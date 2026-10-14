const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function withChain(type,map,check){
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage();await p.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);window.fixtureNow=Date.now();Date.now=()=>fixtureNow;
   function chainFixture(type,map){
    const names={centipede:'Centipede',desert_centipede:'Desert Centipede',evil_centipede:'Evil Centipede'};
    mobCatalog=Object.fromEntries(Object.entries(names).flatMap(([key,name])=>[[key,{name}],[key+'_body',{name}]]));mobIDs=Object.keys(mobCatalog).sort();mobCatalogTrusted=true;
    serverWorld.realm=mapFile(map);serverWorld.updatedAt=Date.now();serverWorld.frames=100;serverWorld.rejected=0;serverWorld.protocol='delta-header';serverWorld.entityProtocol='public';serverWorld.entityProtocolConfirmed=true;
    pos={x:2000,y:2000,updatedAt:Date.now()};serverWorld.own={hp:100,maxHP:100,at:Date.now()};
    const entity=(id,body,x,hp=1)=>({id,kind:1,type:mobIDs.indexOf(type+(body?'_body':'')),rarity:9,x,y:4000,radius:300,hp,at:Date.now()});
    const head=entity(42,false,4000),body=entity(43,true,4700),tail=entity(44,true,5400);
    serverWorld.entities=new Map([[42,head],[43,body],[44,tail],[45,{...entity(45,true,3000),rarity:6}],[46,{...entity(46,true,3000),type:mobIDs.indexOf(type==='centipede'?'evil_centipede_body':'centipede_body')}]]);
    const job=apex.active={type,map,name:names[type],spawnedAt:Date.now()-1000,dead:false,entityId:42,samples:[],lastBoss:{...head}};apex.queue=[];observeApexEntities();return job;
   }
   function tick(ms=400){fixtureNow+=ms;serverWorld.updatedAt=Date.now();pos.updatedAt=Date.now();serverWorld.own.at=Date.now();observeApexEntities();}
   function removedZero(id){const packet=new Uint8Array(36),view=new DataView(packet.buffer);packet[0]=5;view.setFloat64(5,12345,true);view.setFloat32(13,2000,true);view.setFloat32(17,2000,true);view.setUint16(25,1,true);packet[27]=id;packet[28]=4;view.setUint16(31,1,true);packet[33]=id;acceptServerFrame(packet);}
   window.chainTest={
    handoff(type,map){
     const job=chainFixture(type,map);serverWorld.entities.get(42).hp=0;observeApexEntities();tick();
     const head={dead:job.dead,target:job.entityId,count:job.segments.size,killed:job.segments.get(42).dead};
     observeRenderedApexDefeat('A Apex '+job.name+' has been defeated by @tester',{fillStyle:'#ff00ff'});
     const announcementEnds=job.dead;removedZero(43);tick();
     const body={dead:job.dead,target:job.entityId,killed:job.segments.get(43).dead,rejected:serverWorld.rejected};
     removedZero(44);tick();const last={dead:job.dead,needsSweep:apexSegmentsNeedSweep(job),corpses:job.segmentCorpses.map(s=>s.id)};
     const noSweep=completeApexSegments(job);job.segmentSweep={completed:true,blocked:1};tick(6000);const blocked=completeApexSegments(job);job.segmentSweep.blocked=0;serverWorld.updatedAt=Date.now()-2000;const stale=completeApexSegments(job);tick(100);const complete=completeApexSegments(job);
     return {head,announcementEnds,body,last,noSweep,blocked,stale,complete};
    },
    missing(type,map){
     const job=chainFixture(type,map);serverWorld.entities.get(42).hp=0;observeApexEntities();tick();serverWorld.entities.delete(43);serverWorld.entities.delete(44);tick(2000);
     observeRenderedApexDefeat('A Apex '+job.name+' has been defeated by @tester',{fillStyle:'#ff00ff'});
     return {dead:job.dead,target:job.entityId,visible:apexTargetVisible(job),lastHP:job.lastBoss.hp,needsSweep:apexSegmentsNeedSweep(job),rejoin:shouldRejoinApex(job,1000)};
    },
    async fullHunt(type,map){
     const job=chainFixture(type,map);running=true;const token=++version;let dpsTicks=0,lootEarly=false,searchVisits=0;
     const attacked=[],before=apex.completed;networkLifeTotals=null;mobCatalogRefresh=null;serverWorld.entities.delete(45);serverWorld.entities.delete(46);
     spawnSelect.value=map;raritySelect.value='Ultra+';screenInfo=()=>({kind:'play'});liveGate=async()=>true;ensureExpectedLoadout=async()=>true;ensureApexVision=async()=>true;apexNeedsWorldRefresh=()=>false;
     setFarmMap=(name,rarity)=>{spawnSelect.value=name;raritySelect.value=rarity;};apexEnsureSpawn=async(j,t,number=2)=>{j.preset=number;return true;};selectLoadout=async number=>{job.preset=number;return true;};swapTravelLoadout=async()=>true;apexInUltraZone=()=>true;
     apexStandPoint=()=>({world:position(),path:[position()]});apexSafeKeys=(j,keys)=>keys;apexSearchTargets=()=>[{x:3000,y:3000},{x:6000,y:6000}];apexRecentlyScanned=()=>true;
     apexNavigate=async(target,j,t,loot)=>{if(loot){lootEarly=[...job.segments.values()].some(s=>!s.dead);}else searchVisits++;j.navigateOutcome='arrived';return true;};
     wait=async ms=>{fixtureNow+=Math.max(400,ms);serverWorld.updatedAt=Date.now();pos.updatedAt=Date.now();serverWorld.own.at=Date.now();
      if(phase==='Apex DPS'&&job.entityId!=null){const e=serverWorld.entities.get(job.entityId);if(e?.hp>0){attacked.push(e.id);e.hp=0;dpsTicks++;if(e.id===42)confirmApexAnnouncement(job,'Fixture head announcement');}}
      observeApexEntities();if(fixtureNow-job.spawnedAt>180000)throw Error('Hunt failed to finish');
     };
     await runApex(job,token);running=false;return {attacked,dpsTicks,lootEarly,searchVisits,dead:job.dead,completed:apex.completed-before,corpses:job.segmentCorpses.map(s=>s.id)};
    }
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await p.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  await check(p,type,map);await p.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}

