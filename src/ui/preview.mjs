import {mountBadge} from './app.mjs';
let state='running';
const badge=mountBadge(document.getElementById('badge'),{request:async data=>{
 const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),v=await r.json();if(!v.ok)throw new Error(v.message??'Could not connect.');
 if(data.action==='snapshot'&&v.value.mode==='demo'&&state!=='all')v.value.runs=v.value.runs.filter(r=>r.status===state).slice(0,2);return v.value;
}});
document.getElementById('preview-state').onchange=ev=>{state=ev.target.value;void badge.refresh();};
document.querySelector('.preview-send').onclick=()=>{const i=document.querySelector('textarea');if(i.value.trim()){i.value='';i.placeholder='Preview only — your prompt stays here.';}};
