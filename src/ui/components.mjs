import {STATES,progress} from '../core/model.mjs';
import {escapeHtml as e} from '../core/presentation.mjs';
import {icon} from './icons.mjs';
export function badgeState({runs=[],errors=[]}){
 if(errors.length)return {status:'unknown',label:runs.length?'Stale':'Unavailable'};
 if(!runs.length)return {status:'unknown',label:'No sources'};
 for(const status of ['failed','running','waiting','queued','unknown','cancelled']){const n=runs.filter(r=>r.status===status).length;if(n)return {status,label:status==='failed'?n+' failed':status==='running'?n+' running':status==='waiting'?'Approval':STATES[status].label};}
 return {status:runs.some(r=>r.status==='success')?'success':'skipped',label:runs.some(r=>r.status==='success')?'Passed':'Skipped'};
}
export function statusBadge(status){return '<span class="ci-state state-'+status+'">'+icon(STATES[status].icon,status==='running'?'ci-spin':'')+e(STATES[status].label)+'</span>';}
export function progressBar(run){const p=progress(run);return '<div class="ci-progress state-'+run.status+(p.indeterminate?' ci-indeterminate':'')+'" role="progressbar" aria-label="Job progress" '+(p.indeterminate?'':'aria-valuenow="'+p.percent+'" aria-valuemin="0" aria-valuemax="100"')+'><span style="--progress:'+p.percent+'%"></span></div>';}
