const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const test=require('node:test'),assert=require('node:assert/strict');

test('Public saved loadout comparison uses the L bank: L3 is wire key 12 and L5 is 14',async()=>{
  const server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end('<canvas width="1100" height="800"></canvas>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
    const source=fs.readFileSync(path.join(__dirname,'../flowrix-navigator.js'),'utf8');
    const fixture=`
      clearInterval(lifeTimer);clearInterval(timer);clearInterval(recoveryTimer);
      window.loadoutWireTest=async()=>{
        running=true;screenInfo=()=>({kind:'play'});wait=async()=>{};
        const lower=Array.from({length:20},()=>({type:1,rarity:3}));
        const upper=Array.from({length:20},()=>({type:2,rarity:6}));
        networkLifeTotals={id:'fixture',receivedAt:Date.now(),equipped:upper.map(p=>({...p})),savedLoadouts:{2:lower,12:upper}};
        expectedLoadout={number:3,account:'fixture',slots:upper.map(p=>({...p})),swaps:[]};let calls=0;
        sendLoadout=async()=>{calls++;networkLifeTotals.receivedAt=Date.now();networkLifeTotals.equipped=upper.map(p=>({...p}));return true;};
        const confirmed=await selectLoadout(3,version),reuseCalls=calls;
        expectedLoadout=null;networkLifeTotals.equipped=lower.map(p=>({...p}));
        const loaded=await selectLoadout(3,version);
        const result={keys:[1,2,3,4,5,6,7,8,9,0].map(savedPresetKey),confirmed,reuseCalls,loaded,calls,expected:expectedLoadout?.slots};running=false;return result;
      };
    `;
    await page.evaluate(source.replace('window.flowrixNav={stop',fixture+'window.flowrixNav={stop'));
    const result=await page.evaluate(()=>loadoutWireTest());
    // Client keyboard bank 1 (L) + zero-based digit index, unlike the J bank 0.
    assert.deepEqual(result.keys,[10,11,12,13,14,15,16,17,18,19]);
    assert(result.confirmed);assert.equal(result.reuseCalls,0,'A matching L3 must not be compared against J3');
    assert(result.loaded);assert.equal(result.calls,1,'The first matching L-bank response confirms the build');
    assert(result.expected?.every(slot=>slot.type===2&&slot.rarity===6));
    await page.evaluate(()=>flowrixNav.destroy());
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
