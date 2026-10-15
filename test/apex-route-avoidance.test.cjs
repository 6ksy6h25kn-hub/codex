const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function fixture(check){
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage();await p.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);
   window.fixtureNow=Date.now();Date.now=()=>fixtureNow;
   function avoidanceFixture(){
    gardenReady=true;const size=100;gardenData={name:'Garden',size,worldW:10000,worldH:10000};gardenOpen=new Uint8Array(size*size).fill(1);gardenRanks=new Uint8Array(size*size).fill(6);region={w:size,h:size};margin.value='0';gridCache=null;temporaryBlocks.clear();
    mapping={toMap:p=>({x:p.x/100,y:p.y/100}),toWorld:p=>({x:p.x*100,y:p.y*100})};pos={x:1000,y:5000,updatedAt:Date.now()};serverWorld.own={hp:100,maxHP:100,at:Date.now(),vx:0,vy:0};serverWorld.updatedAt=Date.now();serverWorld.entities=new Map();serverWorld.frames=100;serverWorld.rejected=0;
    mobCatalogTrusted=true;mobCatalog={bee:{name:'Bee'},hornet:{name:'Hornet'},wasp_pet:{name:'Wasp Pet'}};mobIDs=['bee','hornet','wasp_pet'];
    phase='Apex travel';const job=apex.active={type:'bee',map:'Garden',preset:3,zoneEntered:true,dead:false,worldRefreshed:true,samples:[]};
    screenInfo=()=>({kind:'play'});liveGate=async()=>true;ensureExpectedLoadout=async()=>true;realmMismatch=()=>false;
    return job;
   }
   function mob(id,x,y,radius=350){return {id,kind:1,type:1,rarity:6,x,y,radius,hp:1,vx:0,vy:0,poseAt:Date.now(),at:Date.now()};}
   window.avoidanceTest={
    async lootHandoff(preset=2,otherApex=false){
     const job=avoidanceFixture();job.dead=preset===2;job.preset=preset;job.lastBoss={id:42,x:5000,y:5000,radius:300,hp:0,at:Date.now()};
     gardenOpen.fill(0);for(let x=5;x<=90;x++)for(let y=48;y<=52;y++)gardenOpen[y*100+x]=1;gridCache=null;
     serverWorld.entities=new Map([[1,{...mob(1,5500,5000,300),rarity:otherApex?9:6}],[50,{id:50,kind:4,type:1,rarity:6,x:6000,y:5000,radius:20}]]);
     if(preset===3){serverWorld.entities.set(42,{...job.lastBoss,kind:1,type:0,rarity:9,hp:1,poseAt:Date.now()});job.lastBoss.hp=1;job.entityId=42;}
     networkLifeTotals={id:'fixture',receivedAt:Date.now(),inventory:[{type:1,rarity:6,count:0}]};mobCatalogRefresh=null;spawnSelect.value='Garden';raritySelect.value='Ultra+';
     setFarmMap=(name,rarity)=>{spawnSelect.value=name;raritySelect.value=rarity;};apexEnsureSpawn=async(j,t,n=2)=>{job.preset=n;return true;};selectLoadout=async n=>{job.preset=n;return true;};swapTravelLoadout=async()=>true;
     ensureApexVision=async()=>true;const before=apex.completed,builds=[];let ticks=0,collected=false;running=true;const token=++version;
     wait=async ms=>{fixtureNow+=ms;const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);if(len){pos.x+=dx/len*300*ms/1000;pos.y+=dy/len*300*ms/1000;}pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();if(builds.at(-1)!==job.preset)builds.push(job.preset);
      if(!job.dead&&phase==='Apex DPS'){serverWorld.entities.get(42).hp=0;job.lastBoss.hp=0;confirmApexAnnouncement(job,'Fixture defeat during DPS');}
      if(!collected&&distance(pos,{x:6000,y:5000})<100){collected=true;serverWorld.entities.delete(50);networkLifeTotals={...networkLifeTotals,receivedAt:Date.now(),inventory:[{type:1,rarity:6,count:1}]};updateApexLoot(job,networkLifeTotals);}if(++ticks>8000)throw Error('Loot handoff did not terminate');};
     await runApex(job,token);const result={collected,completed:apex.completed-before,gains:job.lootGains,history:job.historyStatus,retained:apexDiagnostics().lastHunt,position:position(),builds,ticks};running=false;return result;
    },
    async midrouteDefeat(){
     const job=avoidanceFixture();job.preset=2;phase='searching Apex Ultra+ zone';running=true;const token=++version;let ticks=0,deathPosition=null;
     wait=async ms=>{fixtureNow+=ms;const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);if(len){pos.x+=dx/len*300*ms/1000;pos.y+=dy/len*300*ms/1000;}pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();if(++ticks===20){job.dead=true;deathPosition=position();}if(ticks>1500)throw Error('Search did not stop');};
     const result=await apexNavigate({x:7000,y:5000},job,token),after=deathPosition&&distance(pos,deathPosition);running=false;return {result,outcome:job.navigateOutcome,after,ticks};
    },
    categories(){
     avoidanceFixture();serverWorld.entities=new Map([
      [1,{...mob(1,2000,5000),rarity:0}],
      [2,mob(2,3000,5000)],
      [3,{...mob(3,4000,5000),kind:6}],
      [4,{...mob(4,5000,5000),type:2}],
      [5,{...mob(5,5500,5000),hp:0}],
      [6,{...mob(6,6000,5000,20),kind:3,hp:undefined}],
      [7,{...mob(7,6500,5000),rarity:9}]
     ]);
     const ids=apexAvoidanceThreats().map(e=>e.id),mask=apexAvoidanceMask();
     return {ids,commonBlocked:mask[50*100+20]===0,npcBlocked:mask[50*100+40]===0,petOpen:mask[50*100+50]===1,deadOpen:mask[50*100+55]===1,shotOpen:mask[50*100+60]===1};
    },
    closeEscape(){
     const job=avoidanceFixture();const e=mob(1,1110,5000,100);serverWorld.entities.set(1,e);
     const keys=apexSafeKeys(job,['d'],.09,300),dx=Number(keys.includes('d'))-Number(keys.includes('a')),dy=Number(keys.includes('s'))-Number(keys.includes('w')),len=Math.hypot(dx,dy),end={x:pos.x+(len?dx/len*45:0),y:pos.y+(len?dy/len*45:0)};
     const route=apexApproachPath(job,position(),{x:7000,y:5000},apexTravelMask()),first=mapping.toWorld(route[0]);
     return {keys,before:distance(pos,e),after:distance(end,e),canExit:apexSegmentClear(job,position(),first)};
    },
    prediction(){
     const job=avoidanceFixture(),e=mob(1,3000,5500,100);e.vy=-1400;serverWorld.entities.set(1,e);
     const mask=apexAvoidanceMask(),currentBlocked=mask[55*100+30]===0,predictedOpen=mask[50*100+30]===1,segmentOpen=apexSegmentClear(job,position(),{x:4000,y:5000});e.poseAt=Date.now()-2000;e.at=e.poseAt;const stale=apexAvoidanceMask();
     e.x=1110;e.y=5000;e.vx=0;e.vy=0;e.poseAt=Date.now();apexSafeKeys(job,['d']);const blocked=apexDiagnostics().hunt.movement.lastBlocked;
     const shot={...mob(2,1500,5000,20),kind:3,hp:undefined,vx:-3000};serverWorld.entities=new Map([[2,shot]]);
     const shotKeys=apexSafeKeys(job,['d'],.09,300);
     return {currentBlocked,predictedOpen,segmentOpen,staleOpen:stale[50*100+30]===1,shotKeys,blocked};
    },
    async l2Selection(){
     const job=avoidanceFixture();serverWorld.entities.set(1,mob(1,1110,5000,100));networkLifeTotals=null;expectedLoadout=null;running=true;const token=++version;let l2Sent=false,before=0,after=0;game.addEventListener('keydown',e=>{if(e.key==='2')l2Sent=true;});wait=async ms=>{fixtureNow+=ms;pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();if([...heldKeys].some(k=>['w','a','s','d'].includes(k))){if(l2Sent)after++;else before++;}};const selected=await sendLoadout(2,token);running=false;return {selected,before,after,preset:job.preset};
    },
    clearanceRules(){
     const job=avoidanceFixture(),results=[];for(const hp of [100,20])for(const level of [0,1,2])for(const speed of [0,3000]){serverWorld.own.hp=hp;job.approachLevel=level;const e={...mob(1,4000,5000,100),vx:speed};results.push({hp,level,speed,gap:apexAvoidanceRadius(e)-e.radius});}return results;
    },
    projectileRules(){
     const job=avoidanceFixture(),results=[];for(const preset of [2,3,4,5])for(const looting of [false,true])for(const hp of [undefined,1,0]){job.preset=preset;job.dead=looting;phase=looting?'Apex loot':'Apex travel';serverWorld.entities=new Map([[1,{...mob(1,1100,5000,300),kind:3,hp,vx:-3000}]]);results.push({preset,looting,hp,threats:apexAvoidanceThreats().length,keys:apexSafeKeys(job,['d']),mask:apexTravelMask()!==null,segment:apexSegmentClear(job,position(),{x:7000,y:5000})});}return results;
    },
    scope(){
     const job=avoidanceFixture();serverWorld.entities.set(1,mob(1,2000,5000));
     const ultraL3=apexAvoidanceThreats().map(e=>e.id);job.preset=2;const ultraL2=apexAvoidanceThreats().map(e=>e.id);job.preset=3;gardenRanks.fill(5);const outsideL3=apexAvoidanceThreats().map(e=>e.id);
     return {ultraL3,ultraL2,outsideL3};
    },
    async journey(mode,travelSpeed=300){
     const looting=mode.endsWith('-loot');let lootCollected=false;
     const job=avoidanceFixture();if(['l2','l2-all','l2-loot','transition','fast','receding-shot'].includes(mode))job.preset=2;running=true;const token=++version,destination={x:7000,y:5000},e=mob(1,mode==='close'?1200:4000,mode==='moving'?7500:5000,mode==='close'?100:350);serverWorld.entities.set(1,e);
     if(looting){job.dead=true;job.lootDeadline=Date.now()+90000;phase='Apex loot';serverWorld.entities.set(50,{id:50,kind:4,x:7000,y:5000,radius:20});}
     if(mode==='cached-loot'||mode==='l2-loot'){gardenOpen.fill(0);for(let x=5;x<=90;x++)for(let y=48;y<=52;y++)gardenOpen[y*100+x]=1;gridCache=null;serverWorld.entities.set(2,{...mob(2,4500,5000,50),kind:3,vx:-1000});serverWorld.entities.set(3,{...mob(3,5000,5000,400),rarity:9});job.lastBoss={...mob(42,7000,5000,300),rarity:9,hp:0};}
     if(mode==='cached-loot'){const slots=Array.from({length:20},(_,i)=>({type:i,rarity:6}));networkLifeTotals={id:'fixture',receivedAt:Date.now(),equipped:slots.map(p=>({...p})),savedLoadouts:{11:slots}};expectedLoadout={number:2,account:'fixture',slots:slots.map(p=>({...p})),swaps:[]};await selectLoadout(2,token);}
     if(mode.startsWith('fast')){gardenOpen.fill(0);for(let x=5;x<=45;x++)for(let y=48;y<=52;y++)gardenOpen[y*100+x]=1;for(let x=43;x<=47;x++)for(let y=48;y<=72;y++)gardenOpen[y*100+x]=1;for(let x=43;x<=75;x++)for(let y=68;y<=72;y++)gardenOpen[y*100+x]=1;gridCache=null;destination.y=7000;serverWorld.entities.set(99,{...mob(99,8500,5000,300),rarity:9});serverWorld.entities.delete(1);}
     if(mode==='l2-all'){serverWorld.entities.set(2,{...mob(2,4500,5000,50),kind:3,vx:-1000});serverWorld.entities.set(3,{...mob(3,5000,5000,400),rarity:9});job.lastBoss={...mob(42,3000,5000,300),rarity:9};}
     if(mode==='twenty'){e.radius=250;e.y=5270;}
     if(mode==='transition'){e.x=4700;serverWorld.entities.set(2,mob(2,2200,5000,350));}
     if(mode==='l3-shot-loot'){e.x=2000;e.kind=3;e.radius=20;e.vx=-1000;}
     if(mode==='incoming-shot'){e.x=2000;e.kind=3;e.radius=20;e.vx=-1000;}
     if(mode==='receding-shot'){e.x=3000;e.kind=3;e.radius=20;e.vx=800;gardenOpen.fill(0);for(let x=5;x<=90;x++)for(let y=48;y<=52;y++)gardenOpen[y*100+x]=1;gridCache=null;}
     if(mode==='corridor'){gardenOpen.fill(0);for(let x=5;x<90;x++)gardenOpen[50*100+x]=1;gridCache=null;}
     const pressed=[];let attackHeld=false;game.addEventListener('keydown',event=>{pressed.push(event.key);if(event.key===' ')attackHeld=true;});game.addEventListener('keyup',event=>{if(event.key===' ')attackHeld=false;});let ticks=0,minGap=Infinity,mobInserted=false,maxSideStep=0,wallContacts=0,l3MovementTicks=0,foldedL3Movement=0,l2AttackTicks=0,transitioned=false,sideAtSwitch=null,sideAfterSwitch=0;
     wait=async ms=>{fixtureNow+=Math.max(1,ms);ticks++;
      if(['receding-shot','incoming-shot','l3-shot-loot'].includes(mode)){e.x+=e.vx*ms/1000;e.poseAt=Date.now();e.at=Date.now();}
      if(mode==='moving'&&!mobInserted&&ticks>=20){e.y=5000;e.poseAt=Date.now();e.at=Date.now();mobInserted=true;}
      const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);
      if(job.preset===2&&attackHeld)l2AttackTicks++;if(len&&job.preset===3){l3MovementTicks++;if(!attackHeld)foldedL3Movement++;}
      if(len){const step=travelSpeed*ms/1000,substeps=Math.max(1,Math.ceil(step/20));serverWorld.own.vx=dx/len*travelSpeed;serverWorld.own.vy=dy/len*travelSpeed;for(let k=0;k<substeps;k++){const x=pos.x+dx/len*step/substeps,y=pos.y+dy/len*step/substeps;if(!gardenOpen[Math.round(y/100)*100+Math.round(x/100)]){wallContacts++;serverWorld.own.vx=0;serverWorld.own.vy=0;break;}pos.x=x;pos.y=y;}}else{serverWorld.own.vx=0;serverWorld.own.vy=0;}
      pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();
      minGap=Math.min(minGap,distance(pos,e)-e.radius);
      maxSideStep=Math.max(maxSideStep,Math.abs(pos.y-5000));
      if(looting&&distance(pos,destination)<80){lootCollected=true;serverWorld.entities.delete(50);}
      if(mode==='reverse-transition'&&!transitioned&&Math.abs(pos.y-5000)>=250){job.preset=2;transitioned=true;sideAtSwitch=Math.abs(pos.y-5000);}
      if(mode==='reverse-transition'&&transitioned)sideAfterSwitch=Math.max(sideAfterSwitch,Math.abs(pos.y-5000));
      if(mode==='transition'&&pos.x>=3200&&job.preset===2){job.preset=3;transitioned=true;}
      if(ticks>2500){running=false;throw Error('Avoidance did not finish');}
     };
     const origin=position(),result=await apexNavigate(destination,job,token,looting),outcome=job.navigateOutcome;running=false;
     return {result,outcome,minGap,maxSideStep,goalDistance:distance(pos,destination),moved:distance(origin,pos),pressed,preset:job.preset,position:position(),wallContacts,ticks,lootCollected,l3MovementTicks,foldedL3Movement,l2AttackTicks,transitioned,sideAtSwitch,sideAfterSwitch,replans:job.avoidanceReplans||0};
    }
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await p.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  await check(p);await p.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}

