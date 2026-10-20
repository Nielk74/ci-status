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
// Allow a full 15s poll interval plus the providers' 10s request timeout.
async function waitFor(expression,expected,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){const value=await read(expression);if(value===expected)return;await delay(150);}throw new Error('Timed out waiting for '+expected+'; last value '+await read(expression));}
async function capture(name){const file=path.join(root,name+'.png');await fs.writeFile(file,(await window.webContents.capturePage()).toPNG());report.screenshots.push(file);}
async function saveReport(){await fs.writeFile(path.join(root,'report.json'),JSON.stringify({...report,requests:upstream?.requests},null,2)+'\n','utf8');}
async function verifySelects(){
  // Claude's composer cancels bubbling mousedown events to retain editor focus.
  await read('window.__cancelComposerMouseDown=e=>e.preventDefault();document.querySelector(".preview-composer").addEventListener("mousedown",window.__cancelComposerMouseDown)');
  window.show();window.focus();window.webContents.focus();
  async function choose(name,value){
    const css=JSON.stringify('select[name="'+name+'"]');
    const point=await read('(()=>{const n='+selector+'.querySelector('+css+');n.scrollIntoView({block:"nearest"});const r=n.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
    await waitFor(selector+'?.querySelector('+css+')?.matches(":open")',true,2000);
    const index=await read('Array.from('+selector+'.querySelector('+css+').options).findIndex(n=>n.value==='+JSON.stringify(value)+')');
    assert.ok(index>=0,'expected select option exists');
    for(const key of ['Home',...Array(index).fill('Down'),'Return']){
      window.webContents.sendInputEvent({type:'keyDown',keyCode:key});
      window.webContents.sendInputEvent({type:'keyUp',keyCode:key});
    }
    await waitFor(selector+'?.querySelector('+css+')?.value',value,2000);
    assert.equal(await read('!!'+selector+'.querySelector(".ci-popover:not([hidden])")'),true);
  }
  try{
    await read(selector+'.querySelector("[data-action=manage]").click()');await waitFor('!!'+selector+'?.querySelector("[data-action=new-badge]")',true);
    await read(selector+'.querySelector("[data-action=new-badge]").click()');await waitFor('!!'+selector+'?.querySelector("select[name=scope]")',true);
    await choose('scope','project');await choose('projectKind','claude');await choose('sourceMode','selected');await choose('displayType','value');
    assert.equal(await read('!!'+selector+'.querySelector("input[name=projectId]")&&!!'+selector+'.querySelector("input[name=sourceIds]")&&!!'+selector+'.querySelector("select[name=valueSourceId]")'),true);
    await read(selector+'.querySelector("[data-action=cancel]").click()');
    await read(selector+'.querySelector("[data-action=add]").click()');await waitFor('!!'+selector+'?.querySelector("select[name=provider]")',true);
    await choose('provider','http');assert.equal(await read('!!'+selector+'.querySelector("input[name=expectedStatus]")'),true);
    await read(selector+'.querySelector("[data-action=cancel]").click()');await read(selector+'.querySelector("[data-action=close]").click()');
    report.checks.push('Native dropdowns open with real mouse input and select options by keyboard inside a composer that cancels mousedown; badge and source fields update.');
  }finally{
    await read('document.querySelector(".preview-composer").removeEventListener("mousedown",window.__cancelComposerMouseDown);delete window.__cancelComposerMouseDown');
  }
}
async function verify(){
  const label=selector+'?.querySelector(".ci-badge")?.getAttribute("aria-label")';
  await waitFor(label,'CI status: 1 running');report.checks.push('Production renderer mounted via production preload and trusted app:// IPC.');
  assert.equal(await read(selector+'.querySelector(".ci-badge").getBoundingClientRect().height'),26);
  await read('document.querySelector("textarea").value="Draft remains intact while CI updates"');
  await read(selector+'.querySelector(".ci-badge").click()');
  await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
  await verifySelects();
  await read(selector+'.querySelector(".ci-badge").click()');await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
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
  // Model the host restoring its own draft after recreating the composer DOM.
  await read('(()=>{const composer=document.querySelector(".preview-composer"),draft=composer.querySelector("textarea").value;composer.outerHTML=composer.outerHTML;document.querySelector("textarea").value=draft;})()');
  await waitFor('!!document.querySelector("[data-signal-ci-slot] #signal-ci-badge-host")?.shadowRoot?.querySelector(".ci-badge")',true);
  assert.equal(await read('document.querySelectorAll("#signal-ci-badge-host").length'),1);report.checks.push('Badge reattaches when the host composer is recreated, with one functional shadow root.');
  const untrusted=new BrowserWindow({show:false,webPreferences:{preload:path.join(project,'dist/desktop/preload.cjs'),sandbox:true,contextIsolation:true}});
  await untrusted.loadURL('data:text/html,<p>Untrusted frame test</p>');const denied=await untrusted.webContents.executeJavaScript('window.signalCI.request({action:"snapshot"})');assert.equal(denied.ok,false);untrusted.destroy();report.checks.push('Production IPC rejects an untrusted page.');
  await read(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")==="true"&&'+selector+'.querySelector(".ci-badge").click()');
  const badges=[
    {id:'api',label:'API',scope:'global',sourceIds:['mock-api']},
    {id:'build',label:'Build',scope:'project',sourceIds:['mock-build'],project:{kind:'folder',id:'C:/work/website',name:'Website'}},
    {id:'other',label:'Other',scope:'project',sourceIds:['mock-build'],project:{kind:'folder',id:'C:/work/other',name:'Other'}},
    {id:'release',label:'Release',scope:'project',sourceIds:['mock-build'],project:{kind:'claude',id:'project-one',name:'Website project'}}
  ];
  const result=await read('window.signalCI.request('+JSON.stringify({action:'config.set',args:{...upstream.config,badges}})+')');assert.equal(result.ok,true);
  const badgeIds=selector+'&&Array.from('+selector+'.querySelectorAll(".ci-badge")).map(n=>n.dataset.badgeId).join(",")';
  await read('(()=>{const n=document.createElement("button");n.id="native-folder-context";n.dataset.testid="draft-rail-folder";n.title="C:/work/website";n.textContent="website";document.querySelector(".preview-toolbar").append(n);history.pushState({},"","/code/session-one");})()');
  await waitFor(badgeIds,'api,build');assert.equal(await read(selector+'.querySelectorAll(".ci-badge")[1].getBoundingClientRect().height'),26);
  await capture('project-badges');report.checks.push('A common API badge and exact-folder Build badge appear together at the original 26px height.');
  await read('document.getElementById("native-folder-context").title="C:/other/website"');await waitFor(badgeIds,'api',2000);
  await read('document.getElementById("native-folder-context").title="C:/work/other"');await waitFor(badgeIds,'api,other',2000);
  report.checks.push('Changing the native primary folder immediately switches scoped badges; equal folder basenames do not match.');
  await read('document.getElementById("native-folder-context").remove();history.pushState({},"","/project/project-one")');await waitFor(badgeIds,'api,release',2000);
  await read('history.pushState({},"","/project/project-two")');await waitFor(badgeIds,'api',2000);
  report.checks.push('Claude project routes show only the matching project badge; common badges remain visible.');
  await read(selector+'.querySelector(".ci-badge").click()');await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
  await read(selector+'.querySelector("[data-action=manage]").click()');await waitFor('!!'+selector+'?.querySelector("select[name=projectContext]")',true);
  await read('(()=>{const s='+selector+'.querySelector("select[name=projectContext]");s.value=Array.from(s.options).find(o=>o.textContent.includes("Website")&&o.textContent.includes("folder")).value;s.dispatchEvent(new Event("change",{bubbles:true}));})()');await waitFor(badgeIds,'api,build',2000);
  await read('history.pushState({},"","/chat/another-conversation")');await waitFor(badgeIds,'api',2000);
  report.checks.push('Manual project context works when needed and clears on navigation.');
  await read('(()=>{const n=document.createElement("button");n.id="native-folder-context";n.dataset.testid="draft-rail-folder";n.title="C:/work/website";n.textContent="website";document.querySelector(".preview-toolbar").append(n);})()');await waitFor(badgeIds,'api,build',2000);
  await read(selector+'.querySelector(".ci-badge").click()');await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
  await read(selector+'.querySelector("[data-action=manage]").click()');await waitFor('!!'+selector+'?.querySelector("[data-action=new-badge]")',true);
  await read(selector+'.querySelector("[data-action=new-badge]").click()');await waitFor('!!'+selector+'?.querySelector("input[name=label]")',true);
  await read('(()=>{const s='+selector+';const set=(name,value)=>{const n=s.querySelector("[name="+name+"]");n.value=value;n.dispatchEvent(new Event("input",{bubbles:true}));};set("label","Checks");set("scope","project");set("sourceMode","selected");const c=s.querySelector("input[name=sourceIds][value=mock-api]");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));s.querySelector("form").requestSubmit();})()');
  await waitFor(selector+'&&Array.from('+selector+'.querySelectorAll(".ci-badge b")).map(n=>n.textContent).join(",")','API,Build,Checks');
  const saved=await read('window.signalCI.request({action:"config.get"})');const added=saved.value.badges.find(b=>b.label==='Checks');assert.equal(added.project.id,'C:/work/website');assert.deepEqual(added.sourceIds,['mock-api']);
  await read('document.getElementById("native-folder-context").title="C:/work/other"');await waitFor(badgeIds,'api,other',2000);
  await read('document.getElementById("native-folder-context").title="C:/work/website"');await waitFor(badgeIds,'api,build,'+added.id,2000);
  report.checks.push('The compact editor creates and persists a named badge, selected source and current-project visibility.');
  await read(selector+'.querySelector(".ci-badge").click()');await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
  const editBadgeSelector=JSON.stringify('[data-action=edit-badge][data-id="'+added.id+'"]');
  await read(selector+'.querySelector("[data-action=manage]").click()');await waitFor('!!'+selector+'?.querySelector('+editBadgeSelector+')',true);
  await read(selector+'.querySelector('+editBadgeSelector+').click()');await waitFor('!!'+selector+'?.querySelector("[data-action=remove]")',true);
  await read(selector+'.querySelector("[data-action=remove]").click()');await waitFor(badgeIds,'api,build');
  await read(selector+'.querySelector("[data-action=close]").click()');report.checks.push('Badges can be edited and removed from the same compact settings popover.');
  upstream.setScenario('offline');await waitFor(selector+'?.querySelector("[data-badge-id=build]")?.getAttribute("aria-label")','Build status: Stale');
  assert.equal(await read(selector+'.querySelector("[data-badge-id=api]").getAttribute("aria-label")'),'API status: 1 failed');
  upstream.setScenario('success');await waitFor(selector+'?.querySelector("[data-badge-id=build]")?.getAttribute("aria-label")','Build status: Passed');
  assert.equal(await read('document.querySelector("textarea").value'),'Draft remains intact while CI updates');
  report.checks.push('Independent badges isolate upstream errors and recover through shared polling without touching the prompt.');
  await capture('project-badges-recovered');
  // Configure a metric through the actual source and badge editors.
  await read(selector+'.querySelector(".ci-badge").click()');await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
  await read(selector+'.querySelector("[data-action=manage]").click()');await waitFor('!!'+selector+'?.querySelector("[data-action=edit][data-id=mock-api]")',true);
  await read(selector+'.querySelector("[data-action=edit][data-id=mock-api]").click()');await waitFor('!!'+selector+'?.querySelector("input[name=valuePath]")',true);
  await read('(()=>{const s='+selector+',n=s.querySelector("input[name=valuePath]");n.value="latencyMs";n.dispatchEvent(new Event("input",{bubbles:true}));s.querySelector("form").requestSubmit();})()');
  await waitFor('!!'+selector+'?.querySelector("[data-action=edit-badge][data-id=api]")',true);
  await read(selector+'.querySelector("[data-action=edit-badge][data-id=api]").click()');await waitFor('!!'+selector+'?.querySelector("input[name=label]")',true);
  await read('(()=>{const s='+selector+';const set=(name,value)=>{const n=s.querySelector("[name="+name+"]");n.value=value;n.dispatchEvent(new Event("input",{bubbles:true}));};set("label","Latency");set("displayType","value");set("valueSuffix"," ms");s.querySelector("form").requestSubmit();})()');
  const metricLabel=selector+'?.querySelector("[data-badge-id=api]")?.getAttribute("aria-label")';
  await waitFor(metricLabel,'Latency value: 48 ms; status: Passed');
  const metricSettings=await read('window.signalCI.request({action:"config.get"})');assert.equal(metricSettings.value.sources.find(s=>s.id==='mock-api').valuePath,'latencyMs');assert.equal(metricSettings.value.badges.find(b=>b.id==='api').display.suffix,' ms');
  report.checks.push('The real source and badge editors persist a JSON metric and unit suffix; the badge displays 48 ms with an accessible health status.');
  upstream.setScenario('building');await waitFor(metricLabel,'Latency value: 80 ms; status: Passed');
  upstream.setScenario('failed');await waitFor(metricLabel,'Latency status: 1 failed');
  upstream.setScenario('success');await waitFor(metricLabel,'Latency value: 48 ms; status: Passed');
  report.checks.push('Shared polling updates metric values and replaces failed metrics with their failure status.');
  await read(selector+'.querySelector("[data-action=close]").click()');
  window.setContentSize(375,780);await delay(150);
  assert.equal(await read('Array.from('+selector+'.querySelectorAll(".ci-badge")).every(n=>{const r=n.getBoundingClientRect();return r.height===26&&r.left>=0&&r.right<=innerWidth;})'),true);
  await read(selector+'.querySelector(".ci-badge").click()');await waitFor(selector+'?.querySelector(".ci-badge")?.getAttribute("aria-expanded")','true');
  assert.equal(await read('(()=>{const r='+selector+'.querySelector(".ci-popover").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})()'),true);
  await capture('metrics-narrow');window.setContentSize(1100,780);await delay(100);await capture('metrics-badges');
  report.checks.push('Multiple metric/status badges and their popover fit a 375px viewport at the original 26px height.');
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
