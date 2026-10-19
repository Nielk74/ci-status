import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createStatusService} from './core/service.mjs';
const routes=new Map([
  ['/',['./ui/index.html','text/html; charset=utf-8']],
  ['/ui/app.mjs',['./ui/app.mjs','text/javascript; charset=utf-8']],
  ['/ui/preview.mjs',['./ui/preview.mjs','text/javascript; charset=utf-8']],
  ['/ui/preview.css',['./ui/preview.css','text/css; charset=utf-8']],
  ['/ui/components.mjs',['./ui/components.mjs','text/javascript; charset=utf-8']],
  ['/ui/icons.mjs',['./ui/icons.mjs','text/javascript; charset=utf-8']],
  ['/ui/styles.css',['./ui/styles.css','text/css; charset=utf-8']],
  ['/core/model.mjs',['./core/model.mjs','text/javascript; charset=utf-8']],
  ['/core/badges.mjs',['./core/badges.mjs','text/javascript; charset=utf-8']],
  ['/desktop/project.mjs',['./desktop/project.mjs','text/javascript; charset=utf-8']],
  ['/core/presentation.mjs',['./core/presentation.mjs','text/javascript; charset=utf-8']]
]);
export async function createPreviewServer({port=4319,service=createStatusService({configFile:fileURLToPath(new URL('../ci-status.config.json',import.meta.url))})}={}){
  const server=http.createServer(async(req,res)=>{
    const host='127.0.0.1:'+server.address().port,origin='http://'+host;
    const reply=(code,value,type='application/json; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type});res.end(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(req.headers.host!==host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return reply(403,{ok:false,message:'Local requests only.'});
    try{
      if(req.method==='GET'&&routes.has(req.url)){
        const [file,type]=routes.get(req.url);return reply(200,await fs.readFile(new URL(file,import.meta.url)),type);
      }
      if(req.method!=='POST'||req.url!=='/api')return reply(404,{ok:false,message:'Not found.'});
      if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(403,{ok:false,message:'JSON requests only.'});
      let size=0;const buffers=[];for await(const chunk of req){size+=chunk.length;if(size>65536)return reply(413,{ok:false,message:'Request too large.'});buffers.push(chunk);}
      let data;try{data=JSON.parse(Buffer.concat(buffers).toString('utf8'));}catch{return reply(400,{ok:false,message:'Invalid JSON.'});}
      return reply(200,{ok:true,value:await service.request(data)});
    }catch(error){return reply(400,{ok:false,message:error.message??'Status request failed.'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server;
}
