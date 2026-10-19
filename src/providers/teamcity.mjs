import {createJsonClient} from './client.mjs';
function timestamp(v){return v?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})([+-]\d{2})(\d{2})$/,'$1-$2-$3T$4:$5:$6$7:$8');}
export function createTeamCityProvider(options={}){
  const get=createJsonClient({...options,defaultTokenEnv:'TEAMCITY_TOKEN'});
  return {id:'teamcity',label:'TeamCity',fields:['url','buildType','branch','tokenEnv'],async listRuns(target){
    const url=new URL(target.url.replace(/\/$/,'')+'/app/rest/builds');
    url.searchParams.set('locator',`buildType:(id:${target.buildType}),branch:(${target.branch?'name:'+target.branch:'default:any'}),state:any,count:6`);
    url.searchParams.set('fields','build(id,number,state,status,branchName,webUrl,startDate,finishDate,statusText,buildType(name,projectName),runningInfo(percentageComplete),revisions(revision(version)))');
    const data=await get(url,target);if(data.build!==undefined&&!Array.isArray(data.build))throw new Error('Invalid TeamCity build response.');
    return (data.build??[]).slice(0,6).map(b=>({id:b.id,name:b.buildType?.name??target.buildType,repository:b.buildType?.projectName??target.buildType,branch:b.branchName,commit:b.revisions?.revision?.[0]?.version,number:b.number,status:b.state==='running'?'running':b.state==='queued'?'queued':b.state==='finished'?({SUCCESS:'success',FAILURE:'failed',UNKNOWN:'unknown'}[b.status]??'unknown'):'unknown',url:b.webUrl,startedAt:timestamp(b.startDate),completedAt:timestamp(b.finishDate),detail:b.statusText,progressPercent:b.runningInfo?.percentageComplete,jobs:[]}));
  }};
}
