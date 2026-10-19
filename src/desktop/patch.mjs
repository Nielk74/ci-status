// The archive and embedded-hash approach follows ../claude-mod/src/desktop/patch.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
function nodeFor(header,name,create=false){
  const parts=name.split('/');if(!name||parts.some(p=>!p||['.','..','__proto__','constructor','prototype'].includes(p)||p.includes('\\')))throw new Error('Invalid archive path.');
  let node=header;
  for(const p of parts.slice(0,-1)){if(!Object.hasOwn(node.files??{},p)){if(!create)return null;node.files??={};node.files[p]={files:{}};}node=node.files[p];if(!node.files)throw new Error('Archive path is not a directory.');}
  if(create){node.files??={};node.files[parts.at(-1)]??={};}return node.files?.[parts.at(-1)];
}
export function readAsar(bytes){
  if(bytes.length<16)throw new Error('Invalid ASAR header.');const size=bytes.readUInt32LE(4),length=bytes.readUInt32LE(12);
  if(size<8||length>size-8||8+size>bytes.length)throw new Error('Invalid ASAR header.');
  const raw=bytes.subarray(16,16+length),header=JSON.parse(raw.toString('utf8')),base=8+size;
  return {header,headerHash:sha256(raw),read(name){const entry=nodeFor(header,name);if(!entry||entry.files||entry.link||entry.unpacked)throw new Error('Expected packed ASAR file: '+name);const start=base+Number(entry.offset);if(!Number.isSafeInteger(start)||start<base||!Number.isSafeInteger(entry.size)||entry.size<0||start+entry.size>bytes.length)throw new Error('Invalid ASAR entry bounds.');return bytes.subarray(start,start+entry.size);}};
}
export function repackAsar(bytes,changes){
  const original=readAsar(bytes),header=structuredClone(original.header);
  for(const [name,value]of Object.entries(changes)){
    const entry=nodeFor(header,name,true);if(entry.files||entry.link||entry.unpacked)throw new Error('Cannot replace non-packed entry.');const buffer=Buffer.from(value),blockSize=entry.integrity?.blockSize??4194304;
    if(!Number.isInteger(blockSize)||blockSize<=0)throw new Error('Invalid ASAR block size.');const blocks=[];for(let i=0;i<buffer.length;i+=blockSize)blocks.push(sha256(buffer.subarray(i,i+blockSize)));if(!blocks.length)blocks.push(sha256(buffer));
    Object.assign(entry,{size:buffer.length,integrity:{algorithm:'SHA256',hash:sha256(buffer),blockSize,blocks}});
  }
  let offset=0;const body=[];
  function collect(node,prefix=''){for(const [name,entry]of Object.entries(node.files??{})){const file=prefix+name;if(entry.files)collect(entry,file+'/');else if(!entry.unpacked&&!entry.link){const content=Object.hasOwn(changes,file)?Buffer.from(changes[file]):original.read(file);entry.offset=String(offset);entry.size=content.length;body.push(content);offset+=content.length;}}}collect(header);
  const raw=Buffer.from(JSON.stringify(header),'utf8'),length=8+raw.length+(4-raw.length%4)%4,pickle=Buffer.alloc(length),outer=Buffer.alloc(8);outer.writeUInt32LE(4);outer.writeUInt32LE(length,4);pickle.writeUInt32LE(length-4);pickle.writeUInt32LE(raw.length,4);raw.copy(pickle,8);return Buffer.concat([outer,pickle,...body]);
}
export function updateEmbeddedHash(exe,oldHash,nextHash){
  if(!/^[a-f0-9]{64}$/.test(oldHash)||!/^[a-f0-9]{64}$/.test(nextHash))throw new Error('Invalid ASAR integrity hash.');const index=exe.indexOf(oldHash);
  if(index<0||exe.indexOf(oldHash,index+1)>=0)throw new Error('Expected exactly one embedded ASAR hash.');const result=Buffer.from(exe);result.write(nextHash,index,'ascii');return result;
}
const allowed=['claude.exe','resources/app.asar','resources/ion-dist/index.html'];
export async function applyManifest(manifest,{restore=false,isRunning=async()=>false}={}){
  if(manifest?.version!==1||typeof manifest.installDir!=='string'||!path.isAbsolute(manifest.installDir)||!Array.isArray(manifest.files)||manifest.files.length!==3||new Set(manifest.files.map(f=>f.relative)).size!==3||manifest.files.some(f=>!allowed.includes(f.relative)||!path.isAbsolute(f.backup??'')||!path.isAbsolute(f.staged??'')||!(/^[a-f0-9]{64}$/.test(f.originalHash)&&/^[a-f0-9]{64}$/.test(f.patchedHash))))throw new Error('Invalid installation manifest.');
  const lockFile=path.join(path.dirname(manifest.files[0].backup),'signal-install.lock');const lock=await fs.open(lockFile,'wx');
  try{
    if(await isRunning(manifest.installDir))throw new Error('Fully quit Claude Desktop from its tray menu before changing the installation.');
    const tasks=[];
    for(const file of manifest.files){
      const target=path.join(manifest.installDir,...file.relative.split('/')),current=sha256(await fs.readFile(target)),from=restore?file.patchedHash:file.originalHash,to=restore?file.originalHash:file.patchedHash;
      if(sha256(await fs.readFile(file.backup))!==file.originalHash||sha256(await fs.readFile(file.staged))!==file.patchedHash)throw new Error('Staged or backup file changed: '+file.relative);
      if(current!==from&&current!==to)throw new Error('Installed file changed: '+file.relative);
      if(current!==to)tasks.push({target,from,to,file,input:restore?file.backup:file.staged,undo:restore?file.staged:file.backup});
    }
    if(await isRunning(manifest.installDir))throw new Error('Fully quit Claude Desktop before applying the patch.');
    async function replace(task,input,expectedCurrent,expectedNext){
      if(sha256(await fs.readFile(task.target))!==expectedCurrent)throw new Error('Installed file changed during installation.');
      const tmp=task.target+'.signal-'+randomUUID();try{await fs.copyFile(input,tmp);if(sha256(await fs.readFile(tmp))!==expectedNext)throw new Error('File copy verification failed.');await fs.rename(tmp,task.target);}finally{await fs.rm(tmp,{force:true});}
    }
    const done=[];try{for(const task of tasks){await replace(task,task.input,task.from,task.to);done.push(task);}}
    catch(error){const failures=[];for(const task of done.reverse())try{await replace(task,task.undo,task.to,task.from);}catch(e){failures.push(e);}if(failures.length)throw new AggregateError([error,...failures],'Installation and rollback failed; exact backups are preserved.');throw error;}
    for(const task of tasks)if(sha256(await fs.readFile(task.target))!==task.to)throw new Error('Final installation verification failed.');
    return {changed:tasks.length>0,files:tasks.length,restored:restore};
  }finally{await lock.close();await fs.unlink(lockFile);}
}
