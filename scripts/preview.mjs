import {createPreviewServer} from '../src/server.mjs';
const index=process.argv.indexOf('--port');const port=index>=0?Number(process.argv[index+1]):4319;
const server=await createPreviewServer({port});
console.log(`Signal CI preview: http://127.0.0.1:${server.address().port}`);
for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>server.close(()=>process.exit(0)));
