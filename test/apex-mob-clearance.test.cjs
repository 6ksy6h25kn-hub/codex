const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function fixture(check){
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);
   window.clearanceNow=Date.now();Date.now=()=>clearanceNow;
   window.clearanceJourney=async function(mode='corridor',speed=300){
    gardenReady=true;const size=100;gardenData={name:'Garden',size,worldW:10000,worldH:10000};gardenOpen=new Uint8Array(size*size);gardenRanks=new Uint8Array(size*size).fill(6);region={w:size,h:size};margin.value='0';gridCache=null;temporaryBlocks.clear();
    for(let x=5;x<=90;x++)for(let y=49;y<=51;y++)gardenOpen[y*size+x]=1;
    mapping={toMap:p=>({x:p.x/100,y:p.y/100}),toWorld:p=>({x:p.x*100,y:p.y*100})};pos={x:1000,y:5000,updatedAt:Date.now()};serverWorld.own={hp:100,maxHP:100,at:Date.now(),vx:0,vy:0};serverWorld.updatedAt=Date.now();serverWorld.frames=100;serverWorld.rejected=0;
    mobCatalogTrusted=true;mobCatalog={bee:{name:'Bee'},hornet:{name:'Hornet'}};mobIDs=['bee','hornet'];
    const e={id:1,kind:1,type:1,rarity:6,x:4000,y:5000,radius:50,hp:1,vx:0,vy:0,poseAt:Date.now(),at:Date.now()};if(mode==='geometry')Object.assign(e,{x:3950,y:5050,radius:30});serverWorld.entities=new Map([[e.id,e]]);
    phase='Apex travel';const job=apex.active={type:'bee',map:'Garden',preset:3,zoneEntered:true,dead:false,worldRefreshed:true,samples:[]};
    screenInfo=()=>({kind:'play'});liveGate=async()=>true;ensureExpectedLoadout=async()=>true;realmMismatch=()=>false;
    const destination={x:7000,y:5000},mask=apexTravelMask(),topOpen=!!mask[49*size+40],bottomOpen=!!mask[51*size+40];
    if(mode==='geometry'){const from={x:3900,y:5000},to={x:4000,y:5100},g=grid(mask),direct=clearLine(g,mapping.toMap(from),mapping.toMap(to)),path=plan(from,to,mask).map(p=>mapping.toWorld(p));let minGap=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.y-a.y)*dy)/(dx*dx+dy*dy||1)));minGap=Math.min(minGap,Math.hypot(a.x+dx*t-e.x,a.y+dy*t-e.y)-e.radius);}return {direct,path,minGap,endpointsOpen:!!g.open[50*size+39]&&!!g.open[51*size+40]};}
    let minGap=Infinity,maxSide=0,ticks=0,wallContacts=0,attackHeld=false,foldedMovement=0,observedAt=Date.now();const physical={x:pos.x,y:pos.y},sensorInterval=mode==='lagged'?150:0;
    game.addEventListener('keydown',event=>{if(event.key===' ')attackHeld=true;});game.addEventListener('keyup',event=>{if(event.key===' ')attackHeld=false;});
    running=true;const token=++version;
    wait=async ms=>{clearanceNow+=Math.max(1,ms);const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);if(len&&!attackHeld)foldedMovement++;
     if(len){const step=speed*ms/1000,n=Math.max(1,Math.ceil(step/5));serverWorld.own.vx=dx/len*speed;serverWorld.own.vy=dy/len*speed;for(let k=0;k<n;k++){const x=physical.x+dx/len*step/n,y=physical.y+dy/len*step/n;if(!gardenOpen[Math.round(y/100)*size+Math.round(x/100)]){wallContacts++;break;}physical.x=x;physical.y=y;minGap=Math.min(minGap,distance(physical,e)-e.radius);}}else{serverWorld.own.vx=0;serverWorld.own.vy=0;}
     maxSide=Math.max(maxSide,Math.abs(physical.y-5000));if(Date.now()-observedAt>=sensorInterval){Object.assign(pos,physical);pos.updatedAt=Date.now();serverWorld.updatedAt=Date.now();serverWorld.own.at=Date.now();observedAt=Date.now();}if(++ticks>3500)throw Error('Narrow mob detour did not terminate');};
    const result=await apexNavigate(destination,job,token),outcome=job.navigateOutcome;running=false;return {result,outcome,topOpen,bottomOpen,minGap,maxSide,goalDistance:distance(physical,destination),position:position(),physical,wallContacts,foldedMovement,ticks,replans:job.avoidanceReplans||0,lastBlocked:job.lastBlockedMove};
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await page.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  await check(page);await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}

for(const speed of [300,900,2400])test('L3 takes the available close mob detour at '+speed+' units per second without a whole-cell margin',async()=>fixture(async page=>{
 const r=await page.evaluate(speed=>clearanceJourney('corridor',speed),speed);assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.topOpen&&r.bottomOpen,'Floor centers 50 units beyond the mob body must remain routable');assert(r.minGap>=20-.1,JSON.stringify(r));assert(r.maxSide>70&&r.maxSide<150,JSON.stringify(r));assert(r.goalDistance<200);assert.equal(r.wallContacts,0);assert.equal(r.foldedMovement,0);
}));

for(const speed of [300,900,2400])test('L3 close mob detour progresses with 150ms position observations at '+speed+' units per second',async()=>fixture(async page=>{
 const r=await page.evaluate(speed=>clearanceJourney('lagged',speed),speed);assert(r.result,JSON.stringify(r));assert.equal(r.outcome,'arrived');assert(r.minGap>=20-.1,JSON.stringify(r));assert(r.goalDistance<200);assert(r.replans<=20,JSON.stringify(r));if(speed<2400)assert.equal(r.wallContacts,0,JSON.stringify(r));else{assert(r.wallContacts<=6,JSON.stringify(r));console.log('2400-unit L3 with 150ms observations:',JSON.stringify(r));}assert.equal(r.foldedMovement,0);
}));

test('Close ordinary-mob routes reject a diagonal that crosses the 20-unit circle between clear endpoints',async()=>fixture(async page=>{
 const r=await page.evaluate(()=>clearanceJourney('geometry'));assert(r.endpointsOpen);assert.equal(r.direct,false);assert(r.path.length>=3,JSON.stringify(r));assert(r.minGap>=20-.1,JSON.stringify(r));
}));
