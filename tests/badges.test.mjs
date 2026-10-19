import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../src/core/config.mjs';
import {badgeState} from '../src/ui/components.mjs';
import {visibleBadges,projectSnapshot,normalizeProject} from '../src/core/badges.mjs';

const sources=[{id:'api',provider:'http',url:'https://example.test/health'},{id:'build',provider:'github',owner:'acme',repo:'website'}];
const settings=badges=>validateConfig({mode:'live',sources,...(badges===undefined?{}:{badges})});
const common={id:'api',label:'API',scope:'global',sourceIds:['api']};
const folder={id:'build',label:'Build',scope:'project',sourceIds:['build'],project:{kind:'folder',id:'C:/work/website',name:'Website'}};

test('legacy configurations keep one global badge while an explicit empty list disables badges',()=>{
  assert.deepEqual(settings().badges,[{id:'ci',label:'CI',scope:'global'}]);
  assert.deepEqual(settings([]).badges,[]);
});

test('badge scope and source selections survive validation and reject broken references',()=>{
  assert.deepEqual(settings([common,folder]).badges,[common,folder]);
  for(const badges of [[common,common],[{...common,sourceIds:['missing']}],[{...folder,project:undefined}],[{...common,scope:'sometimes'}],[{...common,label:'bad\nlabel'}],[{...common,sourceIds:'api'}],[{...folder,project:{kind:'folder',id:'website'}}]]){
    assert.throws(()=>settings(badges));
  }
});

test('global badges remain visible and folder badges match the complete canonical path',()=>{
  const config=settings([common,folder]);
  assert.deepEqual(visibleBadges(config,[]).map(b=>b.id),['api']);
  assert.deepEqual(visibleBadges(config,[{kind:'folder',id:'c:\\WORK\\website\\'}]).map(b=>b.id),['api','build']);
  assert.deepEqual(visibleBadges(config,[{kind:'folder',id:'C:/other/website'}]).map(b=>b.id),['api']);
  assert.deepEqual(visibleBadges(config,[{kind:'folder',id:'C:/work/website/subfolder'}]).map(b=>b.id),['api']);
});

test('Claude project URLs normalize to exact IDs and POSIX folders remain case-sensitive',()=>{
  assert.deepEqual(normalizeProject({kind:'claude',id:'https://claude.ai/project/project-one'}),{kind:'claude',id:'project-one'});
  const config=settings([{id:'claude',label:'Release',scope:'project',project:{kind:'claude',id:'project-one'}},{id:'posix',label:'Build',scope:'project',project:{kind:'folder',id:'/work/Website'}}]);
  assert.deepEqual(visibleBadges(config,[{kind:'claude',id:'project-two'}]),[]);
  assert.deepEqual(visibleBadges(config,[{kind:'claude',id:'project-one'}]).map(b=>b.id),['claude']);
  assert.deepEqual(visibleBadges(config,[{kind:'folder',id:'/work/website'}]),[]);
});

test('a badge only summarizes its own sources, including stale and unavailable results',()=>{
  const snapshot={mode:'live',runs:[{id:'a',sourceId:'api',status:'success'},{id:'b',sourceId:'build',status:'running'}],sources:[{id:'api'},{id:'build',stale:true}],errors:[{sourceId:'build',message:'Offline'}]};
  assert.deepEqual(badgeState(projectSnapshot(snapshot,common)),{status:'success',label:'Passed'});
  assert.deepEqual(badgeState(projectSnapshot(snapshot,folder)),{status:'unknown',label:'Stale'});
  assert.equal(projectSnapshot(snapshot,{...common,sourceIds:[]}).runs.length,0);
  assert.equal(projectSnapshot(snapshot,{id:'all',label:'CI',scope:'global'}).runs.length,2);
});
