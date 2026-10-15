const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function fixture(check){
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas><button id="continue">Continue</button>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);
   window.fixtureNow=Date.now();Date.now=()=>fixtureNow;
   const scheduled=[];window.setTimeout=(fn,delay)=>{scheduled.push({fn,delay,cancelled:false});return scheduled.length;};window.clearTimeout=id=>{if(scheduled[id-1])scheduled[id-1].cancelled=true;};
   wait=async ms=>{fixtureNow+=ms;};
   window.unattendedTest={
    async background(){
     Object.defineProperty(document,'hidden',{configurable:true,value:true});document.hasFocus=()=>false;
     running=true;autoRecovery.enabled=true;backgroundFarm.checked=true;screenInfo=()=>({kind:'play'});
     const keys=[];game.addEventListener('keydown',e=>keys.push(e.key));
     const gate=await liveGate(version),build=await sendLoadout(3,version);
     let clicked=0;const button=document.getElementById('continue');button.onclick=()=>clicked++;
     const click=await clickPoint({x:200,y:200,at:Date.now(),dom:button},version);
     const background=inputAllowed();backgroundFarm.checked=false;const paused=!inputAllowed();
     autoRecovery.enabled=false;backgroundFarm.checked=true;const manualPaused=!inputAllowed();running=false;
     return {gate,build,click,clicked,keys,background,paused,manualPaused};
    },
    churnAndOrphan(){
     autoRecovery.enabled=true;running=true;phase='recovering position';autoRecovery.phase='traveling to zone';
     pos={x:5000,y:5000,updatedAt:Date.now()};autoRecovery.point={...pos};autoRecovery.lastProgress=Date.now()-121000;screenInfo=()=>({kind:'play'});serverWorld.own=null;
     const churn=recoveryReason();autoRecovery.hasStarted=true;autoRecovery.loopToken=null;
     const orphan=recoveryReason();stop();return {churn,orphan};
    },
    async cooldown(cancel){
     running=true;autoRecovery.enabled=true;autoRecovery.attempts=Array(5).fill(Date.now()-1000);
     let starts=0;start=async farming=>{if(farming)starts++;};
     const ok=scheduleRecovery('repeated temporary failure'),timer=scheduled.at(-1),enabled=autoRecovery.enabled,retry=autoRecovery.nextRetryAt;
     if(cancel)stop();fixtureNow+=timer.delay;timer.fn();await Promise.resolve();
     return {ok,delay:timer.delay,enabled,retry,starts,cancelled:timer.cancelled,events:autoRecovery.events};
    },
    recoveryContext(){
     running=true;autoRecovery.enabled=true;autoRecovery.attempts=[];phase='Apex DPS';pos={x:5000,y:5000,updatedAt:Date.now()};goal={x:6500,y:5000};apex.active={type:'hornet',map:'Garden',preset:3,dead:false,lastBlockedMove:{at:Date.now(),reason:'mob',position:{x:5000,y:5000}}};hold(['d']);scheduleRecovery('No movement or phase progress for two minutes');stop();apex.active=null;phase='patrol point 1/6';return apexDiagnostics();
    },
    async earlyExit(){
     running=false;autoRecovery.enabled=false;apex.queue=[];screenInfo=()=>({kind:'play'});liveGate=async()=>true;bootSpawn=async()=>false;
     await start(true);const result={enabled:autoRecovery.enabled,running,pending:!!autoRecovery.pending,reason:autoRecovery.lastReason};stop();return result;
    }
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await page.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  await check(page);await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}

test('Automatic farming can select builds and respawn in a hidden unfocused tab',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>unattendedTest.background());assert(r.gate&&r.build&&r.click&&r.background);assert.equal(r.clicked,1);assert.deepEqual(r.keys,['l','3']);assert(r.paused&&r.manualPaused);
}));
test('Recovery catches a lost farming loop and phase churn cannot hide a stationary stall',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>unattendedTest.churnAndOrphan());assert.match(r.churn,/two minutes/);assert.match(r.orphan,/loop ended/);
}));
test('Five recovery failures schedule a cooldown followed by automatic farming restart',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>unattendedTest.cooldown(false));assert(r.ok&&r.enabled);assert(r.delay>30000&&r.delay<=600100);assert.equal(r.starts,1);assert(r.retry);assert.match(r.events[0].reason,/cooldown/);
}));
test('Manual Stop cancels an unattended recovery cooldown',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>unattendedTest.cooldown(true));assert.equal(r.starts,0);assert(r.cancelled);
}));
test('An early farming loop return restarts instead of leaving running true with no controller',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>unattendedTest.earlyExit());assert(r.enabled&&r.pending);assert.equal(r.running,false);assert.match(r.reason,/loop ended/);
}));

test('Recovery preserves the stalled hunt context when the current hunt is already cleared',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>unattendedTest.recoveryContext());assert.equal(r.hunt,null);assert.equal(r.scriptBuild,'2026-10-15-apex-route-progress');assert.equal(r.automation.phase,'patrol point 1/6');const c=r.recovery.events[0].context;assert.equal(c.phase,'Apex DPS');assert.equal(c.hunt.type,'hornet');assert.equal(c.hunt.preset,3);assert.equal(c.hunt.lastBlocked.reason,'mob');assert.deepEqual(c.keys,['d']);
}));
