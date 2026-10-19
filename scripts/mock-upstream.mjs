import fs from 'node:fs/promises';
import {createMockCiServer} from './fixtures/mock-ci.mjs';
const upstream=await createMockCiServer({port:4320}),root=new URL('../.local/mock-upstream/',import.meta.url);
await fs.mkdir(root,{recursive:true});await fs.writeFile(new URL('sources.json',root),JSON.stringify(upstream.config,null,2)+'\n','utf8');
const modes=['running','building','success','failed','offline','success'];let step=0;
console.log('Mock TeamCity and HTTP: '+upstream.base+' · 20-second state cycle.');
const timer=setInterval(()=>{const scenario=modes[++step%modes.length];upstream.setScenario(scenario);console.log('Upstream: '+scenario);},20000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(timer);await upstream.close();process.exit(0);});
