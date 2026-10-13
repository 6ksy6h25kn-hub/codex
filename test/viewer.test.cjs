const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {createApp}=require('../server.cjs');
test('Private viewer authenticates, injects the navigator and controls a browser that runs without viewers',async()=>{
  const password=crypto.randomBytes(24).toString('hex'),profileDir=await fs.mkdtemp(path.join(os.tmpdir(),'flowrix-viewer-test-'));
  const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Fixture</title><canvas width="1280" height="900"></canvas><input id="typing" style="position:absolute;left:700px;top:100px"><script>window.Module={flixNet:{deliver(){}}};window.ticks=0;setInterval(()=>ticks++,100);window.received=[];document.addEventListener('keydown',e=>received.push(e.key));</script>`);});
  await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
  const app=await createApp({password,profileDir,secureCookie:false,gameURL:`http://127.0.0.1:${fixture.address().port}/`,executablePath:'/usr/bin/chromium'});
  let viewer;
  try{
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
    assert.equal((await fetch(base+'/api/status')).status,401);
    assert.equal((await fetch(base+'/login',{method:'POST',body:'password=wrong'})).status,401);
    const response=await fetch(base+'/login',{method:'POST',body:new URLSearchParams({password}),redirect:'manual'});assert.equal(response.status,303);
    const cookie=response.headers.get('set-cookie').split(';')[0];assert(response.headers.get('set-cookie').includes('HttpOnly'));
    const get=route=>fetch(base+route,{headers:{Cookie:cookie}});
    const control=async data=>{const r=await fetch(base+'/api/control',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await r.json();assert.equal(r.status,200,body.error);return body;};
    assert.equal((await fetch(base+'/api/control',{method:'POST',headers:{Cookie:cookie,Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{}'})).status,403);
    await app.launch();assert.equal((await (await get('/api/status')).json()).ready,true);
    await control({type:'inject'});assert.equal((await (await get('/api/status')).json()).injected,true);
    await control({type:'settings',values:{biome:'Ocean',rarity:'Ultra+'}});
    const image=await get('/frame');assert.equal(image.headers.get('content-type'),'image/jpeg');assert((await image.arrayBuffer()).byteLength>1000);
    viewer=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const browserContext=await viewer.newContext();
    await browserContext.addCookies([{name:'flowrix_session',value:cookie.slice(16),url:base}]);const view=await browserContext.newPage();await view.goto(base);await view.waitForFunction(()=>document.querySelector('#frame').naturalWidth===1280);
    await view.locator('#screen').focus();await view.keyboard.press('x');
    await app.browserPage().waitForFunction(()=>received.includes('x'));
    await control({type:'pointer',action:'down',x:740,y:110});await control({type:'pointer',action:'up',x:740,y:110});await control({type:'text',text:'fixture-text'});
    assert.equal(await app.browserPage().inputValue('#typing'),'fixture-text');
    await view.close();await control({type:'release'});
    const ticks=await app.browserPage().evaluate(()=>window.ticks);
    const before=await (await get('/api/status')).json();await new Promise(resolve=>setTimeout(resolve,1200));const after=await (await get('/api/status')).json();
    assert.equal(before.ready,true);assert.equal(after.ready,true);assert(after.state.position===null||typeof after.state.position==='object');
    assert(await app.browserPage().evaluate(()=>window.ticks)>ticks+5,'The server browser must keep ticking without a viewer');
    assert.deepEqual(await app.browserPage().evaluate(()=>({hidden:document.hidden,focused:document.hasFocus()})),{hidden:false,focused:true});
    await control({type:'stop'});assert.equal((await (await get('/api/status')).json()).state.running,false);
  }finally{await viewer?.close();await app.close();await new Promise(resolve=>fixture.close(resolve));await fs.rm(profileDir,{recursive:true,force:true});}
});
