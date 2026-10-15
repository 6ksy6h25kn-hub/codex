const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

test('Apex spawn waits for the new realm header instead of returning to the menu on the stale map',async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);let now=Date.now();Date.now=()=>now;
   window.mapTransitionTest=async()=>{running=true;const token=++version;serverWorld.realm='ant_hell';pos={x:100,y:100,updatedAt:now};let screen='menu',waits=0,returns=0,selections=0;
    screenInfo=()=>({kind:screen,button:{x:1,y:1,at:now}});liveGate=async()=>true;freshText=()=>null;spawnPoint=()=>({x:1,y:1,at:now});clickPoint=async()=>{selections++;screen='play';return true;};selectLoadout=async()=>true;returnToSpawnMenu=async()=>{returns++;screen='menu';};
    wait=async ms=>{now+=ms;pos.updatedAt=now;if(screen==='play'&&++waits===8)serverWorld.realm='computer';};
    const result=await apexEnsureSpawn({map:'Computer'},token,2);running=false;return {result,returns,selections,realm:serverWorld.realm,waits};};
   window.flowrixNav={stop`);
  await page.evaluate(source);const result=await page.evaluate(()=>mapTransitionTest());assert(result.result,JSON.stringify(result));assert.equal(result.realm,'computer');assert.equal(result.returns,0,'A stale previous realm must not force an exit during loading');assert(result.selections>=1);await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
