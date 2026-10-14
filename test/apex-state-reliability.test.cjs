const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function withNavigator(check){
  const server=http.createServer((request,response)=>{
    response.setHeader('Content-Type','text/html');
    response.end('<canvas width="1100" height="800"></canvas>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port);
    const navigator=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');
    const fixture=`
      clearInterval(lifeTimer);clearInterval(timer);clearInterval(recoveryTimer);
      window.fixtureNow=Date.now();Date.now=()=>window.fixtureNow;
      window.stateReliabilityTest={
        repeatedDeaths(){const job={};const first=[1,2,3].map(()=>apexRecordDeath(job));const stopped=apexRecordDeath(job);fixtureNow+=1000;job.lastDamageAt=Date.now();const progress=apexRecordDeath(job);fixtureNow+=601000;const reset=apexRecordDeath(job);return {first,stopped,progress,reset};},
        silentStream(){
          serverWorld.frames=100;serverWorld.rejected=0;
          serverWorld.updatedAt=Date.now()-5000;
          serverWorld.own={at:Date.now(),hp:100,maxHP:100};
          const stale=apexWorldStale();serverWorld.updatedAt=Date.now();
          return {stale,fresh:apexWorldStale()};
        },
        repeatedDefeat(){
          const line='A Apex moth has been defeated by @Terrabyte [terrabyte]';
          const job=apex.active={type:'moth',name:'moth',spawnedAt:Date.now()-1000,dead:false};
          apex.queue=[];observeRenderedApexDefeat(line,{fillStyle:'#ff00ff'});
          const first=job.dead;
          fixtureNow+=1000;
          const next=apex.active={type:'moth',name:'moth',spawnedAt:Date.now(),dead:false};
          observeRenderedApexDefeat(line,{fillStyle:'#ff00ff'});
          const retainedOldLine=next.dead;
          fixtureNow+=40000;
          observeRenderedApexDefeat(line,{fillStyle:'#ff00ff'});
          return {first,retainedOldLine,second:next.dead};
        },
        removedDeadBoss(){
          mobCatalog={bee:{name:'Bee',groups:{garden:1}}};mobIDs=['bee'];mobCatalogTrusted=true;
          serverWorld.realm='garden';serverWorld.updatedAt=Date.now();
          const job=apex.active={type:'bee',map:'Garden',name:'Bee',entityId:42,dead:false,samples:[],lastBoss:{id:42,x:5000,y:5000,radius:300,hp:.1,at:Date.now()-100}};
          serverWorld.entities=new Map([[42,{id:42,kind:1,type:0,rarity:9,hp:0,x:5000,y:5000,radius:300}]]);
          observeApexEntities();const first=job.dead;
          fixtureNow+=40;serverWorld.entities.delete(42);serverWorld.updatedAt=Date.now();observeApexEntities();
          fixtureNow+=400;serverWorld.updatedAt=Date.now();observeApexEntities();
          return {first,confirmed:job.dead,zeroHP:job.zeroHP};
        },
        zeroHPAndRemovalPacket(){
          mobCatalog={bee:{name:'Bee',groups:{garden:1}}};mobIDs=['bee'];mobCatalogTrusted=true;
          serverWorld.realm='garden';serverWorld.protocol='delta-header';serverWorld.entityProtocol='public';serverWorld.entityProtocolConfirmed=true;
          serverWorld.updatedAt=Date.now();serverWorld.rejected=0;serverWorld.frames=100;
          const boss={id:42,kind:1,type:0,rarity:9,hp:.1,x:5000,y:5000,radius:300,at:Date.now()};
          const job=apex.active={type:'bee',map:'Garden',name:'Bee',entityId:42,dead:false,samples:[],lastBoss:{...boss}};
          serverWorld.entities=new Map([[42,boss]]);
          const packet=new Uint8Array(36),view=new DataView(packet.buffer);packet[0]=5;
          view.setFloat64(5,12345,true);view.setFloat32(13,4000,true);view.setFloat32(17,5000,true);
          view.setUint16(25,1,true);packet[27]=42;packet[28]=4;
          view.setUint16(31,1,true);packet[33]=42;
          acceptServerFrame(packet);
          const removed=!serverWorld.entities.has(42),rejected=serverWorld.rejected;
          fixtureNow+=500;serverWorld.updatedAt=Date.now();observeApexEntities();
          return {removed,rejected,confirmed:job.dead,zeroHP:job.zeroHP};
        },
        async lootRoute(mode){
          running=true;const token=++version;let calls=0;
          serverWorld.entities=new Map();serverWorld.frames=100;serverWorld.rejected=0;serverWorld.updatedAt=Date.now();
          networkLifeTotals=null;mobCatalogRefresh=null;spawnSelect.value='Garden';raritySelect.value='Ultra+';
          pos={x:1000,y:1000,updatedAt:Date.now()};
          const job={name:'Bee',type:'bee',map:'Garden',dead:true,preset:3,samples:[],lastBoss:{id:42,x:5000,y:5000,radius:300,hp:0,at:Date.now()}};
          const before=apex.completed;
          screenInfo=()=>({kind:'play'});liveGate=async()=>true;observeApexEntities=()=>{};
          setFarmMap=(name,rarity)=>{spawnSelect.value=name;raritySelect.value=rarity;};
          apexEnsureSpawn=async(j,unused,number=2)=>{j.preset=number;return true;};
          selectLoadout=async(number)=>{job.preset=number;return true;};swapTravelLoadout=async()=>true;
          wait=async(ms)=>{fixtureNow+=Math.max(1,ms);};
          apexNavigate=async()=>{
            calls++;fixtureNow+=1000;
            if(mode==='cancel'){running=false;version++;return false;}
            // A hard test guard lets the old unbounded loop terminate and report failure.
            if(calls>180)running=false;
            return false;
          };
          await runApex(job,token);
          const result={calls,completed:apex.completed-before,status:job.historyStatus,phase,running};
          running=false;return result;
        }
      };
    `;
    await page.evaluate(navigator.replace('window.flowrixNav={stop',fixture+'window.flowrixNav={stop'));
    await check(page);
    await page.evaluate(()=>flowrixNav.destroy());
  }finally{
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}

test('Apex movement pauses on a silent entity stream even when every earlier packet decoded',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>stateReliabilityTest.silentStream());
    assert.equal(result.stale,true);assert.equal(result.fresh,false);
  });
});