test('L3 avoidance includes living mobs and NPCs while excluding projectiles, pets and dead mobs',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.categories());assert.deepEqual(r.ids,[1,2,3]);assert(r.commonBlocked&&r.npcBlocked&&r.petOpen&&r.deadOpen&&r.shotOpen);
}));
test('A nearby ordinary mob forces outward escape even before the Apex is visible',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.closeEscape());assert(r.keys.length>0&&!r.keys.includes('d'));assert(r.after>r.before);assert(r.canExit,'The route must start with a continuous safe exit from the buffer');
}));
test('Mob routes use current body positions without reserving an enlarged predicted path',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.prediction());assert(r.currentBlocked&&r.predictedOpen&&r.segmentOpen&&r.staleOpen);assert.deepEqual(r.shotKeys,['d']);assert.equal(r.blocked.reason,'mob');assert.equal(r.blocked.entity.kind,1);assert.deepEqual(r.blocked.requested,['d']);assert.equal(r.blocked.ageMs,0);
}));
test('Apex travel follows an actual detour around a living mob while keeping attacks active toward the Apex',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('static'));assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.moved>5500);assert(r.goalDistance<200);assert(r.minGap>=20,JSON.stringify(r));assert(r.pressed.includes(' '));assert.equal(r.foldedL3Movement,0);assert(r.l3MovementTicks>100);assert.equal(r.preset,3);
}));
test('A mob entering an existing route triggers a detour while preserving the Apex destination',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('moving'));assert(r.result,JSON.stringify(r));assert(r.replans>0);assert(r.goalDistance<200);assert(r.minGap>=20,JSON.stringify(r));assert(r.pressed.includes(' '));assert.equal(r.foldedL3Movement,0);
}));
test('L2 travels straight through weak mobs without ordinary-mob avoidance even inside Ultra',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('l2'));assert(r.result,JSON.stringify(r));assert.equal(r.preset,2);assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);assert(r.goalDistance<200);assert(!r.pressed.includes(' '));
}));
test('Ordinary-mob avoidance follows L3 in both high and lower zones and stays off in L2',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.scope());assert.deepEqual(r,{ultraL3:[1],ultraL2:[],outsideL3:[1]});
}));
test('A corridor blocked by a mob cannot be crossed by dropping the avoidance mask',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('corridor'));assert.equal(r.result,false);assert.equal(r.outcome,'blocked');assert.equal(r.moved,0);assert(r.pressed.includes(' '));
}));
test('A route starting inside a mob comfort buffer escapes and resumes instead of endlessly replanning',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('close'));assert(r.result,JSON.stringify(r));assert(r.goalDistance<200);assert(r.minGap>=20,JSON.stringify(r));
}));

