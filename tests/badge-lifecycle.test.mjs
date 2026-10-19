import test from 'node:test';
import assert from 'node:assert/strict';
import {mountBadge} from '../src/ui/app.mjs';
import {validateConfig} from '../src/core/config.mjs';

test('automatic status refresh survives a rejected source save and Cancel',async t=>{
  const keys=['document','setTimeout','clearTimeout','FormData'];
  const originals=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const listeners=new Map(),timers=new Map();let serial=0,widget,snapshots=0;
  t.after(()=>{widget?.destroy();for(const [key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  globalThis.document={activeElement:null,addEventListener(){},removeEventListener(){}};
  globalThis.setTimeout=fn=>{const id=++serial;timers.set(id,fn);return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  globalThis.FormData=class{constructor(form){return Object.entries(form.values);}};
  const root={innerHTML:'',getRootNode:()=>({activeElement:null}),contains:()=>false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener(){},replaceChildren(){},querySelector:()=>({focus(){}})};
  const config={mode:'live',pollIntervalMs:15000,sources:[{id:'a',provider:'http',name:'Healthy',url:'https://example.test'}],providers:[{id:'http',label:'HTTP'}]};
  widget=mountBadge(root,{request:async({action,args})=>{
    if(action==='config.get')return config;
    if(action==='config.set')return validateConfig(args);
    snapshots++;return {mode:'live',runs:[],errors:[],pollIntervalMs:15000};
  }});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(snapshots,1);
  const click=action=>listeners.get('click')({target:{closest:selector=>selector==='.ci-badge'?null:{dataset:{action}}}});
  await click('add');await listeners.get('submit')({preventDefault(){},target:{values:{provider:'http',name:'Bad URL',url:'https://user:pass@example.test',expectedStatus:'200'}}});
  assert.match(root.innerHTML,/inline credentials/);await click('cancel');
  const next=timers.values().next().value;assert.equal(typeof next,'function','automatic refresh should remain scheduled');
  await next();assert.equal(snapshots,2,'the scheduled callback must request a fresh status');
});
