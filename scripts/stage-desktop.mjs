import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readAsar,repackAsar,updateEmbeddedHash,sha256} from '../src/desktop/patch.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const directory=arg('--install-dir'),expectedVersion=arg('--expected-version');
if(!directory||!expectedVersion)throw new Error('Supply --install-dir <Claude app folder> --expected-version <installed version>. Staging does not install anything.');
const installDir=path.resolve(directory);
const originals={};for(const relative of ['claude.exe','resources/app.asar','resources/ion-dist/index.html'])originals[relative]=await fs.readFile(path.join(installDir,...relative.split('/')));
const original=readAsar(originals['resources/app.asar']),pkg=JSON.parse(original.read('package.json').toString('utf8'));
if(pkg.version!==expectedVersion)throw new Error('Installed version differs from --expected-version.');
if(!pkg.main?.startsWith('.vite/build/'))throw new Error('Unrecognized Desktop main entry layout.');
const main=original.read(pkg.main),preload=original.read('.vite/build/mainView.js'),html=originals['resources/ion-dist/index.html'].toString('utf8');
if(main.includes('signal-ci:main')||html.includes('signal-ci:start'))throw new Error('Signal is already installed. Restore this Signal stage before staging another version.');
if(html.split('</body>').length!==2)throw new Error('Desktop HTML body anchor is missing or ambiguous.');
const mainModule=path.posix.dirname(pkg.main)+'/signal-ci/main.cjs';
let mainBundle=await fs.readFile(path.join(project,'dist/desktop/main.cjs'));
if(process.argv.includes('--verify-installed'))mainBundle=Buffer.concat([mainBundle,Buffer.from('\n;require('+JSON.stringify(path.join(project,'scripts/verify-installed.cjs'))+')('+JSON.stringify({reportFile:path.join(project,'.local/framework-demo/installed-report.json'),imageFile:path.join(project,'.local/framework-demo/installed.png')})+');\n','utf8')]);
const additions={
  [pkg.main]:Buffer.concat([main,Buffer.from('\n;/* signal-ci:main */try{require("./signal-ci/main.cjs")}catch(e){console.error("[Signal CI]",e)}\n','utf8')]),
  '.vite/build/mainView.js':Buffer.concat([preload,Buffer.from('\n'),await fs.readFile(path.join(project,'dist/desktop/preload.cjs'))]),
  [mainModule]:mainBundle
};
const nextArchive=repackAsar(originals['resources/app.asar'],additions),next=readAsar(nextArchive);
let verifiedEntries=0;function verify(node,prefix=''){for(const [name,entry]of Object.entries(node.files??{})){const file=prefix+name;if(entry.files)verify(entry,file+'/');else if(!entry.unpacked&&!entry.link){const expected=additions[file]??original.read(file);if(!next.read(file).equals(expected))throw new Error('Archive entry verification failed: '+file);verifiedEntries++;}}}verify(original.header);
if(!next.read(mainModule).equals(additions[mainModule]))throw new Error('Signal main bundle verification failed.');
const renderer=(await fs.readFile(path.join(project,'dist/desktop/renderer.js'),'utf8')).replace(/<\/script/gi,'<\\/script');
const outputs={'claude.exe':updateEmbeddedHash(originals['claude.exe'],original.headerHash,next.headerHash),'resources/app.asar':nextArchive,'resources/ion-dist/index.html':Buffer.from(html.replace('</body>',()=>`<!--signal-ci:start--><script>${renderer}</script><!--signal-ci:end--></body>`),'utf8')};
const stage=path.join(project,'.local/desktop',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(stage,{recursive:true});const files=[];
for(const [relative,bytes]of Object.entries(outputs)){
  const backup=path.join(stage,'backup',...relative.split('/')),staged=path.join(stage,'patched',...relative.split('/'));await fs.mkdir(path.dirname(backup),{recursive:true});await fs.mkdir(path.dirname(staged),{recursive:true});await fs.writeFile(backup,originals[relative],{flag:'wx'});await fs.writeFile(staged,bytes,{flag:'wx'});files.push({relative,backup,staged,originalHash:sha256(originals[relative]),patchedHash:sha256(bytes)});
}
const manifestFile=path.join(stage,'manifest.json');await fs.writeFile(manifestFile,JSON.stringify({version:1,desktopVersion:pkg.version,installDir,verifiedEntries,files},null,2)+'\n','utf8');
await fs.writeFile(path.join(project,'.local/desktop/latest.json'),JSON.stringify({manifestFile})+'\n','utf8');
console.log(JSON.stringify({staged:true,installed:false,manifestFile,desktopVersion:pkg.version,verifiedEntries,compatibility:'Experimental; version agreement and archive integrity verified, native UI not certified.'},null,2));
