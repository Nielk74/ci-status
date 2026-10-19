import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const project=fileURLToPath(new URL('../',import.meta.url));
const {exe}=JSON.parse(await fs.readFile(path.join(project,'.local/framework-demo/runtime.json'),'utf8'));
const args=process.argv.includes('--test')?['--verify','--test']:process.argv.includes('--verify')?['--verify']:[];
const child=spawn(exe,args,{cwd:project,stdio:'inherit',windowsHide:!process.argv.includes('--show')});
child.once('error',error=>{console.error(error);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
