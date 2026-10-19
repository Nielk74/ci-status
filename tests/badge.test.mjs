import test from 'node:test';
import assert from 'node:assert/strict';
import {badgeState} from '../src/ui/components.mjs';
test('badge shows failures first, active progress next, and never a false all-clear',()=>{
  assert.deepEqual(badgeState({runs:[{status:'running'},{status:'failed'}],errors:[]}),{status:'failed',label:'1 failed'});
  assert.deepEqual(badgeState({runs:[{status:'running'},{status:'running'}],errors:[]}),{status:'running',label:'2 running'});
  assert.equal(badgeState({runs:[],errors:[]}).label,'No sources');
  assert.equal(badgeState({runs:[{status:'success'}],errors:[{}]}).label,'Stale');
  assert.equal(badgeState({runs:[{status:'unknown'}],errors:[]}).status,'unknown');
  assert.equal(badgeState({runs:[{status:'success'},{status:'skipped'}],errors:[]}).label,'Passed');
});
