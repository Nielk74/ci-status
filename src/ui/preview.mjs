import {mountBadge} from './app.mjs';
import {observeProjects} from '../desktop/project.mjs';
let state='running';
const badge=mountBadge(document.getElementById('badge'),{request:async data=>{
 const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),v=await r.json();if(!v.ok)throw new Error(v.message??'Could not connect.');
 if(data.action==='snapshot'&&v.value.mode==='demo'&&state!=='all')v.value.runs=v.value.runs.filter(r=>r.status===state).slice(0,2);return v.value;
}});
const stopProjects=observeProjects(window,document,(projects,options)=>badge.setContext(projects,options));
document.getElementById('preview-project').onchange=event=>{
 const value=event.target.value;
 for(const name of ['data-signal-project-kind','data-signal-project-id','data-signal-project-name'])document.body.removeAttribute(name);
 if(value){document.body.setAttribute('data-signal-project-kind',value==='claude'?'claude':'folder');document.body.setAttribute('data-signal-project-id',value==='claude'?'project-one':value==='website'?'C:/work/website':'C:/work/other');document.body.setAttribute('data-signal-project-name',value==='claude'?'Website project':value==='website'?'Website':'Other');}
};
window.addEventListener('pagehide',()=>{stopProjects();badge.destroy();},{once:true});
document.getElementById('preview-state').onchange=ev=>{state=ev.target.value;void badge.refresh();};
document.querySelector('.preview-send').onclick=()=>{const i=document.querySelector('textarea');if(i.value.trim()){i.value='';i.placeholder='Preview only — your prompt stays here.';}};
