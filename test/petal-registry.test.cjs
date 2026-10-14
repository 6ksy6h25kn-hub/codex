const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),test=require('node:test'),assert=require('node:assert/strict');

// Actual native registry key lists, with server-observed equipped IDs. The
// public WASM initializer adds generated mob egg definitions before sorting.
const nativeKeys={
 petals:['basic','rose','stinger','light','rock','sand','yggdrasil','dandelion','clover','bone','cactus','poison_cactus','iris','lightning','missile','jelly','yucca','leaf','cutter','lightning_cutter','wing','square','golden_leaf','blood_leaf','bulb','gas','starfish','sponge','javascript','glitch','corn','third_eye','antennae','observer','faster','pollen','bumble_bee_pollen','powder','peas','grapes','magic_peas','soil','air','magnet','yin_yang','lentil','bubble','rainbow','bomb','flower','raindrop','dahlia','azalea','sparkle','healing','explosive','test_explosive','shield','splitter','hornet_missile','wasp_missile','action_test','egg','glass','glasss','infinity','web','guided_missile','blue_iris','stick','pincer','moon','lotus','heaviest','rice','uranium','honey','shell','battery','bur','root','magic_orb','magic_leaf','magic_cactus','magic_stick','magic_missile','magic_stinger','magic_bubble','poo','talisman','salt','claw','fang','cotton','pearl','coral','orange','capacitor','coin','wax','triangle','mimic','plank','relic','carrot','tomato','rubber','compass','sacrifice'],
 mobs:['bee','ladybug','soldier_ant','worker_ant','baby_ant','ant_hole','fire_ant_hole','worker_fire_ant','baby_fire_ant','rock','dandelion','soldier_fire_ant','shiny_ladybug','dark_ladybug','sandstorm','cactus','scorpion','beetle','hel_beetle','jellyfish','bubble','starfish','sponge_2','sponge_1','shell','crab','leech','leech_body','hornet','mantis','leafbug','bush','golden_leafbug','wasp','firefly','magic_firefly','target_dummy','fly','roach','garbage','moth','item_spawner','spider','soldier_ant_pet','soldier_fire_ant_pet','javascript','dust','glitch','glitch_flower','cube','sun','server','centipede','centipede_body','desert_centipede','desert_centipede_body','evil_centipede','evil_centipede_body','queen_ant','digger','oracle','trader','titan','bumble_bee','baby_termite','worker_termite','soldier_termite','termite_overmind','termite_egg','termite_mound']
};

test('Petal wire IDs include generated mob eggs and match native equipped IDs',async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`clearInterval(lifeTimer);window.petalRegistryTest=buildPetalIDs;window.petalBehaviorTest=async(petals,mobs)=>{
    const files={'/data/petals.json':JSON.stringify(petals),'/data/mobs.json':JSON.stringify(mobs)};window.Module={FS:{readFile:key=>files[key]}};runtimePetalCache=null;
    let swaps=0;swapTravelLoadout=async()=>{swaps++;return true;};
    const equipped=Array.from({length:20},()=>({type:65535,rarity:0}));equipped[5]={type:3,rarity:7};networkLifeTotals={receivedAt:Date.now(),equipped};
    const active={preset:3};await ensureApexVision(active,version);const activeSwaps=swaps;
    equipped[5]={type:134,rarity:7};equipped[10]={type:3,rarity:7};const reserve={preset:3};await ensureApexVision(reserve,version);const reserveSwaps=swaps-activeSwaps;
    equipped[10]={type:2,rarity:7};const wrong={preset:3};await ensureApexVision(wrong,version);const wrongSwaps=swaps-activeSwaps-reserveSwaps;
    const names={antennae:apexPetalName(3,7),stick:apexPetalName(151,9),egg:apexPetalName(runtimePetalCatalog().ids.indexOf('bee_egg'),6)};
    window.Module={FS:{readFile(){throw Error('No registry');}}};const unknown=apexPetalName(151,9);
    return {active:active.searchPetal,reserve:reserve.searchPetal,wrong:wrong.searchPetal,activeSwaps,reserveSwaps,wrongSwaps,names,unknown};
  };window.flowrixNav={stop`);
  await page.evaluate(source);
  const result=await page.evaluate(keys=>{
   const petals=Object.fromEntries(keys.petals.map(key=>[key,{}])),mobs=Object.fromEntries(keys.mobs.map(key=>[key,{}]));
   const native=petalRegistryTest(petals,mobs);
   // noEggDrop affects actual drops, not whether a generated type exists.
   const edge=petalRegistryTest({antennae:{},bee_egg:{name:'Custom Bee Egg'},shell:{},stick:{}},{ant_hole:{noEggDrop:true},bee:{},shell:{},soldier_ant_pet:{},stick:{}});
   return {count:native.length,ids:Object.fromEntries(['antennae','bulb','magnet','powder','root','shell','stick'].map(key=>[key,native.indexOf(key)])),edge};
  },nativeKeys);
  assert.equal(result.count,177);
  assert.deepEqual(result.ids,{antennae:3,bulb:18,magnet:100,powder:116,root:125,shell:134,stick:151});
  assert.deepEqual(result.edge,['ant_hole_egg','antennae','bee_egg','shell','shell_egg','stick','stick_egg']);
  assert.equal(result.edge.filter(key=>key==='bee_egg').length,1,'An explicit egg definition must not create a duplicate type ID');
  const behavior=await page.evaluate(async keys=>{
   const petals=Object.fromEntries(keys.petals.map(key=>[key,{name:key==='antennae'?'Antennae':key==='stick'?'Stick':key}])),mobs=Object.fromEntries(keys.mobs.map(key=>[key,{name:key==='bee'?'Bee':key}]));
   return petalBehaviorTest(petals,mobs);
  },nativeKeys);
  assert(behavior.active&&behavior.reserve);
  assert.equal(behavior.activeSwaps,0,'Already-equipped Antennae must remain equipped through DPS handoff');
  assert.equal(behavior.reserveSwaps,1,'Antennae in reserve slot 1 should be swapped exactly once');
  assert.equal(behavior.wrong,false,'The old petals-only ID 2 must not be mistaken for Antennae');
  assert.equal(behavior.wrongSwaps,0);
  assert.deepEqual(behavior.names,{antennae:'Super Antennae',stick:'Apex Stick',egg:'Ultra Bee Egg'});
  assert.equal(behavior.unknown,'Apex Petal #151','Missing authoritative registry must not invent loot names');
  await page.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
