import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProviderRegistry} from '../src/providers/registry.mjs';
import {createStatusService} from '../src/core/service.mjs';
import {validateConfig} from '../src/core/config.mjs';

test('partial source failures preserve last known runs and mark them stale',async()=>{
  let fail=false;
  const registry=createProviderRegistry([{id:'fixture',label:'Fixture',listRuns:async t=>{if(fail&&t.id==='a')throw new Error('Unavailable');return [{id:'1',name:t.id,status:'success'}];}}]);
  const service=createStatusService({registry,config:{mode:'live',pollIntervalMs:30000,sources:[{id:'a',provider:'fixture',name:'A'},{id:'b',provider:'fixture',name:'B'}]}});
  assert.equal((await service.request({action:'refresh'})).runs.length,2);fail=true;
  const result=await service.request({action:'refresh'});
  assert.equal(result.runs.length,2);assert.equal(result.sources.find(s=>s.id==='a').stale,true);assert.equal(result.sources.find(s=>s.id==='b').stale,false);
  assert.equal(result.errors.length,1);
});
test('concurrent refreshes coalesce, and changing config discards the old response',async()=>{
  let calls=0,release;const wait=new Promise(r=>{release=r;});
  const registry=createProviderRegistry([{id:'fixture',label:'Fixture',listRuns:async()=>{calls++;await wait;return [{id:'old',status:'success'}];}}]);
  const service=createStatusService({registry,config:{mode:'live',pollIntervalMs:30000,sources:[{id:'a',provider:'fixture'}]}});
  const one=service.request({action:'refresh'}),two=service.request({action:'refresh'});
  await new Promise(r=>setImmediate(r));assert.equal(calls,1);
  await service.request({action:'config.set',args:{mode:'live',sources:[]}});release();
  await Promise.all([one,two]);assert.equal((await service.request({action:'snapshot'})).runs.length,0);
});
test('config saves atomically and rejects inline credentials, invalid URLs and locator injection',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'signal-config-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'settings.json');const service=createStatusService({configFile:file});
  await service.request({action:'config.set',args:{mode:'live',pollIntervalMs:30000,sources:[{id:'api',provider:'http',name:'API',url:'https://example.test/health',expectedStatus:200,tokenEnv:'SERVICE_TOKEN'}]}});
  const data=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(data.sources[0].tokenEnv,'SERVICE_TOKEN');
  for(const url of ['file:///etc/passwd','https://user:pass@example.test','https://example.test/?token=secret'])assert.throws(()=>validateConfig({mode:'live',sources:[{id:'x',provider:'http',url}]}));
  assert.throws(()=>validateConfig({mode:'live',sources:[{id:'x',provider:'teamcity',url:'https://ci.test',buildType:'X),count:100'}]}));
  assert.throws(()=>validateConfig({mode:'live',sources:[{id:'x',provider:'http',url:'https://test',token:'secret'}]}),/environment|credential/i);
});
