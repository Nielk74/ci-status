export function createHttpProvider({fetchImpl=fetch,env=process.env,now=Date.now}={}){
  return {id:'http',label:'HTTP health check',fields:['url','expectedStatus','jsonPath','expectedValue','tokenEnv'],async listRuns(target){
    const start=now(),base={id:target.id??'health',name:target.name??'Service health',kind:'service',repository:new URL(target.url).host,url:target.url,startedAt:new Date(start).toISOString(),jobs:[]};
    const token=target.tokenEnv?env[target.tokenEnv]:null;if(target.tokenEnv&&!token)throw new Error('Set the '+target.tokenEnv+' environment variable in the host process.');
    try{
      const response=await fetchImpl(target.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})}});
      let healthy=response.status===(target.expectedStatus??200),detail=`HTTP ${response.status} · ${Math.max(0,now()-start)} ms`;
      if(target.jsonPath&&healthy){
        const body=await response.text();if(Buffer.byteLength(body)>1024*1024)throw new Error('Health response too large.');const data=JSON.parse(body);
        const value=target.jsonPath.split('.').reduce((v,key)=>v&&typeof v==='object'&&Object.hasOwn(v,key)?v[key]:undefined,data);
        healthy=value!==undefined&&String(value)===String(target.expectedValue??'ok');detail+=healthy?' · response matched':' · response did not match';
      }else{await response.body?.cancel();}
      return [{...base,status:healthy?'success':'failed',detail,completedAt:new Date(now()).toISOString()}];
    }catch{return [{...base,status:'failed',detail:'Unreachable, timed out, or invalid health response',completedAt:new Date(now()).toISOString()}];}
  }};
}
