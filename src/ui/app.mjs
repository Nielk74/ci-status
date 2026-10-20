import {STATES,progress} from '../core/model.mjs';
import {escapeHtml as e} from '../core/presentation.mjs';
import {visibleBadges,projectSnapshot,normalizeProject,projectKey,badgeValue} from '../core/badges.mjs';
import {icon} from './icons.mjs';
import {badgeState,statusBadge,progressBar} from './components.mjs';

// One controller owns the entire row, one popover and one polling timer.
export function mountBadge(root,{request,context=[]}={}){
  let data={runs:[],errors:[],mode:'demo'},config=null,projects=context,manualProject=null;
  let open=false,manager=false,active='ci',editing=null,selected=null,error='',saving=false;
  let timer,stopped=false,generation=0,viewRevision=0;
  const uid='ci-'+Math.random().toString(36).slice(2);
  const call=async(action,args)=>{
    const response=await request({action,args});
    if(response?.ok===false)throw new Error(response.message??'Source unavailable');
    const value=response?.ok===true?response.value:response;
    return action==='config.get'?{...value,badges:value.badges??[{id:'ci',label:'CI',scope:'global'}]}:value;
  };
  const definitions=()=>data.badges??config?.badges??[{id:'ci',label:'CI',scope:'global'}];
  const currentProjects=()=>manualProject?[manualProject]:projects;
  const shown=()=>visibleBadges({badges:definitions()},currentProjects());
  const activeBadge=()=>definitions().find(b=>b.id===active)??shown()[0]??{id:'ci',label:'CI',scope:'global'};
  const currentData=()=>projectSnapshot(data,activeBadge());
  const projectName=p=>p.name??(p.kind==='folder'?p.id.split('/').filter(Boolean).at(-1):p.id);
  const scopeName=b=>b.scope==='project'?projectName(b.project):'Everywhere';

  function render(){
    if(stopped)return;
    const element=root.getRootNode().activeElement??document.activeElement;
    const focused=root.contains(element)?element:null,name=focused?.name,start=focused?.selectionStart,end=focused?.selectionEnd;
    const badges=shown(),view=currentData(),run=view.runs.find(r=>r.id===selected);
    const buttons=badges.map(b=>{
      const snapshot=projectSnapshot(data,b),state=badgeState(snapshot),expanded=open&&!manager&&!editing&&active===b.id;
      const value=badgeValue(snapshot,b),metric=value!==null&&!snapshot.errors.length&&!['failed','cancelled'].includes(state.status),text=metric?value:state.label;
      const accessible=metric?`${b.label} value: ${text}; status: ${state.label}`:`${b.label} status: ${state.label}`;
      return `<button type="button" class="ci-badge state-${state.status}" data-badge-id="${e(b.id)}" aria-label="${e(accessible)}" aria-expanded="${expanded}" aria-controls="${uid}" title="${e(b.label)} · ${e(text)}${metric?' · '+e(state.label):''}${b.scope==='project'?' · '+e(scopeName(b)):''}">${icon(STATES[state.status].icon,state.status==='running'?'ci-spin':'')}<b>${e(b.label)}</b><span class="ci-divider">·</span><span class="ci-badge-value">${e(text)}</span></button>`;
    }).join('');
    const title=editing?.type==='badge'?'Configure badge':editing?'Configure source':manager?'Badges':activeBadge().label==='CI'?'CI / CD':activeBadge().label;
    const body=editing?.type==='badge'?badgeForm():editing?sourceForm():manager?management():run?details(run):list(view);
    root.innerHTML=`<div class="ci-widget ci-badge-row">${buttons}${badges.length?'':`<button type="button" class="ci-manage" data-action="manage" aria-label="Configure badges">${icon('edit')}Badges</button>`}<section id="${uid}" class="ci-popover" ${open?'':'hidden'} aria-label="CI sources"><header><strong>${e(title)}</strong><small>${data.mode==='demo'?'demo':''}</small><button type="button" data-action="close" aria-label="Close CI details">${icon('x')}</button></header>${error?`<p class="ci-error" role="alert">${e(error)}</p>`:''}${body}${editing?'':`<footer><button type="button" data-action="${manager?'new-badge':'add'}">${icon('plus')}${manager?'Add badge':'Add source'}</button><button type="button" data-action="${manager?'add':'manage'}">${icon('edit')}${manager?'Add source':'Badges'}</button><button type="button" data-action="refresh" aria-label="Refresh CI status">${icon('refresh')}Refresh</button></footer>`}</section></div>`;
    if(open){
      const anchor=root.querySelector(`[data-badge-id="${active}"]`)??root.querySelector('.ci-badge,.ci-manage');
      const panel=root.querySelector('.ci-popover'),rect=anchor?.getBoundingClientRect?.(),bounds=root.getBoundingClientRect?.();
      if(rect&&panel){panel.style.maxHeight=Math.max(120,Math.min(480,rect.top-12))+'px';const left=rect.left-(bounds?.left??rect.left),overflow=Math.max(0,rect.left+panel.offsetWidth-(window.innerWidth-12));panel.style.left=(left-overflow)+'px';}
    }
    if(name){
      const target=[...root.querySelectorAll('[name]')].find(n=>n.name===name&&(focused.type!=='checkbox'||n.value===focused.value));target?.focus({preventScroll:true});
      if(typeof start==='number'&&target?.setSelectionRange)try{target.setSelectionRange(start,end);}catch{}
    }
  }

  function list(view){
    const ids=activeBadge().sourceIds;
    return `<div class="ci-run-list">${view.errors.map(x=>`<p class="ci-error">${e(x.name)} · ${e(x.message)}</p>`).join('')}${view.runs.slice(0,12).map(r=>`<button type="button" class="ci-run state-${r.status}" data-action="run" data-id="${e(r.id)}">${icon(STATES[r.status].icon,r.status==='running'?'ci-spin':'')}<span><strong>${e(r.name)}</strong><small>${e(r.repository)}${r.branch?' · '+e(r.branch):''}</small></span><em>${e(STATES[r.status].label)}</em></button>`).join('')||'<p class="ci-note">Connect a pipeline or HTTP endpoint.</p>'}</div>${(config?.sources??[]).filter(s=>ids===undefined||ids.includes(s.id)).map(s=>`<button type="button" class="ci-edit" data-action="edit" data-id="${e(s.id)}">${icon('edit')}${e(s.name)}</button>`).join('')}${data.mode==='demo'?'<p class="ci-note">Sample data · add a source to connect your own.</p>':''}`;
  }

  function knownProjects(){
    const result=new Map();
    for(const project of [...projects,...definitions().filter(b=>b.scope==='project').map(b=>b.project)])try{result.set(projectKey(project),project);}catch{}
    return [...result.values()];
  }

  function management(){
    const known=knownProjects(),selectedKey=manualProject?projectKey(manualProject):'';
    const detected=projects.map(projectName).join(', ')||'No project detected';
    return `<div class="ci-context"><label>Project context<select name="projectContext" aria-label="Project context"><option value="">Automatic · ${e(detected)}</option>${known.map((p,i)=>`<option value="${i}" ${projectKey(p)===selectedKey?'selected':''}>${e(projectName(p))} · ${p.kind==='folder'?'folder':'Claude project'}</option>`).join('')}</select></label><small>${manualProject?'Selected manually for this page; resets on navigation.':'Scoped badges stay hidden until their exact project is known.'}</small></div><div class="ci-run-list">${definitions().map(b=>`<button type="button" class="ci-run" data-action="edit-badge" data-id="${e(b.id)}">${icon('edit')}<span><strong>${e(b.label)}</strong><small>${e(scopeName(b))} · ${b.sourceIds===undefined?'All sources':b.sourceIds.length+' sources'}</small></span></button>`).join('')||'<p class="ci-note">Add a badge to show a source or group of sources.</p>'}</div><div class="ci-settings-sources">${(config?.sources??[]).map(s=>`<button type="button" class="ci-edit" data-action="edit" data-id="${e(s.id)}">${icon('edit')}${e(s.name)}</button>`).join('')}</div>`;
  }

  function details(run){
    const p=progress(run),source=config?.sources.find(s=>s.id===run.sourceId);
    return `<div class="ci-detail"><button type="button" data-action="back" class="ci-back">← Sources</button><h3>${e(run.name)}</h3>${statusBadge(run.status)}<dl><dt>Source</dt><dd>${e(source?.name??run.provider)}</dd><dt>Repo / host</dt><dd>${e(run.repository||'—')}</dd><dt>Branch</dt><dd>${e(run.branch||'—')}</dd>${source?.url?`<dt>Path</dt><dd>${e(source.url)}</dd>`:''}${run.commit?`<dt>Commit</dt><dd>${e(run.commit.slice(0,8))}</dd>`:''}</dl>${run.kind==='service'?'':progressBar(run)}<p class="ci-note">${e(run.detail||(p.total?p.completed+' / '+p.total+' jobs complete':p.indeterminate?'Job progress unavailable':p.percent+'% reported by provider'))}</p>${run.url?`<a class="ci-link" href="${e(run.url)}" target="_blank" rel="noopener noreferrer">Open source ${icon('external')}</a>`:''}</div>`;
  }

  const input=(name,label,placeholder='',required=false,type='text')=>`<label>${label}<input name="${name}" type="${type}" value="${e(editing[name]??'')}" placeholder="${e(placeholder)}" ${required?'required':''} maxlength="500"></label>`;
  const actions=()=>`<div class="ci-actions"><button type="button" data-action="cancel">Cancel</button>${editing.existing?'<button type="button" data-action="remove">Remove</button>':''}<button type="submit" ${saving?'disabled':''}>${saving?'Saving…':'Save'}</button></div>`;

  function metricForm(){
    const choices=config.sources.filter(s=>editing.sourceMode==='all'||editing.sourceIds.includes(s.id));
    return `<label>Display<select name="displayType"><option value="status" ${editing.displayType!=='value'?'selected':''}>Status text</option><option value="value" ${editing.displayType==='value'?'selected':''}>Source value / metric</option></select></label>${editing.displayType==='value'?`<label>Value source<select name="valueSourceId" required>${choices.map(s=>`<option value="${e(s.id)}" ${editing.valueSourceId===s.id?'selected':''}>${e(s.name)}</option>`).join('')}</select></label>${input('valuePrefix','Prefix (optional)','')}${input('valueSuffix','Suffix (optional)',' ms')}<p class="ci-note">HTTP sources use their Value property path. Custom providers return a value field. Failed or stale checks show their status.</p>`:''}`;
  }

  function badgeForm(){
    const b=editing;
    return `<form class="ci-form">${input('label','Label','Build',true)}<label>Visible in<select name="scope"><option value="global" ${b.scope==='global'?'selected':''}>Everywhere</option><option value="project" ${b.scope==='project'?'selected':''}>One project</option></select></label>${b.scope==='project'?`<div class="ci-project-fields"><label>Project type<select name="projectKind"><option value="folder" ${b.projectKind==='folder'?'selected':''}>Claude Code folder</option><option value="claude" ${b.projectKind==='claude'?'selected':''}>Claude Project</option></select></label>${input('projectId',b.projectKind==='claude'?'Project URL or ID':'Full folder path',b.projectKind==='claude'?'https://claude.ai/project/…':'C:/work/website',true)}${input('projectName','Project name (optional)','Website')}${currentProjects().length?'<button type="button" class="ci-use-project" data-action="use-project">Use current project</button>':''}</div>`:''}<label>Sources<select name="sourceMode"><option value="all" ${b.sourceMode==='all'?'selected':''}>All current and future sources</option><option value="selected" ${b.sourceMode==='selected'?'selected':''}>Choose sources</option></select></label>${b.sourceMode==='selected'?`<div class="ci-source-choices">${config.sources.map(s=>`<label class="ci-check"><input type="checkbox" name="sourceIds" value="${e(s.id)}" ${b.sourceIds.includes(s.id)?'checked':''}>${e(s.name)}</label>`).join('')||'<p class="ci-note">Add a source first, or use all sources.</p>'}</div>`:''}${metricForm()}${actions()}</form>`;
  }

  function sourceForm(){
    const p=editing.provider;
    return `<form class="ci-form"><label>Provider<select name="provider">${config.providers.map(x=>`<option value="${e(x.id)}" ${p===x.id?'selected':''}>${e(x.label)}</option>`).join('')}</select></label>${input('name','Name','Production build',true)}${['github','bitbucket'].includes(p)?input('repository','Repository',p==='github'?'owner/repo':'workspace/repo',true):''}${['http','teamcity'].includes(p)?input('url',p==='http'?'Health endpoint':'TeamCity URL','https://…',true,'url'):''}${p==='teamcity'?input('buildType','Build configuration / path','Project_Build',true):''}${p!=='http'?input('branch','Branch (optional)','main'):input('expectedStatus','Expected HTTP status','200',true,'number')}${p==='http'?`<details><summary>JSON fields (optional)</summary>${input('jsonPath','Property path','service.status')}${input('expectedValue','Expected value','ok')}${input('valuePath','Value property path (optional)','metrics.latencyMs')}</details>`:''}<details><summary>Authentication (optional)</summary>${input('tokenEnv','Token environment variable','MY_CI_TOKEN')}${p==='bitbucket'?'<label>Scheme<select name="authScheme"><option value="bearer">Bearer</option><option value="basic" '+(editing.authScheme==='basic'?'selected':'')+'>Basic · base64(email:token)</option></select></label>':''}<small>Variable name only. Credentials stay in the host.</small></details>${actions()}</form>`;
  }

  async function refresh(){
    const id=++generation;clearTimeout(timer);
    try{const next=await call('snapshot');if(stopped||id!==generation)return;data=next;if(!editing)error='';}
    catch(x){if(id===generation)error=x.message;}
    finally{if(!stopped&&id===generation){if(!editing)render();timer=setTimeout(refresh,data.pollIntervalMs??30000);}}
  }

  async function persist(next){
    const revision=viewRevision;++generation;clearTimeout(timer);
    try{
      await call('config.set',next);config=await call('config.get');data={...data,badges:config.badges};
      if(revision===viewRevision){editing=null;selected=null;error='';}await refresh();return revision===viewRevision;
    }catch(x){if(!stopped)timer=setTimeout(refresh,data.pollIntervalMs??30000);throw x;}
  }

  function useProject(project=currentProjects()[0]){
    if(!project)return;
    editing.projectKind=project.kind;editing.projectId=project.id;editing.projectName=projectName(project);
  }

  async function loadSettings(revision){
    const next=await call('config.get');if(stopped||revision!==viewRevision)return false;config=next;return true;
  }

  async function click(event){
    const revision=++viewRevision;
    const badge=event.target.closest('.ci-badge');
    if(badge){try{const id=badge.dataset?.badgeId??'ci';open=!(open&&!manager&&!editing&&active===id);active=id;manager=false;selected=null;editing=null;error='';if(await loadSettings(revision))render();}catch(x){if(revision===viewRevision){error=x.message;render();}}return;}
    const button=event.target.closest('[data-action]');if(!button)return;
    try{
      switch(button.dataset.action){
        case 'close':open=false;editing=null;selected=null;render();root.querySelector('.ci-badge,.ci-manage')?.focus();break;
        case 'run':selected=button.dataset.id;render();break;
        case 'back':selected=null;render();break;
        case 'refresh':await refresh();break;
        case 'manage':if(!await loadSettings(revision))return;data.badges=config.badges;manager=true;open=true;editing=null;selected=null;error='';render();break;
        case 'new-badge':
          if(!await loadSettings(revision))return;editing={type:'badge',id:crypto.randomUUID(),label:'',scope:'global',sourceMode:'all',sourceIds:[],projectKind:currentProjects()[0]?.kind??'folder',displayType:'status',valueSourceId:config.sources[0]?.id??'',valuePrefix:'',valueSuffix:''};error='';render();break;
        case 'edit-badge':{
          if(!await loadSettings(revision))return;const b=config.badges.find(b=>b.id===button.dataset.id);if(!b)break;
          editing={...b,type:'badge',existing:true,sourceMode:b.sourceIds===undefined?'all':'selected',sourceIds:[...(b.sourceIds??[])],projectKind:b.project?.kind??'folder',projectId:b.project?.id??'',projectName:b.project?.name??'',displayType:b.display?.type??'status',valueSourceId:b.display?.sourceId??b.sourceIds?.[0]??config.sources[0]?.id??'',valuePrefix:b.display?.prefix??'',valueSuffix:b.display?.suffix??''};error='';render();break;
        }
        case 'use-project':useProject();render();break;
        case 'add':if(!await loadSettings(revision))return;editing={type:'source',id:crypto.randomUUID(),provider:'github',name:'',expectedStatus:200};error='';render();break;
        case 'edit':{
          if(!await loadSettings(revision))return;const source=config.sources.find(s=>s.id===button.dataset.id);if(!source)break;
          editing={...source,type:'source',existing:true,repository:[source.owner??source.workspace,source.repo].filter(Boolean).join('/')};error='';render();break;
        }
        case 'cancel':editing=null;error='';render();break;
        case 'remove':{
          if(editing.type==='badge')await persist({...config,badges:config.badges.filter(b=>b.id!==editing.id)});
          else{
            const id=editing.id,sources=config.sources.filter(s=>s.id!==id);
            const badges=config.badges.map(b=>({...b,...(b.sourceIds?{sourceIds:b.sourceIds.filter(s=>s!==id)}:{}),...(b.display?.sourceId===id?{display:undefined}:{})}));
            await persist({...config,mode:sources.length?'live':'demo',sources,badges});
          }
          render();break;
        }
      }
    }catch(x){if(revision===viewRevision){error=x.message;render();}}
  }

  function change(event){
    const target=event.target;
    if(target.name==='projectContext'&&!editing){
      ++viewRevision;manualProject=target.value===''?null:knownProjects()[Number(target.value)]??null;selected=null;render();return;
    }
    if(!editing||!target.name)return;
    if(target.name==='sourceIds'){
      editing.sourceIds=target.checked?[...new Set([...editing.sourceIds,target.value])]:editing.sourceIds.filter(id=>id!==target.value);
      if(editing.sourceMode==='selected'&&!editing.sourceIds.includes(editing.valueSourceId))editing.valueSourceId=editing.sourceIds[0]??'';
      render();return;
    }
    editing[target.name]=target.value;
    if(target.name==='scope'&&target.value==='project'&&!editing.projectId)useProject();
    if(['provider','scope','sourceMode','projectKind','displayType'].includes(target.name))render();
  }

  async function submit(event){
    event.preventDefault();if(saving)return;
    const revision=viewRevision,form=new FormData(event.target),values=Object.fromEntries(form);
    Object.assign(editing,values,editing.type==='badge'?{sourceIds:values.sourceMode==='selected'?form.getAll('sourceIds'):editing.sourceIds}:{});saving=true;
    try{
      if(editing.type==='badge'){
        const badge={id:editing.id,label:values.label,scope:values.scope};
        if(values.sourceMode==='selected')badge.sourceIds=form.getAll('sourceIds');
        if(badge.scope==='project')badge.project=normalizeProject({kind:values.projectKind,id:values.projectId,...(values.projectName?{name:values.projectName}:{})});
        if(values.displayType==='value')badge.display={type:'value',sourceId:values.valueSourceId,...(values.valuePrefix?{prefix:values.valuePrefix}:{}),...(values.valueSuffix?{suffix:values.valueSuffix}:{})};
        const badges=editing.existing?config.badges.map(b=>b.id===badge.id?badge:b):[...config.badges,badge];
        if(await persist({...config,badges}))manager=true;
      }else{
        const source={id:editing.id,provider:values.provider,name:values.name};
        if(['github','bitbucket'].includes(source.provider)){
          const [owner,repo,...rest]=(values.repository??'').split('/');
          if(rest.length||!owner||!repo)throw new Error('Use owner/repository or workspace/repository.');
          source[source.provider==='github'?'owner':'workspace']=owner;source.repo=repo;
        }
        for(const key of ['url','buildType','branch','tokenEnv','authScheme','jsonPath','expectedValue','valuePath'])if(values[key])source[key]=values[key];
        if(source.provider==='http')source.expectedStatus=Number(values.expectedStatus||200);
        const sources=editing.existing?config.sources.map(s=>s.id===source.id?source:s):[...config.sources,source];
        const badges=!editing.existing&&!manager?config.badges.map(b=>b.id===active&&b.sourceIds!==undefined?{...b,sourceIds:[...b.sourceIds,source.id]}:b):config.badges;
        await persist({...config,mode:'live',sources,badges});
      }
    }catch(x){if(revision===viewRevision)error=x.message;}
    finally{saving=false;render();}
  }

  function setContext(next,{navigation=false}={}){
    const normalized=[];for(const project of next??[])try{normalized.push(normalizeProject(project));}catch{}
    if(!navigation&&JSON.stringify(projects)===JSON.stringify(normalized))return;
    ++viewRevision;projects=normalized;manualProject=null;open=false;editing=null;selected=null;error='';render();
  }
  function key(event){if(event.key==='Escape'){++viewRevision;open=false;editing=null;render();root.querySelector('.ci-badge,.ci-manage')?.focus();}}
  const outside=event=>{if(open&&!event.composedPath().includes(root)){++viewRevision;open=false;editing=null;render();}};
  // The host composer cancels bubbling mousedown to keep focus in its editor.
  // Keep native controls' default focus/picker behavior inside our widget.
  const mouseDown=event=>event.stopPropagation();
  root.addEventListener('mousedown',mouseDown);root.addEventListener('click',click);root.addEventListener('input',change);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
  render();void call('config.get').then(c=>{if(stopped)return;config=c;return refresh();}).catch(x=>{error=x.message;if(!stopped)render();});
  return {refresh,setContext,destroy(){stopped=true;generation++;viewRevision++;clearTimeout(timer);root.removeEventListener('mousedown',mouseDown);root.removeEventListener('click',click);root.removeEventListener('input',change);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);root.replaceChildren();}};
}
