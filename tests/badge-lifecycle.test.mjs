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

test('multiple badges share one polling timer and late results cannot restore another project badge',async t=>{
  const keys=['document','setTimeout','clearTimeout'];
  const originals=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const timers=new Map();let serial=0,widget,snapshots=0,release;
  t.after(()=>{widget?.destroy();for(const [key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  globalThis.document={activeElement:null,addEventListener(){},removeEventListener(){}};
  globalThis.setTimeout=fn=>{const id=++serial;timers.set(id,fn);return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const root={innerHTML:'',getRootNode:()=>({activeElement:null}),contains:()=>false,addEventListener(){},removeEventListener(){},replaceChildren(){},querySelector:()=>({focus(){}})};
  const config=validateConfig({mode:'live',sources:[{id:'api',provider:'http',url:'https://example.test'}],badges:[{id:'global',label:'API',scope:'global'},{id:'local',label:'Build',scope:'project',project:{kind:'folder',id:'C:/work/website'}}]});
  const snapshot={mode:'live',runs:[{id:'a',sourceId:'api',status:'success'}],errors:[],badges:config.badges,pollIntervalMs:15000};
  widget=mountBadge(root,{context:[{kind:'folder',id:'C:/work/website'}],request:async({action})=>{
    if(action==='config.get')return config;
    snapshots++;if(snapshots===2)await new Promise(resolve=>{release=resolve;});return snapshot;
  }});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(root.innerHTML,/API status: Passed/);assert.match(root.innerHTML,/Build status: Passed/);
  assert.equal(snapshots,1);assert.equal(timers.size,1);
  const pending=widget.refresh();await new Promise(resolve=>setImmediate(resolve));
  widget.setContext([{kind:'folder',id:'C:/other/website'}]);
  assert.doesNotMatch(root.innerHTML,/Build status:/);release();await pending;
  assert.doesNotMatch(root.innerHTML,/Build status:/);assert.match(root.innerHTML,/API status: Passed/);
  assert.equal(snapshots,2);assert.equal(timers.size,1);
  widget.destroy();assert.equal(timers.size,0);
});

function editingFixture(t,request){
  const keys=['document','setTimeout','clearTimeout','FormData'];
  const originals=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const listeners=new Map(),timers=new Map();let serial=0;
  globalThis.document={activeElement:null,addEventListener(){},removeEventListener(){}};
  globalThis.setTimeout=fn=>{const id=++serial;timers.set(id,fn);return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  globalThis.FormData=class{constructor(form){this.values=form.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}getAll(key){return this.values[key]===undefined?[]:[this.values[key]];}};
  const root={innerHTML:'',getRootNode:()=>({activeElement:null}),contains:()=>false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener(){},replaceChildren(){},querySelector:()=>({focus(){}})};
  const widget=mountBadge(root,{request});
  const click=(action,id)=>listeners.get('click')({target:{closest:selector=>selector==='.ci-badge'?null:{dataset:{action,id}}}});
  t.after(()=>{widget.destroy();for(const [key,descriptor]of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  return {root,widget,click,listeners};
}

test('a rejected badge save keeps source checkboxes editable',async t=>{
  const config=validateConfig({mode:'live',sources:[{id:'a',provider:'http',url:'https://example.test'}],badges:[{id:'ci',label:'CI',scope:'global',sourceIds:['a']}]});
  const ui=editingFixture(t,async({action,args})=>action==='config.get'?config:action==='config.set'?validateConfig(args):{mode:'live',runs:[],errors:[],badges:config.badges});
  await new Promise(resolve=>setImmediate(resolve));await ui.click('manage');await ui.click('edit-badge','ci');
  await ui.listeners.get('submit')({preventDefault(){},target:{values:{label:'x'.repeat(61),scope:'global',sourceMode:'selected',sourceIds:'a'}}});
  assert.match(ui.root.innerHTML,/short label/);
  assert.doesNotThrow(()=>ui.listeners.get('change')({target:{name:'sourceIds',value:'a',checked:false}}));
});

test('a pending settings action cannot reopen an old project panel after navigation',async t=>{
  const config=validateConfig({mode:'live',sources:[]});let gets=0,release;
  const ui=editingFixture(t,async({action})=>{
    if(action==='config.get'){if(++gets===2)await new Promise(resolve=>{release=resolve;});return config;}
    return {mode:'live',runs:[],errors:[],badges:config.badges};
  });
  await new Promise(resolve=>setImmediate(resolve));const pending=ui.click('manage');
  ui.widget.setContext([{kind:'claude',id:'new-project'}],{navigation:true});release();await pending;
  assert.match(ui.root.innerHTML,/class="ci-popover" hidden/);
});

test('changing selected sources refreshes the available metric source',async t=>{
  const config=validateConfig({mode:'live',sources:[{id:'a',name:'A',provider:'http',url:'https://a.test'},{id:'b',name:'B',provider:'http',url:'https://b.test'}],badges:[{id:'ci',label:'Metric',scope:'global',sourceIds:['a'],display:{type:'value',sourceId:'a'}}]});
  const ui=editingFixture(t,async({action})=>action==='config.get'?config:{mode:'live',runs:[],errors:[],badges:config.badges});
  await new Promise(resolve=>setImmediate(resolve));await ui.click('manage');await ui.click('edit-badge','ci');
  ui.listeners.get('change')({target:{name:'sourceIds',value:'a',checked:false}});
  ui.listeners.get('change')({target:{name:'sourceIds',value:'b',checked:true}});
  const choices=ui.root.innerHTML.match(/<select name="valueSourceId"[^>]*>([\s\S]*?)<\/select>/)?.[1];
  assert.match(choices,/value="b" selected/);assert.doesNotMatch(choices,/value="a"/);
});
