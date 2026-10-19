// Disposable native Electron host for the real Desktop bridge and badge bundle.
const {app,BrowserWindow,protocol,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..'),root=path.join(project,'.local/framework-demo');
app.setPath('userData',path.join(root,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let upstream,window,autoplay;const report={checks:[],screenshots:[],errors:[]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const selector='document.querySelector("#signal-ci-badge-host")?.shadowRoot';
async function read(expression){return window.webContents.executeJavaScript(expression);}
async function waitFor(expression,expected,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const value=await read(expression);if(value===expected)return;await delay(150);}throw new Error('Timed out waiting for '+expected+'; last value '+await read(expression));}
async function capture(name){const file=path.join(root,name+'.png');await fs.writeFile(file,(await window.webContents.capturePage()).toPNG());report.screenshots.push(file);}
async function saveReport(){await fs.writeFile(path.join(root,'report.json'),JSON.stringify({...report,requests:upstream?.requests},null,2)+'\n','utf8');}
async function verify(){
  const label=selector+'?.querySelector(".ci-badge")?.getAttribute("aria-label")';
  await waitFor(label,'CI status: 1 running');report.checks.push('Production renderer mounted via production preload and trusted app:// IPC.');
  assert.equal(await read(selector+'.querySelector(".ci-badge").getBoundingClientRect().height'),26);
  await read('document.querySelector("textarea").value="Draft remains intact while CI updates"');
  await read(selector+'.querySelector(".ci-badge").click()');
  await read(selector+'.querySelector(".ci-run").click()');
  await waitFor(selector+'?.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")','35');
  await capture('running');report.checks.push('Real TeamCity adapter supplies repository, branch and 35% progress.');
  upstream.setScenario('building');
  await waitFor(selector+'?.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")','80');report.checks.push('Automatic polling advances upstream progress to 80% without a UI refresh.');
  for(const [scenario,expected]of [['success','Passed'],['failed','2 failed'],['offline','Stale'],['success','Passed']]){
    upstream.setScenario(scenario);await waitFor(label,'CI status: '+expected);
    assert.equal(await read('document.querySelector("textarea").value'),'Draft remains intact while CI updates');
    report.checks.push('Automatic polling: '+scenario+' -> '+expected+'; composer draft preserved.');await capture(scenario==='success'&&report.checks.length>5?'recovered':scenario);
    console.log('[framework check] '+scenario+' -> '+expected);
  }
  // Recreate the host composer, as Claude does during navigation.
  await read('document.querySelector(".preview-composer").outerHTML=document.querySelector(".preview-composer").outerHTML');
  await waitFor('!!document.querySelector("[data-signal-ci-slot] #signal-ci-badge-host")?.shadowRoot?.querySelector(".ci-badge")',true);
  assert.equal(await read('document.querySelectorAll("#signal-ci-badge-host").length'),1);report.checks.push('Badge reattaches when the host composer is recreated, with one functional shadow root.');
  const untrusted=new BrowserWindow({show:false,webPreferences:{preload:path.join(project,'dist/desktop/preload.cjs'),sandbox:true,contextIsolation:true}});
  await untrusted.loadURL('data:text/html,<p>Untrusted frame test</p>');const denied=await untrusted.webContents.executeJavaScript('window.signalCI.request({action:"snapshot"})');assert.equal(denied.ok,false);untrusted.destroy();report.checks.push('Production IPC rejects an untrusted page.');
  await read(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")==="true"&&'+selector+'.querySelector(".ci-badge").click()');
  await saveReport();console.log('[framework check] PASS '+report.checks.length+' native integration checks.');
}
app.whenReady().then(async()=>{
  const {createMockCiServer}=await import('./fixtures/mock-ci.mjs');upstream=await createMockCiServer();
  const {injectFixtureScript}=await import('./fixtures/inject-script.mjs');
  await fs.writeFile(path.join(root,'sources.json'),JSON.stringify(upstream.config,null,2)+'\n','utf8');
  require(path.join(root,'main.cjs'));
  const css=await fs.readFile(path.join(project,'src/ui/preview.css'),'utf8'),renderer=await fs.readFile(path.join(project,'dist/desktop/renderer.js'),'utf8');
  let html=await fs.readFile(path.join(project,'src/ui/index.html'),'utf8');
  html=html.replace(/<link[^>]+>/g,'').replace('<div id="badge"></div>','<span data-signal-ci-slot></span>').replace(/<script type="module"[\s\S]*?<\/script>/,'');
  html=html.replace(/<header class="preview-header">[\s\S]*?<\/header>/,'<header class="preview-header"><span>Framework integration test <small>native Electron · production Desktop bundles</small></span><label>Mock upstream <select id="mock-scenario"><option value="running">Running · 35%</option><option value="building">Building · 80%</option><option value="success">Passed</option><option value="failed">Failed</option><option value="offline">Source offline</option></select></label></header>');
  html=html.replace('Your work stays front and center.','Mock TeamCity + HTTP → real adapters → real Desktop bridge → badge.');
  html=html.replace('A small CI badge beside the prompt. Click it for details.','Real 15-second polling. Upstream data changes; your prompt stays intact.');
  html=html.replace('</head>',()=>'<style>'+css+'</style></head>');
  html=injectFixtureScript(html,renderer);
  html=injectFixtureScript(html,'document.getElementById("mock-scenario").onchange=e=>window.signalDemo.set(e.target.value);');
  protocol.handle('app',request=>new Response(new URL(request.url).pathname==='/index.html'?html:'Not found',{status:new URL(request.url).pathname==='/index.html'?200:404,headers:{'Content-Type':'text/html; charset=utf-8'}}));
  ipcMain.handle('signal-demo:set',(event,scenario)=>{if(event.sender!==window.webContents)throw new Error('Invalid demo frame');upstream.setScenario(scenario);return {scenario,pollIntervalMs:15000};});
  window=new BrowserWindow({title:'Signal framework · live mock sources',width:1100,height:780,show:true,backgroundColor:'#f7f6f0',webPreferences:{preload:path.join(root,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.setMenuBarVisibility(false);window.webContents.on('console-message',(_event,...args)=>console.log('[renderer]',...args));
  await window.loadURL('app://localhost/index.html');
  if(process.argv.includes('--verify'))await verify();
  if(process.argv.includes('--test')){await saveReport();await upstream.close();app.quit();return;}
  upstream.setScenario('running');const modes=['running','building','success','failed','offline','success'];let step=0;
  autoplay=setInterval(()=>{const scenario=modes[++step%modes.length];upstream.setScenario(scenario);void window.webContents.executeJavaScript('document.getElementById("mock-scenario").value='+JSON.stringify(scenario));},18000);
  window.show();window.focus();
}).catch(async error=>{report.errors.push(error.stack);console.error(error.stack);await saveReport();app.exit(1);});
app.on('window-all-closed',()=>{clearInterval(autoplay);void upstream?.close();app.quit();});
