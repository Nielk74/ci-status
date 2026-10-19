import {statusOf} from '../core/model.mjs';
import {createJsonClient} from './client.mjs';
export function createGitHubProvider(options={}){
  const env=options.env??process.env,get=createJsonClient({...options,env,defaultTokenEnv:env.GITHUB_TOKEN?'GITHUB_TOKEN':'GH_TOKEN',headers:{'X-GitHub-Api-Version':'2026-03-10','User-Agent':'signal-ci-mod',Accept:'application/vnd.github+json'}});
  return {id:'github',label:'GitHub Actions',fields:['owner','repo','branch','tokenEnv'],async listRuns(target){
    const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions`,url=new URL(base+'/runs');url.searchParams.set('per_page','6');if(target.branch)url.searchParams.set('branch',target.branch);
    const data=await get(url,target);if(!Array.isArray(data.workflow_runs))throw new Error('Invalid GitHub workflow response.');
    return Promise.all(data.workflow_runs.slice(0,6).map(async run=>{
      const jobs=[];for(let page=1;page<=10;page++){
        const data=await get(`${base}/runs/${encodeURIComponent(run.id)}/jobs?per_page=100&page=${page}`,target);
        if(!Array.isArray(data.jobs))throw new Error('Invalid GitHub job response.');jobs.push(...data.jobs);if(data.jobs.length<100||jobs.length>=data.total_count)break;
      }
      return {id:run.id,name:run.name,repository:`${target.owner}/${target.repo}`,branch:run.head_branch,commit:run.head_sha,title:run.display_title,number:run.run_number,status:statusOf(run.status,run.conclusion),url:run.html_url,startedAt:run.run_started_at??run.created_at,completedAt:run.status==='completed'?run.updated_at:null,jobs:jobs.map(j=>({id:j.id,name:j.name,status:statusOf(j.status,j.conclusion),startedAt:j.started_at,completedAt:j.completed_at,steps:(j.steps??[]).map(s=>({id:s.number,name:s.name,status:statusOf(s.status,s.conclusion),startedAt:s.started_at,completedAt:s.completed_at}))}))};
    }));
  }};
}
