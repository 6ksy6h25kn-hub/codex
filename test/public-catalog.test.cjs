const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),zlib=require('zlib'),test=require('node:test'),assert=require('node:assert/strict');
test('Catalog follows loaded compressed assets on both supported online domains',async()=>{
 const registry={bee:{name:'Bee',groups:{garden:1}},worker_ant:{name:'Worker Ant',groups:{ant_hell:1}},worker_fire_ant:{name:'Worker Fire Ant',groups:{fire_ant_hell:1}},worker_termite:{name:'Worker Termite',groups:{termite_ant_hell:1}}};
 const packed=zlib.deflateRawSync(Buffer.from('\0'+JSON.stringify(registry)+'\0'));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const host of ['flowrix.pro','flowrix.sussybite.dev']){
  const page=await browser.newPage();const requests=[];
  await page.route('**/*',route=>{const url=new URL(route.request().url());requests.push(url.pathname);return route.fulfill(url.pathname.endsWith('.bin')?{status:200,contentType:'application/octet-stream',body:packed}:{status:200,contentType:'text/html',body:'<canvas width="1100" height="800"></canvas>'});});
  await page.goto('https://'+host+'/');await page.evaluate(()=>{window.Module={flixNet:{deliver(){}}};Object.defineProperty(performance,'getEntriesByType',{value:type=>type==='resource'?[{name:location.origin+'/builds/game.wasm.bin?version=test'}]:[]});});
  await page.evaluate(fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8'));
  await page.waitForFunction(()=>flowrixNav.apexDiagnostics().catalog.state==='ready');const d=await page.evaluate(()=>flowrixNav.apexDiagnostics());assert(d.catalog.trusted);assert.equal(d.catalog.count,4);assert.equal(d.catalog.path,'/builds/game.wasm.bin');assert(requests.includes('/builds/game.wasm.bin'));assert(!JSON.stringify(d.catalog).includes('version='));await page.evaluate(()=>flowrixNav.destroy());await page.close();
 }}finally{await browser.close();}
});
