const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function withNavigator(check){
 const server=http.createServer((request,response)=>{
  response.setHeader('Content-Type','text/html');response.end('<canvas width="1100" height="800"></canvas>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');
  const fixture=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);
   window.fixtureNow=Date.now();Date.now=()=>window.fixtureNow;
   function acquisitionFixture(){
    gardenReady=true;const size=160;gardenData={name:'Garden',file:'garden',size,worldW:8000,worldH:8000};
    gardenOpen=new Uint8Array(size*size).fill(1);gardenRanks=new Uint8Array(size*size).fill(6);
    region={x:0,y:0,w:size,h:size};margin.value='0';gridCache=null;
    mapping={toMap:p=>({x:p.x/50,y:p.y/50}),toWorld:p=>({x:p.x*50,y:p.y*50})};
    apexDistance.value='100';pos={x:6300,y:4000,updatedAt:Date.now()};
    serverWorld.realm='garden';serverWorld.updatedAt=Date.now();serverWorld.frames=100;serverWorld.rejected=0;serverWorld.entities=new Map();serverWorld.own={hp:100,maxHP:100,at:Date.now(),vx:0,vy:0};
    const job=apex.active={type:'bee',map:'Garden',name:'Bee',dead:false,entityId:42,zoneEntered:true,preset:3,worldRefreshed:true,samples:[],lastBoss:{id:42,x:4000,y:4000,radius:600,hp:.8,vx:0,vy:0,at:Date.now()-6000}};
    phase='searching Apex Ultra+ zone';screenInfo=()=>({kind:'play'});liveGate=async()=>true;ensureExpectedLoadout=async()=>true;
    return job;
   }
   window.acquisitionRecoveryTest={
    async lostDPSView(){
     const job=acquisitionFixture(),origin=position();running=true;const token=++version;
     const points=apexReacquireTargets(job),target=points.find(point=>distance(point,origin)>200);
     let movementCommands=0,ticks=0,closestGap=Infinity;const originalHold=hold;
     hold=keys=>{if(keys.some(key=>['w','a','s','d'].includes(key)))movementCommands++;originalHold(keys);};
     wait=async milliseconds=>{
      window.fixtureNow+=Math.max(1,milliseconds);ticks++;
      const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),length=Math.hypot(dx,dy);
      if(length){pos.x+=dx/length*12;pos.y+=dy/length*12;}
      pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();
      closestGap=Math.min(closestGap,distance(position(),job.lastBoss)-job.lastBoss.radius);
      if(ticks>1000)running=false;
     };
     const visible=apexTargetVisible(job),success=target?await apexNavigate(target,job,token):false;
     const result={visible,points:points.length,targetDistance:target&&distance(origin,target),movementCommands,moved:distance(origin,position()),closestGap,success,outcome:job.navigateOutcome,ticks};
     running=false;return result;
    },
    staleFastVelocity(){
     const job=acquisitionFixture();job.lastBoss.at=Date.now();job.lastBoss.poseAt=Date.now()-45000;job.lastBoss.vx=25000;job.lastBoss.vy=-18000;
     const points=apexReacquireTargets(job),g=grid(apexSafetyMask(job)),reachable=search(g,mapping.toMap(position()));
     return {points:points.length,allReachable:points.every(point=>reachable.steps[g.nearest(mapping.toMap(point),'Fixture point',0)]>=0),maxDistance:Math.max(...points.map(point=>distance(point,job.lastBoss))),standRadius:apexStandRadius(job),cellDiagonal:Math.hypot(gardenData.worldW,gardenData.worldH)/gardenData.size};
    }
   };
  `;
  await page.evaluate(source.replace('window.flowrixNav={stop',fixture+'window.flowrixNav={stop'));
  await check(page);await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}

test('A lost DPS-view Apex still produces real pathfinding movement to a safe reacquisition point',async()=>{
 await withNavigator(async page=>{
  const result=await page.evaluate(()=>acquisitionRecoveryTest.lostDPSView());
  assert.equal(result.visible,false,'Fixture must lose live sight of the Apex');
  assert(result.points>3,'Reacquisition must have reachable alternatives');
  assert(result.targetDistance>200,'Destination must exceed the largest navigation arrival tolerance');
  assert(result.movementCommands>0,'Pathfinding must issue movement keys after losing sight: '+JSON.stringify(result));
  assert(result.moved>300,'A snapped source node or a zero-length route is not recovery');
  assert(result.closestGap>=100,'Reacquisition must preserve the requested border gap');
  assert.equal(result.success,true);assert.equal(result.outcome,'arrived');assert(result.ticks<1000);
 });
});

test('Old extreme boss velocity cannot send reacquisition across the biome or onto unreachable floor',async()=>{
 await withNavigator(async page=>{
  const result=await page.evaluate(()=>acquisitionRecoveryTest.staleFastVelocity());
  assert(result.points>3);assert(result.allReachable);
  assert(result.maxDistance<=result.standRadius+2*result.cellDiagonal,'Fresh entity heartbeats must not extrapolate a 45-second-old movement sample');
 });
});