test('Fast L2 travel negotiates narrow route corners without getting stuck before the Apex',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('fast',2400));assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.goalDistance<200);assert.equal(r.wallContacts,0);
}));

test('A receding projectile does not seal an otherwise clear travel corridor',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('receding-shot'));assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.goalDistance<200);assert(r.minGap>=100);
}));

test('L3 travels directly toward its destination without dodging an incoming projectile',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('incoming-shot'));assert(r.result,JSON.stringify(r));assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);assert(r.goalDistance<200);
}));

for(const [mode,speed] of [['fast',900],['fast-l3',900],['fast-l3',2400]])test('Narrow corner travel in '+(mode==='fast'?'L2':'L3')+' at '+speed+' units per second keeps every turn',async()=>fixture(async p=>{
 const r=await p.evaluate(([mode,speed])=>avoidanceTest.journey(mode,speed),[mode,speed]);assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.goalDistance<200);assert.equal(r.wallContacts,0);
}));

test('L2 keeps a straight terrain route through ordinary mobs, projectiles and retained or visible Apex mobs',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('l2-all'));assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);assert.equal(r.l2AttackTicks,0);assert(r.goalDistance<200);
}));

test('Changing from L2 to L3 on an existing route enables attacks and detours without losing the destination',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('transition'));assert(r.result,JSON.stringify(r));assert(r.transitioned);assert.equal(r.outcome,'arrived');assert(r.maxSideStep>=370&&r.maxSideStep<450,JSON.stringify(r));assert(r.minGap>=20);assert.equal(r.l2AttackTicks,0);assert.equal(r.foldedL3Movement,0);assert(r.l3MovementTicks>0);assert(r.goalDistance<200);
}));

