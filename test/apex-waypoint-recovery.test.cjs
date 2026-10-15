const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

async function journey(preset,atCorner){
 const server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end('<canvas width="1100" height="800"></canvas>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);
   window.fixtureNow=Date.now();Date.now=()=>fixtureNow;
   window.cornerJourney=async(preset,atCorner)=>{
    gardenReady=true;gardenData={name:'Garden',size:100,worldW:10000,worldH:10000};region={w:100,h:100};margin.value='0';
    gardenOpen=new Uint8Array(10000);gardenRanks=new Uint8Array(10000).fill(6);gridCache=null;temporaryBlocks.clear();
    for(let x=5;x<=45;x++)for(let y=49;y<=51;y++)gardenOpen[y*100+x]=1;
    for(let x=44;x<=46;x++)for(let y=49;y<=71;y++)gardenOpen[y*100+x]=1;
    for(let x=44;x<=75;x++)for(let y=69;y<=71;y++)gardenOpen[y*100+x]=1;
    mapping={toMap:p=>({x:p.x/100,y:p.y/100}),toWorld:p=>({x:p.x*100,y:p.y*100})};
    pos={...(atCorner?{x:4348.639610306789,y:5146.139610306789}:{x:1000,y:5000}),updatedAt:Date.now()};
    serverWorld.own={hp:100,maxHP:100,vx:0,vy:0,at:Date.now()};serverWorld.updatedAt=Date.now();serverWorld.entities=new Map();serverWorld.frames=100;serverWorld.rejected=0;
    phase='Apex travel';const job=apex.active={type:'bee',map:'Garden',preset,zoneEntered:true,dead:false,worldRefreshed:true,samples:[]};
    screenInfo=()=>({kind:'play'});liveGate=async()=>true;ensureExpectedLoadout=async()=>true;realmMismatch=()=>false;
    running=true;const token=++version,destination={x:7000,y:7000},origin=position();
    const initial=apexApproachPath(job,position(),destination,apexTravelMask()),sourceDistance=distance(pos,mapping.toWorld(initial[0])),secondClear=apexSegmentClear(job,position(),mapping.toWorld(initial[1]));
    let physical=position(),nextObservation=Date.now()+150,ticks=0,reports=0,wallContacts=0;
    wait=async ms=>{
     fixtureNow+=ms;ticks++;
     const dx=Number(heldKeys.has('d'))-Number(heldKeys.has('a')),dy=Number(heldKeys.has('s'))-Number(heldKeys.has('w')),len=Math.hypot(dx,dy);
     if(len){const step=300*ms/1000,parts=Math.max(1,Math.ceil(step/20));for(let i=0;i<parts;i++){const next={x:physical.x+dx/len*step/parts,y:physical.y+dy/len*step/parts};if(!gardenOpen[Math.round(next.y/100)*100+Math.round(next.x/100)]){wallContacts++;break;}physical=next;}}
     if(Date.now()>=nextObservation){pos={...physical,updatedAt:Date.now()};serverWorld.updatedAt=Date.now();serverWorld.own={...serverWorld.own,at:Date.now(),vx:len?dx/len*300:0,vy:len?dy/len*300:0};nextObservation=Date.now()+150;reports++;}
     if(ticks>2000)throw Error('Corner route stalled');
    };
    const result=await apexNavigate(destination,job,token);running=false;
    return {result,outcome:job.navigateOutcome,sourceDistance,secondClear,moved:distance(origin,pos),remaining:distance(destination,pos),replans:job.avoidanceReplans||0,ticks,reports,wallContacts,blocks:temporaryBlocks.size,preset:job.preset};
   };
  `;
  let source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');
  if(process.env.FLOWRIX_RESTORE_SOURCE_SKIP==='1')source=source.replace('async function navigateGarden(path,token,farming){', 'async function navigateGarden(path,token,farming){if(path.length>1&&distance(position(),mapping.toWorld(path[0]))<75)path=path.slice(1);');
  await page.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  const result=await page.evaluate(([preset,atCorner])=>cornerJourney(preset,atCorner),[preset,atCorner]);await page.evaluate(()=>flowrixNav.destroy());return result;
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}

for(const preset of [2,3])test('L'+preset+' keeps its snapped source at an off-center corner until the next segment is reachable',async()=>{
 const result=await journey(preset,true);
 assert(result.sourceDistance>60&&result.sourceDistance<75,JSON.stringify(result));
 assert.equal(result.secondClear,false,'The snapped source is essential to clear the inside wall');
 assert(result.result,JSON.stringify(result));assert.equal(result.outcome,'arrived');assert(result.remaining<200,JSON.stringify(result));assert(result.moved>3000);assert(result.replans<3,JSON.stringify(result));
});

test('L2 completes an entire narrow bend with coordinates arriving only every 150 ms',async()=>{
 const result=await journey(2,false);
 assert(result.result,JSON.stringify(result));assert.equal(result.outcome,'arrived');assert(result.remaining<200,JSON.stringify(result));assert(result.moved>6000);assert(result.reports>100);assert(result.reports<result.ticks/4);assert(result.replans<3,JSON.stringify(result));
});
