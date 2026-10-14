const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),test=require('node:test'),assert=require('node:assert/strict');

async function withNavigator(run){
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<canvas width="1100" height="800"></canvas>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}});await page.goto('http://127.0.0.1:'+server.address().port);
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`clearInterval(lifeTimer);clearInterval(recoveryTimer);window.searchReliabilityTest={
   reusedIdentity(kind,type,rarity){
    mobCatalog={bee:{name:'Bee'},scorpion:{name:'Scorpion'}};mobIDs=['bee','scorpion'];mobCatalogTrusted=true;verifiedMobTypes.clear();serverWorld.realm='garden';serverWorld.updatedAt=Date.now();pos={x:100,y:100,updatedAt:Date.now()};
    const remembered={id:10,type:0,kind:1,rarity:9,hp:.6,x:1000,y:1000,radius:200,vx:0,vy:0,at:Date.now()-3000};
    const job=apex.active={type:'bee',map:'Garden',entityId:10,lastBoss:{...remembered},samples:[],standTarget:{obsolete:true},hazard:{obsolete:true}};
    // A new valid Apex can move far away or have a different radius/HP after ID reuse.
    // Keep it outside every historical-distance/HP/radius matching heuristic.
    serverWorld.entities=new Map([[10,{...remembered,kind,type,rarity}],[11,{...remembered,id:11,x:8000,y:8500,radius:700,hp:.95,at:Date.now()}]]);
    observeApexEntities();return {entityId:job.entityId,visible:apexTargetVisible(job),x:job.lastBoss?.x,obsoleteStand:!!job.standTarget,obsoleteHazard:!!job.hazard};
   },
   replacedMissingIdentity(){
    mobCatalog={bee:{name:'Bee'}};mobIDs=['bee'];mobCatalogTrusted=true;verifiedMobTypes.clear();serverWorld.realm='garden';serverWorld.updatedAt=Date.now();pos={x:7000,y:7500,updatedAt:Date.now()};
    const old={id:10,type:0,kind:1,rarity:9,hp:.6,x:1000,y:1000,radius:200,vx:0,vy:0,at:Date.now()-45000};
    const job=apex.active={type:'bee',map:'Garden',entityId:10,lastBoss:{...old},samples:[],standTarget:{obsolete:true},hazard:{obsolete:true}};
    serverWorld.entities=new Map([[11,{...old,id:11,x:8000,y:8500,radius:700,hp:.95,at:Date.now()}]]);
    observeApexEntities();return {entityId:job.entityId,visible:apexTargetVisible(job),x:job.lastBoss?.x,obsoleteStand:!!job.standTarget,obsoleteHazard:!!job.hazard};
   },
   screenCoverage(){
    game.width=1100;game.height=800;serverWorld.updatedAt=Date.now();serverWorld.realm='garden';phase='searching Apex Ultra+ zone';pos={x:300,y:530,updatedAt:Date.now()};
    const job=apex.active={type:'bee',map:'Garden',searchPetal:true,viewScale:{scale:2/3,at:Date.now()},coverageSeen:new Map()};
    apexRecordCoverage(job);const outOfView={x:300,y:1190};return {inside:apexRecentlyScanned(job,{x:300,y:530}),outside:apexRecentlyScanned(job,outOfView),outsideViewport:Math.abs(outOfView.y-pos.y)>game.height/job.viewScale.scale/2};
   }
  };window.flowrixNav={stop`);
  await page.evaluate(source);await run(page);await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}

test('Apex acquisition recovers when a retained ID changes type, rarity, or becomes an incomplete record',async()=>{
 await withNavigator(async page=>{
  for(const [label,kind,type,rarity] of [['different mob',1,1,9],['ordinary mob',1,0,6],['incomplete record',-1,0,9]]){
   const result=await page.evaluate(([kind,type,rarity])=>searchReliabilityTest.reusedIdentity(kind,type,rarity),[kind,type,rarity]);
   assert.equal(result.entityId,11,'Fresh Apex must replace retained '+label+' ID');assert(result.visible,label+' must not prevent live reacquisition');assert.equal(result.x,8000);assert.equal(result.obsoleteStand,false);assert.equal(result.obsoleteHazard,false);
  }
 });
});

test('A fresh matching Apex can replace an absent ID after moving far beyond the stale sighting',async()=>{
 await withNavigator(async page=>{
  const result=await page.evaluate(()=>searchReliabilityTest.replacedMissingIdentity());
  assert.equal(result.entityId,11,'A complete live Apex is stronger evidence than a 45-second-old position');
  assert(result.visible);assert.equal(result.x,8000);assert.equal(result.obsoleteStand,false);assert.equal(result.obsoleteHazard,false);
 });
});

test('Apex search coverage does not skip targets outside the measured camera view',async()=>{
 await withNavigator(async page=>{
  const result=await page.evaluate(()=>searchReliabilityTest.screenCoverage());assert(result.outsideViewport,'Fixture must put the skipped target outside the camera');assert(result.inside,'Current player location was observed');assert.equal(result.outside,false,'A whole search bucket cannot count as seen when its target was outside the viewport');
 });
});