test('Changing back from L3 to L2 drops the old mob detour and folds attacks',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('reverse-transition'));assert(r.result,JSON.stringify(r));assert(r.transitioned);assert.equal(r.outcome,'arrived');assert.equal(r.preset,2);assert.equal(r.l2AttackTicks,0);assert(r.sideAfterSwitch<=r.sideAtSwitch+1,JSON.stringify(r));assert(r.goalDistance<200);
}));

for(const mode of ['l2-loot','cached-loot'])test('L2 collects loot through mobs and projectiles: '+mode,async()=>fixture(async p=>{
 const r=await p.evaluate(mode=>avoidanceTest.journey(mode),mode);assert(r.result,JSON.stringify(r));assert.equal(r.preset,2);assert.equal(r.outcome,'arrived');assert(r.lootCollected);assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);
}));

test('Projectiles never change steering or block routes in any build or during loot',async()=>fixture(async p=>{
 const cases=await p.evaluate(()=>avoidanceTest.projectileRules());assert.equal(cases.length,24);for(const r of cases){assert.equal(r.threats,0,JSON.stringify(r));assert.deepEqual(r.keys,['d']);assert.equal(r.mask,false);assert(r.segment);}
}));

test('L3 reaches loot directly without projectile detours',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('l3-shot-loot'));assert(r.result,JSON.stringify(r));assert.equal(r.preset,3);assert.equal(r.outcome,'arrived');assert(r.lootCollected);assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);
}));

