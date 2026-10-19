import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateBadges} from './badges.mjs';
export const defaultConfig=()=>({mode:'demo',pollIntervalMs:30000,sources:[],badges:validateBadges(undefined,[])});
const credentialKeys=/^(token|password|secret|authorization|api[_-]?key|access[_-]?token)$/i;
const cleanText=value=>typeof value==='string'&&value.length<=500&&!/[\u0000-\u001f]/.test(value);
export function validateConfig(value){
  if(!value||!['demo','live'].includes(value.mode)||!Array.isArray(value.sources)||value.sources.length>20)throw new Error('Choose demo or live mode and up to 20 sources.');
  const pollIntervalMs=value.pollIntervalMs??30000;if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<15000||pollIntervalMs>3600000)throw new Error('Refresh interval must be between 15 and 3600 seconds.');
  const ids=new Set(),sources=value.sources.map(s=>{
    if(!s||!/^[-a-zA-Z0-9_]{1,80}$/.test(s.id)||ids.has(s.id)||!/^[-a-z0-9]+$/.test(s.provider))throw new Error('Sources need unique IDs and a provider.');ids.add(s.id);
    for(const [key,v]of Object.entries(s)){if(credentialKeys.test(key))throw new Error('Credentials belong in environment variables, referenced with tokenEnv.');if(key!=='options'&&!['number','string','undefined'].includes(typeof v))throw new Error('Invalid source field: '+key);}
    const result={id:s.id,provider:s.provider,name:cleanText(s.name)?s.name.slice(0,100):s.id};
    for(const key of ['owner','workspace','repo','branch','url','buildType','tokenEnv','authScheme','jsonPath','expectedValue','valuePath'])if(s[key]!==undefined&&s[key]!==''){if(!cleanText(s[key]))throw new Error('Invalid '+key);result[key]=s[key].trim();}
    if(result.tokenEnv&&!/^[A-Za-z_][A-Za-z0-9_]*$/.test(result.tokenEnv))throw new Error('Invalid environment variable name.');
    if(result.authScheme&&!['bearer','basic'].includes(result.authScheme))throw new Error('Choose bearer or basic authentication.');
    if(s.expectedStatus!==undefined&&s.expectedStatus!==''){const status=Number(s.expectedStatus);if(!Number.isInteger(status)||status<100||status>599)throw new Error('Expected HTTP status must be 100–599.');result.expectedStatus=status;}
    if(['http','teamcity'].includes(s.provider)){
      let u;try{u=new URL(result.url);}catch{throw new Error('Enter a complete http:// or https:// source URL.');}
      if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>/token|password|secret|api.?key|authorization/i.test(k)))throw new Error('Use an HTTP(S) URL without inline credentials; use tokenEnv for credentials.');
      result.url=u.href;
    }
    if(s.provider==='github'&&(!/^[a-zA-Z0-9_.-]+$/.test(result.owner??'')||!/^[a-zA-Z0-9_.-]+$/.test(result.repo??'')))throw new Error('GitHub requires an owner and repository name.');
    if(s.provider==='bitbucket'&&(!/^[a-zA-Z0-9_.-]+$/.test(result.workspace??'')||!/^[a-zA-Z0-9_.-]+$/.test(result.repo??'')))throw new Error('Bitbucket requires a workspace and repository slug.');
    if(s.provider==='teamcity'&&(!/^[a-zA-Z0-9_.-]+$/.test(result.buildType??'')||result.branch&&/[,():$]/.test(result.branch)))throw new Error('Use a TeamCity build configuration ID and a branch without locator syntax.');
    if(result.jsonPath&&!/^[a-zA-Z0-9_.-]+$/.test(result.jsonPath))throw new Error('JSON path uses dot-separated property names.');
    if(result.valuePath&&!/^[a-zA-Z0-9_.-]+$/.test(result.valuePath))throw new Error('Value path uses dot-separated property names.');
    if(s.options!==undefined){const raw=JSON.stringify(s.options);if(raw.length>8000||!s.options||Array.isArray(s.options)||typeof s.options!=='object'||Object.keys(s.options).some(k=>credentialKeys.test(k)))throw new Error('Custom options must be a small object without credentials.');result.options=JSON.parse(raw);}
    return result;
  });return {mode:value.mode,pollIntervalMs,sources,badges:validateBadges(value.badges,sources)};
}
export async function readConfig(file){if(!file)return defaultConfig();try{return validateConfig(JSON.parse(await fs.readFile(file,'utf8')));}catch(error){if(error.code==='ENOENT')return defaultConfig();throw new Error('Could not load source configuration: '+error.message);}}
export async function saveConfig(file,config){
  await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,JSON.stringify(config,null,2)+'\n',{encoding:'utf8',flag:'wx'});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
}
