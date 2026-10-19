import {normalizeRun} from '../core/model.mjs';
export function createProviderRegistry(providers=[]){
  const entries=new Map();
  function register(provider){
    if(!provider||!/^[-a-z0-9]+$/.test(provider.id)||typeof provider.listRuns!=='function')throw new Error('Provider needs an id and listRuns function.');
    if(entries.has(provider.id))throw new Error('Duplicate provider: '+provider.id);
    entries.set(provider.id,provider);return api;
  }
  const api={register,describe:()=>[...entries.values()].filter(p=>p.id!=='demo').map(({id,label,fields=[]})=>({id,label,fields})),async list(target,context={}){
    const provider=entries.get(target.provider);if(!provider)throw new Error('Unknown provider: '+target.provider);
    const runs=await provider.listRuns(target,context);if(!Array.isArray(runs)||runs.length>100)throw new Error('Provider must return at most 100 runs.');
    const result=runs.map(run=>normalizeRun(run,provider.id,target.id));if(new Set(result.map(r=>r.id)).size!==result.length)throw new Error('Provider returned duplicate run IDs.');return result;
  }};
  providers.forEach(register);return api;
}
