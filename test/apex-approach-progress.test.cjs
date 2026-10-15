const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function fixture(check){
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage();await p.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);window.fixtureNow=Date.now();Date.now=()=>fixtureNow;
   function approachFixture(crowded=false){
    gardenReady=true;const size=100;gardenData={name:'Garden',size,worldW:10000,worldH:10000};gardenOpen=new Uint8Array(size*size).fill(1);gardenRanks=new Uint8Array(size*size).fill(6);region={w:size,h:size};margin.value='0';gridCache=null;temporaryBlocks.clear();
    if(crowded){gardenOpen.fill(0);for(let y=45;y<=55;y++)for(let x=5;x<=95;x++)gardenOpen[y*size+x]=1;}
    mapping={toMap:p=>({x:p.x/100,y:p.y/100}),toWorld:p=>({x:p.x*100,y:p.y*100})};pos={x:1000,y:5000,updatedAt:Date.now()};serverWorld.own={hp:100,maxHP:100,at:Date.now(),vx:0,vy:0};serverWorld.updatedAt=Date.now();serverWorld.entities=new Map();serverWorld.frames=100;serverWorld.rejected=0;
    mobCatalogTrusted=true;mobCatalog={bee:{name:'Bee'},hornet:{name:'Hornet'}};mobIDs=['bee','hornet'];
    const boss={id:42,kind:1,type:0,rarity:9,x:8500,y:5000,radius:300,hp:1,vx:0,vy:0,at:Date.now(),poseAt:Date.now()};serverWorld.entities.set(42,boss);
    if(crowded)for(const [id,y] of [[1,4780],[2,5220]])serverWorld.entities.set(id,{id,kind:1,type:1,rarity:6,x:4000,y,radius:100,hp:1,vx:0,vy:0,at:Date.now(),poseAt:Date.now()});
    phase='Apex DPS';const job=apex.active={type:'bee',name:'Bee',map:'Garden',preset:3,zoneEntered:true,dead:false,worldRefreshed:true,samples:[],entityId:42,lastBoss:{...boss}};
    screenInfo=()=>({kind:'play'});liveGate=async()=>true;ensureExpectedLoadout=async()=>true;realmMismatch=()=>false;
    return job;
   }
   function advance(job,ms=90){fixtureNow+=ms;const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);if(len){pos.x+=dx/len*300*ms/1000;pos.y+=dy/len*300*ms/1000;}pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();if(job.lastBoss)job.lastBoss.at=Date.now();}
   window.approachTest={
    async crowdedRoute(){
     const job=approachFixture(true);phase='Apex travel';running=true;const token=++version;let steps=0,minBorder=Infinity;
     wait=async ms=>{advance(job,ms);for(const e of serverWorld.entities.values())if(e.rarity<9)minBorder=Math.min(minBorder,distance(pos,e)-e.radius);if(++steps>2500)throw Error('Crowded route did not finish');};
     const result=await apexNavigate({x:7300,y:5000},job,token);running=false;return {result,outcome:job.navigateOutcome,minBorder,moved:pos.x-1000,steps};
    },
    approach(crowded){
     const job=approachFixture(crowded);running=true;const start=position();let minBorder=Infinity,maxIdle=0,idle=0,reached=false,steps=0;
     for(;steps<600;steps++){
      if(typeof apexTrackApproach==='function')apexTrackApproach(job);
      const stand=apexStandPoint(job);let keys=[];
      if(stand){const dx=stand.world.x-pos.x,dy=stand.world.y-pos.y;if(Math.abs(dx)>=45||Math.abs(dy)>=60){const next=mapping.toWorld(stand.path[Math.min(1,stand.path.length-1)]);job.moveTarget=next;if(Math.abs(next.x-pos.x)>30)keys.push(next.x>pos.x?'d':'a');if(Math.abs(next.y-pos.y)>45)keys.push(next.y>pos.y?'s':'w');}}
      keys=apexSafeKeys(job,keys);hold(keys);idle=keys.length?0:idle+1;maxIdle=Math.max(maxIdle,idle);advance(job);
      for(const e of serverWorld.entities.values())if(e.rarity<9)minBorder=Math.min(minBorder,distance(pos,e)-e.radius);
      const gap=distance(pos,job.lastBoss)-job.lastBoss.radius;if(gap>=100&&gap<=280){reached=true;break;}
     }
     running=false;return {reached,moved:distance(start,pos),gap:distance(pos,job.lastBoss)-job.lastBoss.radius,minBorder,maxIdle,steps,position:position()};
    },
    committedGoal(){
     const job=approachFixture();for(let y=5;y<=55;y++)gardenOpen[y*100+60]=0;gridCache=null;
     const first=apexStandPoint(job);pos={x:4500,y:5900,updatedAt:Date.now()};const second=apexStandPoint(job);return {first:first?.world,second:second?.world};
    },
    async l3Hunt(blind=false){
     const job=approachFixture(true),boss=serverWorld.entities.get(42);running=true;const token=++version,before=apex.completed;let ticks=0,hits=0,extended=false,minMobBorder=Infinity,minBossBorder=Infinity,trashHits=0,searchMovement=0,foldedSearchMovement=0;
     if(blind){serverWorld.entities.delete(42);job.entityId=null;job.lastBoss=null;apexSearchTargets=()=>[{x:7300,y:5000}];}
     game.addEventListener('keydown',e=>{if(e.key===' ')extended=true;});game.addEventListener('keyup',e=>{if(e.key===' ')extended=false;});
     networkLifeTotals=null;mobCatalogRefresh=null;spawnSelect.value='Garden';raritySelect.value='Ultra+';
     setFarmMap=(name,rarity)=>{spawnSelect.value=name;raritySelect.value=rarity;};apexEnsureSpawn=async(j,t,number=2)=>{j.preset=number;return true;};selectLoadout=async number=>{job.preset=number;return true;};ensureApexVision=async()=>true;swapTravelLoadout=async()=>true;
     wait=async ms=>{if(blind&&job.preset===3&&phase==='searching Apex Ultra+ zone'&&[...heldKeys].some(k=>['w','a','s','d'].includes(k))){searchMovement++;if(!extended)foldedSearchMovement++;}advance(job,ms);ticks++;if(blind){if(pos.x>=6500)serverWorld.entities.set(42,boss);if(job.preset===3&&extended)for(const e of serverWorld.entities.values())if(e.rarity<9&&e.hp>0&&distance(pos,e)-e.radius<900){e.hp=0;trashHits++;}}if(phase==='Apex DPS'&&extended){const gap=distance(pos,boss)-boss.radius;minBossBorder=Math.min(minBossBorder,gap);if(gap>=100&&gap<=280&&boss.hp>0){boss.hp=Math.max(0,boss.hp-.25);hits++;}}
      for(const e of serverWorld.entities.values())if(e.rarity<9&&e.hp>0)minMobBorder=Math.min(minMobBorder,distance(pos,e)-e.radius);observeApexEntities();if(ticks>1200)throw Error('L3 no-safe-floor wait did not recover');
     };
     await runApex(job,token);running=false;return {hits,completed:apex.completed-before,minMobBorder,minBossBorder,ticks,trashHits,searchMovement,foldedSearchMovement};
    }
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await p.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  await check(p);await p.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}

