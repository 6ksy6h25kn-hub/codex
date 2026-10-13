const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),test=require('node:test');
test('Apex sightings survive visibility loss, stay biome scoped, and rebind lost IDs',async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<canvas width="1100" height="800"></canvas>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`clearInterval(lifeTimer);window.locatingTest=()=>{
 mobCatalog={bee:{name:'Bee'}};mobIDs=['bee'];serverWorld.realm=null;liveRealm={id:'garden',at:Date.now()};serverWorld.updatedAt=Date.now();pos={x:100,y:100,updatedAt:Date.now()};
 const boss={id:10,type:0,kind:1,rarity:9,hp:1,x:1000,y:1000,radius:200,vx:1800,vy:0};serverWorld.entities=new Map([[10,boss]]);apex.active=null;observeApexEntities();
 serverWorld.entities.clear();const remembered={type:'bee',map:'Garden',samples:[]};seedApexSighting(remembered);const confirmed=apexTargetVisible(remembered);
 const wrongMap={type:'bee',map:'Desert',samples:[]};seedApexSighting(wrongMap);
 remembered.lastBoss.at=Date.now()-3000;remembered.entityId=10;apex.active=remembered;serverWorld.entities.set(11,{...boss,id:11,x:1100});serverWorld.updatedAt=Date.now();observeApexEntities();const rebound=remembered.entityId;mobCatalogTrusted=true;verifiedMobTypes.set(0,{type:'mantis',at:Date.now()});observeApexEntities();const registryWins=remembered.entityId===11;mobCatalogTrusted=false;verifiedMobTypes.clear();
 const near=apexSightings.values().next().value;for(const b of apexSightings.values())b.at=Date.now()-16000;const stale={type:'bee',map:'Garden',samples:[]};seedApexSighting(stale);
 apex.active=null;const stationary=apexStandRadius({lastBoss:{...boss,at:Date.now(),vx:0}}),charging=apexStandRadius({lastBoss:{...boss,at:Date.now()}});
 return {registryWins,remembered:!!remembered.lastBoss,confirmed,wrongMap:!!wrongMap.lastBoss,rebound,stale:!!stale.lastBoss,stationary,charging};};window.flowrixNav={stop`);await page.evaluate(source);const r=await page.evaluate(()=>locatingTest());assert(r.registryWins,'Authoritative registry must win over a mismatched screen label');assert(r.remembered);assert.equal(r.confirmed,false,'Cached sightings require live confirmation before DPS');assert.equal(r.wrongMap,false);assert.equal(r.rebound,11);assert.equal(r.stale,false);assert.equal(r.charging-r.stationary,450);await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
