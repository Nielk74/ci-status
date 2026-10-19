import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {readAsar,repackAsar,updateEmbeddedHash} from '../src/desktop/patch.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),root=path.join(project,'.local/framework-demo'),runtime=path.join(root,'runtime');
const i=process.argv.indexOf('--runtime');const installed=i>=0?path.resolve(process.argv[i+1]):path.join(os.homedir(),'AppData/Local/Programs/Obsidian');
await fs.mkdir(root,{recursive:true});
const configFile=path.join(root,'sources.json'),common={absWorkingDir:project,bundle:true,target:'es2022',legalComments:'none',minify:true};
await build({...common,entryPoints:['src/desktop/main.mjs'],outfile:path.join(root,'main.cjs'),format:'cjs',platform:'node',external:['electron'],define:{__SIGNAL_CONFIG_FILE__:JSON.stringify(configFile)}});
// Use the exact production renderer and preload emitted by npm run build.
const preload=await fs.readFile(path.join(project,'dist/desktop/preload.cjs'),'utf8');
await fs.writeFile(path.join(root,'preload.cjs'),preload+`\n;(()=>{const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('signalDemo',Object.freeze({set:scenario=>ipcRenderer.invoke('signal-demo:set',scenario)}));})();\n`,'utf8');
const marker=path.join(root,'runtime.json');
try{const existing=JSON.parse(await fs.readFile(marker,'utf8'));await fs.access(existing.exe);console.log(JSON.stringify({...existing,configFile,alreadyPrepared:true}));process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const original=await fs.readFile(path.join(installed,'resources/app.asar')),archive=readAsar(original),exe=await fs.readFile(path.join(installed,'Obsidian.exe'));
await fs.mkdir(path.join(runtime,'resources'),{recursive:true});
for(const entry of await fs.readdir(installed,{withFileTypes:true})){
  if(entry.name==='resources'||/uninstall/i.test(entry.name))continue;
  if(entry.isFile())await fs.copyFile(path.join(installed,entry.name),path.join(runtime,entry.name));
  else if(entry.name==='locales')await fs.cp(path.join(installed,entry.name),path.join(runtime,entry.name),{recursive:true});
}
const next=repackAsar(original,{'package.json':Buffer.from(JSON.stringify({name:'signal-framework-demo',version:'0.1.0',main:'signal-host.cjs'})),'signal-host.cjs':Buffer.from('require('+JSON.stringify(path.join(project,'scripts/framework-host.cjs'))+');\n')});
await fs.writeFile(path.join(runtime,'resources/app.asar'),next);const exePath=path.join(runtime,'Obsidian.exe');await fs.writeFile(exePath,updateEmbeddedHash(exe,archive.headerHash,readAsar(next).headerHash));
const result={exe:exePath,root,runtimeSource:installed};await fs.writeFile(marker,JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({...result,configFile,prepared:true}));