test('Overlapping mob comfort buffers cannot seal a corridor with a physically clear route to the Apex',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>approachTest.crowdedRoute());assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.moved>6000);assert(r.minBorder>=80,JSON.stringify(r));
}));
test('A visible Apex can be approached to attack distance instead of stopping at a coarse grid stand-off',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>approachTest.approach(false));assert(r.reached,JSON.stringify(r));assert(r.gap>=100);assert(r.maxIdle<30);
}));
test('DPS approach routes through crowding and reaches the Apex while preserving mob and Apex clearance',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>approachTest.approach(true));assert(r.reached,JSON.stringify(r));assert(r.minBorder>=80,JSON.stringify(r));assert(r.gap>=100);assert(r.maxIdle<60);
}));
test('A valid far-away attack position stays committed while walking around a wall',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>approachTest.committedGoal());assert(r.first&&r.second);assert.deepEqual(r.second,r.first,'Changing the approach bearing must not move the destination every frame');
}));
test('The real L2-to-L3 hunt loop gets past the no-safe-floor wait and reaches an attacking position',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>approachTest.l3Hunt());assert.equal(r.hits,4,JSON.stringify(r));assert.equal(r.completed,1);assert(r.minMobBorder>=80);assert(r.minBossBorder>=100);assert(r.ticks<1200);
}));

test('An L3 hunt attacks route mobs while searching, then acquires and approaches the Apex',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>approachTest.l3Hunt(true));assert.equal(r.trashHits,2,JSON.stringify(r));assert(r.searchMovement>100);assert.equal(r.foldedSearchMovement,0);assert.equal(r.hits,4);assert.equal(r.completed,1);assert(r.minBossBorder>=100);
}));
