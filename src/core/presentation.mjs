import {STATES,progress} from './model.mjs';
export function duration(start,end,now=Date.now()){
  if(!start)return '—';const seconds=Math.max(0,Math.floor(((end?Date.parse(end):now)-Date.parse(start))/1000));
  if(!Number.isFinite(seconds))return '—';return seconds>=3600?`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`:seconds>=60?`${Math.floor(seconds/60)}m ${seconds%60}s`:`${seconds}s`;
}
export function runSummary(run){const p=progress(run);return `${run.name} · ${STATES[run.status].label}\n${run.repository}${run.branch?' · '+run.branch:''}${run.commit?' · '+run.commit.slice(0,7):''}\n${p.total?`${p.completed}/${p.total} jobs completed`:run.detail||'No job details available'}${run.url?'\n'+run.url:''}`;}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
