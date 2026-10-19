export function createDemoProvider({now=Date.now}={}){
  const start=now();let offset=0;
  const provider={id:'demo',label:'Demo feed',reset(){offset=now()-start;},async listRuns(){
    const elapsed=Math.floor((now()-start-offset)/5000),phase=elapsed%8;
    const at=seconds=>new Date(now()-seconds*1000).toISOString();
    const jobs=(names,done,state='running')=>names.map((name,i)=>({id:String(i),name,status:i<done?'success':i===done?state:'queued',startedAt:i<=done?at(160-i*25):null,completedAt:i<done?at(140-i*25):null,steps:['Set up runner','Install dependencies','Run '+name.toLowerCase(),'Upload artifacts'].map((s,k)=>({id:String(k),name:s,status:i<done?'success':i===done?k<2?'success':k===2?state:'queued':'queued',startedAt:i<=done?at(80-k*10):null,completedAt:i<done?at(60-k*10):null}))}));
    return [
      {id:'1042',name:'Build & deploy',repository:'acme/website',branch:'feat/new-checkout',commit:'8f3a2c1d90',title:'Refine the checkout experience',number:1042,status:phase<6?'running':'success',environment:'Preview',startedAt:at(194+phase*5),completedAt:phase>=6?at(2):null,jobs:jobs(['Install','Lint','Unit tests','Build','Deploy'],Math.min(5,2+Math.floor(phase/2)))},
      {id:'289',name:'API regression',repository:'acme/platform-api',branch:'main',commit:'c7e91b0a2',number:289,status:'running',environment:'Staging',startedAt:at(82),jobs:jobs(['Setup','Integration tests','Publish report'],1)},
      {id:'76',name:'Production release',repository:'acme/website',branch:'main',commit:'19bc82f',number:76,status:'waiting',environment:'Production',startedAt:at(280),detail:'Waiting for an environment approval',jobs:jobs(['Build','Security scan','Approve','Deploy'],2,'waiting')},
      {id:'1041',name:'Build & deploy',repository:'acme/website',branch:'fix/cart-total',commit:'d12e4f9',number:1041,status:'failed',startedAt:at(1820),completedAt:at(1640),detail:'Unit tests failed in the checkout suite',jobs:jobs(['Install','Lint','Unit tests','Build','Deploy'],2,'failed')},
      {id:'health',name:'Payments API',kind:'service',repository:'api.acme.example',status:'success',detail:'HTTP 200 · 48 ms · response matched',startedAt:at(1),completedAt:at(1),jobs:[]},
      {id:'52',name:'Package & publish',repository:'acme/design-system',branch:'main',commit:'f28a51b',number:52,status:'success',startedAt:at(3620),completedAt:at(3515),jobs:jobs(['Validate','Build','Publish'],3)}
    ];
  }};return provider;
}
