const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

test('Restored Shop auto-buy tab selects an offer and confirms it',async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1000" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`window.shopBuyerTest=async()=>{const clicks=[];let state='shop';shopSelected=10;shopRunning=true;shopToken=1;shopAttempts=0;lastShopGrid=Array.from({length:10},(_,i)=>({x:.134+.183*(i%5),y:.512+.302*Math.floor(i/5)}));shopScreen=()=>state;shopFindConfirm=()=>({x:.44,y:.68});shopClick=async point=>{clicks.push(point);state=clicks.length===1?'confirm':'shop';if(clicks.length===2)shopRunning=false;return true;};await shopBuyLoop(1,0);return {clicks,state,shopTab:shopTab.textContent};};window.flowrixNav={stop`);
  await page.evaluate(source);const r=await page.evaluate(()=>shopBuyerTest());assert.equal(r.shopTab,'Shop auto-buy');assert.equal(r.clicks.length,2);assert(Math.abs(r.clicks[0].x-.866)<.01&&Math.abs(r.clicks[0].y-.814)<.01,JSON.stringify(r));assert.deepEqual(r.clicks[1],{x:.44,y:.68});await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
