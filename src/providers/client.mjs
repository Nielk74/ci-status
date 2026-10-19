export function createJsonClient({fetchImpl=fetch,env=process.env,defaultTokenEnv,headers={}}={}){
  const cache=new Map();
  return async function get(url,target={},options={}){
    const tokenName=target.tokenEnv||defaultTokenEnv,token=tokenName?env[tokenName]:null;
    if(target.tokenEnv&&!token)throw new Error('Set the '+target.tokenEnv+' environment variable in the host process.');
    const auth=token?{Authorization:(target.authScheme==='basic'?'Basic ':'Bearer ')+token}:{},key=String(url)+'|'+tokenName+'|'+target.authScheme;
    const previous=cache.get(key);
    let response;
    try{response=await fetchImpl(url,{method:'GET',redirect:'error',signal:options.signal??AbortSignal.timeout(10000),headers:{Accept:'application/json',...headers,...auth,...(previous?.etag?{'If-None-Match':previous.etag}:{})}});}catch{throw new Error('Could not reach source (network, redirect, or 10s timeout).');}
    if(response.status===304&&previous)return structuredClone(previous.data);
    if(!response.ok){const retry=response.headers.get('retry-after');throw new Error(`Source returned HTTP ${response.status}${retry?' (rate limited; retry later)':''}. Check access and configuration.`);}
    const body=await response.text();if(Buffer.byteLength(body)>5*1024*1024)throw new Error('Source response exceeds 5 MB.');
    let data;try{data=JSON.parse(body);}catch{throw new Error('Source did not return JSON.');}
    const etag=response.headers.get('etag');if(etag){if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,{etag,data});}
    return structuredClone(data);
  };
}
