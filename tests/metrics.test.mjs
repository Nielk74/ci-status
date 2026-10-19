import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../src/core/config.mjs';
import {normalizeRun} from '../src/core/model.mjs';
import {createHttpProvider} from '../src/providers/http.mjs';
import {badgeValue} from '../src/core/badges.mjs';

test('custom providers can return safe numbers and short text values',()=>{
  assert.equal(normalizeRun({id:'latency',status:'success',value:48},'custom','api').value,48);
  assert.equal(normalizeRun({id:'version',status:'success',value:'v2.1'},'custom','api').value,'v2.1');
  assert.equal(normalizeRun({id:'bad',status:'success',value:{token:'hidden'}},'custom','api').value,undefined);
  assert.equal(normalizeRun({id:'bad',status:'success',value:Infinity},'custom','api').value,undefined);
});

test('HTTP sources extract a metric and still check the response health independently',async()=>{
  const provider=createHttpProvider({fetchImpl:async()=>Response.json({status:'ok',metrics:{latencyMs:48,queue:0}})});
  const target={id:'api',url:'https://example.test',jsonPath:'status',expectedValue:'ok',valuePath:'metrics.latencyMs'};
  const [run]=await provider.listRuns(target);assert.equal(run.status,'success');assert.equal(run.value,48);
  assert.equal((await provider.listRuns({...target,valuePath:'metrics.queue'}))[0].value,0);
});

test('metric badges persist formatting and select only their chosen source value',()=>{
  const config=validateConfig({mode:'live',sources:[{id:'api',provider:'http',url:'https://example.test',valuePath:'metrics.latencyMs'}],badges:[{id:'latency',label:'Latency',scope:'global',sourceIds:['api'],display:{type:'value',sourceId:'api',suffix:' ms'}}]});
  assert.equal(config.sources[0].valuePath,'metrics.latencyMs');
  assert.deepEqual(config.badges[0].display,{type:'value',sourceId:'api',suffix:' ms'});
  assert.equal(badgeValue({runs:[{sourceId:'other',value:999},{sourceId:'api',value:48}]},config.badges[0]),'48 ms');
  assert.equal(badgeValue({runs:[{sourceId:'api',value:0}]},config.badges[0]),'0 ms');
  assert.equal(badgeValue({runs:[]},config.badges[0]),'—');
  assert.equal(badgeValue({runs:[{sourceId:'api'},{sourceId:'api',value:42}]},config.badges[0]),'—','a missing current metric must not reuse an older run value');
  assert.equal(badgeValue({runs:[]},{id:'ci',label:'CI',scope:'global'}),null);
  assert.throws(()=>validateConfig({...config,badges:[{...config.badges[0],display:{type:'value',sourceId:'missing'}}]}));
});
