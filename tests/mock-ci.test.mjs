import test from 'node:test';
import assert from 'node:assert/strict';
import {createMockCiServer} from '../scripts/fixtures/mock-ci.mjs';
import {createStatusService} from '../src/core/service.mjs';
import {badgeState} from '../src/ui/components.mjs';

test('real framework reads mock TeamCity and HTTP endpoints through running, passing, failing, stale and recovery states',async t=>{
  const upstream=await createMockCiServer();t.after(()=>upstream.close());
  const service=createStatusService({config:upstream.config});
  let data=await service.request({action:'refresh'});
  assert.equal(data.mode,'live');assert.equal(badgeState(data).label,'1 running');
  assert.equal(data.runs.find(r=>r.provider==='teamcity').branch,'feature/status-badge');
  assert.equal(data.runs.find(r=>r.provider==='teamcity').progressPercent,35);
  upstream.setScenario('success');data=await service.request({action:'refresh'});assert.equal(badgeState(data).label,'Passed');
  upstream.setScenario('failed');data=await service.request({action:'refresh'});assert.equal(badgeState(data).label,'2 failed');
  upstream.setScenario('offline');data=await service.request({action:'refresh'});assert.equal(badgeState(data).label,'Stale');assert.equal(data.runs.length,2);
  upstream.setScenario('success');data=await service.request({action:'refresh'});assert.equal(badgeState(data).label,'Passed');
  assert.equal(data.errors.length,0);assert.ok(upstream.requests.filter(r=>r.path==='/health').length>=5);
  const builds=upstream.requests.filter(r=>r.path==='/teamcity/app/rest/builds');assert.ok(builds.length>=5);assert.match(builds[0].query.locator,/Demo_Build/);assert.match(builds[0].query.locator,/feature\/status-badge/);
});
