;(()=>{
  try{
    const {contextBridge,ipcRenderer}=require('electron');
    contextBridge.exposeInMainWorld('signalCI',Object.freeze({request:request=>ipcRenderer.invoke('signal-ci:request',request)}));
  }catch(error){console.warn('[Signal CI] Bridge unavailable:',error.message);}
})();
