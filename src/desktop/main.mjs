import {ipcMain} from 'electron';
import {createStatusService} from '../core/service.mjs';
import {isTrustedFrame} from './trust.mjs';
const service=createStatusService({configFile:__SIGNAL_CONFIG_FILE__});
ipcMain.handle('signal-ci:request',async(event,request)=>{
  try{
    if(!isTrustedFrame(event.senderFrame?.url,event.senderFrame===event.sender.mainFrame))throw new Error('Signal is available only in the main local Claude window.');
    if(JSON.stringify(request).length>65536)throw new Error('Request too large.');
    return {ok:true,value:await service.request(request)};
  }catch(error){return {ok:false,message:error.message??'Status request failed.'};}
});
