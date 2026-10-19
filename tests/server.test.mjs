import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPreviewServer} from '../src/server.mjs';

test('preview serves UI, accepts same-origin JSON, and rejects external origins and host rebinding',async t=>{
  let calls=0;const server=await createPreviewServer({port:0,service:{request:async()=>{calls++;return {mode:'demo',runs:[]};}}});
  t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/Signal/);
  const api=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'snapshot'})});assert.equal(api.status,200);assert.equal((await api.json()).ok,true);
  const bad=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'});assert.equal(bad.status,403);
  const hostStatus=await new Promise((resolve,reject)=>{http.get(base,{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(hostStatus,403);
  const plain=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(plain.status,403);
  assert.equal(calls,1);
  assert.equal((await fetch(base+'/src/core/config.mjs')).status,404);
});
