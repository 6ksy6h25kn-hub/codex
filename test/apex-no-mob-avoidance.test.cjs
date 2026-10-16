const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

test('Apex travel keeps its direct route through ordinary mobs in L2 and L3',async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const injection=`
   clearInterval(timer);clearInterval(lifeTimer);clearInterval(recoveryTimer);
   window.noMobAvoidanceTest=()=>{
    gardenReady=true;gardenData={name:'Garden',size:100,worldW:10000,worldH:10000};gardenOpen=new Uint8Array(10000).fill(1);gardenRanks=new Uint8Array(10000).fill(6);region={w:100,h:100};margin.value='0';gridCache=null;temporaryBlocks.clear();
    mapping={toMap:p=>({x:p.x/100,y:p.y/100}),toWorld:p=>({x:p.x*100,y:p.y*100})};pos={x:1000,y:5000,updatedAt:Date.now()};serverWorld.own={hp:100,maxHP:100,at:Date.now(),vx:0,vy:0};serverWorld.updatedAt=Date.now();
    const mob={id:7,kind:1,type:1,rarity:6,x:4000,y:5000,radius:500,hp:1,at:Date.now(),poseAt:Date.now()};serverWorld.entities=new Map([[mob.id,mob]]);
    const destination={x:7000,y:5000};const results=[];
    for(const preset of [2,3]){const job={preset,dead:false};apex.active=job;phase='Apex travel';const mask=apexTravelMask(),path=apexApproachPath(job,position(),destination,mask),keys=apexSafeKeys(job,['d'],.09,300);results.push({preset,mask:mask===null,path:path.map(mapping.toWorld),keys,clear:apexSegmentClear(job,position(),destination)});}
    return results;
   };
  `;
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8');await page.evaluate(source.replace('window.flowrixNav={stop',injection+'window.flowrixNav={stop'));
  const results=await page.evaluate(()=>noMobAvoidanceTest());
  for(const result of results){assert(result.clear,JSON.stringify(result));assert.deepEqual(result.keys,['d']);assert.equal(result.path.length,2);assert.deepEqual(result.path[1],{x:7000,y:5000});}
  await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
