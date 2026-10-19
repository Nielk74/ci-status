// Opt-in, temporary installed-host verification. Never reads conversation text.
module.exports=function verifyInstalled({reportFile,imageFile}){
  try{if(JSON.parse(require('node:fs').readFileSync(reportFile,'utf8')).finished)return;}catch{}
  const {app,BrowserWindow,webContents}=require('electron'),fs=require('node:fs/promises');
  const started=Date.now(),report={installedHost:true,states:[],errors:[]};let lastLabel='',captured=false,done=false;
  async function sample(){
    try{
      const contents=webContents.getAllWebContents().filter(w=>!w.isDestroyed());
      report.views=contents.map(w=>({id:w.id,type:w.getType(),origin:(()=>{try{return new URL(w.getURL()).origin;}catch{return 'empty';}})(),local:w.getURL().startsWith('app://localhost')}));
      report.windows=BrowserWindow.getAllWindows().map(w=>({id:w.id,visible:w.isVisible(),destroyed:w.isDestroyed(),contentsId:w.webContents.id}));
      for(const view of contents){
        if(!view.getURL().startsWith('app://localhost'))continue;
        const state=await view.executeJavaScript(`(()=>{const host=document.getElementById('signal-ci-badge-host'),button=host?.shadowRoot?.querySelector('.ci-badge');if(!button)return {present:false,bridge:!!window.signalCI,editors:[...document.querySelectorAll('[contenteditable="true"],textarea')].map(n=>({tag:n.tagName,role:n.getAttribute('role'),visible:n.getBoundingClientRect().width>0}))};const r=button.getBoundingClientRect();return {present:true,label:button.getAttribute('aria-label'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},fontSize:getComputedStyle(button).fontSize,textColor:getComputedStyle(button).color,popoverColor:getComputedStyle(host.shadowRoot.querySelector('.ci-popover')).backgroundColor,refreshLabel:host.shadowRoot.querySelector('[data-action=refresh]')?.textContent,bridge:!!window.signalCI,obsidianTab:!!document.getElementById('atelier-obsidian-primary-tab')};})()`);
        if(state.label&&state.label!==lastLabel){lastLabel=state.label;report.states.push({...state,time:new Date().toISOString()});}
        report.latest=state;
        if(state.present&&!captured&&state.rect.width>0&&state.rect.y>=0){await fs.writeFile(imageFile,(await view.capturePage()).toPNG());captured=true;}
      }
      if(Date.now()-started>150000){report.finished=true;done=true;}
      await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8');
    }catch(error){report.errors.push(error.message);await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8');}
    if(!done)setTimeout(sample,1000);
  }
  void app.whenReady().then(sample);
};