for(const [type,map] of [['centipede','Garden'],['desert_centipede','Desert'],['evil_centipede','Jungle']]){
 test(map+' Apex centipede targets head, body and tail without treating head defeat as completion',async()=>withChain(type,map,async(p,type,map)=>{
  const r=await p.evaluate(([type,map])=>chainTest.handoff(type,map),[type,map]);
  assert.deepEqual(r.head,{dead:false,target:43,count:3,killed:true});assert.equal(r.announcementEnds,false);
  assert.deepEqual(r.body,{dead:false,target:44,killed:true,rejected:0});assert.equal(r.last.dead,false);assert(r.last.needsSweep);assert.deepEqual(r.last.corpses,[42,43,44]);
  assert.equal(r.noSweep,false);assert.equal(r.blocked,false);assert.equal(r.stale,false);assert.equal(r.complete,true);
 }));
}
test('Unseen centipede bodies remain search targets after a head announcement',async()=>withChain('centipede','Garden',async(p,type,map)=>{
 const r=await p.evaluate(([type,map])=>chainTest.missing(type,map),[type,map]);assert.equal(r.dead,false);assert.equal(r.visible,false);assert.equal(r.lastHP,1);assert.equal(r.needsSweep,false);assert(r.rejoin);assert([43,44].includes(r.target));
}));
test('Full centipede hunt attacks every segment and completes a fresh sweep before entering loot',async()=>withChain('evil_centipede','Jungle',async(p,type,map)=>{
 const r=await p.evaluate(([type,map])=>chainTest.fullHunt(type,map),[type,map]);assert.deepEqual(r.attacked,[42,43,44]);assert.equal(r.dpsTicks,3);assert.equal(r.lootEarly,false);assert.equal(r.searchVisits,2);assert(r.dead);assert.equal(r.completed,1);assert.deepEqual(r.corpses,[42,43,44]);
}));
