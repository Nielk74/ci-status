import http from 'node:http';

// Upstream fixtures only: these never supply badge markup or normalized runs.
export async function createMockCiServer({port=0}={}){
  let scenario='running';const requests=[];
  const started=Date.now();
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),scenario,time:Date.now()});
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(url.pathname==='/health'){
      res.statusCode=['failed','offline'].includes(scenario)?503:200;
      res.end(JSON.stringify({status:res.statusCode===200?'ok':'down',latencyMs:scenario==='building'?80:48}));return;
    }
    if(url.pathname==='/teamcity/app/rest/builds'){
      if(scenario==='offline'){res.writeHead(503);res.end(JSON.stringify({error:'Mock TeamCity unavailable'}));return;}
      const running=['running','building'].includes(scenario),queued=scenario==='queued';
      res.end(JSON.stringify({build:[{id:42,number:'42',state:queued?'queued':running?'running':'finished',status:scenario==='failed'?'FAILURE':'SUCCESS',branchName:'feature/status-badge',webUrl:'http://127.0.0.1:'+server.address().port+'/build/42',startDate:new Date(started).toISOString(),finishDate:!running&&!queued?new Date().toISOString():undefined,statusText:queued?'Waiting for an agent':running?'Building desktop mod':scenario==='failed'?'Tests failed':'All checks passed',buildType:{name:'Build desktop mod',projectName:'acme/ci-status'},runningInfo:running?{percentageComplete:scenario==='building'?80:35}:undefined,revisions:{revision:[{version:'8f3a2c1d90'}]}}]}));return;
    }
    if(url.pathname==='/build/42'){res.end(JSON.stringify({fixture:true,scenario,buildType:'Demo_Build',branch:'feature/status-badge'}));return;}
    res.writeHead(404);res.end('{}');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+server.address().port;
  return {server,requests,base,config:{mode:'live',pollIntervalMs:15000,sources:[{id:'mock-build',provider:'teamcity',name:'Mock TeamCity build',url:base+'/teamcity',buildType:'Demo_Build',branch:'feature/status-badge'},{id:'mock-api',provider:'http',name:'Mock API',url:base+'/health',expectedStatus:200,jsonPath:'status',expectedValue:'ok'}]},
    getScenario:()=>scenario,setScenario(value){if(!['queued','running','building','success','failed','offline'].includes(value))throw new Error('Unknown mock scenario.');scenario=value;},close:()=>new Promise(resolve=>server.close(resolve))};
}
