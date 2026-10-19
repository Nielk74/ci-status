import {normalizeProject,projectKey} from '../core/badges.mjs';

// Host attributes are an explicit integration contract, never inferred from chat text.
export function detectProjects(document,href){
  const projects=[],seen=new Set();
  const add=value=>{try{const p=normalizeProject(value),key=projectKey(p);if(!seen.has(key)){seen.add(key);projects.push(p);}}catch{}};
  for(const node of document.querySelectorAll('[data-signal-project-kind][data-signal-project-id]')){
    add({kind:node.getAttribute('data-signal-project-kind'),id:node.getAttribute('data-signal-project-id'),...(node.getAttribute('data-signal-project-name')?{name:node.getAttribute('data-signal-project-name')}:{})});
  }
  // Claude Desktop's primary Code folder controls expose their full path in title.
  // Additional folders and sidebar entries do not identify the active project.
  if(!projects.some(p=>p.kind==='folder')){
    const folders=new Map();
    for(const node of document.querySelectorAll('[data-testid="environment-bar-folder"][title], [data-testid="draft-rail-folder"][title]')){
      const rect=node.getBoundingClientRect?.();if(rect&&(!rect.width||!rect.height))continue;
      const id=node.getAttribute('title');if(!id||id.includes(', '))continue;
      try{const p=normalizeProject({kind:'folder',id});folders.set(projectKey(p),p);}catch{}
    }
    if(folders.size===1)add([...folders.values()][0]);
  }
  try{
    if(projects.some(p=>p.kind==='claude'))return projects;
    const url=new URL(href),route=url.hash.startsWith('#/')?url.hash.slice(1):url.pathname;
    const id=route.match(/^\/project\/([^/?#]+)(?:\/|$)/)?.[1];if(id){add({kind:'claude',id:decodeURIComponent(id)});return projects;}
    // Only project breadcrumbs in the main view count; sidebar/recent links never do.
    const breadcrumbs=new Map();
    for(const node of document.querySelectorAll('main a[href*="/project/"], [data-testid="conversation-header"] a[href*="/project/"]')){
      if(node.closest?.('aside,nav,[role="navigation"]'))continue;
      const r=node.getBoundingClientRect?.();if(r&&(!r.width||!r.height))continue;
      const target=new URL(node.getAttribute('href'),url);
      if(target.origin!==url.origin)continue;
      const project=target.pathname.match(/^\/project\/([^/]+)\/?$/)?.[1];
      // Header breadcrumbs identify a conversation's project, unlike arbitrary main content.
      if(project&&node.closest?.('[data-testid="conversation-header"],header')){const name=node.textContent.trim();breadcrumbs.set(project,{kind:'claude',id:project,...(name&&name.length<=100?{name}:{})});}
    }
    if(breadcrumbs.size===1)add([...breadcrumbs.values()][0]);
  }catch{}
  return projects;
}

export function observeProjects(window,document,listener){
  let last='',url=window.location.href;
  const update=()=>{const nextUrl=window.location.href,navigation=nextUrl!==url;url=nextUrl;const projects=detectProjects(document,nextUrl),signature=JSON.stringify(projects);if(signature!==last||navigation){last=signature;listener(projects,{navigation});}};
  const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-signal-project-kind','data-signal-project-id','data-signal-project-name','href','title']});
  const originals=new Map();
  for(const method of ['pushState','replaceState']){const original=window.history[method];const wrapped=function(...args){const result=original.apply(this,args);update();return result;};originals.set(method,{original,wrapped});window.history[method]=wrapped;}
  window.addEventListener('popstate',update);window.addEventListener('hashchange',update);update();
  return ()=>{observer.disconnect();window.removeEventListener('popstate',update);window.removeEventListener('hashchange',update);for(const [method,{original,wrapped}]of originals)if(window.history[method]===wrapped)window.history[method]=original;};
}
