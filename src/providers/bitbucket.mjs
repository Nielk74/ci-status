import {createJsonClient} from './client.mjs';
const state=value=>{const name=value?.name,result=value?.result?.name;return name==='IN_PROGRESS'?'running':name==='PENDING'?'queued':name==='COMPLETED'?({SUCCESSFUL:'success',FAILED:'failed',ERROR:'failed',STOPPED:'cancelled',EXPIRED:'failed'}[result]??'unknown'):name==='PAUSED'?'waiting':'unknown';};
export function createBitbucketProvider(options={}){
  const get=createJsonClient({...options,defaultTokenEnv:'BITBUCKET_TOKEN'});
  return {id:'bitbucket',label:'Bitbucket Pipelines',fields:['workspace','repo','branch','tokenEnv','authScheme'],async listRuns(target){
    const base=`https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(target.workspace)}/${encodeURIComponent(target.repo)}/pipelines`,url=new URL(base);url.searchParams.set('pagelen','6');url.searchParams.set('sort','-created_on');
    if(target.branch)url.searchParams.set('q','target.ref_name='+JSON.stringify(target.branch));
    const data=await get(url,target);if(!Array.isArray(data.values))throw new Error('Invalid Bitbucket pipeline response.');
    return Promise.all(data.values.slice(0,6).map(async p=>{
      const steps=[];let next=`${base}/${encodeURIComponent(p.uuid)}/steps/?pagelen=100`;
      for(let page=0;next&&page<10;page++){
        const u=new URL(next);if(u.origin!=='https://api.bitbucket.org'||!u.pathname.startsWith(new URL(base).pathname+'/'))throw new Error('Unexpected Bitbucket pagination URL.');
        const data=await get(u,target);if(!Array.isArray(data.values))throw new Error('Invalid Bitbucket step response.');steps.push(...data.values);next=data.next;
      }
      return {id:p.uuid,name:p.target?.selector?.pattern??'Pipeline',repository:`${target.workspace}/${target.repo}`,branch:p.target?.ref_name,commit:p.target?.commit?.hash,number:p.build_number,status:state(p.state),startedAt:p.created_on,completedAt:p.completed_on,url:`https://bitbucket.org/${encodeURIComponent(target.workspace)}/${encodeURIComponent(target.repo)}/pipelines/results/${p.build_number}`,jobs:steps.map(s=>({id:s.uuid,name:s.name??'Step',status:state(s.state),startedAt:s.started_on,completedAt:s.completed_on}))};
    }));
  }};
}
