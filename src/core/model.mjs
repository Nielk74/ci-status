export const STATES=Object.freeze({
  running:{label:'Running',icon:'loader',color:'#bade85'},
  success:{label:'Passed',icon:'check',color:'#8fd9ac'},
  failed:{label:'Failed',icon:'x',color:'#f28e8e'},
  queued:{label:'Queued',icon:'clock',color:'#a8adba'},
  waiting:{label:'Needs approval',icon:'pause',color:'#edc47e'},
  cancelled:{label:'Cancelled',icon:'stop',color:'#a8adba'},
  skipped:{label:'Skipped',icon:'skip',color:'#a8adba'},
  unknown:{label:'Unknown',icon:'help',color:'#baa8df'}
});
const aliases={in_progress:'running',pending:'queued',requested:'queued',failure:'failed',timed_out:'failed',startup_failure:'failed',stale:'failed',action_required:'waiting',neutral:'skipped'};
export function statusOf(state,conclusion){
  if(state==='completed')return Object.hasOwn(STATES,conclusion)?conclusion:aliases[conclusion]??'unknown';
  return Object.hasOwn(STATES,state)?state:aliases[state]??'unknown';
}
export const terminal=status=>['success','failed','cancelled','skipped'].includes(status);
export function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const text=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function job(value,i){return {id:text(value.id??i),name:text(value.name??'Job'),status:statusOf(value.status),startedAt:date(value.startedAt),completedAt:date(value.completedAt),steps:(Array.isArray(value.steps)?value.steps:[]).slice(0,500).map((s,i)=>({id:text(s.id??i),name:text(s.name??'Step'),status:statusOf(s.status),startedAt:date(s.startedAt),completedAt:date(s.completedAt)}))};}
export function normalizeRun(value,provider,sourceId){
  if(!value||!['string','number'].includes(typeof value.id)||!String(value.id))throw new Error('Provider result requires an id.');
  return {id:`${provider}:${sourceId}:${value.id}`,externalId:text(value.id),sourceId,provider,kind:value.kind==='service'?'service':'pipeline',name:text(value.name??'Pipeline'),repository:text(value.repository??''),branch:text(value.branch??''),commit:text(value.commit??''),title:text(value.title??''),number:text(value.number??''),status:statusOf(value.status),url:safeUrl(value.url),startedAt:date(value.startedAt),completedAt:date(value.completedAt),detail:text(value.detail??''),environment:text(value.environment??''),progressPercent:Number.isFinite(value.progressPercent)?Math.max(0,Math.min(100,value.progressPercent)):null,jobs:(Array.isArray(value.jobs)?value.jobs:[]).slice(0,1000).map(job)};
}
export function progress(run){
  const jobs=run.jobs??[],completed=jobs.filter(j=>terminal(j.status)).length,total=jobs.length;
  return {completed,total,percent:total?Math.round(completed/total*100):Number.isFinite(run.progressPercent)?run.progressPercent:0,indeterminate:!total&&!Number.isFinite(run.progressPercent)};
}
export function summarize(runs){
  const counts=Object.fromEntries(Object.keys(STATES).map(key=>[key,0]));
  for(const run of runs)counts[Object.hasOwn(STATES,run.status)?run.status:'unknown']++;
  return {total:runs.length,...counts};
}
