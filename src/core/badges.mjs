import {summarize} from './model.mjs';

const text=(value,max=500)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f]/.test(value);
const validId=value=>typeof value==='string'&&/^[-a-zA-Z0-9_]{1,80}$/.test(value);

export function normalizeProject(value){
  if(!value||!['folder','claude'].includes(value.kind)||!text(value.id))throw new Error('Choose a full folder path or Claude project ID.');
  let id=value.id.trim();
  if(value.kind==='folder'){
    id=id.replace(/\\/g,'/');
    const prefix=id.match(/^(?:[a-zA-Z]:\/|\/\/[^/]+\/[^/]+\/?|\/)/)?.[0];
    if(!prefix)throw new Error('Use an absolute project folder path.');
    const parts=[];
    for(const part of id.slice(prefix.length).split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)throw new Error('Invalid project folder path.');parts.pop();}else parts.push(part);}
    id=prefix.replace(/\/$/,'')+(parts.length?'/'+parts.join('/'):'/');
    if(id.length>1&&!/^[a-zA-Z]:\/$/.test(id))id=id.replace(/\/$/,'');
  }else{
    if(/^https?:\/\//i.test(id)){const url=new URL(id);if(url.hostname!=='claude.ai'||url.username||url.password)throw new Error('Use a claude.ai project URL or project ID.');id=url.pathname.match(/^\/project\/([^/]+)\/?$/)?.[1]??'';}
    if(!/^[-a-zA-Z0-9_]{1,120}$/.test(id))throw new Error('Use a Claude project ID or its project URL.');
  }
  const result={kind:value.kind,id};
  if(value.name!==undefined){if(!text(value.name,100))throw new Error('Project names must be short plain text.');result.name=value.name.trim();}
  return result;
}

export function projectKey(project){
  const p=normalizeProject(project),id=p.kind==='folder'&&/^(?:[a-zA-Z]:|\/\/)/.test(p.id)?p.id.toLowerCase():p.id;
  return p.kind+':'+id;
}

export function validateBadges(value,sources){
  if(value===undefined)return [{id:'ci',label:'CI',scope:'global'}];
  if(!Array.isArray(value)||value.length>20)throw new Error('Configure up to 20 badges.');
  const ids=new Set(),sourceIds=new Set(sources.map(s=>s.id));
  return value.map(b=>{
    if(!b||!validId(b.id)||ids.has(b.id)||!text(b.label,60))throw new Error('Badges need unique IDs and a short label.');
    ids.add(b.id);const scope=b.scope??'global';
    if(!['global','project'].includes(scope))throw new Error('Choose Everywhere or one project for badge visibility.');
    const result={id:b.id,label:b.label.trim(),scope};
    if(b.sourceIds!==undefined){
      if(!Array.isArray(b.sourceIds)||b.sourceIds.length>20||new Set(b.sourceIds).size!==b.sourceIds.length||b.sourceIds.some(id=>!sourceIds.has(id)))throw new Error('Choose existing sources for each badge.');
      result.sourceIds=[...b.sourceIds];
    }
    if(scope==='project')result.project=normalizeProject(b.project);
    if(b.display!==undefined){
      if(!b.display||!['status','value'].includes(b.display.type))throw new Error('Choose status text or a source value for the badge display.');
      if(b.display.type==='value'){
        const sourceId=b.display.sourceId;
        if(!sourceIds.has(sourceId)||result.sourceIds&&!result.sourceIds.includes(sourceId))throw new Error('Choose a value source included in this badge.');
        result.display={type:'value',sourceId};
        for(const key of ['prefix','suffix'])if(b.display[key]!==undefined){const v=b.display[key];if(typeof v!=='string'||v.length>24||/[\u0000-\u001f]/.test(v))throw new Error('Value prefixes and suffixes must be short plain text.');result.display[key]=v;}
      }
    }
    return result;
  });
}

export function visibleBadges(config,projects=[]){
  const keys=new Set();for(const p of projects)try{keys.add(projectKey(p));}catch{}
  return (config.badges??[{id:'ci',label:'CI',scope:'global'}]).filter(b=>b.scope!=='project'||keys.has(projectKey(b.project)));
}

export function projectSnapshot(snapshot,badge){
  if(badge.sourceIds===undefined)return snapshot;
  const ids=new Set(badge.sourceIds),runs=(snapshot.runs??[]).filter(r=>ids.has(r.sourceId));
  return {...snapshot,runs,sources:(snapshot.sources??[]).filter(s=>ids.has(s.id)),errors:(snapshot.errors??[]).filter(e=>ids.has(e.sourceId)),summary:summarize(runs)};
}

export function badgeValue(snapshot,badge){
  if(badge.display?.type!=='value')return null;
  const run=(snapshot.runs??[]).find(r=>r.sourceId===badge.display.sourceId);
  const valid=run&&(typeof run.value==='string'||typeof run.value==='number'&&Number.isFinite(run.value));
  return valid?(badge.display.prefix??'')+run.value+(badge.display.suffix??''):'—';
}
