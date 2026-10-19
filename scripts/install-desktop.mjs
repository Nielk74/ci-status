import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {applyManifest,sha256} from '../src/desktop/patch.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),execute=promisify(execFile),i=process.argv.indexOf('--manifest');
const manifestFile=i>=0?path.resolve(process.argv[i+1]):JSON.parse(await fs.readFile(path.join(project,'.local/desktop/latest.json'),'utf8')).manifestFile;
const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
async function isRunning(){
  if(process.platform!=='win32')throw new Error('The Desktop installer supports Windows only.');
  const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name claude -ErrorAction SilentlyContinue).Count"],{windowsHide:true});return Number(stdout.trim())>0;
}
if(process.argv.includes('--status')){
  const states=[];for(const f of manifest.files){const hash=sha256(await fs.readFile(path.join(manifest.installDir,...f.relative.split('/'))));states.push({file:f.relative,state:hash===f.patchedHash?'patched':hash===f.originalHash?'original':'changed'});}
  console.log(JSON.stringify({manifestFile,states,running:await isRunning()},null,2));
}else console.log(JSON.stringify(await applyManifest(manifest,{restore:process.argv.includes('--restore'),isRunning}),null,2));
