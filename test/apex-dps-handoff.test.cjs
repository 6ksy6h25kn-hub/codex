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
    const source=fs.readFileSync(path.join(__dirname,'../flowrix-navigator.js'),'utf8');
    const fixture=`
      clearInterval(lifeTimer);clearInterval(timer);clearInterval(recoveryTimer);
      window.handoffNow=Date.now();Date.now=()=>window.handoffNow;
      const originalRetreat=apexRetreatPoint;
      function setupHandoff(){
        running=true;++version;phase='searching Apex Ultra+ zone';
        gardenReady=true;const size=100;
        gardenData={size,worldW:10000,worldH:10000};
        gardenOpen=new Uint8Array(size*size).fill(1);
        gardenRanks=new Uint8Array(size*size).fill(6);
        region={x:0,y:0,w:size,h:size};margin.value='0';gridCache=null;
        mapping={toMap:p=>({x:p.x/100,y:p.y/100}),toWorld:p=>({x:p.x*100,y:p.y*100})};
        pos={x:4500,y:5000,updatedAt:Date.now()};
        serverWorld.entities=new Map();serverWorld.frames=100;serverWorld.rejected=0;
        serverWorld.updatedAt=Date.now();serverWorld.own={at:Date.now(),hp:100,maxHP:100,vx:0,vy:0};
        screenInfo=()=>({kind:'play'});liveGate=async()=>true;networkLifeTotals=null;expectedLoadout=null;
        const job=apex.active={type:'ladybug',name:'Ladybug',map:'Garden',preset:3,zoneEntered:true,dead:false,worldRefreshed:true,samples:[],lastBoss:{id:42,x:5000,y:5000,radius:300,hp:.6,vx:0,vy:0,at:Date.now()-2500}};
        apexRetreatPoint=originalRetreat;return job;
      }
      window.dpsHandoffTest={
        async safeReacquisition(){
          const job=setupHandoff(),destination={x:4300,y:5500};let pathCalls=0,retreatCalls=0;
          const insideGuard=distance(position(),job.lastBoss)<apexStandRadius(job);
          apexRetreatPoint=(...args)=>{retreatCalls++;return originalRetreat(...args);};
          navigate=async path=>{pathCalls++;return 'arrived';};
          let ticks=0;wait=async ms=>{handoffNow+=Math.max(1,ms);serverWorld.updatedAt=Date.now();pos.updatedAt=Date.now();if(++ticks>80)running=false;};
          const result=await apexNavigate(destination,job,version);
          const output={result,pathCalls,retreatCalls,insideGuard,outcome:job.navigateOutcome,ticks};running=false;return output;
        },
        async blockedEscape(){
          const job=setupHandoff();pos.x=4600;
          // The only opening is toward the retained boss. Every outward cell is a wall.
          gardenOpen.fill(0);for(let x=46;x<95;x++)gardenOpen[50*100+x]=1;gridCache=null;
          const insideGuard=distance(position(),job.lastBoss)<apexStandRadius(job);
          let ticks=0,pathCalls=0;wait=async ms=>{handoffNow+=Math.max(1,ms);serverWorld.updatedAt=Date.now();pos.updatedAt=Date.now();if(++ticks>80)running=false;};
          navigate=async()=>{pathCalls++;return 'arrived';};
          const result=await apexNavigate({x:6000,y:5000},job,version);
          const output={result,pathCalls,insideGuard,outcome:job.navigateOutcome,ticks,stillRunning:running,held:[...heldKeys]};running=false;return output;
        },
        reacquisitionPoints(){
          const job=setupHandoff();pos={x:5000,y:4400,updatedAt:Date.now()};
          const points=apexReacquireTargets(job);
          const output={points,current:{x:pos.x,y:pos.y},gap:apexStandRadius(job)};running=false;return output;
        },
        async antennae(active,reserve){
          const job=setupHandoff();window.Module={FS:{readFile:()=>JSON.stringify({antennae:{},basic:{},stick:{}})}};
          const slots=Array.from({length:20},()=>({type:1,rarity:6}));if(active)slots[0]={type:0,rarity:6};if(reserve)slots[10]={type:0,rarity:6};
          networkLifeTotals={id:'fixture',equipped:slots,receivedAt:Date.now(),savedLoadouts:{}};
          expectedLoadout={number:3,account:'fixture',slots:slots.map(p=>({...p})),swaps:[]};let swaps=0;
          send=(type,key)=>{if(type==='keydown'&&key==='1'){swaps++;[slots[0],slots[10]]=[slots[10],slots[0]];networkLifeTotals.receivedAt=Date.now();}};
          wait=async ms=>{handoffNow+=Math.max(1,ms);};
          const first=await ensureApexVision(job,version),second=await ensureApexVision(job,version);
          const output={first,second,swaps,activeType:slots[0].type,reserveType:slots[10].type,searchPetal:job.searchPetal};running=false;return output;
        }
      };
    `;
    await page.evaluate(source.replace('window.flowrixNav={stop',fixture+'window.flowrixNav={stop'));
    await check(page);
    await page.evaluate(()=>flowrixNav.destroy());
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}

test('A lost Apex after the DPS handoff continues to a reachable point when already outside the border guard',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>dpsHandoffTest.safeReacquisition());
    assert.equal(result.insideGuard,false,'Fixture player is already at a safe gap');
    assert.equal(result.result,true);assert.equal(result.pathCalls,1);
    assert.equal(result.retreatCalls,0,'An extra retreat buffer must not trap safe reacquisition before pathfinding');
    assert.equal(result.outcome,'arrived');
  });
});

test('A retained Apex with no outward escape returns control instead of holding forever',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>dpsHandoffTest.blockedEscape());
    assert(result.insideGuard);assert.equal(result.result,false);
    assert.match(result.outcome,/blocked/);assert(result.ticks<=40);
    assert(result.stillRunning,'Route failure must leave farming recovery in charge');
    assert.deepEqual(result.held,[]);
  });
});

test('Lost-Apex search points require real movement instead of selecting the current ring cell again',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>dpsHandoffTest.reacquisitionPoints());
    assert(result.points.length>3);for(const point of result.points){
      assert(Math.hypot(point.x-result.current.x,point.y-result.current.y)>=100,'A search point must reveal additional floor');
      assert(Math.hypot(point.x-5000,point.y-5000)>=result.gap,'Reacquisition must preserve the border guard');
    }
  });
});

test('DPS handoff preserves already active Antennae and swaps a confirmed reserve Antennae only once',async()=>{
  await withNavigator(async page=>{
    const active=await page.evaluate(()=>dpsHandoffTest.antennae(true,false));
    assert(active.first&&active.second);assert.equal(active.activeType,0);assert.equal(active.swaps,0);
  });
  await withNavigator(async page=>{
    const reserve=await page.evaluate(()=>dpsHandoffTest.antennae(false,true));
    assert(reserve.first&&reserve.second);assert.equal(reserve.activeType,0);assert.equal(reserve.swaps,1);
  });
});

test('A known DPS build without slot-one Antennae is not blindly toggled into the wrong build',async()=>{
  await withNavigator(async page=>{
    const result=await page.evaluate(()=>dpsHandoffTest.antennae(false,false));
    assert(result.first&&result.second);assert.equal(result.swaps,0);assert.equal(result.activeType,1);
  });
});