test('An old rendered defeat cannot kill a new hunt, but a later identical announcement can',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>stateReliabilityTest.repeatedDefeat());
    assert.equal(result.first,true);assert.equal(result.retainedOldLine,false);
    assert.equal(result.second,true,'Identical boss and killer messages must work on later spawns');
  });
});

test('Observed zero HP remains death evidence after the entity is removed',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>stateReliabilityTest.removedDeadBoss());
    assert.equal(result.first,false,'One zero-HP frame is not yet confirmed');
    assert.equal(result.confirmed,true,'Removal must not erase observed zero-HP evidence');
  });
});

test('A zero-HP update and removal in one valid packet preserve the tracked boss death evidence',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>stateReliabilityTest.zeroHPAndRemovalPacket());
    assert.equal(result.rejected,0);assert.equal(result.removed,true);
    assert.equal(result.confirmed,true);
  });
});

test('An unreachable Apex corpse has a bounded loot phase and returns control to farming',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>stateReliabilityTest.lootRoute('blocked'));
    assert(result.calls<100,'Repeated blocked routes must stop before the hard fixture guard');
    assert.equal(result.running,true,'The timeout must resume farming, not stop the automation');
  });
});

test('Stopping during Apex loot does not record a completed hunt or inventory visit',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>stateReliabilityTest.lootRoute('cancel'));
    assert.equal(result.completed,0);
    assert(!String(result.status).startsWith('Loot visit complete'));
  });
});

test('Repeated Apex deaths without damage stop retries while recent boss damage permits a return',async()=>{await withNavigator(async page=>{const r=await page.evaluate(()=>stateReliabilityTest.repeatedDeaths());assert.deepEqual(r.first,[true,true,true]);assert.equal(r.stopped,false);assert.equal(r.progress,true);assert.equal(r.reset,true);});});
