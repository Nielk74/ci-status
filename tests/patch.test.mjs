import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readAsar,repackAsar,updateEmbeddedHash,sha256,applyManifest} from '../src/desktop/patch.mjs';
function archive(){const body=Buffer.from('original'),header=Buffer.from(JSON.stringify({files:{'main.js':{offset:'0',size:body.length},'keep.js':{offset:String(body.length),size:4}}})),n=8+header.length+(4-header.length%4)%4,outer=Buffer.alloc(8),pickle=Buffer.alloc(n);outer.writeUInt32LE(4);outer.writeUInt32LE(n,4);pickle.writeUInt32LE(n-4);pickle.writeUInt32LE(header.length,4);header.copy(pickle,8);return Buffer.concat([outer,pickle,body,Buffer.from('keep')]);}
test('archive patch changes requested entries and preserves unrelated Obsidian content',()=>{
  const original=archive(),next=repackAsar(original,{'signal/main.cjs':Buffer.from('signal'),'main.js':Buffer.from('original; require("./signal/main.cjs");')});
  assert.equal(readAsar(next).read('keep.js').toString(),'keep');assert.equal(readAsar(next).read('signal/main.cjs').toString(),'signal');
  const old=readAsar(original).headerHash,hash=readAsar(next).headerHash,exe=Buffer.from('fuses-before'+old+'fuses-after');
  assert.equal(updateEmbeddedHash(exe,old,hash).toString(),'fuses-before'+hash+'fuses-after');
  assert.throws(()=>updateEmbeddedHash(Buffer.from(old+old),old,hash),/exactly one/i);
});
test('installer refuses running or changed files, applies and restores exact originals',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'signal-patch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const installDir=path.join(root,'app'),stage=path.join(root,'stage');await fs.mkdir(path.join(installDir,'resources','ion-dist'),{recursive:true});await fs.mkdir(stage);
  const files=[];for(const relative of ['claude.exe','resources/app.asar','resources/ion-dist/index.html']){
    const target=path.join(installDir,relative),backup=path.join(stage,files.length+'.original'),staged=path.join(stage,files.length+'.patched');
    await fs.writeFile(target,'obsidian-original');await fs.writeFile(backup,'obsidian-original');await fs.writeFile(staged,'obsidian-plus-signal');
    files.push({relative,backup,staged,originalHash:sha256('obsidian-original'),patchedHash:sha256('obsidian-plus-signal')});
  }
  const manifest={version:1,installDir,files};
  await assert.rejects(()=>applyManifest(manifest,{isRunning:async()=>true}),/quit/i);
  await fs.writeFile(path.join(installDir,'claude.exe'),'changed');await assert.rejects(()=>applyManifest(manifest),/changed/i);await fs.writeFile(path.join(installDir,'claude.exe'),'obsidian-original');
  await applyManifest(manifest);assert.equal(await fs.readFile(path.join(installDir,'claude.exe'),'utf8'),'obsidian-plus-signal');
  await applyManifest(manifest,{restore:true});assert.equal(await fs.readFile(path.join(installDir,'claude.exe'),'utf8'),'obsidian-original');
  await assert.rejects(()=>applyManifest({...manifest,files:[...files.slice(0,2),{...files[2],relative:'../outside'}]}),/manifest/i);
});
