import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createProviderRegistry} from '../src/providers/registry.mjs';
import {createGitHubProvider} from '../src/providers/github.mjs';
import {createBitbucketProvider} from '../src/providers/bitbucket.mjs';
import {createTeamCityProvider} from '../src/providers/teamcity.mjs';
import {createHttpProvider} from '../src/providers/http.mjs';

test('custom adapters normalize results and reject duplicate provider IDs',async()=>{
  const adapter={id:'custom',label:'Custom',listRuns:async()=>[{id:'one',name:'Check',status:'success'}]};
  const registry=createProviderRegistry([adapter]);
  assert.equal((await registry.list({id:'target',provider:'custom'}))[0].id,'custom:target:one');
  assert.throws(()=>createProviderRegistry([adapter,adapter]),/duplicate/i);
  await assert.rejects(()=>registry.list({id:'x',provider:'missing'}),/unknown/i);
});
test('GitHub sends repo/branch and auth, maps unknown states, and reads paginated jobs',async()=>{
  const calls=[];
  const provider=createGitHubProvider({env:{GITHUB_TOKEN:'private-token'},fetchImpl:async(url,init)=>{
    calls.push({url:String(url),init});const u=new URL(url);
    if(u.pathname.endsWith('/runs'))return Response.json({workflow_runs:[{id:17,name:'CI',status:'completed',conclusion:'new_result',head_branch:'feature/ui',head_sha:'abcdef',repository:{full_name:'acme/app'},html_url:'https://github.com/acme/app/actions/runs/17'}]});
    return Response.json({total_count:101,jobs:u.searchParams.get('page')==='2'?[{id:101,name:'Last job',status:'completed',conclusion:'success'}]:Array.from({length:100},(_,i)=>({id:i,name:'Job '+i,status:'completed',conclusion:'success'}))});
  }});
  const [run]=await provider.listRuns({owner:'acme',repo:'app',branch:'feature/ui'});
  assert.equal(run.status,'unknown');assert.equal(run.jobs.length,101);
  assert.equal(new URL(calls[0].url).searchParams.get('branch'),'feature/ui');
  assert.equal(calls[0].init.headers.Authorization,'Bearer private-token');
  assert.ok(calls.every(c=>c.init.redirect==='error'&&c.init.signal));
});
test('GitHub ETags reuse cached responses and API failures do not leak response bodies',async()=>{
  let n=0;
  const provider=createGitHubProvider({fetchImpl:async(url,init)=>{
    n++;if(n===1)return Response.json({workflow_runs:[]},{headers:{etag:'"first"'}});
    assert.equal(init.headers['If-None-Match'],'"first"');return new Response(null,{status:304});
  }});
  assert.deepEqual(await provider.listRuns({owner:'a',repo:'b'}),[]);
  assert.deepEqual(await provider.listRuns({owner:'a',repo:'b'}),[]);
  const bad=createGitHubProvider({fetchImpl:async()=>new Response('secret server response',{status:401})});
  await assert.rejects(()=>bad.listRuns({owner:'a',repo:'b'}),error=>error.message.includes('401')&&!error.message.includes('secret'));
});
test('Bitbucket maps pipeline steps and filters on the configured branch',async()=>{
  const calls=[];const provider=createBitbucketProvider({fetchImpl:async url=>{
    calls.push(String(url));return Response.json(String(url).includes('/steps')?{values:[{uuid:'s1',name:'Test',state:{name:'COMPLETED',result:{name:'SUCCESSFUL'}}}]}:{values:[{uuid:'{p1}',build_number:9,state:{name:'IN_PROGRESS'},target:{ref_name:'main',commit:{hash:'abcdef'}}}]});
  }});
  const [run]=await provider.listRuns({workspace:'acme',repo:'app',branch:'main'});
  assert.equal(run.status,'running');assert.equal(run.jobs[0].status,'success');
  assert.match(new URL(calls[0]).searchParams.get('q'),/main/);
});
test('TeamCity includes running builds, branch, build path and status',async()=>{
  let request;const provider=createTeamCityProvider({fetchImpl:async url=>{request=new URL(url);return Response.json({build:[{id:10,number:'42',state:'running',status:'FAILURE',branchName:'main',buildType:{name:'Deploy',projectName:'Portal'},runningInfo:{percentageComplete:60},statusText:'Step 3/5'}]});}});
  const [run]=await provider.listRuns({url:'https://ci.example.test/teamcity',buildType:'Portal_Deploy',branch:'main'});
  assert.equal(request.pathname,'/teamcity/app/rest/builds');assert.match(request.searchParams.get('locator'),/state:any/);assert.match(request.searchParams.get('locator'),/Portal_Deploy/);
  assert.equal(run.status,'running');assert.equal(run.progressPercent,60);
});
test('HTTP service checks actual status and optional JSON path, including connection failure',async t=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:{state:'ok'}}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port+'/health';const provider=createHttpProvider();
  const [healthy]=await provider.listRuns({id:'health',name:'API',url,jsonPath:'service.state',expectedValue:'ok'});
  assert.equal(healthy.status,'success');assert.equal(healthy.kind,'service');assert.match(healthy.detail,/200/);
  const [bad]=await provider.listRuns({id:'health',url,jsonPath:'service.state',expectedValue:'down'});assert.equal(bad.status,'failed');
  const unavailable=createHttpProvider({fetchImpl:async()=>{throw new Error('connect');}});
  assert.equal((await unavailable.listRuns({id:'x',url}))[0].status,'failed');
});
