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
     return {ids,commonBlocked:mask[50*100+20]===0,npcBlocked:mask[50*100+40]===0,petOpen:mask[50*100+50]===1,deadOpen:mask[50*100+55]===1};
    },
    closeEscape(){
     const job=avoidanceFixture();const e=mob(1,1200,5000,100);serverWorld.entities.set(1,e);
     const keys=apexSafeKeys(job,['d'],.09,300),dx=Number(keys.includes('d'))-Number(keys.includes('a')),dy=Number(keys.includes('s'))-Number(keys.includes('w')),len=Math.hypot(dx,dy),end={x:pos.x+(len?dx/len*45:0),y:pos.y+(len?dy/len*45:0)};
     return {keys,before:distance(pos,e),after:distance(end,e),startOpen:apexTravelMask()[50*100+10]===1};
    },
    prediction(){
     const job=avoidanceFixture(),e=mob(1,3000,5500,100);e.vy=-1400;serverWorld.entities.set(1,e);
     const mask=apexAvoidanceMask(),predictedBlocked=mask[50*100+30]===0;e.poseAt=Date.now()-2000;e.at=e.poseAt;const stale=apexAvoidanceMask();
     const shot={...mob(2,1500,5000,20),kind:3,hp:undefined,vx:-3000};serverWorld.entities=new Map([[2,shot]]);
     const shotKeys=apexSafeKeys(job,['d'],.09,300);
     return {predictedBlocked,staleOpen:stale[50*100+30]===1,shotKeys};
    },
    scope(){
     const job=avoidanceFixture();serverWorld.entities.set(1,mob(1,2000,5000));
     const ultraL3=apexAvoidanceThreats().map(e=>e.id);job.preset=2;const ultraL2=apexAvoidanceThreats().map(e=>e.id);job.preset=3;gardenRanks.fill(5);const outsideL3=apexAvoidanceThreats().map(e=>e.id);
     return {ultraL3,ultraL2,outsideL3};
    },
    async journey(mode){
     const job=avoidanceFixture();if(mode==='l2')job.preset=2;running=true;const token=++version,destination={x:7000,y:5000},e=mob(1,4000,mode==='moving'?7500:5000,350);serverWorld.entities.set(1,e);
     if(mode==='corridor'){gardenOpen.fill(0);for(let x=5;x<90;x++)gardenOpen[50*100+x]=1;gridCache=null;}
     const pressed=[];game.addEventListener('keydown',event=>pressed.push(event.key));let ticks=0,minGap=Infinity,mobInserted=false,maxSideStep=0;
     wait=async ms=>{fixtureNow+=Math.max(1,ms);ticks++;
      if(mode==='moving'&&!mobInserted&&ticks>=20){e.y=5000;e.poseAt=Date.now();e.at=Date.now();mobInserted=true;}
      const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);
      if(len){const step=Math.min(12,300*ms/1000);pos.x+=dx/len*step;pos.y+=dy/len*step;}
      pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();
      minGap=Math.min(minGap,distance(pos,e)-e.radius);
      maxSideStep=Math.max(maxSideStep,Math.abs(pos.y-5000));
      if(ticks>2500){running=false;throw Error('Avoidance did not finish');}
     };
     const origin=position(),result=await apexNavigate(destination,job,token),outcome=job.navigateOutcome;running=false;
     return {result,outcome,minGap,maxSideStep,goalDistance:distance(pos,destination),moved:distance(origin,pos),pressed,preset:job.preset,ticks,replans:job.avoidanceReplans||0};
    }
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await p.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  await check(p);await p.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}

test('Apex avoidance includes Common mobs, hostile NPCs and projectiles without HP fields',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.categories());assert.deepEqual(r.ids,[1,2,3,6]);assert(r.commonBlocked&&r.npcBlocked&&r.petOpen&&r.deadOpen);
}));
test('A nearby ordinary mob forces outward escape even before the Apex is visible',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.closeEscape());assert(r.keys.length>0&&!r.keys.includes('d'));assert(r.after>r.before);assert(r.startOpen,'The player must retain a starting floor cell for escape');
}));
test('Fresh mob motion is predicted and projectiles without HP cannot be ignored',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.prediction());assert(r.predictedBlocked&&r.staleOpen);assert(!r.shotKeys.includes('d'));
}));
test('Apex travel follows an actual detour around a living mob without attacking it',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('static'));assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.moved>5500);assert(r.goalDistance<200);assert(r.minGap>=180,JSON.stringify(r));assert(!r.pressed.includes(' '));assert.equal(r.preset,3);
}));
test('A mob entering an existing route triggers a detour while preserving the Apex destination',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('moving'));assert(r.result,JSON.stringify(r));assert(r.replans>0);assert(r.goalDistance<200);assert(r.minGap>=180,JSON.stringify(r));assert(!r.pressed.includes(' '));
}));
test('L2 travels straight through weak mobs without ordinary-mob avoidance even inside Ultra',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('l2'));assert(r.result,JSON.stringify(r));assert.equal(r.preset,2);assert.equal(r.maxSideStep,0);assert.equal(r.replans,0);assert(r.goalDistance<200);assert(!r.pressed.includes(' '));
}));
test('Ordinary-mob avoidance activates for L3 inside Ultra+ and stays off for L2 or lower zones',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.scope());assert.deepEqual(r,{ultraL3:[1],ultraL2:[],outsideL3:[]});
}));
test('A corridor blocked by a mob cannot be crossed by dropping the avoidance mask',async()=>fixture(async p=>{
 const r=await p.evaluate(()=>avoidanceTest.journey('corridor'));assert.equal(r.result,false);assert.equal(r.outcome,'blocked');assert.equal(r.moved,0);assert(!r.pressed.includes(' '));
}));
