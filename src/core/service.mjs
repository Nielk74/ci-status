import {createProviderRegistry} from '../providers/registry.mjs';
import {createGitHubProvider} from '../providers/github.mjs';
import {createBitbucketProvider} from '../providers/bitbucket.mjs';
import {createTeamCityProvider} from '../providers/teamcity.mjs';
import {createHttpProvider} from '../providers/http.mjs';
import {createDemoProvider} from '../providers/demo.mjs';
import {defaultConfig,validateConfig,readConfig,saveConfig} from './config.mjs';
import {summarize} from './model.mjs';
export function createStatusService({registry,config,configFile,now=Date.now}={}){
  const demo=createDemoProvider({now});registry??=createProviderRegistry([createGitHubProvider(),createBitbucketProvider(),createTeamCityProvider(),createHttpProvider(),demo]);
  let settings=config?validateConfig(config):defaultConfig(),loaded=!!config,revision=0,inflight=null,last=null,previous=new Map(),writes=Promise.resolve();
  async function load(){if(!loaded){settings=await readConfig(configFile);loaded=true;}}
  function envelope(runs,sources,errors,mode=settings.mode){return {mode,runs,sources,errors,badges:structuredClone(settings.badges),summary:summarize(runs),updatedAt:new Date(now()).toISOString(),pollIntervalMs:mode==='demo'?5000:settings.pollIntervalMs};}
  async function refresh(force=false){
    await load();
    if(settings.mode==='demo'){
      // A custom registry need not register the built-in demo provider.
      const {normalizeRun}=await import('./model.mjs');const runs=(await demo.listRuns()).map(r=>normalizeRun(r,'demo','demo'));return envelope(runs,[],[],'demo');
    }
    if(inflight)return inflight;
    if(!force&&last&&now()-Date.parse(last.updatedAt)<settings.pollIntervalMs/2)return structuredClone(last);
    const generation=revision,sources=structuredClone(settings.sources);
    const task=(async()=>{
      const results=await Promise.all(sources.map(async source=>{
        try{return {source,runs:await registry.list(source),error:null};}
        catch(error){return {source,runs:previous.get(source.id)?.runs??[],error:error.message??'Source unavailable'};}
      }));
      if(generation!==revision)return refresh(false);
      for(const r of results)if(!r.error)previous.set(r.source.id,{runs:r.runs,updatedAt:new Date(now()).toISOString()});
      last=envelope(results.flatMap(r=>r.runs),results.map(r=>({id:r.source.id,name:r.source.name,provider:r.source.provider,stale:!!r.error,updatedAt:previous.get(r.source.id)?.updatedAt??null})),results.filter(r=>r.error).map(r=>({sourceId:r.source.id,name:r.source.name,message:r.error})));
      return structuredClone(last);
    })();inflight=task;
    try{return await task;}finally{if(inflight===task)inflight=null;}
  }
  return {async request({action,args}={}){
    await load();
    if(action==='snapshot'||action==='refresh')return refresh(action==='refresh');
    if(action==='config.get')return {...structuredClone(settings),providers:registry.describe()};
    if(action==='config.set'){
      const next=validateConfig(args);
      const operation=writes.then(async()=>{if(configFile)await saveConfig(configFile,next);settings=next;revision++;last=null;inflight=null;previous=new Map();return structuredClone(settings);});
      writes=operation.catch(()=>{});return operation;
    }
    if(action==='demo.reset'){demo.reset();return refresh(true);}
    throw new Error('Unknown status action.');
  }};
}
