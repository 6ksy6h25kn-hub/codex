const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

test('Shop buyer selects the requested offer, confirms it, and stops cleanly',async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1000" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`window.shopBuyerTest=async()=>{running=true;const token=++version;shopBuyer.active=true;shopBuyer.offer=10;shopBuyer.buys=0;const clicks=[];freshText=name=>name==='Shop'||name==='Confirm'?{x:500,y:150,at:Date.now()}:null;scene=()=> 'play';clickPoint=async point=>{clicks.push(point);if(clicks.length===2)shopBuyer.active=false;return true;};wait=async()=>{};await runShopBuyer();return {clicks,buys:shopBuyer.buys,active:shopBuyer.active,token};};window.flowrixNav={stop`);
  await page.evaluate(source);const r=await page.evaluate(()=>shopBuyerTest());assert.equal(r.buys,1);assert.equal(r.active,false);assert.equal(r.clicks.length,2);assert(Math.abs(r.clicks[0].x-866)<2&&Math.abs(r.clicks[0].y-651)<2,JSON.stringify(r));assert(Math.abs(r.clicks[1].x-437)<2&&Math.abs(r.clicks[1].y-342)<2,JSON.stringify(r));await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