test('Ordinary-mob clearance stays at 20 units at low HP, high speed and every caution level',async()=>fixture(async p=>{
 const cases=await p.evaluate(()=>avoidanceTest.clearanceRules());assert.equal(cases.length,12);for(const r of cases)assert.equal(r.gap,20,JSON.stringify(r));
}));

test('L3 travel passes a mob at a 20-unit border gap without a larger detour',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('twenty'));assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);assert(r.minGap>=20&&r.minGap<21,JSON.stringify(r));assert.equal(r.foldedL3Movement,0);
}));

test('Sending L2 immediately disables mob dodges during the remaining loadout-key waits',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.l2Selection());assert(r.selected);assert(r.before>0);assert.equal(r.after,0,JSON.stringify(r));assert.equal(r.preset,2);
}));

for(const [preset,otherApex] of [[2,false],[3,false],[3,true]])test('Loot handoff reaches a drop beyond a mob after starting in L'+preset+(otherApex?' with another Apex nearby':''),async()=>fixture(async p=>{
 const r=await p.evaluate(([preset,otherApex])=>avoidanceTest.lootHandoff(preset,otherApex),[preset,otherApex]);assert(r.collected,JSON.stringify(r));assert.equal(r.completed,1);assert.equal(r.gains?.[0]?.count,1);assert.equal(r.history,'Looted');assert.equal(r.retained.status,'Looted');assert.equal(r.retained.lootGains[0].count,1);assert(r.builds.includes(3));
}));

test('An Apex defeat stops the current search route promptly for loot handoff',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.midrouteDefeat());assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'defeated');assert(r.after<=15);assert(r.ticks<=22);
}));
