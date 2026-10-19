import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRun,progress,summarize,statusOf} from '../src/core/model.mjs';

test('unrecognized conclusions cannot report success',()=>{
  assert.equal(statusOf('completed','future_outcome'),'unknown');
  assert.equal(statusOf('in_progress',null),'running');
  assert.equal(statusOf('completed','timed_out'),'failed');
  assert.equal(statusOf('waiting',null),'waiting');
});
test('progress counts terminal jobs, without pretending a running job is complete',()=>{
  assert.deepEqual(progress({jobs:[{status:'success'},{status:'skipped'},{status:'running'},{status:'queued'}]}),{completed:2,total:4,percent:50,indeterminate:false});
  assert.deepEqual(progress({jobs:[]}),{completed:0,total:0,percent:0,indeterminate:true});
});
test('normalization qualifies IDs and removes unsafe links and unexpected fields',()=>{
  const run=normalizeRun({id:'4',name:'Build',status:'success',url:'javascript:alert(1)',secret:'no',jobs:[]},'github','frontend');
  assert.equal(run.id,'github:frontend:4');
  assert.equal(run.url,null);
  assert.equal(run.secret,undefined);
  assert.throws(()=>normalizeRun({name:'Missing ID'},'github','a'),/id/i);
});
test('summary is derived from actual states',()=>{
  const result=summarize([{status:'running'},{status:'success'},{status:'failed'},{status:'waiting'},{status:'unknown'}]);
  assert.equal(result.total,5);assert.equal(result.running,1);assert.equal(result.failed,1);assert.equal(result.success,1);assert.equal(result.waiting,1);
});
