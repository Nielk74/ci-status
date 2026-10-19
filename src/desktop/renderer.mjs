import {mountBadge} from '../ui/app.mjs';
import styles from '../ui/styles.css';
if(!document.getElementById('signal-ci-badge-host')&&window.signalCI?.request){
 const host=document.createElement('span');host.id='signal-ci-badge-host';host.style.cssText='display:inline-block;position:relative;vertical-align:middle;-webkit-app-region:no-drag';
 const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),root=document.createElement('span');style.textContent=styles;shadow.append(style,root);
 const badge=mountBadge(root,{request:window.signalCI.request});let disposed=false,scheduled=false;
 function attach(){
  scheduled=false;if(disposed)return;
  for(const duplicate of document.querySelectorAll('#signal-ci-badge-host'))if(duplicate!==host)duplicate.remove();
  const slot=document.querySelector('[data-signal-ci-slot]');if(slot){if(host.parentElement!==slot)slot.append(host);host.hidden=false;return;}
  const editors=[...document.querySelectorAll('[contenteditable="true"],textarea')].filter(n=>{const r=n.getBoundingClientRect();return r.width>200&&r.height>15&&n.getAttribute('aria-hidden')!=='true';});
  const editor=editors.at(-1);if(!editor){host.hidden=true;return;}
  const composer=editor.closest('fieldset,form')??editor.parentElement?.parentElement;
  if(!composer||composer===document.body){host.hidden=true;return;}
  host.hidden=false;if(host.parentElement!==composer){host.style.margin='0 10px 8px';composer.append(host);}
 }
 const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(attach);});observer.observe(document.body,{childList:true,subtree:true});attach();
 window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();badge.destroy();host.remove();},{once:true});
}
