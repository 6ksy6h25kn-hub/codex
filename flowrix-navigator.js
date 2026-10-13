(() => {
  window.flowrixNav?.destroy();
  window.flowrixPanelTools?.destroy();
  window.flowrixTypingFix?.destroy();
  window.flowrixPositionReader?.destroy();
  window.flowrixFarm?.destroy();
  const game = document.querySelector('canvas');
  if (!game) throw new Error('Game canvas not found.');
  let heldKeys=new Set();
  const codes = { w:87, a:65, s:83, d:68, '1':49, '2':50, '3':51, '4':52, '5':53, l:76, ' ':32, j:74 };
  function send(type, key) {
    game.dispatchEvent(new KeyboardEvent(type, { key, code:key===' '?'Space':/^\d$/.test(key)?`Digit${key}`:`Key${key.toUpperCase()}`, keyCode:codes[key], which:codes[key], bubbles:true, cancelable:true }));
  }
  function release() { if(typeof heldKeys!=='undefined')heldKeys.clear();for (const k of ['w','a','s','d','1','2','3','4','5','l',' ','j']) send('keyup', k); }
  release();
  let pos = window.flowrixPosition&&Number.isFinite(window.flowrixPosition.x)&&Number.isFinite(window.flowrixPosition.y)?{...window.flowrixPosition}:null, region = null, samples = [], mapping = null, calibrating = false;
  let running = false, version = 0, pending = null, route = [], goal = null, drag = null, overlay = null;
  let terrainPixels=null,colorPixels=null,teaching=false,showColors=false,capturing=false,captureVersion=0;
  const rarityNames=['Common','Uncommon','Rare','Epic','Legendary','Mythic','Ultra'];
  const palette=new Map(),textPoints=new Map();
  let deathSeen=0,menuSeen=0,liveRealm=window.flowrixRealm||null;
  const realmLabels={garden:'garden',desert:'desert',sewers:'sewers',ant_hell:'ant_hell','ant hell':'ant_hell',computer:'computer',ocean:'ocean',jungle:'jungle'};
  let awaitingPalette=false,phase='idle',frameCache=null,screenCache=null,patrolPreview=null;
  const frameCanvas=document.createElement('canvas'),frameCtx=frameCanvas.getContext('2d',{willReadFrequently:true});
  const hooks = [];
  const visualAtlas=new WeakMap(),visualPending=new Map(),verifiedMobTypes=new Map(),visualVotes=new Map();
  const visualRarities=['Common','Uncommon','Rare','Epic','Legendary','Mythic','Ultra','Super','Unique','Apex'];
  let visualRows=[],visualAt=0,visualRAF=0,visualEnabled=true,visualPairs=0,visualFrameNumber=0;
  const atlasProbeState={queued:0,checked:0,recovered:0,lastAt:0,errors:0};
  const terrainViewPending=[];
  const atlasProbeQueue=[],atlasProbePending=new WeakMap(),atlasProbeResults=new WeakMap(),atlasTemplates=new Map();
  const atlasProbeCanvas=document.createElement('canvas'),atlasProbeCtx=atlasProbeCanvas.getContext('2d',{willReadFrequently:true});
  function visualTextType(text){
    const label=String(text).trim();if(visualRarities.includes(label))return {label,rarity:visualRarities.indexOf(label)};
    if(!loadMobCatalog())return null;for(const [type,m] of Object.entries(mobCatalog))if(m.name===label)return {label,type};return null;
  }
  function atlasSignature(image,sx,sy,sw,sh){
    if(sw<8||sh<6||sw>600||sh>128)return null;
    atlasProbeCanvas.width=Math.ceil(sw);atlasProbeCanvas.height=Math.ceil(sh);
    atlasProbeCtx.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
    const width=atlasProbeCanvas.width,height=atlasProbeCanvas.height,pixels=atlasProbeCtx.getImageData(0,0,width,height).data;
    let left=width,right=-1,top=height,bottom=-1,ink=0;const mask=new Uint8Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(pixels[i+3]>=80&&Math.max(pixels[i],pixels[i+1],pixels[i+2])>=128){mask[y*width+x]=1;ink++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
    if(ink<15||right<left||bottom-top<4||ink>sw*sh*.75)return null;
    const w=right-left+1,h=bottom-top+1,bits=new Uint8Array(64*32);
    for(let y=0;y<32;y++)for(let x=0;x<64;x++){const px=left+Math.min(w-1,Math.floor((x+.5)*w/64)),py=top+Math.min(h-1,Math.floor((y+.5)*h/32));bits[y*64+x]=mask[py*width+px];}
    return {bits,aspect:w/h,left,right,top,bottom,width:w,height:h};
  }
  function atlasTemplate(label,font){
    const key=label+'|'+font;if(atlasTemplates.has(key))return atlasTemplates.get(key);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=font;canvas.width=Math.ceil(ctx.measureText(label).width)+16;canvas.height=96;ctx.font=font;ctx.fillStyle='#ffffff';ctx.fillText(label,8,72);
    const sig=atlasSignature(canvas,0,0,canvas.width,canvas.height);atlasTemplates.set(key,sig);while(atlasTemplates.size>160)atlasTemplates.delete(atlasTemplates.keys().next().value);return sig;
  }
  function queueAtlasProbe(image,sx,sy,sw,sh){
    if(!visualEnabled||!apex.active||mobCatalogTrusted&&apexTargetVisible(apex.active)||image.width<512||image.height<256||sw<18||sw>600||sh<7||sh>96||atlasProbeQueue.length>=24)return;
    const key=[sx,sy,sw,sh].map(Math.round).join(':');let results=atlasProbeResults.get(image);if(!results)atlasProbeResults.set(image,results=new Map());
    const prior=results.get(key);if(prior&&Date.now()-prior.at<60000)return;
    let pending=atlasProbePending.get(image);if(!pending)atlasProbePending.set(image,pending=new Set());if(pending.has(key))return;pending.add(key);atlasProbeQueue.push({image,sx,sy,sw,sh,key});atlasProbeState.queued=atlasProbeQueue.length;
  }
  function recoverCachedAtlasText(){
    if(!visualEnabled||!apex.active||Date.now()-atlasProbeState.lastAt<125)return;atlasProbeState.lastAt=Date.now();
    const item=atlasProbeQueue.shift();atlasProbeState.queued=atlasProbeQueue.length;if(!item)return;
    atlasProbePending.get(item.image)?.delete(item.key);atlasProbeState.checked++;
    try{
      const sig=atlasSignature(item.image,item.sx,item.sy,item.sw,item.sh),labels=['Apex',mobCatalog?.[apex.active.type]?.name].filter(Boolean);let best=null,second=0;
      const fonts=[...new Set([...(window.Module?.cppCanvasStrings||[]).filter(v=>typeof v==='string'&&/\b(?:bold\s+)?[\d.]+px\s+/i.test(v)&&parseFloat(v.match(/([\d.]+)px/)?.[1])<=64),...[12,14,16,18,20,22,24,28,32,36,40,48].flatMap(n=>['bold '+n+'px Ubuntu, sans-serif','bold '+n+'px sans-serif'])])].slice(0,48);
      if(sig)for(const label of labels)for(const font of fonts){
        const template=atlasTemplate(label,font);if(!template||Math.abs(Math.log(sig.aspect/template.aspect))>.12)continue;
        let same=0,total=0;for(let i=0;i<sig.bits.length;i++){if(sig.bits[i]||template.bits[i])total++;if(sig.bits[i]&&template.bits[i])same++;}const score=total?same/total:0;
        if(!best||score>best.score){if(best&&best.label!==label)second=best.score;best={label,score,font};}else if(best.label!==label)second=Math.max(second,score);
      }
      let results=atlasProbeResults.get(item.image);if(!results)atlasProbeResults.set(item.image,results=new Map());results.set(item.key,{at:Date.now(),label:best?.score>=.92&&best.score-second>.08?best.label:null});while(results.size>512)results.delete(results.keys().next().value);
      if(!sig||!best||best.score<.92||best.score-second<=.08)return;
      const role=visualTextType(best.label);if(!role)return;const row={...role,left:item.sx+sig.left,right:item.sx+sig.right+1,top:item.sy+sig.top,bottom:item.sy+sig.bottom+1,fontSize:parseFloat(best.font.match(/([\d.]+)px/)?.[1])||sig.height/.72,textScale:1,recovered:true,score:best.score};
      let cache=visualAtlas.get(item.image);if(!cache)visualAtlas.set(item.image,cache={entries:new Map(),cells:new Map()});
      const key='recovered:'+item.key,cell=Math.floor((row.left+row.right)/256)+':'+Math.floor((row.top+row.bottom)/256);cache.entries.set(key,row);let bucket=cache.cells.get(cell);if(!bucket)cache.cells.set(cell,bucket=new Map());bucket.set(key,row);atlasProbeState.recovered++;
    }catch{atlasProbeState.errors++;}
  }
  function atlasText(ctx,text,x,y){
    const role=visualTextType(text);if(!role||!Number.isFinite(x)||!Number.isFinite(y))return;
    const fontSize=parseFloat(ctx.font.match(/([\d.]+)px/)?.[1]||'0');if(fontSize<=0||fontSize>128)return;
    const m=ctx.measureText(text),t=ctx.getTransform(),left=x-(m.actualBoundingBoxLeft||0),right=x+(m.actualBoundingBoxRight||m.width),top=y-(m.actualBoundingBoxAscent||fontSize),bottom=y+(m.actualBoundingBoxDescent||0);
    const pts=[[left,top],[right,top],[left,bottom],[right,bottom]].map(([x,y])=>({x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f}));
    const box={left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
    const row={...role,...box,fontSize,textScale:Math.hypot(t.a,t.b)},cx=(box.left+box.right)/2,cy=(box.top+box.bottom)/2;
    if(ctx.canvas===game){rememberVisual(row,cx,cy);return;}
    let cache=visualAtlas.get(ctx.canvas);if(!cache)visualAtlas.set(ctx.canvas,cache={entries:new Map(),cells:new Map()});
    const key=Math.round(box.left)+':'+Math.round(box.top)+':'+role.label,cell=Math.floor(cx/128)+':'+Math.floor(cy/128);
    cache.entries.set(key,row);let bucket=cache.cells.get(cell);if(!bucket)cache.cells.set(cell,bucket=new Map());bucket.set(key,row);
  }
  function forgetAtlas(ctx,x,y,w,h){
    const cache=visualAtlas.get(ctx.canvas),results=atlasProbeResults.get(ctx.canvas);if(!cache&&!results)return;
    if(x===undefined){visualAtlas.delete(ctx.canvas);atlasProbeResults.delete(ctx.canvas);return;}
    const t=ctx.getTransform(),corners=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([x,y])=>({x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f}));
    x=Math.min(...corners.map(p=>p.x));y=Math.min(...corners.map(p=>p.y));w=Math.max(...corners.map(p=>p.x))-x;h=Math.max(...corners.map(p=>p.y))-y;
    if(x<=0&&y<=0&&x+w>=ctx.canvas.width&&y+h>=ctx.canvas.height){visualAtlas.delete(ctx.canvas);atlasProbeResults.delete(ctx.canvas);return;}
    if(results)for(const key of results.keys()){const [sx,sy,sw,sh]=key.split(':').map(Number);if(sx<x+w&&sx+sw>x&&sy<y+h&&sy+sh>y)results.delete(key);}
    if(!cache)return;
    for(const [key,row] of cache.entries)if(row.left<x+w&&row.right>x&&row.top<y+h&&row.bottom>y){
      cache.entries.delete(key);const cell=Math.floor((row.left+row.right)/256)+':'+Math.floor((row.top+row.bottom)/256);cache.cells.get(cell)?.delete(key);
    }
  }
  function rememberVisual(row,x,y){
    if(!visualEnabled)return;const key=row.label+':'+Math.round(x/3)+':'+Math.round(y/3);
    if(x>=0&&x<game.width&&y>=0&&y<game.height&&(y>game.height*.82||x<game.width*.38&&y>game.height*.55||x>game.width*.7&&y<game.height*.35||x<game.width*.3&&y<game.height*.2))return;
    visualPending.set(key,{...row,x,y,at:Date.now()});
  }
  function observeTerrainView(ctx,image,args){
    const job=apex.active;if(!job?.searchPetal||!gardenReady||!gardenData?.map||!pos||Date.now()-pos.updatedAt>1000||args.length!==2||image.width<48||image.width>4096||Math.abs(image.width-image.height)>2)return;
    const t=ctx.getTransform();if(Math.abs(t.b)>.001||Math.abs(t.c)>.001||t.a<=0||t.d<=0)return;
    const chunk=gardenData.map.tilewidth*4;if(!chunk)return;
    const width=image.width*t.a,height=image.height*t.d,scale=(width+height)/(2*chunk),left=t.a*args[0]+t.e,top=t.d*args[1]+t.f;
    if(!Number.isFinite(scale)||scale<.002||scale>5||!Number.isFinite(left)||!Number.isFinite(top))return;
    const x=pos.x+(left-game.width/2)/scale,y=pos.y+(top-game.height/2)/scale,cx=Math.round(x/chunk),cy=Math.round(y/chunk),own=serverWorld.own;
    terrainViewPending.push({scale,left,top,chunk,cx,cy,at:Date.now()});if(terrainViewPending.length>48)terrainViewPending.shift();
  }
  function measureTerrainView(){
    const job=apex.active,now=Date.now(),rows=terrainViewPending.splice(0).filter(r=>now-r.at<100);if(!job?.searchPetal||now-(job.visionSince||now)<300||rows.length<3)return;
    rows.sort((a,b)=>a.scale-b.scale);const scale=rows[Math.floor(rows.length/2)].scale,close=rows.filter(r=>Math.abs(r.scale-scale)<scale*.015),base=close[0],cells=new Map();if(!base)return;
    // The camera can lead the player. Verify a repeated screen lattice instead of assuming its center is the player.
    const step=scale*base.chunk;for(const row of close){const dx=(row.left-base.left)/step,dy=(row.top-base.top)/step,cx=Math.round(dx),cy=Math.round(dy);if(Math.abs(dx-cx)*step<=3&&Math.abs(dy-cy)*step<=3)cells.set(cx+':'+cy,{cx,cy});}
    if(cells.size<3)return;const points=[...cells.values()];if(new Set(points.map(p=>p.cx)).size<2||new Set(points.map(p=>p.cy)).size<2||!points.some(a=>points.some(b=>Math.abs(a.cx-b.cx)+Math.abs(a.cy-b.cy)===1)))return;
    job.viewScale={scale,at:now,source:'Rendered terrain grid',tiles:cells.size};
  }
  function atlasImage(ctx,image,args){
    if(ctx.canvas!==game)return;observeTerrainView(ctx,image,args);const cache=visualAtlas.get(image);
    let sx=0,sy=0,sw=image.width,sh=image.height,dx=args[0],dy=args[1],dw=sw,dh=sh;
    if(args.length===4){dw=args[2];dh=args[3];}else if(args.length===8){[sx,sy,sw,sh,dx,dy,dw,dh]=args;}else if(args.length!==2)return;
    if(![sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite)||sw<=0||sh<=0)return;
    if(!cache){queueAtlasProbe(image,sx,sy,sw,sh);return;}const t=ctx.getTransform();let known=false;
    for(let by=Math.floor(sy/128);by<=Math.floor((sy+sh)/128);by++)for(let bx=Math.floor(sx/128);bx<=Math.floor((sx+sw)/128);bx++)for(const row of cache.cells.get(bx+':'+by)?.values()||[]){
      if(row.left<sx-2||row.right>sx+sw+2||row.top<sy-2||row.bottom>sy+sh+2)continue;
      const x=dx+((row.left+row.right)/2-sx)*dw/sw,y=dy+((row.top+row.bottom)/2-sy)*dh/sh;
      known=true;rememberVisual({...row,textScale:row.textScale*Math.abs(dw/sw)*Math.hypot(t.a,t.b)},t.a*x+t.c*y+t.e,t.b*x+t.d*y+t.f);
    }
    if(!known)queueAtlasProbe(image,sx,sy,sw,sh);
  }
  function renderedLabelScore(rarity,name){
    const ratio=name.fontSize/rarity.fontSize;if(ratio<1.08||ratio>1.6)return Infinity;
    const scale=name.textScale||1,gap=rarity.y-name.y;return Math.min(Math.abs(gap-26.5*scale),Math.abs(gap-(name.fontSize+rarity.fontSize)*scale));
  }
  function learnRenderedMobTypes(){
    const pairs=[],bindings=new Map(),frameNumber=++visualFrameNumber;
    for(const rarity of visualRows.filter(r=>r.rarity===9)){
      // Names may be left-aligned to a long boss health bar; the rarity is centered on the mob.
      const score=n=>renderedLabelScore(rarity,n);
      const names=visualRows.filter(n=>n.type&&n.fontSize>rarity.fontSize*1.05&&n.x<=rarity.x+20&&score(n)<Math.max(2,3*(n.textScale||1)));
      names.sort((a,b)=>score(a)-score(b));
      if(names[0]&&(!names[1]||score(names[1])-score(names[0])>.75))pairs.push({type:names[0].type,rarity:rarity.rarity,x:rarity.x,y:rarity.y});
    }
    visualPairs=pairs.length;if(Date.now()-serverWorld.updatedAt>1000)return;
    for(const rarity of [9]){
      const labels=pairs.filter(p=>p.rarity===rarity).sort((a,b)=>a.x-b.x),entities=[...serverWorld.entities.values()].filter(e=>(e.kind===1||e.kind===6)&&e.rarity===rarity&&e.hp>0&&Number.isFinite(e.type)&&Number.isFinite(e.x)&&Number.isFinite(e.y)).sort((a,b)=>a.x-b.x);
      if(!labels.length||labels.length!==entities.length)continue;
      let aligned=true;const ambiguous=new Set();
      for(let i=1;i<entities.length;i++){const dx=entities[i].x-entities[i-1].x,px=labels[i].x-labels[i-1].x;if(dx<40||px<2){ambiguous.add(i);ambiguous.add(i-1);continue;}if(px/dx<.01||px/dx>5){aligned=false;break;}}
      if(!aligned)continue;
      if(entities.length>=3){
        const mx=entities.reduce((s,e)=>s+e.x,0)/entities.length,my=labels.reduce((s,e)=>s+e.x,0)/labels.length;
        let cov=0,varX=0;for(let i=0;i<entities.length;i++){cov+=(entities[i].x-mx)*(labels[i].x-my);varX+=(entities[i].x-mx)**2;}
        const slope=cov/(varX||1);if(slope<=0||labels.some((p,i)=>Math.abs(p.x-(my+slope*(entities[i].x-mx)))>25))continue;
      }
      for(let i=0;i<entities.length;i++){
        if(ambiguous.has(i))continue;const id=entities[i].type,type=labels[i].type;
        let candidates=bindings.get(id);if(!candidates)bindings.set(id,candidates=new Set());candidates.add(type);
      }
    }
    for(const [id,candidates] of bindings){
      if(candidates.size!==1||mobCatalogTrusted&&mobIDs[id]!==[...candidates][0]){visualVotes.delete(id);verifiedMobTypes.delete(id);continue;}
      const type=[...candidates][0],old=visualVotes.get(id),vote={type,count:old?.type===type&&old.frame===frameNumber-1?old.count+1:1,frame:frameNumber};visualVotes.set(id,vote);
      if(vote.count>=3)verifiedMobTypes.set(id,{type,at:Date.now()});
    }
  }
  function visualFrame(){
    if(!visualEnabled)return;const now=Date.now();measureTerrainView();if(visualPending.size){visualRows=[...visualPending.values()];visualPending.clear();visualAt=now;learnRenderedMobTypes();measureApexView();}else if(now-visualAt>250)visualRows=[];recoverCachedAtlasText();visualRAF=requestAnimationFrame(visualFrame);
  }
  const host = document.createElement('div');
  for (const [k,v] of Object.entries({position:'fixed',left:'12px',top:'65px',width:'min(310px, calc(100vw - 16px))',height:'auto',display:'block',transform:'none','z-index':'2147483647','pointer-events':'auto'})) host.style.setProperty(k,v,'important');
  document.body.append(host);
  const root = host.attachShadow({mode:'open'});
  const css = document.createElement('style');
  css.textContent = `
    :host { all:initial; color-scheme:dark; }
    * { box-sizing:border-box; }
    .panel { touch-action:pan-y; overscroll-behavior:contain; background:#222; color:white; padding:12px; border:1px solid #777; border-radius:9px; font:13px Arial,sans-serif; max-height:85vh; overflow:auto; }
    .title,.life-title { min-height:40px; font-weight:bold; cursor:move; user-select:none; touch-action:none; padding:4px 0; }
    .position,.status { margin:7px 0; }
    .status,.apex-status { color:#ffe08a; overflow-wrap:anywhere; }
    input,select { min-height:44px; position:static; display:inline-block; padding:6px; border:1px solid #999; border-radius:4px; background:#fff; color:#111; font:16px monospace; }
    .destination { width:100%; margin:8px 0; }
    .number { width:55px; }
    button { min-height:44px; touch-action:manipulation; position:static; display:inline-block; margin:4px 5px 4px 0; padding:6px 8px; color:#fff; background:#444; border:1px solid #aaa; border-radius:4px; cursor:pointer; font:13px Arial,sans-serif; }
    .mapbox { display:none; margin-top:8px; max-height:38vh; overflow:auto; }
    canvas { position:static; display:block; width:100%; height:auto; margin:0; transform:none; image-rendering:pixelated; cursor:crosshair; touch-action:none; }
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.08); cursor:crosshair; z-index:5; }
    .hint { position:absolute; top:8px; left:8px; padding:12px; background:#222; color:white; font:14px Arial; pointer-events:none; max-width:430px; }
  `;
  root.append(css);
  function element(tag, cls, text, parent) {
    const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; parent?.append(el); return el;
  }
  const panel = element('div','panel','',root);
  const title = element('div','title','Flowrix navigator — drag here',panel);
  const live = element('div','position','Waiting for position…',panel);
  const status = element('div','status','Select the minimap to begin.',panel);
  const setup = element('div','','',panel);
  const input = element('input','destination','',panel); input.placeholder = 'Destination x, y';
  const settings = element('div','','',panel);
  settings.append('Arrival: ');
  const arrival = element('input','number','',settings); arrival.type='number'; arrival.min='1'; arrival.value='20';
  settings.append('  Wall margin: ');
  const margin = element('input','number','',settings); margin.type='number'; margin.min='0'; margin.max='4'; margin.value='0';
  const zoneControls=element('div','','',panel);zoneControls.style.marginTop='8px';zoneControls.append('Farm rarity: ');
  let spawnSelect;
  const raritySelect=element('select','','',zoneControls);
  function rebuildRarities(){const selected=raritySelect.value;raritySelect.replaceChildren();for(const name of rarityNames)element('option','',name,raritySelect).value=name;element('option','','Any rarity',raritySelect).value='Any rarity';element('option','','Ultra+',raritySelect).value='Ultra+';if(['Ocean','Jellyfish zone'].includes(spawnSelect?.value))element('option','','Jellyfish zone',raritySelect).value='Jellyfish zone';raritySelect.value=selected||'Ultra';}
  rebuildRarities();
  const paletteInfo=element('div','','No colors taught yet.',zoneControls);paletteInfo.style.marginTop='5px';
  const spawnControls=element('div','','',panel);spawnControls.style.marginTop='8px';spawnControls.append('Farm map: ');
  spawnSelect=element('select','','',spawnControls);
  const spawnNames=['Default','Garden','Desert','Computer','Ocean','Jungle','Hell','Ant Hell','Sewers','PVP Arena','Maze'];
  const buttonLabels=new Set(['continue','ready','skip tutorial',...spawnNames.map(s=>s.toLowerCase())]);
  const farmMapNames=spawnNames.flatMap(name=>name==='Ant Hell'?['Normal Ant Hell','Fire Ant Hell','Termite Ant Hell']:name==='Ocean'?['Ocean','Jellyfish zone']:[name]);
  function actualSpawnName(){if(spawnSelect.value==='Jellyfish zone')return 'Ocean';return spawnSelect.value.endsWith('Ant Hell')?'Ant Hell':spawnSelect.value;}
  let apexResumeBuild=false,apexFarmRestorePending=false;
  let firstLoadoutSwapDone=false,deathLoadoutSwapPending=false,deathLoadoutLatched=false,travelLoadoutActive=false;
  function queueDeathLoadoutSwap(){if(firstLoadoutSwapDone&&!deathLoadoutLatched){deathLoadoutSwapPending=true;deathLoadoutLatched=true;}}
  for(const name of farmMapNames)element('option','',name,spawnSelect).value=name;spawnSelect.value='Garden';
  const actions = element('div','','',panel);
  const mapbox = element('div','mapbox','',panel);
  const view = element('canvas','','',mapbox), vc = view.getContext('2d');
  const raw = document.createElement('canvas'), rc = raw.getContext('2d',{willReadFrequently:true});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function alt(type){game.dispatchEvent(new KeyboardEvent(type,{key:'Alt',code:'AltLeft',keyCode:18,which:18,altKey:type==='keydown',bubbles:true,cancelable:true}));}
  function stop(message='Stopped.') {  if(apex.active?.savedFarm&&spawnSelect.value===apex.active.map){spawnSelect.value=apex.active.savedFarm.map;gardenReady=false;gardenData=null;mapping=null;gridCache=null;rebuildRarities();raritySelect.value=apex.active.savedFarm.rarity;apexFarmRestorePending=true;}running=false; awaitingPalette=false;phase='stopped';version++;captureVersion++;release();alt('keyup');pending?.();status.textContent=message; }
  function wait(ms) {
    return new Promise(resolve => { const timer=setTimeout(done,ms); function done(){clearTimeout(timer);if(pending===done)pending=null;resolve();} pending=done; });
  }
  function refreshTextCache(){document.fonts?.dispatchEvent?.(new Event('loadingdone'));}
  function position() { if(!pos)throw new Error('Waiting for the first coordinates. Enable the game position display.'); return {x:pos.x,y:pos.y}; }
  async function freshPosition(token) {
    let probes=0,refreshed=false;
    while(token===version&&running) {
      if(scene()!=='play')return null;
      if(pos&&Date.now()-pos.updatedAt<=1500)return position();
      if(apex.active&&apexKnownBoss(apex.active)){release();status.textContent='Apex movement paused until fresh coordinates arrive.';await wait(100);continue;}
      if(!refreshed){refreshed=true;refreshTextCache();await wait(160);continue;}
      if(!await liveGate(token))return null;
      if(probes>=8)throw new Error('Movement probes could not read coordinates. The game must display its Pos text for this reader to work.');
      release();status.textContent=`Reading coordinates with a movement probe (${probes+1}/8)…`;
      const key=['d','w','a','s'][probes%4];send('keydown',key);
      await wait(350);release();if(token!==version)return null;
      await wait(120);probes++;
    }
    return null;
  }
  function observePosition(text){
    if(typeof text!=='string')return;
    if(serverWorld.own&&Date.now()-serverWorld.updatedAt<800)return;
    const m=text.match(/\bPos\s*:\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/i);
    if(m){ const x=Number(m[1]),y=Number(m[2]); if(Number.isFinite(x)&&Number.isFinite(y)){pos={x,y,updatedAt:Date.now()};window.flowrixPosition=pos;} }
  }
  function inspect(text,ctx,x,y) {
    if(typeof text!=='string')return;observePosition(text);
    if(ctx.canvas!==game)return;
    const label=text.trim(),now=Date.now();
    if(/you were destroyed by/i.test(label))deathSeen=now;
    if(/^spawn at\s*:?$/i.test(label))menuSeen=now;
    if(!buttonLabels.has(label.toLowerCase())&&!realmLabels[label.toLowerCase()]&&!['settings','graphics','show performance stats'].includes(label.toLowerCase()))return;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const metrics=ctx.measureText(text),t=ctx.getTransform();
    const left=Number.isFinite(metrics.actualBoundingBoxLeft)?metrics.actualBoundingBoxLeft:0;
    const right=Number.isFinite(metrics.actualBoundingBoxRight)?metrics.actualBoundingBoxRight:metrics.width;
    const ascent=Number.isFinite(metrics.actualBoundingBoxAscent)?metrics.actualBoundingBoxAscent:12;
    const descent=Number.isFinite(metrics.actualBoundingBoxDescent)?metrics.actualBoundingBoxDescent:3;
    const cx=x+(right-left)/2,cy=y+(descent-ascent)/2;
    const tx=t.a*cx+t.c*cy+t.e,ty=t.b*cx+t.d*cy+t.f;if(realmLabels[label.toLowerCase()]&&tx>game.width*.7&&ty<game.height*.4){liveRealm={id:realmLabels[label.toLowerCase()],at:now};window.flowrixRealm=liveRealm;}
    textPoints.set(label.toLowerCase(),{x:t.a*cx+t.c*cy+t.e,y:t.b*cx+t.d*cy+t.f,at:now,left:t.a*(x-left)+t.c*cy+t.e,height:Math.abs(t.d)*(ascent+descent),scale:Math.abs(t.a)});
  }
  for(const proto of [globalThis.CanvasRenderingContext2D?.prototype,globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    for(const name of ['fillText','strokeText','measureText']) { const original=proto[name]; if(typeof original!=='function')continue;
      function wrapped(...args){const result=Reflect.apply(original,this,args);if(name==='measureText')observePosition(args[0]);else{inspect(args[0],this,args[1],args[2]);if(name==='fillText')atlasText(this,args[0],args[1],args[2]);}return result;}
      proto[name]=wrapped;hooks.push({proto,name,original,wrapped});
    }
  }
  for(const proto of [globalThis.CanvasRenderingContext2D?.prototype,globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean))for(const name of ['drawImage','clearRect','fillRect','reset']){
    const original=proto[name];if(typeof original!=='function')continue;
    function wrapped(...args){const result=Reflect.apply(original,this,args);if(name==='drawImage')atlasImage(this,args[0],args.slice(1));else forgetAtlas(this,...args);return result;}
    proto[name]=wrapped;hooks.push({proto,name,original,wrapped});
  }
  function readMap() {
    if(gardenReady)return showColors?colorPixels:terrainPixels;
    if(!region)throw new Error('Select the minimap first.');
    const rect=game.getBoundingClientRect(),scaleX=game.width/rect.width,scaleY=game.height/rect.height;
    const sx=(rect.width-region.anchor.right-region.anchor.width)*scaleX,sy=region.anchor.top*scaleY;
    const sw=region.anchor.width*scaleX,sh=region.anchor.height*scaleY;
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<0||sy<0||sx+sw>game.width+1||sy+sh>game.height+1)throw new Error('Minimap crop is outside the game. Click Select minimap again.');
    rc.drawImage(game,sx,sy,sw,sh,0,0,region.w,region.h);
    return rc.getImageData(0,0,region.w,region.h).data;
  }
  function removeOverlay(){overlay?.remove();overlay=null;}
  function selectMap() {
    stop();removeOverlay();overlay=element('div','overlay','',root);
    const hint=element('div','hint','Click minimap top-left, then bottom-right. Escape cancels.',overlay), points=[];
    overlay.onclick=e=>{
      const r=game.getBoundingClientRect();points.push({x:(e.clientX-r.left)*game.width/r.width,y:(e.clientY-r.top)*game.height/r.height});
      hint.textContent='Now click minimap bottom-right.';if(points.length<2)return;
      const x=Math.round(Math.min(points[0].x,points[1].x)),y=Math.round(Math.min(points[0].y,points[1].y));
      const w=Math.round(Math.abs(points[1].x-points[0].x)),h=Math.round(Math.abs(points[1].y-points[0].y));removeOverlay();
      if(w<30||h<30||w>600||h>600||x<0||y<0||x+w>game.width||y+h>game.height){status.textContent='Invalid map selection. Try again.';return;}
      const rect=game.getBoundingClientRect(),scaleX=game.width/rect.width,scaleY=game.height/rect.height;
      region={x,y,w,h,anchor:{right:rect.width-(x+w)/scaleX,top:y/scaleY,width:w/scaleX,height:h/scaleY}};
      region.w=192;region.h=192;raw.width=view.width=192;raw.height=view.height=192;mapping=null;terrainPixels=null;colorPixels=null;updatePalette();saveSettings();status.textContent='Minimap selected. Press Start automatic loop.';
    };
  }
  view.onclick=e=>{
    if(running&&!awaitingPalette)stop();const r=view.getBoundingClientRect();let map={x:(e.clientX-r.left)*view.width/r.width,y:(e.clientY-r.top)*view.height/r.height};
    try {
      if(teaching){
        if(!colorPixels||!terrainPixels)throw new Error('Capture the normal and Alt maps first.');
        const colors=[];
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const x=Math.round(map.x)+dx,y=Math.round(map.y)+dy;if(x<0||y<0||x>=region.w||y>=region.h)continue;const n=(y*region.w+x)*4;
          if(terrainPixels[n]<155||terrainPixels[n+1]<155||terrainPixels[n+2]<155)continue;
          colors.push([colorPixels[n],colorPixels[n+1],colorPixels[n+2]]);
        }
        if(!colors.length)throw new Error('Click the middle of a colored floor area, away from walls and water.');
        const rgb=[0,1,2].map(c=>colors.map(v=>v[c]).sort((a,b)=>a-b)[Math.floor(colors.length/2)]);
        const name=raritySelect.value==='Ultra+'?'Ultra':raritySelect.value;
        palette.set(name,rgb);teaching=false;updatePalette();saveSettings();status.textContent=`${name} color taught and saved.`;
      } else {
        if(!mapping)throw new Error('Calibrate first.');goal=mapping.toWorld(map);input.value=`${Math.round(goal.x)}, ${Math.round(goal.y)}`;route=[];status.textContent='Destination selected. Click Go.';
      }
    }catch(error){status.textContent=error.message;}
  };
  function updatePalette(){paletteInfo.textContent=palette.size?'Taught: '+[...palette.keys()].join(', '):'No colors taught yet.';}
  function freshText(name){const p=textPoints.get(name.toLowerCase());return p&&Date.now()-p.at<900?p:null;}
  async function captureMaps(automatic=false){
    if(capturing)return;
    if(!automatic)stop();
    try{
      if(!region||!mapping)throw new Error('Select the minimap and calibrate first.');
      if(scene()!=='play')throw new Error('Capture maps while your character is alive in the game.');
      capturing=true;const token=++captureVersion;status.textContent='Capturing normal map, then Alt colors…';
      alt('keyup');await wait(250);if(token!==captureVersion)return;
      if(scene()!=='play')throw new Error('SCREEN');
      terrainPixels=new Uint8ClampedArray(readMap());
      alt('keydown');await wait(450);if(token!==captureVersion)return;
      if(scene()!=='play')throw new Error('SCREEN');
      const colors=new Uint8ClampedArray(readMap());
      let floor=0,changed=0;
      for(let n=0;n<colors.length;n+=4)if(terrainPixels[n]>=155&&terrainPixels[n+1]>=155&&terrainPixels[n+2]>=155){floor++;if(Math.hypot(colors[n]-terrainPixels[n],colors[n+1]-terrainPixels[n+1],colors[n+2]-terrainPixels[n+2])>20)changed++;}
      if(changed<Math.max(5,floor*.02))throw new Error('Alt did not change the map. Hold Alt yourself and click Capture colors manually.');
      colorPixels=colors;showColors=true;teaching=false;mapbox.style.display='block';
      status.textContent='Maps captured. Select a rarity, click Teach color, then click inside its colored area.';
      return true;
    }catch(error){if(automatic&&error.message==='SCREEN')throw error;status.textContent=error.message;return false;}
    finally{alt('keyup');capturing=false;}
  }
  function captureColorsManually(){
    try{
      if(!terrainPixels)throw new Error('Click Capture maps once first to save normal terrain.');
      const colors=new Uint8ClampedArray(readMap());if(!awaitingPalette)stop();colorPixels=colors;showColors=true;mapbox.style.display='block';
      status.textContent='Alt colors captured. Select a rarity and click Teach color.';
    }catch(error){status.textContent=error.message;}
  }
  function teachColor(){
    if(!awaitingPalette)stop();
    if(!colorPixels){status.textContent='Capture the maps first.';return;}
    calibrating=false;teaching=true;showColors=true;mapbox.style.display='block';
    const name=raritySelect.value==='Ultra+'?'Ultra':raritySelect.value;
    status.textContent=`Click the middle of a ${name} colored area below. You decide which color is ${name}.`;
  }
  function addRarity(){
    stop();const name=prompt('Name of a rarity HIGHER than Ultra (for example, a higher rarity you know):')?.trim();
    if(!name||rarityNames.includes(name)||name==='Ultra+')return;
    rarityNames.push(name);rebuildRarities();raritySelect.value=name;saveSettings();status.textContent='Rarity added. Teach its color on the Alt map.';
  }
  function grid(allowed=null){
    const pixels=terrainPixels||readMap(),padding=Number(margin.value),W=region.w,H=region.h;
    if(gardenReady&&padding===0)return gardenGrid(allowed);
    if(!Number.isInteger(padding)||padding<0||padding>4)throw new Error('Wall margin must be 0–4 map pixels.');
    const open=new Uint8Array(W*H),point=i=>({x:i%W,y:Math.floor(i/W)});
    for(let i=0;i<open.length;i++){
      if(allowed&&!allowed[i])continue;
      const p=point(i);let clear=true;
      for(let dy=-padding;dy<=padding&&clear;dy++)for(let dx=-padding;dx<=padding;dx++){
        const x=p.x+dx,y=p.y+dy,n=(y*W+x)*4;
        if(x<0||y<0||x>=W||y>=H||pixels[n]<155||pixels[n+1]<155||pixels[n+2]<155){clear=false;break;}
      }
      open[i]=clear?1:0;
    }
    function nearest(p,label,limit){
      if(p.x<0||p.y<0||p.x>=W||p.y>=H)throw new Error(`${label} is outside the calibrated map.`);
      let best=-1,d=Infinity;for(let i=0;i<open.length;i++)if(open[i]){const v=distance(point(i),p);if(v<d){d=v;best=i;}}
      if(d>limit)throw new Error(`${label} is too close to a wall/water. Try open floor, margin 0, or check calibration.`);return best;
    }
    return {W,H,open,point,nearest};
  }
  function neighbors(g,i){const x=i%g.W,y=Math.floor(i/g.W),list=[];if(x>0)list.push(i-1);if(x+1<g.W)list.push(i+1);if(y>0)list.push(i-g.W);if(y+1<g.H)list.push(i+g.W);return list;}
  function search(g,start){
    const source=g.nearest(start,'Player position',7),previous=new Int32Array(g.open.length).fill(-1),steps=new Int32Array(g.open.length).fill(-1),queue=[source];
    previous[source]=source;steps[source]=0;
    for(let q=0;q<queue.length;q++)for(const next of neighbors(g,queue[q]))if(g.open[next]&&previous[next]<0){previous[next]=queue[q];steps[next]=steps[queue[q]]+1;queue.push(next);}
    return {source,previous,steps};
  }
  function reconstruct(g,result,target){
    if(result.previous[target]<0)throw new Error('No clear path. Check calibration or use wall margin 0.');
    const nodes=[];for(let i=target;i!==result.source;i=result.previous[i])nodes.push(g.point(i));nodes.push(g.point(result.source));nodes.reverse();
    const corners=[nodes[0]];for(let i=1;i<nodes.length-1;i++){const a=nodes[i-1],b=nodes[i],c=nodes[i+1];if(b.x-a.x!==c.x-b.x||b.y-a.y!==c.y-b.y)corners.push(b);}if(nodes.length>1)corners.push(nodes[nodes.length-1]);return corners;
  }
  function plan(startWorld,goalWorld,allowed=null){const g=grid(allowed),target=g.nearest(mapping.toMap(goalWorld),'Destination',3),result=gardenReady?astar(g,mapping.toMap(startWorld),target):search(g,mapping.toMap(startWorld));const nodes=reconstruct(g,result,target);return gardenReady?smooth(g,nodes):nodes;}
  function rarityMask(){
    if(!colorPixels||!terrainPixels)throw new Error('Capture maps and teach the requested rarity color first.');
    const requested=raritySelect.value;if(requested==='Jellyfish zone'){if(gardenData?.name!=='Ocean')throw Error('Jellyfish zone requires Ocean.');const zones=gardenData.map.layers.find(l=>l.name==='spawns')?.objects.filter(o=>o.name.toLowerCase()==='jellyfish zone'&&o.polygon)||[];if(!zones.length)throw Error('Ocean map has no Jellyfish zone.');const inside=(p,o)=>{let hit=false;for(let i=0,j=o.polygon.length-1;i<o.polygon.length;j=i++){const a=o.polygon[i],b=o.polygon[j],x=p.x-o.x,y=p.y-o.y;if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};return Uint8Array.from(gardenOpen,(v,i)=>v&&zones.some(o=>inside(mapping.toWorld({x:i%region.w,y:Math.floor(i/region.w)}),o))?1:0);}if(requested==='Any rarity'&&gardenReady)return Uint8Array.from(gardenRanks,r=>r!==255?1:0);const plus=requested==='Ultra+',rank=plus?6:rarityNames.indexOf(requested);
    const taught=[...palette].map(([name,rgb])=>({name,rgb,rank:rarityNames.indexOf(name)}));
    if(!taught.some(p=>plus?p.rank>=rank:p.name===requested))throw new Error(`Teach ${plus?'Ultra or a higher rarity':requested} first.`);
    const mask=new Uint8Array(region.w*region.h);
    for(let i=0;i<mask.length;i++){
      const n=i*4;let best=null,bestDistance=32*32;
      for(const entry of taught){const d=(colorPixels[n]-entry.rgb[0])**2+(colorPixels[n+1]-entry.rgb[1])**2+(colorPixels[n+2]-entry.rgb[2])**2;if(d<bestDistance){bestDistance=d;best=entry;}}
      if(best&&(plus?best.rank>=rank:best.name===requested))mask[i]=1;
    }
    return mask;
  }
  function interior(g,mask,i){const p=g.point(i);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=p.x+dx,y=p.y+dy;if(x<0||y<0||x>=g.W||y>=g.H||!mask[y*g.W+x]||!g.open[y*g.W+x])return false;}return true;}
  function sewerPatrolBox(){
    if(gardenData?.name!=='Sewers'||!['Ultra','Ultra+'].includes(raritySelect.value))return null;
    const zones=(gardenData.map.layers.find(l=>l.name==='spawns')?.objects||[]).filter(o=>/ultra/i.test(o.name)&&o.polygon);
    const boxes=zones.map(o=>{const xs=o.polygon.map(p=>p.x+o.x),ys=o.polygon.map(p=>p.y+o.y);return {minX:Math.max(o.x,Math.min(...xs)),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};});
    boxes.sort((a,b)=>(b.maxX-b.minX)*(b.maxY-b.minY)-(a.maxX-a.minX)*(a.maxY-a.minY));return boxes[0]||null;
  }
  function inSewerBox(p,box,inset=0){return p.x>=box.minX+inset&&p.x<=box.maxX-inset&&p.y>=box.minY+inset&&p.y<=box.maxY-inset;}
  function chooseArea(startWorld,areaIndex=0){
    const g=grid(),result=search(g,mapping.toMap(startWorld)),mask=rarityMask(),labels=new Int32Array(mask.length),areas=[];let id=0;
    for(let i=0;i<mask.length;i++){
      if(!mask[i]||!g.open[i]||labels[i])continue;
      id++;const queue=[i];labels[i]=id;let near=-1,safe=-1;
      for(let q=0;q<queue.length;q++){
        const cell=queue[q];
        if(result.steps[cell]>=0){if(near<0||result.steps[cell]<result.steps[near])near=cell;if(interior(g,mask,cell)&&(safe<0||result.steps[cell]<result.steps[safe]))safe=cell;}
        for(const next of neighbors(g,cell))if(mask[next]&&g.open[next]&&!labels[next]){labels[next]=id;queue.push(next);}
      }
      const target=safe>=0?safe:near;if(target>=0&&safe>=0&&queue.length>=64)areas.push({id,target,steps:result.steps[target]});
    }
    if(!areas.length)throw new Error('No reachable area matches this rarity. Check its taught color and wall margin.');
    areas.sort((a,b)=>a.steps-b.steps);let selection=areas;const sewerBox=sewerPatrolBox();
    if(sewerBox){const roomIDs=new Set();for(let i=0;i<mask.length;i++)if(mask[i]&&g.open[i]&&inSewerBox(mapping.toWorld(g.point(i)),sewerBox,256))roomIDs.add(labels[i]);const preferred=areas.filter(a=>roomIDs.has(a.id));if(!preferred.length)throw new Error("The large Sewers room is not reachable with the current wall margin.");selection=preferred;}
    const chosen=selection[areaIndex%selection.length],areaMask=new Uint8Array(mask.length);
    for(let i=0;i<mask.length;i++)if(labels[i]===chosen.id&&(!sewerBox||inSewerBox(mapping.toWorld(g.point(i)),sewerBox)))areaMask[i]=1;
    let target=chosen.target;
    if(sewerBox){let entry=-1;for(let i=0;i<areaMask.length;i++)if(areaMask[i]&&result.steps[i]>=0&&interior(g,areaMask,i)&&(entry<0||result.steps[i]<result.steps[entry]))entry=i;if(entry>=0)target=entry;}
    if(gardenData?.name==='Desert'){
      // Colored entrance corridors are travel, not the farming-zone arrival.
      // Keep the speed loadout until the route opens into the broad zone.
      const {depth,max}=zoneDepth({mask:areaMask});
      const clearance=Math.min(max,Math.max(8,Math.min(16,Math.floor(max*.2))));
      let exit=-1;
      for(let i=0;i<areaMask.length;i++)if(areaMask[i]&&g.open[i]&&depth[i]>=clearance&&result.steps[i]>=0&&(exit<0||result.steps[i]<result.steps[exit]))exit=i;
      if(exit>=0)target=exit;
    }
    return {mask:areaMask,path:reconstruct(g,result,target),goal:mapping.toWorld(g.point(target)),count:selection.length};
  }
  async function navigate(path,token,farming=false){
    if(gardenReady)return navigateGarden(path,token,farming);
    route=path.slice();const finalGoal=mapping.toWorld(route[route.length-1]),speed={x:null,y:null};
    const started=performance.now();let checkpoint=position(),checkpointTime=performance.now(),wrong=0;
    while(running&&token===version){
      if(scene()!=='play'){release();route=[];return 'screen';}
      const wasStale=!pos||Date.now()-pos.updatedAt>1500;
      if(!await liveGate(token))return 'stopped';
      const before=await freshPosition(token);if(!before)return 'screen';
      if(wasStale){checkpoint=before;checkpointTime=performance.now();}
      const map=mapping.toMap(before);
      if(route.length&&((!farming&&route.length===1&&distance(before,finalGoal)<=Number(arrival.value))||distance(map,route[0])<.6))route.shift();
      if(!route.length){release();return 'arrived';}
      if(performance.now()-started>600000)throw new Error('Route timed out.');
      const target=mapping.toWorld(route[0]),dx=target.x-before.x,dy=target.y-before.y,axis=Math.abs(dx)>=Math.abs(dy)?'x':'y',error=axis==='x'?dx:dy;
      const direction=axis==='x'?(error>0?'d':'a'):(error>0?'s':'w'),duration=speed[axis]?Math.max(25,Math.min(140,Math.abs(error)/speed[axis]*650)):100;
      status.textContent=`${farming?'Farming '+raritySelect.value:'Navigating'}: ${route.length} route points remaining`;
      const began=performance.now();send('keydown',direction);await wait(duration);if(token!==version)return 'stopped';release();const elapsed=(performance.now()-began)/1000;
      await wait(70);if(token!==version)return 'stopped';if(scene()!=='play'){route=[];return 'screen';}
      const staleAfter=!pos||Date.now()-pos.updatedAt>1500,after=await freshPosition(token);if(!after)return 'screen';
      if(staleAfter){checkpoint=after;checkpointTime=performance.now();continue;}
      const moved=after[axis]-before[axis],other=axis==='x'?'y':'x',sideways=Math.abs(after[other]-before[other]);
      if((Math.abs(moved)>3&&Math.sign(moved)!==Math.sign(error))||sideways>Math.max(8,Math.abs(moved)*.7)){release();return 'recover';}
      if(Math.abs(moved)>1){const measured=Math.abs(moved)/elapsed;speed[axis]=speed[axis]?(speed[axis]+measured)/2:measured;}
      if(performance.now()-checkpointTime>4000){if(distance(after,checkpoint)<3)throw new Error('Blocked. Check calibration or increase wall margin.');checkpoint=after;checkpointTime=performance.now();}
    }
    release();return 'stopped';
  }
  function saveSettings(){
    try{
      const data={palette:[...palette],rarity:raritySelect.value,spawn:spawnSelect.value,margin:margin.value,region,mapping:mapping?.coeffs||null};
      localStorage.setItem('flowrixAutoFarmV1',JSON.stringify(data));
    }catch{}
  }
  function makeMapping(xScale,xOffset,yScale,yOffset){
    return {coeffs:{xScale,xOffset,yScale,yOffset},toMap:p=>({x:xScale*p.x+xOffset,y:yScale*p.y+yOffset}),toWorld:p=>({x:(p.x-xOffset)/xScale,y:(p.y-yOffset)/yScale})};
  }
  function loadSettings(){
    try{
      const data=JSON.parse(localStorage.getItem('flowrixAutoFarmV1')||'null');if(!data)return;
      for(const [name,rgb] of data.palette||[])if(typeof name==='string'&&Array.isArray(rgb)&&rgb.length===3&&rgb.every(v=>Number.isFinite(v)&&v>=0&&v<=255)){if(!rarityNames.includes(name))rarityNames.push(name);palette.set(name,rgb);}
      rebuildRarities();if([...raritySelect.options].some(o=>o.value===data.rarity))raritySelect.value=data.rarity;
      const savedSpawn=data.spawn==='Ant Hell'?'Normal Ant Hell':data.spawn;if(farmMapNames.includes(savedSpawn))spawnSelect.value=savedSpawn;if(['Ocean','Jellyfish zone'].includes(savedSpawn)){rebuildRarities();raritySelect.value=savedSpawn==='Jellyfish zone'?'Jellyfish zone':data.rarity;}
      if(Number.isInteger(Number(data.margin))&&Number(data.margin)>=0&&Number(data.margin)<=4)margin.value=data.margin;
      if(data.region&&data.region.w===192&&data.region.h===192&&Object.values(data.region.anchor||{}).length===4&&Object.values(data.region.anchor).every(Number.isFinite)){region=data.region;raw.width=view.width=192;raw.height=view.height=192;}
      const c=data.mapping;if(c&&Object.values(c).length===4&&Object.values(c).every(Number.isFinite)&&Math.abs(c.xScale)>1e-9&&Math.abs(c.yScale)>1e-9)mapping=makeMapping(c.xScale,c.xOffset,c.yScale,c.yOffset);
      updatePalette();status.textContent='Saved colors loaded. Choose the target, then Start automatic loop.';
    }catch{}
  }
  function frame(force=false){
    if(!force&&frameCache&&Date.now()-frameCache.at<200)return frameCache;
    if(frameCanvas.width!==game.width||frameCanvas.height!==game.height){frameCanvas.width=game.width;frameCanvas.height=game.height;}
    frameCtx.drawImage(game,0,0);const image=frameCtx.getImageData(0,0,game.width,game.height),rect=game.getBoundingClientRect();
    frameCache={pixels:image.data,W:image.width,H:image.height,rect,at:Date.now()};return frameCache;
  }
  function components(image,test,bounds){
    const {W,H,pixels}=image,seen=new Uint8Array(W*H),found=[];
    const [x0,y0,x1,y1]=bounds||[0,0,W,H];
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const start=y*W+x;if(seen[start]||!test(pixels,start*4))continue;
      const queue=[start];seen[start]=1;let sx=0,sy=0,minX=x,maxX=x,minY=y,maxY=y;
      for(let q=0;q<queue.length;q++){
        const i=queue[q],xx=i%W,yy=Math.floor(i/W);sx+=xx;sy+=yy;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=xx+dx,ny=yy+dy;if(nx<x0||ny<y0||nx>=x1||ny>=y1)continue;const j=ny*W+nx;if(!seen[j]&&test(pixels,j*4)){seen[j]=1;queue.push(j);}}
      }
      found.push({x:sx/queue.length,y:sy/queue.length,minX,maxX,minY,maxY,count:queue.length});
    }
    return found;
  }
  function autoMinimap(){
    if(initGarden())return;
    const image=frame(true),{W,H,rect}=image;
    const yellow=(p,n)=>p[n]>180&&p[n+1]>140&&p[n+2]<100&&p[n+1]>p[n]*.6;
    const candidates=components(image,yellow,[Math.floor(W*.6),0,W,Math.ceil(H*.4)]).filter(c=>{
      const w=c.maxX-c.minX+1,h=c.maxY-c.minY+1,cssW=w*rect.width/W,cssH=h*rect.height/H;
      return cssW>=70&&cssH>=70&&cssW<=400&&cssH<=400&&w/h>.75&&w/h<1.3&&c.minY<H*.15&&c.maxX>W*.85&&c.count>1.1*(w+h);
    }).sort((a,b)=>b.count-a.count);
    if(!candidates.length){if(region){readMap();return;}throw new Error('Could not find the yellow minimap border. Use Select minimap once, then Start again.');}
    const c=candidates[0],x=c.minX+2,y=c.minY+2,w=c.maxX-c.minX-3,h=c.maxY-c.minY-3;
    region={w:192,h:192,anchor:{right:rect.width-(x+w)*rect.width/W,top:y*rect.height/H,width:w*rect.width/W,height:h*rect.height/H}};
    raw.width=view.width=192;raw.height=view.height=192;saveSettings();
  }
  function visualScreens(){
    const image=frame(),{W,H,rect,pixels}=image,sx=W/rect.width,sy=H/rect.height;
    if(screenCache&&screenCache.at===image.at)return screenCache.result;
    const green=(p,n)=>p[n+1]>110&&p[n+1]>p[n]*1.4&&p[n+2]<p[n+1]*.4;
    const list=components(image,green,[Math.floor(W*.25),Math.floor(H*.25),Math.ceil(W*.78),Math.ceil(H*.78)]);
    let death=null,menu=null;
    function ratio(cx,cy,halfW,halfH,test){let hit=0,total=0;for(let yy=-halfH;yy<=halfH;yy+=3)for(let xx=-halfW;xx<=halfW;xx+=3){const x=Math.round(cx+xx*sx),y=Math.round(cy+yy*sy);if(x<0||y<0||x>=W||y>=H)continue;total++;if(test(pixels,(y*W+x)*4))hit++;}return total?hit/total:0;}
    const gray=(p,n)=>p[n]>=45&&p[n]<=190&&Math.max(p[n],p[n+1],p[n+2])-Math.min(p[n],p[n+1],p[n+2])<30;
    const lightGray=(p,n)=>Math.min(p[n],p[n+1],p[n+2])>155&&Math.max(p[n],p[n+1],p[n+2])-Math.min(p[n],p[n+1],p[n+2])<30;
    for(const c of list){
      const bw=c.maxX-c.minX+1,bh=c.maxY-c.minY+1,cx=(c.minX+c.maxX)/2,cy=(c.minY+c.maxY)/2,u=bh/40;
      if(bw<30||bw>W*.25||bh<12||bh>H*.15||bw/bh<1.7||bw/bh>8||c.count/(bw*bh)<.45)continue;
      const dx=cx-W/2,dy=cy-H/2;
      if(Math.abs(dx)<60*u&&dy>20*u&&dy<170*u){
        const close=Math.max(...[32,38,44].map(offset=>ratio(cx,cy+offset*u,25*u/sx,8*u/sy,gray)));
        if(close>.45)death={kind:'death',button:{x:cx,y:cy,h:c.maxY-c.minY+1,at:Date.now()},source:'visual Continue'};
      }
      if(dx>45*u&&dx<260*u&&dy>-145*u&&dy<-15*u){
        const inputField=ratio(cx-200*u,cy,65*u/sx,10*u/sy,lightGray)>.55;
        const tests=[[2,(p,n)=>p[n]>150&&p[n+1]>90&&p[n+2]<130],[4,(p,n)=>p[n+1]>160&&p[n+2]>160],[6,(p,n)=>p[n]>180&&p[n+1]<100&&p[n+2]<100],[10,(p,n)=>p[n+2]>70&&p[n+1]<130&&p[n+2]>p[n+1]*1.2]];
        const hits=tests.filter(([index,test])=>ratio(W/2+(index-5)*84*u-22*u,cy+65*u-5*u,5*u/sx,5*u/sy,test)>.5).length;
        if(inputField||hits>=3)menu={kind:'menu',button:{x:cx,y:cy,h:bh,at:Date.now()},source:'visual Ready'};
      }
    }
    const result=menu||death||{kind:'play'};screenCache={at:image.at,result};return result;
  }
  function screenInfo(){
    const domReady=domPoint('Ready'),domContinue=domPoint('Continue');
    if(domReady)return {kind:'menu',button:domReady,source:'Ready control'};
    if(domContinue)return {kind:'death',button:domContinue,source:'Continue control'};
    const ready=freshText('Ready'),cont=freshText('Continue');
    if(Date.now()-menuSeen<900&&ready&&menuSeen>=deathSeen)return {kind:'menu',button:ready,source:'Ready text'};
    if(Date.now()-deathSeen<900&&cont)return {kind:'death',button:cont,source:'Continue text'};
    try{return visualScreens();}catch{return {kind:'play'};}
  }
  function scene(){return screenInfo().kind;}
  function domPoint(name){
    for(const el of document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')){
      if((el.innerText||el.value||el.textContent||'').trim().toLowerCase()!==name.toLowerCase())continue;
      const r=el.getBoundingClientRect(),style=getComputedStyle(el);if(!r.width||!r.height||style.display==='none'||style.visibility==='hidden')continue;
      const g=game.getBoundingClientRect();return {x:(r.left+r.width/2-g.left)*game.width/g.width,y:(r.top+r.height/2-g.top)*game.height/g.height,at:Date.now(),dom:el};
    }
    return null;
  }
  async function clickPoint(p,token){
    if(!p||Date.now()-p.at>1000||token!==version||!running||document.hidden||!document.hasFocus())return false;
    const r=game.getBoundingClientRect(),data={clientX:r.left+p.x*r.width/game.width,clientY:r.top+p.y*r.height/game.height,button:0,bubbles:true,cancelable:true};
    function dispatch(type,buttons){const d={...data,buttons};(p.dom||game).dispatchEvent(type.startsWith('pointer')&&globalThis.PointerEvent?new PointerEvent(type,{...d,pointerId:1,pointerType:'mouse',isPrimary:true}):new MouseEvent(type,d));}
    dispatch('pointermove',0);dispatch('mousemove',0);await wait(80);if(token!==version||!running)return false;
    dispatch('pointerdown',1);dispatch('mousedown',1);await wait(110);dispatch('pointerup',0);dispatch('mouseup',0);
    if(token!==version||!running||document.hidden||!document.hasFocus())return false;dispatch('click',0);frameCache=null;return true;
  }
  async function clickText(name,token){return clickPoint(freshText(name),token);}
  function spawnPoint(info){
    const label=domPoint(actualSpawnName())||freshText(actualSpawnName());const known=label&&label.y>game.height*.25&&label.y>info.button.y?label:null;if(known)return known;
    const visual=visualScreens();if(visual.kind!=='menu'||!visual.button.h)return null;
    const scale=visual.button.h/40,index=spawnNames.indexOf(actualSpawnName());
    return {x:game.width/2+(index-5)*84*scale,y:visual.button.y+65*scale,at:Date.now()};
  }
  function markerCandidates(){
    const pixels=readMap(),image={W:region.w,H:region.h,pixels};
    const colorful=(p,n)=>(p[n+2]>110&&p[n+2]>p[n]*1.3&&p[n+2]>p[n+1]*1.18)||(p[n+1]>125&&p[n+1]>p[n]*1.3&&p[n+1]>p[n+2]*1.15)||(p[n]>170&&p[n+1]>150&&p[n+2]<100)||(p[n]>150&&p[n]>p[n+1]*1.35&&p[n]>p[n+2]*1.35);
    return components(image,colorful).filter(c=>c.count<=120&&c.maxX-c.minX<=12&&c.maxY-c.minY<=12).map(c=>({x:c.x,y:c.y}));
  }
  function fitAutomatic(records){
    if(records.length<12)throw new Error('Collecting samples');
    function model(list){
      const means={};for(const axis of ['x','y'])means[axis]={w:list.reduce((s,p)=>s+p.world[axis],0)/list.length,m:list.reduce((s,p)=>s+p.map[axis],0)/list.length};
      const coeffs={},quality={};
      for(const axis of ['x','y']){
        const mean=means[axis],vw=list.reduce((s,p)=>s+(p.world[axis]-mean.w)**2,0),vm=list.reduce((s,p)=>s+(p.map[axis]-mean.m)**2,0),cov=list.reduce((s,p)=>s+(p.world[axis]-mean.w)*(p.map[axis]-mean.m),0);
        if(vw<1||vm<1)throw new Error('Not enough movement');const scale=cov/vw;
        if(Math.abs(scale)<.0001||Math.abs(scale)>.1)throw new Error('Static or unrelated marker');
        coeffs[axis]={scale,offset:mean.m-scale*mean.w};quality[axis]=cov*cov/(vw*vm);
      }
      const vwX=list.reduce((s,p)=>s+(p.world.x-means.x.w)**2,0),vwY=list.reduce((s,p)=>s+(p.world.y-means.y.w)**2,0),cross=list.reduce((s,p)=>s+(p.world.x-means.x.w)*(p.world.y-means.y.w),0);
      if(cross*cross/(vwX*vwY)>.95)throw new Error('Need movement in two directions');
      const result=makeMapping(coeffs.x.scale,coeffs.x.offset,coeffs.y.scale,coeffs.y.offset);result.quality=quality;return result;
    }
    const initial=model(records),sorted=records.slice().sort((a,b)=>distance(initial.toMap(a.world),a.map)-distance(initial.toMap(b.world),b.map)),good=sorted.slice(0,Math.ceil(records.length*.8)),result=model(good);
    for(const axis of ['x','y']){const values=good.map(p=>p.map[axis]);if(Math.max(...values)-Math.min(...values)<4||result.quality[axis]<.85)throw new Error('Marker motion is not consistent yet');}
    result.error=Math.sqrt(good.reduce((s,p)=>s+distance(result.toMap(p.world),p.map)**2,0)/good.length);
    if(result.error>1.1)throw new Error('Marker samples are noisy');result.records=good;return result;
  }
  async function liveGate(token){
    while(running&&token===version&&(document.hidden||!document.hasFocus())){release();status.textContent='Paused while the game tab is not focused.';await wait(250);}
    return running&&token===version;
  }
  async function autoCalibrate(token,verify=true){
    release();alt('keyup');if(!await liveGate(token))return false;
    if(initGarden()){
      await preparePosition(token);
      if(realmMismatch()){await returnToSpawnMenu(token);throw new Error('SCREEN');}
      for(let attempt=0;attempt<24&&running&&token===version;attempt++){
        const p=await freshPosition(token);if(!p)throw new Error('SCREEN');
        if(realmMismatch()){await returnToSpawnMenu(token);throw new Error('SCREEN');}
        try{grid().nearest(mapping.toMap(p),'Spawn position',7);status.textContent=spawnSelect.value+' world coordinates verified. No movement calibration needed.';return true;}catch{}
        release();status.textContent='Waiting for valid '+spawnSelect.value+' spawn coordinates…';await wait(150);
        if(scene()!=='play')throw new Error('SCREEN');
      }
      throw new Error('SCREEN');
    }
    await wait(180);if(scene()!=='play')throw new Error('SCREEN');autoMinimap();
    const start=await freshPosition(token);if(!start)throw new Error('SCREEN');
    let candidates=markerCandidates();
    if(verify&&mapping){status.textContent='Using the saved mapping for this map.';return true;}
    const tracks=candidates.map(p=>({last:p,records:[{world:start,map:p}],misses:0})),directions=['w','d','s','a','d','w','a','s'];
    let best=null;
    for(let tick=0;tick<64;tick++){
      if(!await liveGate(token))return false;if(scene()!=='play')throw new Error('SCREEN');
      status.textContent=`Auto calibration: tracking the moving marker (${tick+1}/64)…`;
      const key=directions[Math.floor(tick/8)];send('keydown',key);await wait(600);release();if(token!==version)return false;
      await wait(100);const world=await freshPosition(token);if(!world)throw new Error('SCREEN');candidates=markerCandidates();
      for(const track of tracks){
        const near=candidates.slice().sort((a,b)=>distance(a,track.last)-distance(b,track.last))[0];
        if(!near||distance(near,track.last)>18){track.misses++;continue;}
        track.last=near;track.records.push({world,map:near});
        try{const fit=fitAutomatic(track.records);if(!best||fit.error<best.error)best=fit;}catch{}
      }
      if(best){mapping=best;samples=best.records.slice(-8);saveSettings();status.textContent=`Auto calibrated: ${best.error.toFixed(2)} map-pixel fit error.`;return true;}
    }
    throw new Error('Could not identify a consistently moving player marker. Try starting in a more open area, then press Start again.');
  }
  async function calibrate(){
    stop();running=true;const token=++version;
    try{const ok=await autoCalibrate(token,false);if(ok&&token===version)stop('Auto calibration complete. Press Start automatic loop.');}
    catch(error){if(token===version)stop(error.message==='SCREEN'?'Spawn into the game, then calibrate again.':error.message);}
    finally{if(token===version)release();}
  }
  async function swapTravelLoadout(token,keys=['3','4']){
    for(const key of keys){
      if(token!==version||!running||scene()!=='play')return false;
      send('keydown',key);await wait(90);send('keyup',key);
      if(token!==version||!running||scene()!=='play')return false;
      await wait(60);
    }
    return token===version&&running&&scene()==='play';
  }
  // Restore the saved farming preset once per arrival, including every respawn.
  // Loading L4 is idempotent; blind reserve toggles are not.
  async function verifyFarmLoadout(token){
    release();phase='checking farm petals';
    const before=Date.now()-(networkLifeTotals?.receivedAt||0)<3000?networkLifeTotals?.equipped?.[4]:null;
    const antHell=spawnSelect.value.endsWith('Ant Hell');let speedConfirmed=!antHell;
    const began=Date.now();
    if(!await selectLoadout(4,token))return false;
    for(let i=0;i<12&&running&&token===version&&scene()==='play';i++){
      if(networkLifeTotals?.receivedAt>began)break;
      await wait(100);
    }
    if(!running||token!==version||scene()!=='play')return false;
    // Ant Hell keeps the already equipped speed booster even if L4 has it in reserve.
    if(spawnSelect.value.endsWith('Ant Hell')&&before&&networkLifeTotals?.receivedAt>began){
      const slots=networkLifeTotals.equipped,same=p=>p&&p.type===before.type&&p.rarity===before.rarity;
      if(!same(slots?.[4])&&same(slots?.[14])){
        const lastProfile=networkLifeTotals.receivedAt;
        if(!await swapTravelLoadout(token,['5']))return false;
        for(let i=0;i<12&&running&&token===version&&scene()==='play'&&networkLifeTotals?.receivedAt<=lastProfile;i++)await wait(100);
        if(!running||token!==version||scene()!=='play')return false;
        speedConfirmed=networkLifeTotals?.receivedAt>lastProfile&&same(networkLifeTotals.equipped?.[4]);
      }else speedConfirmed=same(slots?.[4]);
    }
    status.textContent=!antHell?'Saved L4 farm build restored.':speedConfirmed?'Saved L4 farm build restored; equipped speed petal preserved for Ant Hell.':'Saved L4 farm build restored; live slot data could not confirm the Ant Hell speed petal.';
    return true;
  }
  async function prepareTravelLoadout(token){
    if(apexResumeBuild&&!deathLoadoutSwapPending)return true;
    if(!firstLoadoutSwapDone){
      if(!await swapTravelLoadout(token,['5','4','3']))return false;
      firstLoadoutSwapDone=true;travelLoadoutActive=true;
    }else if(deathLoadoutSwapPending||!travelLoadoutActive){
      if(!await swapTravelLoadout(token,['3','4']))return false;
      deathLoadoutSwapPending=false;travelLoadoutActive=true;
    }
    deathLoadoutLatched=false;return true;
  }
  // Map fallback from the supplied offline game; mob IDs refreshed from the public client.
  const bundledNavigationAssets=decodeNavigationAssets("ewAiAGcAYQByAGQAZQBuAC4AdABtAGoAIgA6AAABdwBpAGQAdABoAAwBMQAyADgALAAiAGgAZQBpAGcAaAB0ABQBFgEYAXQAaQBsAGUADwERARMBOgAyADUANgAiASQBZQAaARwBHgEMASsBLQEiACMBJQFzAGUAdABzAAwBWwAAAWYAaQByAHMAdABnABABFAF9AF0AGAFsAGEAeQBlAEMBPgEAAW4AYQBtAGUADAEiAHcAYQB0AE8BIgAiAXkAcABWAToANwEvAUwBTgFyAF0BIgBwAHIAbwBgAXIAIwFlAD0BOgA/ASIAUwFVAVcBaABhAHMAXwBjAG8AbABsAGkAcwBpAG8AbgBoAXQAXwFhASIAYgBvAH0BaAF2AGEAbAB1AGEBdAByAJEBSQEYAZQBbgBxAVsAMAAsADEAFQEsADMANwA1ADgAMAA5ADYAMwA4AC0BMQCgAaIBpAGmAagBNwCdAZ0BNgAxADAAtAEyADcANACcAasBNQAsADkALAA0ALIBMQC0AbYBFQE3ADMAvwGrAaEBowGlAacBOACxATIALAC7ATAAFwEzADIAMgAVASsBNAC5AcIBxAG3AccByQGsAcwBrwHPAd0BtQHfAcgB5gHFAbgBugGyATIANgA4ADQAMwA1ADQALAHBAasB7wHxAfMB9QGnASwA0QE1ADMA8AE3AKUBwwGyAb0BngHSASwA5QHLAa4BzgGqAbMB5wHGAekBygGtAc0BsAHqAegB4QG1AccBuQExADgA7wGyAbsBMwDiAQ0CqAEPAgwCFgLlAdEB2AHbATQAOAABAjUA0QG8AcABJAIpAhcBFALjAc4BsQGrAcMBEQK4ARMCEALrAbkBuwEsAAcCqwGcASoCMQAtAi8CNgA1AEQC1gHYAdcB9AE3AA8CvQHRASgC5AE3AkECGQKyAVgCOgL+AVsCEgK/AVcCFQLkAdABYQI/AuEBXgIXAvcB3gFiAhgCxgHtATMC1wEJAjgAFwH5AfIB9AEsATICoAHXAdkBUwJVAv4B9wEwABwCNAAeAiEBvAEBAs8BBAIHAv4B8AF5AvwBIwKSAn4CUgLbAYECOwKEAqEBhgIfAloCSAJjAkoCuQFMAjUAPAJFAp0BdwKPAvsB9gEGAooCAwI5ADEAVgKOAvoBegL9ASMCAAICAgQC9wEJAsEBLAKhAjACRAJ4AqkC/QGJArcCrgKBAr0BawJ2AiECCgKfAksCvgLuAagCswIjAsMCiwLFAgYCnQGDAoUChwJaArYC1AKvAqsCxAJKAsoCnwG8Ai4CzgLTAq0CBQIzAr0BnAGuAn0CUQLaAaIB1gI8ApkCHQKcAt8C3QKBAqcCsgL8AbkCwALRAmAC3ALoArkCuwFWAqAC5QJNAkQCAQMEAoECIwL+AvwCygLtAuQCogK/AtACkQLuAc8C+wJ7AvcC6AKNAlACfwKWAtYC0gL0ApsCiAJFAqwCjAIYA5ACLAHSAmACRwKdAWMCFQMaA8oBlALwAoECVwIQAy0BDgMyA7ECKgP9Af8BJwOuAo0CfAKcATIAkwLvAlMCjQKwAiwDuwEyALsCBgOiAqQCSgPiAk0D7gIfA/ECcwI1AlkCUwPBAR4DlQJXA6UC+AExAzYAuQIKA9UCLgMVAVwDNANIA/ICoAEpA8ECQwOdAVQDEgMwAlEDXQJTAwUDzQIIA10CagMgA/MC2QIfAjsCCQIVATkDTwN0A7IBuQI9AkICqAF3A/4BhQN6AzMDRwN9A50BIwOHAoEDTAOEA3kDowJ2A2cDIAJdA/ACHQNTAy0BngNrA34DmgKVA6EDjQOZA6QCSwNxA5gDvQJNAqsDZQLOAZ0CrQM8A28DGwMLA1MD0AGOA5oDnAO7A5kDRAKcATECsQHIAg8CiQPoAbQDVwJ8A9wBOAIlAuUBPAJuAmkCcAI/ArQDFQFEA2IDfAJwAysC2ANuA/8C5wK5A80DNgLTA+ABXQKyAxcC0AM+AscB1QNFA7YDswJ8AqMDkgOwAogD0QPkA6UD9QIgApwD2wMZAzYA7wPLAwwDNALoA4oDGgKUAx8CDwJMA2ED+wN8AmUD6QKlAsEBuQLIAoEDGwKmAwUEUwNEA7wDCQNAAwwEvQHHAuYDyQL2AyQDBgRxA9cDCQR7A5EDVALWAhwEOQKoAVoCEgT3AyEE1gOpA68DTgIlBFYDxgJZA7MD4wOLA5wDIwQ9AwoEGQQ2BPMD6QNAAi0EIATiAjEAMAMkBN8DQQO4A2YDpQIpBM4DWgIQBDkEGgL0AzoEggMeAjEEBwMzBEoE3gJcBIECLQEPBB0EEQRVBGoCYgRtA8cDbwIyAlUE1QOfAfADXwMHAg4EUwRgAlIEAQRcAuEDZgItA2sE4gIwAHgDMgQYBOACHQP+A/ICVgJiA/0CYgMNAyYDgARMBOECZwOEAu0D/AE+BIoEkAM1BNYCSAQ9A4YE+wMsAwsEsAJwA54BDQMXBIsEnASHBKEEbQM6A8ICiQTdAkIDowT4AcoC8QGiAx0ExgNkBMIBBAT4A4IDKwFVA14DSQOzBH8DuAFbA7gE8AL9ArwDCgSbA7YEZAIqBKkB5QPHBGME6QNyAqUC0QEDA3EDdwQOAu4BwgQoBLYEnAHFA9QEmQPDBIQE+wPQBDcAkwReA2EEygS7BBMEtQScATQAxgTOA7EEQgRjAjcE5wNoAkMC1gKqAbQElgMsADYAvwHZBHUEbwL4AdUEMwLSBCsEcgQfBIcCIQQzAGkDJgTjBM4DywQCBDQCcwNNAtkDhQSkBA0DowTKAyYE/wNEBKcDLgPwAb8EUwJBBEICzQQbBAAE7wTPA/EEVgREA/kEsATJBAoFYAIOBTEC8wQjBVEEZgRqBO0ELQO0BA8CpgSRBKkELAWrBC0DCQIbBW4EugTQAREFXATQBCEBbgTBBNsE1gL6ApcE3QMWAz8DkgSPBCsDpAREBcoCxwEcBdsBugQ5A0MFPQVEA9UBywNIBTIEwwTYAuYE2wIZBL0BwQELBN8EzAIyBHUDogPKAjIA+QTLA7oEIgO8BGUFUAVpBa0ETgPAAzQEXgM2BBgFgANvBdUBKQX9BEkFWAN/BSUDeAUuAyoC3AMIBD0DiAQLBIECAwX2AlQFLgO9BPoEWQSiAsMEMgK0BFoCcAMRA6AEjQXBApoEGQRFBV4FJgS6BJsFdQUXA5wDRgNWA7oEoQWzAmQDpAW+BC0FpAKmBLIF4ALQBBUBfQRaBL8CygIxAuoEKQLGAzYFqAO1BeUE9wP2BIMDVwVfA8gCLATEBZwDBwVWAx4F3wEgBcQETAPRBbkE1gI3A9AFmAWGA4YF9QS+BEAF2gWTA7wEyQVUA+IFWAPNBccFRQSsBd0FsAMhA+QF5gTmBcEF5AHsBB8FCQM7Bd4EqwXFBMsFcwVnBLYEnwSqA/AFhwXmBa0F2QUzApICUwMGBp8DAwbgBe0FxgUIBiIFhwUvBNgBywVgBVoEwwR0BWQFiwS6BTIA2ASDBfEE1QVjBcgFFQQWBuMD1QUHAg4G1wTuBb0DTgTxBfcDnQUlBhAGpQITBfoF4QQ1A9YF0QT9BfAFLAM4BRwGUwM3BqQDzgQvBiQDMQbtBegFQwYEBlMDFQXSBSoFKQILBdQF+AWpBfIFRgQoBccE9gVcAisC/gQNBP8F0wHHAl8FAgUlBVEEYAaSBecETgb1BWcGXwL7BNID9AVqBiUFZQTkBDMF9wUNBqoFQQbxA+sF2gL7BdMB2AXABNoEYQVsAxcGmQVpBgEFawb1AyEG+AUIAoEGMALDBGUG9gSdA2QGIwVQBm8CXANmBIUGJgUsAOAELAZ1Ax4GRAZ5BpQFCQLnBZAGaATSA4QFfwYzAq8ExwQxBXEGnQYUBBoFxAOQBi0FjAa7AlsFmwRNBVIFtQJmBXoG/gGSAiAGowaGBrEG8gKrAQkFTwZhBhMGygJjAzsGpwasBiUDpgSjBVAFzQZTBVEFpwS1BrAFFgNcBEIDbwVrBVoEdQMFAogDzwU+BUwG4gR+BhgG1gSHBUYGCQKLAzMGBwLEA8cG4QYMBsoGrAPpAUgG6wYSBnoEGgUfBlcGJwb4BSkGdQaoBAIDygLyBnIF8gI3AioGnAE2ANgEAgfKBkoGLgPtAeoGpgL1BkIEtAOjASMFWAZxAvsGywbnBugECAenBfICyQEFB0UCxAMgBsAG6gLSBv0CygKGAtIG/QMWBQMHywaOBvgG6wQ5BLQD8wGaBi8FCwe6AgsGQgYHAtUB4gKCBfkGAAUkBSMHEAcMBZYGMgdtBiYC4waCBgoHHwfyATQH/wQ7B2cDIQc+B4cG1gKUBqkGeAatBugGpQbbBmwD5gZ8BTgGMwIjBiQD9gRMB/MGnQGYAv0GiQWCA78DbAUvBfEGLwfCBfoGbAPqBVoHSQdcBjYH6AQBBn4EiwSRBfwGGwasBGcDpgWuBW0H2QYmBnQHiwZKBS0HJwezBkkE0gbOBvgC8gL6A0wFnwa7AdoGEwNeB4ACVAcYB7oGcAVNB2ADJQd7B4MHDAeuA70FoAf/BI0GbwWGB48DjQeXB3cGZQZ2Bd0CRQVxBQgFSAeHB64HPwZ2Bm8E9wSJBwwHawekB7gH+QKfB9cGmwc1Bj0E0QZpB9gEGweCB/8EuweCA8kGpQL0BOUFJwd3AqAF/gYoA4sHjgUAA7kG1QZSBX8HCQITB0gGtwW6BqkHLQa9AdAHVAZnAwUCLQV/BLAHbwXOB+UHzAdMA8kHBwbPB/AHIgSdB+8H3ga8BC8ERwT3B5gGXQadAfwHDgexAfkH5gT7B0sFtwNeBNYCAwhXB2YGngFRBzAH4wfDBBcB0wUSAmwEfAYdBWEGQQcpBvUHngHXBwgIqwdPBY8HMwJWBlAEYQZSBFMGLgRGBDgHWAXyAgkG6AcrCLkHtgcJCNsHyAa/BzUHnAW2BqcEnQQxAMQHHwjQBp8G6ge3BykHpQeaB8IHNghYA8MGeARlBiEEuAFdAH0ALABSAVQBiAFkAEIBHwFeAWABVwE4AWUAZQFcARgBagFsAU8BbwGaAVEIdgFiAXgBegF8AX4BgAGCAYQBVwiIAYoBjAEYAY4BkAGSAZQBZQCWASIAmAGaAb0BHwKsBjMA6wfoAtsCoAF9B/UCfwiLBOEBpgSBAwsEiAhiA2cCCwSCCDUAQgX7AzcFjQg0AosIOQiKCBkEagLLA4IIGgaFCIAIBAL5BNIG7AaXCDQIjgiaCPkFPQPsBp0FYgOvB+gCjAj7A5kI4ALhAY8I2gUeB38DhgimCEwEnAYuA90EPQOuCAQCggi3BKYEVQIZBMIIWgWTCJgIhwi7CMED/gctBZQIsQjLCCEIrQK8CIIDlQcwAicCnAjaBTwEwQLZCCYErAjJCFwE7gSJCNIICgKtBMsFtAiCAtIGDwKdBbwD0AiqCIsEwgjBAfYEMwfPCMsIPQizAqQIqAi6COIIygi4BrMIqQjBAqcIAAn8CNUHrgLuBO0ImQPsCOICegUyBKgFkQfdCMoISgTVCNgELAaoBfMIVQV5B1oEqAU0CMUIxAIUCc4ErQjLCAUJbgTCCKsB9gRWBS0FHAn+By4DsgdWA+kInAbECLIBtANWBW4EMAmSBTMApALsAugI2wi6BwAF7QI4CdoDVwWkAScGLANrAkAJIQZGCeYDSAm+BjQA0AQuCZUCRAk/CaQCTQksA00J0ASaAzYJ2gUnCRADLAbvCAIJIwnLBYII/AdHCUQCVQksBbwDZAM0AicCSwnCBkkJgwYRA28JcgbUBZoFPgnvBO0C0gL0A0wHhQZOCScHoweiAisJ5gUWCcEGfgigCK4CnQgdCcwIfgmDCf8ElgQRCQUJZQMgCW0EywPpCLcIEwS5CKMIignjBx4J3QLjCJUIXATCCLEBwwW4CHADNAB/CTACrwVnB5cJhgn8B6sB1QMNCRsJiAd/BZgJtAOnCU0CnAmvCKUEnwliCZkHswmsCbQIxgiDBOsImgm6AqIDlAktCIUJYQnkCNEB1QPGCSYE6QgEB7gIOglxA14J5QjkCP0IEwnNCDQI4AjwCNMIoQjKCO4GUwKCCJIIPQO4Cd8JrgknB70HgAnICbMJ0wmcBloJMwLRCZcJ7gm+CMECwAgHCRIJBglYBGAHLAm6Aj0HJQI5AHwCTQmMBjgJFAPRCOgJZwMkCBYCAQq0B00CagnmB58IYQnJAwcIswJjBt8IdAbzCdIHjAlgA9MBuAgGCvAI2QlvBfIH2gFSCSwGagmxAfQI2wnxCOMF7QkaCvAJHAr9CZQHdwnvA20JRQkNCvQBCgjDCQgK6AZaBgoJrAc3AGMJdgmzCaUJ6gnYCCsKygYyCdgJmQk7CugEMwo2CrwGKgRMCXoJiARHCcoBbwlTCTYKWAo9CjIEagmWCREKTAqgAbAJogLmCfgJoAlXBzkJGgoqCTcI0gnHBk4K4wdqCVQD9AjkCfYJMwlpCrwDugSECJsCtAknB0MJZglTCjcKcAoFCsoJuwmlCOYIGgXhCS4CfgrMBFYJeglFBVsKsQkkBy0KvQg8CXMCHQqrCfkJhQq1CUYHDAp8CVQKNQp8CYwGQgp/ClgKeQmLCicGugXOCS8JvQkEBJgJkQnNCLwF6wlOBzoKSwqGCj4FUAoACjQKUQq2BWkJhAlsCboKWQp3CVQJrAqdBIgKNwDpCGEHHgJoCpMK8AMlCgMK8gJzCrMCCwmVBakKUQlPAjUKcwlxAlYJwwqsB80KowohBtAEaAr2CCQJ2gj/BO8HnQo1BaQJXQkvCmcFMQrOBHcKzwqzCq4KbwXUCiQKvwK8ChEGZQknBqEK+QrnClgK/QrfCjwHfQpwCcIK6QqKBdUJkAmoCBAJ+QhhCSUJkAeiCswE0ATTB5kDugQYCZMKagr/BCgKbwWbCrkKAApUCX8Kmwq7CpkDagkIAr4KHQunCkYEAgtaCn4InQSUCp4H/AoAC2cDGgljCoMKBwr6CcAJ4AKCCL8B9gSBB14DxwrtCl8GzwnwCskFUAn1CgMLaAkiCywHFQfsAboFIwpTAjAJdwnWCr8KbwrjBUoLuQHaCgULggP1CRUKDAvkCqUCDwgLCooKHwXfBC0L7Ar2BLAKRgq4B2MJeQrJCkQC1QNEC04L2gWbCmEL1AVPCQcL+gnjCckJIQpQB3YLDQszAqoJhQjTCUUKTQIUCw8LYgu/BRsKBwJrCy8C0wlkCUsJAgp6CZoFIwKjCZcJngWICywJrAqMC9cIgws5CigJZAscCmwKywrHCeUKQgrbCoAHlgsUCvwBXwkLC94JhwnICS8LQwrnCBcLXgt+CJkL0gb3CfsJ9AeSCgkCrwZBC5EKmAuHC+sKswHtClgEsgshBUkKmQmsCyAJjwozC2YK/wSSCycLGgUpCyYKnAsiCp4LEAp6CoELlgu9AWYLpwt5C7QKhQp9C1wGyQWoCywBtwvCCLMK1wkGCSAJyAi/CDQLIAp3C4QJ9gS2CTUAQQWzCskDFgQTCy8FnQvFC7MLFgsiCUoKywnwC/wJrwveClcJOQjcCWAJSgrhC40CQwu2C+UIbAQODAgLBAm8CfEJhQt0C8ALogv9C78LlQXjB1kFtAtVBdoLHwwtCXYLlwjFCp0IFgzZCmcKLAviCrQKMgeCC/QLlQQiDN4H1gv2C6gHfAtdCyEFugucAS8MqAXeCwEM8gqcAyQMCQsUDEMGYwcqChIM3QJ4C9wLwQvXC8kK7gkyC6gJ1gSdC8EL0QHjC0IMEwy1CD8JcwtxAtAE6QSeC38L2AsYDL0L9AeOBlAMtwlHCnYHGwy7C54LKAhhDJUF+AsyBGQKuAtVC3sJKwsAB/8JCwocCwsKIQtcCjkKOgw0BhkM7weOBmIKUQz8CVMMgQxnCoYJygtHDDYLPwpaApMLhQhwA9YB0gtVCsAKlQzLCzACXQoyDMIDVwxJDFIMbwUXCNsBPgt/DLwLqgrLB38McgPuCGgMjgaoBrgKNgpVByYLoAryArAMYAsqDIcL/AvbC6AMlgu0DK8BOQBbDEsLbQr8C1wJlQVAC6YMKAzsAVcLlAsaC24KwQr6Cj0JxwsSB54LTwS1DEEJbwUwCOkIuQzRC8ELwwx1AswMZwn+CjALggNmDCwB+QnhC3QMyQyRDAELzAq/DFYLgApxC+0K8wseDGUM0gybDLoHwgztCl8LvQyPC8wEdQkEDKYK2ArADEEMLAzpC+YMRgvVDDELlAzXCtMLsgrHC4UK5AhoBUAD6ws0DP4MhgscDNILLQVqCdkMPgWWC9wMBgcXDfcK9AevC6UL0guwC+gHEQy0CgUNBw22BCcNDw2NDKwLuAvsCr4JmApDDOQI/widCTMNWAwRDdoJxQrpCGAMTgzVC+sM7gzKBvILngs4CdMJ8QyIB3QMegy9DOwMfQkCDaoMzQtQC8AKBgwIDUcJ+wwfBZ4KUgsLDT4MlQgvDTcL1AKLDB8NSAt+C1INfAmoCswMlwxbDbkMRA3bDPUM9ApwC6YHxwztDCoNuwGbCeUMXQsUDRcM2gyOC0YLAA1zDc0M/woYDTkIqgv8AbIINw3JC80IwwjvCiMIcg1ODVcEJA0fC4ANIQbDBI4J0QrECR4NbQ1/DNMM+gxCDWkMHgqODDkKLwuVDHQNAAgnDSkNzQx+DXUMow1XCpINgg2JCUgMuQm6CF4NdQqVBZoL5AxpCzEMkAx6CqUJaA0KDVQNkA2mClMLzgv1DKUMPQtcB2oMnAymBBYKVgOCCBULngu/AboNyQo7CCwNhAr7CN8L1g0/DNgN1Q0fCc0IAQIcDR4N/wqrDWcJqQ11CUoNwgmHDGMMDAxtCsELvAynAb4MnQ0bCHkNXAy/BfMLcgydCMgKiwsgDPcMRA0sDCUMAgxDBg0NwQn/BG8HTA22DL0ISA0IBvgNygprDPcMfwy2Dd4IzA1sAzcFIA2qBOEI/w18CKQLWAsfBt4M3griDSMNuwGEDJsLcwKvDcgLLg0XDj4JrAqKDM0IPAxsA8kFcAxaBIQNLAEDCTcNsA2lAdUI/Q0CDqUCFwGOBm8LiQoGDW8Jtwp7DHkEwQ1qDWACyQWhDMYK8AoBDgAJNg3UCM0IHghbC/0I+AiFDe4LCQy1CkgCHA2NDWcNyg2gDWQNIg0aDuoIQQ0qC98MRQ61AfUM4QLbDE0MLwJtC7oMVAzDCy8M9g1+DMgNLwPADVgNbQPiDZALMQwyDUoKWQyeB3sOVw7XAkUNWgupC5cN/gFnCyIOSQZzDsQLiw2zC9ENLwKdBMUM1QqWDJ8Kkw0xDEsOngzLB8cL6QtADM0HOA4TDNUDkQ7wAukIXQRzDiAC/AttDD8NpgvBCxcB5wx9DeEMWA5iDqgNZQ6CCnoLnQyxDeoLiQ1NCz4Osgz/BFAOhA5gCqYOjA6wAn8MxAv/C0QMRgJlDawNJQ0zDFYN8A2dAVMOLAHSCqAGKwjdCvwM5w3qCnwDJQppDb8NsQ5kDpUMCg5wAywO6QVLCU0NugXkCxsFUQ0HAtEBrQ5jDh0OlA6uDWADtA7HDrIBgwy2DsEI1w7aDNkOUQsmC5gMDgpUC84MJAeiDZQOvw3JDcIObQMNDFwONQ6tC3MC7AuPCf8NLwvwDo0CqAyDDuULXQ5gA84NmA2IDJ8Bfw6bDjoN4gIcDhAL7Qf8C54IbgygBowMCwyGDskOzgokDv4NyQMIDhcPPwvMDBEPAAQpDtYJ2w00DtcNOAtyB+QOkw6/CuQNsgGODpMMZwOWCyQPqQ6gBjwNzwxiAzEONgCBA+ELmg6VCCMCEwogDx8FjAbQDjYA0g5NCs0Owg00Bt4LhQqcDskNxg4ODTcPtw59DscCjQ09BhQOBw/LDAkP8w6NC1EK+w5CDlsPyQVTD9QF6Ay7DYEFNwwXCsMNmg2WC6gOaw44DWAN2gl2DekOZwQ1D7gNEQaoDOMMDwkqDwUMeQ7LB44GPAtFC7wOYAMKC78OgA6hDNUOVA9sA5cOTg4MCdQNNQtlD0APAA9cDy4OdA8pDGYNewR5DxEOcwK+DtEOtA2gBhILcQwWD+oO9QztDcgBVw10CeMFyQXQCvwBtwtfDYEIGApfCoAOeAycDeAMMw+rAUEPnQQvDswLJw4VBpwP5wm4DgAHyw+FDJQPtQ9sDDUMCQqqD14D5wvoDR8D2g4DD44PXAZfDsoMjQQnDV4POQ70Bn8OmQoAB0gP/wRVDHwK9wzPDwEKiQ2MDKEPHQ3+B8EL+QzuDU0Ndg/SDakPbA8dDxMMARA4DwEMKA/nDksPgQMyByEOMAwDDlwNNQu0AwsQrwX1DIgKzQofDnQODQ5zDnAOsw/mCMkP4gL1DYAPwA/8CeoP1g1fD2EKCQ1aDSsPOg7xCiQQHg/RCxgQoAvNB7EO8A7EDrYNEhA7C5YLOgsBC54OBBBdDY0MtQ7YBJsN7g24D3ECEghdD9YNNAkyD2kPyA8/DvAO0AzqDPoOow8SD3MOsQ+QCqUCORC9CD0OSQ4VDH8OtANZENgMwws1ELoPsQsGDwoKBQ6oDwwHQRC3Dz8OBA+TA54LOw6pD+wNRhDcDeICXhBiEAYLOxAhEFYQWg7YDpEDmQ91D64ObBBGBVAQgQ1KECoPFhBhEBUMpQ/8CxgP/gHTD4gOww5zDpUNvQ9oDBUO5QmUELoH8g0BDWsMWg9FDiMCrAx1Dn8Qkw/sCpkQfw1sELwPFQ8ADGMP0A8DELcO2Q05DXMQ5Q+LEPgMpg/IDNALggOOEAwQiQ4wENMB5g8sELAQdgsFEDgMNAJsDXwNWw9lC+oMxRCsDdsOjQ8hD3YGfhCnD0UObxCVBcUNog6rCrsQzggGD0YN/w8GD+8PZwMfEIcPXA/jD+kM/gv7A+YLmQfJBWkQnApyCZUO/AnmDQ0QqAytDHkMURA0D9cQ6RBDELUQxhBnCowLuBA9DLsPvRA6D/gKPA+kDaEOcA1cD1wQ4gLUDnAPvQx8DFoEIwunEFcPYQklEMEO+QsiEIYP0Q8WCwYPRQ/5DSMMnBApEEoDAhGvDsILHRHhD8cQoQvpDYkMIBA2DtoJERDCCSMQAAmVDzIOrw/XA6AQ0BAeEYUPnw1gCm8NogzwBfYEdRCGDOICBBG7DuwQLgZ8DwMNuwmgDrQQuQGMBooLCw4zEbEOeA5EDqsNMw+tDxARYAriDroQlwo/EL4BngsKDowLhw65EIIM1gwcDWoOTRFhDoMQyg4kEYYKGRA0EewBdQmlD3EQRw5iDX0MSgfXEO8JZxFQEXYOohDoClkROQ+YDt4LKA8+DX8PSgrJA84QChHuDR4LRA42EZIQrg9aEdQQBRFmD4oQBg+2D+8NpA08CJYLgRFlEVgEHREjDSwMKA9WD9IOMhAgDboL/AsZC28MJxCxDGgR1g7uD7MQIxGqEVwPHRAjDLgMhhBgDpMJJxFkESoOOhCMDrAR/xB+EbACTQ9nESkQLhGBDzcKHgwHEXsLnBBpDccPTBHZC8ELyxF8EMYM7wclC0IOqQ11C/wLZBGMC8QPQhDzEFoMBg72DgsP3gsIDFEO/w1zD2wPKA/OEd4QvQ0oEGkRWATdD8YNJAc9Ed4RMA0cEE8KdgwMB3IRDRFrChkKxxHAEWkRzwsqDWwPyQMbCr8RfRCGEcgBDBGiAhkN9QxBEc8QmhCwDskQNhH7CRYR6QtIELIQwhGdD+UP2wzrDjYKIAtHC3MR9AdOEOgRnBDHD38RwhB+D2URVBFaAgkJsg98DugPDQVKD4UOmA9NDQIKig5JEXUMbBBBDsUPQxHpDxYR5w+/EDsJcRDEDrgHMAmMEAUCrRGaD98FMBB4ENAP4Qt/DDoRDBK5AQ8EiAyMEF8REhCkEDYS6xFnD6UEaQ+LEVURJw4KDh8KVg49EsMRJg2yEMkFHQzaBUQSkxH3EKUQ/RHtCv0Otw2XD2wRbBKuEe4QXA8gEswOGg9eCiUPShL4CRANPhLPDjUSGQYrEH8SCAJUDF0Rng+yEQIP6hHNEBsN5RHCENcRwAvJEMcPtxEpEWUKFxHWCLsMZw7tD84EaRJcEXIQhw2XEpwM3Q7eCjMPkBIYERQRYAMND5YNWhF0AnwS8hEwEV0SJRC1EdAR6gjJBTgS2hH5EBoRrQotEN0MRhE1C+YR2A94EicR3gLyD8oLSA5PC7YSfQ+HElUNUhKMD/8M9RGgBjUSugVyElcSjBKdEcIQjBAvD3AEwRJEA0ERWhCeB8US2gnXDIgHTw/RCH4SPBDRCLMNVBEDEqsP4BIvEloRlhGkERMQLQvEDlkOVhKMCq4RJRHMDpISShDLEqAGCxIyEi0OiBIGD0wRYBKrC4AO4wJQDT4QoRKAEiISaQ+YEYwL9xEIEnAJ/A/ODtIQMwzCDOcRoAZqEtsR4BGeD80R7QqGCKMS+RLzEcYPShDdEBgT2RAaEyAONRJZDfwOyg4WEBsL8xAmEl4RnhLGEegG/BBoEgoSHA0aDUwDLRPODukQFRMmE2MNpA9AEUQPgxJjElkHyhI7E9sMPRNtEEYSoRBlDv4SBANHEykK1BKaBZMR5Q7wDyoTZw66Dt8SBwKmElkL1w/hEgAHQhKyCTwS2g2gDzQNuwkoDwgCfwwsEaMLkRGoEmATwwtUEiwKcw6TDKsO/QkjExUN6Aa8EWQPLRJ6EkYPTQoZE8MLORN0EXwRrBDfCbASMw6tEKoQlhLhC+gQfQ/1DJMMrhJ4CxMORBNFEWEPLRLyCYALfArbDF8ShQ5mDmwP/g2KE/gJjBMyEeYIfBKSCXYTSBL6EegG4wwQDtsP+RHCD+sPLhDGDqYT8hEtAXQM4AqmDcIQlhFjB3ATWBGeEy4DBgX0DDcTvBCOEnoPZAxbE3MTgBLBE5MTfwzGE6QTLRJTE9QJrhK/D/cOPxH2EZYTDgtvE8ITlRAODyUQ9Qi4E48T8hHyDrISCxBxDogPcw7eEqMONBOKB0UNlBNUEMwPphOSCToRXxNqD+QQ7QuEDwgC0BMvEK8TwgNXEZAR6w0aD/cPfQltDWYLAxR3DiARbBAUD+gOJw5mDt8T8hOaDY4ROxEVEdcQ+BOjDjsM8RMJFL8FFhT5E9YT3xAnDpgRvwmpEwgUGg8KEhoQCg+vErMR5A+NEuUTvxIlEg4Q3QkME6YJFBTtEz4RrxG2EBwUvhI1FCUQNAA6FFIQ9RBcEuYQ7BPXEG4Prgz/CjcSkQ+PEfoQxwbcCOIRoQ9yC90RuwFNFBcUngf0CFcU+RPcEaQNBweeC54Q4gIWFCUKIxJaFNcPmg1lELgSOhL6E9QSugUxEjMT8xNnFDkUmRKYEx4SxA63EmoQehG6EtMJoQFJEEQTkBBEFH8TqxBsE8IQeBSUEakRfRO8EFATRBDnEAAHCxR7FO0GghTfEfoSPxL8ESQTKxOsAVUTxwbjEgMMDRR/CoYUiBF5EdASFQnWEZQT8RA5EjMPkBQaBZwUMAqtDhwSehFhE9gEHBNDEx4SMQ1zDrQCiAwVBvQIMhOEEH8UugfyC7ET5QhtExcT2ASFERYTexAaBV8RcgybCMsTiQufEhcSOBN+FLUUbRBNEiAUow5OE5wHixT4EGsUbhO3FA8R4RFUDqkQahMCEFAPjQxWD4YNuQmoE4MRbwVjFAUSUgokE5YRuxEGBwkRVRTAAbwUsg4QErEU9wQEDmoU4w1DEewO+BSRDZUMpQqiFHgRURMGFdAQCBXbFAMVoxR0DtoU7QyvFGUO0A1TDY0KHRTJEAoVfw0YFTYSFhDtFM4OdALEDgATgBCkEmkPtwQAFRoViARsEMYU4AyBED8TpApvCfoPBhJnBH8K6RBWCt4O4A+JERUVtxPlEPcIDw+eFM8SJxUiFUQOMw/sA9IRCxEbEvgUFhD0FOENNQoLEGoJxhNFFYcRzg5dFOsQNhG3BIoSLxM2FYsSdg6TEaEUUROpFKwOaxCRDakUMABOCFAIdAFSCFcBYwB5AXQAJQGFAYcBWQhkAU0BXQhpAWsBbQFiCFEBZxVlCBkBeQF7AX0BfwGBAYMBbhVYCGIBcAhsAI0BjwGRAQwBkwGVAUoBeQh1AJkBPgHCA6MCpxTuDf0PLwKsA8oFzAozEsUFvAOqBgAKEg96CVAVyAEUCOwBjQJMA9QOghISFAAGQwmpFbEDUQqkFbkBphU6Bi0FkAh3CaAVzARBD5gVAQidFXIOVQYsBngLswm6BbsVmQPAFd0N2RHIAfgSHwWyFUkOpgSwCCoDAwLZBx8JEAUZA9AVyQvTFc8Vigx8FOkQSgmvFUMOHwURBKwKHQbjDCcMwRVABkMJrhUACooGTQLpCCIDRgRXFDgAXRVxAjkDIQaKCDAK6AeTEckV1AWyFT8J+RVxAvUVnRN6CsIVhhT9FewBTQ9LCbcVHwV1FFoElQl+CNAEuBR9EOgVCwq7AiEGIQQ3FLQV7AnhFZsUvxXwBegEThJVDw0WGhYXFhEGHRasFRgWIRa8FSMWwAHzC+gUNg43AzoD0BUTCdcVqQLVFeoLLhYxA9AVIwLhAfMUGxYpFmgDLAYsFgEKKgfeD5oExQViA9kTQRa/BQgUSwncFekVJwb7FYoNxBXHDbgIHQZfEYEDLxbZFYEF7wlLFicGdAxPFl8RQQrlFZwDXxZcB/EVpRW0BSgWSQZlFrkBohU5ALAVNxQ/CW4WbBYTFk0JchZcFt4V+hVGBG8SYwkKDsIVbxJWFjcWRAM1FroJ1BWKDCsCUQXQFecS1AgyFnoCMBbqC/QJXgzMCmoWFhZ+CKwDCwJLCXEWcAmYFnAWdhYmEqwDnAciFokOrQSxAdkMiQ09Dn0I3wWiFhoMUxaEB6AWgBSXCRELoxaXC6sWtQ0lFqgWigWxFpgRsQe1FqEWtxaqFq8WeA+RFjcKTwuqFUgCuBa2FXYWmxYEFXgWphFHCQQWaxZ3Fv4VPAYHFsgWdwlzFqEVmRZ2FoYU1ha4FXMElxbZFtUWnBbgFnwJuRXHBjkMmwV0EHcJaA+ZAzAJBAflFtUPbhMUFtgWyhbyFdgWqQ11FuMW9RbxFtoW1BZHCZoWLAYwCR4H7hblB+cWyRRlFWQIbwhyABABZwBWAW4IcBUlAVwIZwFeCHUVYQhpAHABeBV1AYgBZwh9FWoIgBVtCDcBbxWEFYsBhhVyCIgVYQFmAI8BOgFPCAcXVwFuAGUAAgFbARsXfxVsCIIVbwgiF4cVdAiKFXYIeAh6CJEVnQGjAb0EPALBAcID8gEGF3kViAFwABAXXwBzAHAAYQB3AJAVDRdiAW8AYgBqAGUAYwBFAWsBdQBwAGgBUhdUF1YXYwgZARsBHQEfAToAoAI5AC4AngFoF2kXnwFGF1cBaAFfCHYVFRdfFxgXVwFiAIIBdgFQFyIARAEJF24AZwA3F4kVYgECAQQBBgEiACoXbBdiAWkIbwARFx8XgxUiAIgXihdzCH8XIgAjAGYAZgAwADAAYgBlADQAZgCEF2YVcxdiAUwBmBcjF4sXiAF6F2kAfBd+F4gBRwADAQUBhAGFF54XIgCJFwUBiheGAYwXZgBsAG8AWgGoFwwBLQAxADsXbwB0AFoBMxc6AJwBWAEQARIBFAE5AAYFLgDXAcwXzRfsAyIAeAAUAbYBqAHLF84XzBcjAiIAeQAMAX8IrwIxAGcXahdpF0kBrhdoFWIBSxdNF08XoxdXAVwXVRdXF28AWRdbF1MX7BdfFzEBYhcMAcQXrxclAQsXbgBkAAMBeQAgAHoAgwEMF2kBfQF5AGcAgRVyAQAB0RfDFxgB2hfDF4UXChi8Ai4A9AsTGBQY5AzZFyAB1AEuAHYCGxgcGDgAOQAPGDQBQAo3ABIYFRgUGDYBDRjWAzgAGhgdGBwYHxhmFRAYpAHeFzcAMxg0GDUYFwEXGGQXoQFmFyUYJhggGDoA3Bc1AN8X4BeeAdEBOBhKAtcB1RfWF9cBMwA+GE4JRQNCGEMYRRgNGMkXKhhXD1YYVxhXDzcATRjyASMYMwBeGF8YYBjYFw0YDgpJGEoY1wFNGL4MNgAuAFgYWBixATgYZBhmGM0XaBhBFC4AYRh2GAwY2xf4BC4ANRh8GDQYPhg1AG0WNAArGCwYdgK/ATgYBgXeF3YYdhh/GDkAxwF1GIoYXxh4GGQXPAh7GH0YNhg+GFcPhgKVGJYYQAqSGBUBOACYGGcMhxgVAYMYhBh2Aj4YpAHzASQYPBgWGA0YiBiPGJAYXhioGEcEUhgMAekEahhsGG0YqBgeBmoYcRh0Am8YugE+GIcJIxisGPQLhhhjGMEYLxgMAQEKfwhlGNYXvQE4GDgAAAKwGLEYwhg5APEBkhgBCoIYTgncGN0YThg+GLUBMACkGN4Y3hieGK8CMgDgGDAA2AHeF8UYJxgUAR4CMAAuAOQY3hjpGE0DxBcoGPwDiRixGEwYyhhkFzAApgnEGKwY7hhkF5kY6RhBFAMZpglOAmsYuRhZGOkYrQLUGHcYOBhYBfEYvhj8GAkY0hccApsYfRg3GMgY0hgQGYsY/Ri1AS4CMhicGBwZDAGwAzMAGhkbGQYZpgGSGKIBbRYLGQwZWhghGSwCQRicGJ0Y0Ri2ATQA4BhFA04JpRgdGMcYDAGkAXQYNxlACjwZXhjxGAwZTA+SGLwXLAHyGPMY3Bg1ADwZDggfGWAYTBkeAoIYphgbGC4YFxlkF7wY8RhQGX0JOBgtAFcPKhhhGU4JUhkhGVgZIxhDGGgXTBnwATIAMRkyGeAY8BjbGGEZTBlNA6YJzhjOFxYZ0BfvGAACghhxGGIYuxdNA3YCPxlAGXQZgBl7GdcXeBngBGoYZxk7GWoZXhhBGG0ZCAJjGT8CSRlKGTMZXRmeBLYBchltGHgZ1xi4GJoZdBkwAAECTxlQGaEZNwBxGZAZpRkKGZoZTBk5CR4ZRRmgGCEZfAQxAocZWxmxGU0DcRlKGUwP6Rj0C3EZWhlBGToALQAGBQMCixnXF8IYTgJgGWEZtRjFGccZFBmCGcIY9QEjGEUZ0BgNGMYZ1wFmGWcZPhjGCmMDqBnzGNgZuxfWAekEnxm6GP0YxgreDWMZQBhQGEMY3hmJCrkZuhmXGaIZ5xlXGJsZfhk6AEoRwQGXGS8Z7hngF6EY8QHhGeQY4xnFGZgZ9hlWGPgZChhZGNIZZhiDGQYaLgIqGFoZHhiMGMMBAxreGAUaLQBNA7kBCBoNGf0YowGOGLQZeBkbGv8ZahdNGKsZJBklGSMaHgIdGr8Z/RimCUgYFRl4GaYJzRlhGT4YXhghAZcZLQItGgoa2xcGBXEZMhr0GXAFKhl8GLUZXRkWAaMBPBqqGawZ3Rn9GBYBzRhBGtkZBgXXGDwaPhjaATYZNxkmGdAZ9AH6GNUYThqRCIEZghmxGaIBghi+GT0aKgG6ASkZxRitGOQZZBpVGi8aLwKrGKwYbhjZGe8B6hhvGl0ZowLPGbwXuQFmF/sYfRkQGMgZvhjPF9kZMQADAqMZcxlOGoIaURq7F2UXJRrhF/0YGhq4AXIaPBh0Go0augFGGvkZGhqaGEUZMxhvGaYB8hlbGT4YvBdhGoIZDxpkGfQByRnKGY0VbxcUFxYXCBiGFyIAVAiUF2kAYwB1AGwAhgE0F1cBthe4F1YIIgCQF2EBLhorF2IBbQBSFz0BeBelF6cXJBc4F4AXqxeDF74XwBcjAQcYxBcnAccXCxj5GUcEyRc7GAIZkhiWAnYZNhpmFfQXMwHXGvgXLhcGAfwXcgD+FwAYLRduFwQYBhiEAbAaChj3GPYX4BhjA2YXIhpjGcMB2AFVGWAY4BjpBEAaYhr5GvYaRBqXGCEZyBUEGzQYWhq8F6kBKRmVGZ4BqBjTGH8apxoeAjMY/BpfGKgYyAGPGmgXpxoRGGsaNgCYGJ4BlBolGJYaBhqGGh8b/Ri0AewYaxokGxoaywEaGw8b/RioAfwZdRouGw4bvRcxG/QLIhsVGCwb7wE5CS8bNxucGTkadRrrFTobExgnG10ZOQDbGu0YPBu+DF0akBijGmUZFxreGBwbTRsWG7IYkRr4BGoYExrlAewZSgINGw4boxrYAb4Mqhq/GFIarwJdGPsYYRtFA8IZExqxGYYCKRl/GmEbNBpSG90YbhuUGHEbkRqFGRIabRtdG+AERRv0C0cbmhq6AbUBShpdG/IBPxujGoMbmRkyGbEZyAFmFzYboxqjAsoXjBrQGW8bVhuAGrsXExlkG6caAQL3GrQZiRviGIsbuRgsG68YEhujGsgBGwVjGfQLZRpmGqcbVAJ7G1oZTBnlC6EahRiuG7oBdBvcGEwZLwKPGw4b6BiRGiYbahprGrobGRs2G74bXRl8GqoYNhuyG40YlxuYG8UZogEpGZ0aLBspG38bgBtQG/ABuBtOCZwbORtrGiwBoxpYGbQbXBtSGpMaxRt4CK0abgFxFxcX5BeyGmkAtBq2Grga2hd4F7wauRfLGn8XwhqxGsUaYgDHGukX5ReTAaYXfRf1G4gBgResF4QXjRVrAdEawhfUGsYXKQHEFwoY8BhjG7AZwBgeGXgbAAHiGmMX9xfrG/kX5xr9F/8XARjtGmwABRgHGHMB8hqSGDAA6RhXD4UbDRjfGdkb2wEnHIgaoxvZGE0D2RtpGV0Z8BWiGzAcOBimAWwZDhtnGjYcLRpLGUYY+RiXGyAbKhvFGCQbwwFEGVkafxipGr4ZQBwNGPkBmRoKGPMBQRjdGyQbBxqtGzgbVBwrG5IYowKuAi8bxhv5GaMBXxuVGQ8aMQL8A5sbfxhxGjYbZRxjA70Y0xn9GD4cTRwkG5EIBwcYG7wbZBySGPwDQxoUHNgatgEvHGwYJBv8A6kBaBy2GTkAlBmVGc8ZTA/xAeAYUAIpHCcZxgoqGBUZjBynGRMaxBmrGfAVCBszGFEcFAGAGGwbphiWHHAFgRsOHEIcfxouGTECwRsCGeAYDBtfHKYcKBySHAYblBzDGdkY1AGbHP4YuBlnGQUargJ3Gr4YNBx9HLccYRkFGqkBLBpYHHkaTBxmGpIYqQH/GNkbYBwKGPQBNRpQGSQb8BUeBrQbXBn5GRYB3xrQHMgchAKRHG8cRxqcGlkaLhkHB7AbhBjVHDAYLBwQETgYVAJPGL0bPhjzGvoZqAFOG4oYchspGjcZLhnlGTMcYRuLGnEYeRyjAVkZwxmJG8wb0hv8HE4ZuBwAHdYZnRpcHNMXXxyjGtAbmRw0GN0aSRvMHLsXrxvdGuoY/hyfHKMa1xjxHIoYkhiOG48ZwBwZHYYc1RsFGnkZbhwOGgwd0xgCHTgYTQOGGg4dtRwtAA0dKh0oGIcaeBqCGwEdCB1BHGMDBh0OHZ4aRhjDASYdShjOG5sa9BycGOYYpQFDHHkbkxrdGw8aMhtWGtwZYRnoHK4YixysGhMX6BuvGnMBrxezGkEB7xu5GvIbtxf0G78aJRePHOMXehX5G/sbtBekF/4byhphHcwaAQHOGq0XBhy/F8EX0xoYAdUaDBwYAaMcgBhoG5AYkhgeBs0BhRcWHPYXGAHlGvoX6BrqGh4cXgjuGiIcXRnuHCYckRp6Gp4Y9gEsHKcb5BvKG0EcSRwlGZQdOxwOG54Y8QHjHCwY5RyZG70ZchydHRUbfBwKGC0A5hlNHE4cNAEiGdQcTRg5G8UbfR08CHAbaRsvGnoYEht9HQEC8RiVHMIYTA8vG9QBfR1pGtUbohzLGJgcuR0rHUQbHhtHGXsdfB0rHQMCABsnHTQZ6xycHSsdVRunHRQBQRS1HbEYfR0BCp4bmR0hGdodlxsdHZ8Yrx0hGTQdxxyjGH4byx3nHdMclRwdHTIb5h1HGpYXQRilHIcY6QQBGakcIRmNGFobshyHGKkBTx1QGVYaaxvUHB0dhhzRG0ocThoEHu8dEhmjFTUdEBh6Ai4d3RoJGS4dVhoRHvgaDRgAGXccbRk3GkEUVRgRHBke+ATbHU8bOBuaGPYdGR5pGA8ethgWHQUeEhltFn4ath1dGZgaRB1FGlwc+hoqHjoAAAInBDgYowJUAvIdYRyhAQgZLx5IHXkatAEHHSoaLh7uHf8cHxptHJsb3RoDAvkdPBjFHToAzgFYGkgeIR7gGb0dKBtOGI4cOgDaG80d8hzpGYcCTh4SGZgaPx4KGI4ZWhqGAiId7B01HJYCMxzdGucYZx5CGV0crByHGAEK9R0xHvkZbRarGR0dAB6THf0YhhyWF8scHR3wAagcUh7CGLUB0R1KGCQdOBqAHjUcwwGHHiUYAxk9GX8c6BmQHnQYJx40AWAahBxdGQwaZB5PHAcHox2JGp4egBgbHkMYfR3SGB8epB75GYYCuBkMHk8c8QHYHPMYTRjUATQeNhh9HacB3heQGzEbHhj9HZ8cuR4WGloeXRmoASsBEh4rHQYFlh73GTcaNQEtHk8cfwiRGcQecAVKG1Iesx3KHMMe+Rl/CHsc+xh9HYQCHx3gGsQe4hiHHJUZnR0uAnMeKgEXHuAcRhgvAqwbrB4QHj4bHhuRHQEK5x68GIse1hcPGq8CChmvHPMdLgKeGI0cxBzYGjECtx4JG54Y7wFWHpYYtRyvAusZDRhxHAAfDhxwBaUaQR0uGR8CZBtFAzwZRAk8Htgb2B5oHhQfgxplHLcbkBm9HGgeqRtPHFQachx/GGsXTxzeGy8aNx3qHg0YThlbG0kb5htVHXcVsBpZHe0bWx23Gl0d/BsiAPMbvhrAGmMdnRfrG2Yduhr9G3sXABxsHZEXAxzPGnEdCBx0HcUXKAGCHWEcPAgRH/ceyByuAmAeIBkVHGEX4xoYHHoVTAFkAHkAYgB1AGcAHRwtFyAAGhz7F/0XHxwhHPAaIxxSHw0Yjh1BGxgfKBjmGYMaEh1eGaMCxB26G6YB6RjUF5QbLQC+HtYYWhzFGAob2AFeGEQe2Bp/CAEe8xgjGtYB5x48CEgY6R11GoYc3BzSHZwZNBg8HUsajx7YGvMPuxkTHHoeEBjeHiwcuxl+G7weRxomG7EZwwOIGy8aKwFMGncZ7BkuArMe5BgdHvocEh9jGYkKmx0cHjEb/xiSHhUYAxmpHcYKnhzkHDca4h4/G0wZ/AF5Hl4a8x1nHIAf9QEZGK0Z+x1eHJYd2RlpGqceABohGU4CUR6THrEZSRvfHgIe4R3GCscf7BlACmMcux+cGaYZlh+3H1IaQwKcHwoYOhzAHQobUAKMH7QfCh7bH9wf7Bl+HQMe9x+/H40ZzwHEHZEbvx7+HXUajhnuH6IdPxysHQYaJBqnH5oauAENGg4aIxrKHNEfxxtwBasejBtjGdoYLBx4Hy0AMB8xH3wfHxtUHWAIVh1yF+sbWh21Gjof8Rs8Hz4fuhdUHvgZrxdEH8gaah1IH0AfnxdhAGEfYx9lH4YcJQAgAEsfbgAgADUAJQAFHJcBch3SGvAaChxRH9caDx8wGZQb5R/fH7Qe4RpcHxccgx0ZHDYgYh9kH2YfZQAgAG0AeQASAbUabB/vGngVJBw4GHIf+RlACvYeVh9GGF4YAiCgHVYaNRvVHSgYOhgAIE4aqAEwHtwdPh0xAjca5R2wHu8YoQEVHjEbXhvjHwwfmBydGiIf2xf4HXsf0Ri/Hd0btRwGBd8cVx4nGSEb3RtTHgECuB3cHm8YkSBtHtkegwuBILsXcBj7HtYc1x2WINkZ4AS7HgwgMBirGc4elxqvGaQZThq0HeMd+RqmCRcdxB+tIEcEnCDFGUcE5h4TIIofkh8gHo0a/B2QH/8evSC3IH0aiR8KGLsbPxurAfkaqxm8HUseXRlmIBUfExvaH3IgRR6fHYQYVxnPHzgekB35GkkbyCBOHSwcXgz5GgIaMR8zHyIgNR9YHSUgOB8nIPAbRR89H18dPx9iHToA0hhkHYgBMCA8H8kaMyDwICIAYB9WIDkgQCA8IG8dPyBBINAacx1GIHUdCxxSHwoYuR+2IBUgyh4JGoAdUSBSH1kdYQD7F1kg6xoCGHAAih1uH4wdJRyMHMkXxx7VH5UgoR8UAR8CzxyNH+wZVBp3H6ocph2iIL4g1x/YH8Qe8R1bG1cZBB26IFIclhuaHvoZpSAOG1Me8gGkAaQfPh0IHgkeMh7pBOYfqB7WHRYgoxtoGMkbbyDbFyghnyAJIckX4x5tGVwczBumGx8aNx6THycZyRh5GlghwiC1ASIdpiAMAVwaSCGgGT4drhzdHGEcTgm6H0YhTxylATcclx5hHPAB1SAtGLMdVAJ/GOAEWR9hGLke9QHFIGIhhhwuIWkXuR6nGB8afyG2IMgV1B6THnchphm2IIob2SByIakgXh7XAdEeaSGPH3sgkSG/HOAelCHDH6AdEx5NAn4gMh5QHiMdEx6kAU0YmRjhG08e+h5oIVIc+ARHHggfTx4BAjcaYwPMILEbLh4BClYariA4IcwZQB33HlYabiFdHjECLgLpGD4hMiE8HoUZ9RgzG2IhphntHkkh6RkpHTgdLx+WF7shfBmYGKAaWxskG9sBsCEfGiAfZxkPGtghPCHjGNwhEx5LIKohIRgPIEoYnSEHHysZThqOIPUcdx7wAd4gkBnGE3ceGRuZIA4cVR/WF+IYHR38AWEbdxs4IQYFKx8UIEodWxwrHaAC0yDYGpQYMh2tHbUgYSGRIQggRxzHAVIh7xlOGiYfWSEEGfsa2B0qARQiwiBRGyEffxjbIWEZbBxzIS0YfxgaHxMaVhy2H0Ed5CBwF1cdwxrsG+4bKCDsICsgARxBHy0i9SBoHVcB9yAsILIaEyEFAX8BgwEgAAMCOyBoAIkXLRd0ACAAHgY7ID0gIAC1AQIhTR8EIVIfdh0IITQB0x55IZEYbxgWAdIhzRd9GYEd5BrrG5gXFSEBGGgf5hpqH+kaXyCLHfkZjR23IdceAyCcHOAZNSHlIdAgHR18BK0h6iFHGmwaKgEzGCMeYR4bIc8dzRitGyEgKyIkIHoVJiBcHSkgNyJiATIiSR/BGi4gQx/GGuwgOSIzIoQVZQBZIDog/yCCFz4gQCBCIHkIRCAJHAYhSCANHLYYISF2IPgY1wH8H9YbUCAyAVIgsRpfIlggWiBcIGgAXiCJHSAcYCDxGnAf9Bq/G6sc1B/ZHR4hGCILG14c8R4rHbYBZyBaIt8bmRizHQsiiBzFIpgdriHIHo8fBR2/G/IBTiDkGLodogELHdAiMRoBG6EedxoOH50gFB+kHckd2yKsIMcbniDZIjQBqh44Htcc3yCpHkka3CI/GE4h5SIZIoMc7SKGAq8fsB+uGOEY+BzhHasgFyD3IoMezyKcGdggFSIWAaggGx8UAegdwiDXHLMf3RiFIGQXxCA4IckKyyGAHOAYSRs6IVMh6x6eGU8hyBfTH0whORixHBgdCh60Aa8gcCDQHyAd9h+EH9Ue6RzvIU4aox+QGS4Zxh5WIZwZbRb0H+UYxSFZIsQiLxqxHboiXh5xGlUcTRjgIWcZfR0oIrwhIRniIJYhDiDQIKocsiDkHJ4Y9yF8GUwYgCKuGoIiUwjpIIUiMSLuICwg8iBCH2UdjiIxIEcfOiKsIpUiSiKZIgMhRSBQIgchSSA0Acod7RieGMIfZCBcIl4f9CCvIrUaWCBmIhohaCIcIY8dKR9tIgoj3RiJG+8BPxxHHAMbnxuRGvQiLBxWHCwjTRroH8MhfBttIT4ebyKTGC4FyB7/GBMjuSBAIysdFgHfHQgfEyNnHBUihwIlIfUfRxoLHowjIyEYI+QhKgELIBwjgwPpIUUaFh4tHQ8jKwFFHIgeXxqLITojMR2dGlYa/hm1Ix0fGSN4Iv8f3RtcHH8jHh/FH68CtiBiHKwfRxr1GZ0jTSNaIs4b1gGmHxwjFgHnHJMgzR7EIdUfPCNrGs0jehqQIRwgFQE3GlwaIiMTHc4hRRk3GsYKVSJWIqMgKiPEHm4aFSK8FwYfnyGtHqYZgCFuGfka7iODIzIe8SO2IAsbpSNxGE0Yfwh1IM4dhRoOIyIhkSGLI8AelxmoI5UZsB2eITghkhrVIt0bsB16HzojGhq5I2AbLxrCH9sjTxrmIdYXTRikAWsh4BexGXogExp/GLgB0iI0I1Ia1AE2I8wXfxjQHtsjqAGpGoMadyGuIywh0Bl2AqMezCF5GtIYiCH9H7gfaAMGIFQefwifIyYkmRs9JI8j9AHbAfkjgBg+GQUjXh7+I+AjxRmAGBYajyP/GsghTySnAXgf8wGVHeQeqhtWJB0eAiLcGqobQR7MHpYXshvHGSMdeSDrHcIbqhtKAjMjfSMTIsQjvyNqJJUjmSEQGKEgoyKZG/MP4RtWGnIhyB8eGPUiTyBHGmojxRh4GWMDyh8kHt4ckwyXGeke4B1HGnQgTiTGGaQY1iETI5Mbvhh4GQIa8SGqHL8iaSR1Gmwk3BgGBXQZZyH7HJcZnCTaG5MhDhznGJ4Y3CBrHOAYNCEgIqgk8iOeBCoiUSPqG4MiVCMwIl4dvRpYI70cLyBcI/YgMiA6Ij0gmiIHHE8i1xpRImgjZBfSGHwhRRlBI1cPwyJLGA8hqSIRIesbOh9yAGEAdCOyIm0fYSC2Ig4YIRmnAScj+B+FGssj1xfOG/oaGx16ITwe3SNEI8oXFSL8A6sjfRhJIyIihRjIHKkY1RuhHWQXkQhkIfcZ8iSGGcMZeB+vAvMeliGmAZYX3xueHachPB5qIdYixxuGGpkeMySnHEEhmiPQIlkeoyM5HiYb5x6kGuIfOiOmCbwiAyTtI30gOCEaHgglmhq7BbEjPBiFHtcj+h3HG/AfDhvBHYcYmyDsHJEahhybISwYTB2OGyAlqB3lAiMdMyVFIx8jxxsZJc0b3R1vJO0Y+RwaJM4XqR4EI80gDSBCI0QlBCJrIjsl2BrhJNcB/QFLJUojiBnQIhUf+SFBHEAKnR4NIP0hMySGGp4Z7SINJDgleRzGHtIb8CFnGVEdkCAjJSMbsSQjILMkUyMvIusgtyRgHTQg1xjzIFcBNiIgF3kXviSRIm4dlyLBJJwiTx/FJKAiPxj/GBcidiQqAeIYhBtoIW8jUyB6FdMk1SQWIXUj2STXGnEfNxo0Jb0bcR6vHiIkMRs5CQ4lGxlxHmweaxrMHtwgcCQZHqgBQSRRGU4d4hgfIbYYRCE1JSEYjhgeJaYhWxttIP8Y3RqzJZsloSMhIx4lzwHqH0oYvSF8BE4kQRQLJcsfnR8+HtUjYiFrJPkimB/EJQAkySUbI20Z/SQQInYeLx+bAjge2QFFIWoXzxn0AZUhuSXYGh4G8CTJAhkf+yTeJWgeLyO5IUwPESNwIQsa1SEmIlQhUSQlI8cbHSBaGSQffiF+IuIimhrPI2QciRyGGn4kGBrfG+kfoB6QIKgg/yIhJV8hTiRjA6od+CWoHR4GtSDAIsgY0SMFJgwmngGvJMkgYxj4BPgkDiF5G7oetiBMD5Ak5SWEGUwPniU1Hlcigx60JZEalCD/IxwdlyDyIgsm5BmsIawlOR7pJTgexhkHHjEm0Q6oJWgZpxvXGM0kzBdcHLoBfCM6JoQjRwTeJDsk1SXDHC4mxRnpBAUkSyPnJJMk/COEI/UBaiUmGDYeTyZmGIkbPg4SGUwPryQbIBkleiIRGSEe2CJQJjwlIh5OJIYatiFRJnofDyYGI2gmPCVSJoggKBi2An4jfx/wIgofUx6pHUQmcCbSF5gh4B/HG7cPhSQrJlMYvx0qJS8dBhIVI2whthgtHzcZpxtXDyomYCa2GCYlcxqMJrcbRiPsIZwY3xtxIGsm6B53JjwICyQzJAomfyISF+Ug6Rs2H+ggcCU7H4ci7SC4JJEi4Rh2JcQavCSpJpAiiiJXAcAkZCOdIlAf1hqDJdcc/x/QI/QLsxmLJGAX0CRdInoVEyFGIhoBfgGSJbUilCW3IjwlNiT8IiMhUyUjIuEdPSY+Juse0SaiGkQj1yYcGMIdAx81GOAYyBnfIhkelCZHJQkhPyNQGd0hoiKGJK0eiB8JIlQeHhg8HWcaVw/lJOYkKhwsGsIjKBvtJRIlDR9JJlkb4RtaGmcbUyZGG8weHiRqF5EdaCQnJdYcliThIWkgHiOzIH4mnAZpIEMa9iOaGn8I7SS4HlglhyYvIQEfJSTdGPge4AQjJgUbmB90IpYY3R7pJlofmhoAAl8mjyYqAYMDWiWoHdQbVRy6HXoZYCXzJDEnyB4HBxUlHwLaJh4Ywh0cGjQngCbOJWgafR+PHWsgoB3EGdYBqhj1ITQBGiLPJj8YRQNFJj0YvB8WJzUYciImJuQmYiHGHAgjySNJJoAYQyVKJU8cOxrtIr4M2SVpFyslYCeDIEIhex6aJZ8czxk1AQQnaBd4HwEl3R0tJu4eFAHzARknBSeHGJYXCR93JwshwCHLJU4lVicGJCofiiWmI7QY7hxNA0MnqB96IyoBqBuAJ6MchiWHJUUDIRsuJZwZtAFPJfgeSRu+JdMhRCOZJF8kMx0VGxMnDhzPAeYjXhhMIxElTSUQGMke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MjCZMFIa2iNLJPQLwDDiGaofWSRRGEscPjIEGmMaFyjRJRwkyyKfJeQfRzJCMnAayAYSMGAsIS62GD8quSnOI2kxeB8tKZYveBmyGYUqtzEeMm8xnDCWKxEbyy1xMTosxR6zMQEkMi1IKdsX8BUILokkkyDfI7MpLzBDGNkj8Si4K1ckgSyUJAYl1yujLm8ysyd0LUkmAQIUMeIv/hhMJhYy2R4MMDEm/C1nMhkwZDGRH4ExMCFSMvArQy6RLcUfszB1Jk0rpzG9H2os7CqFKn0sfzIjIQAy7SneHFIsATIEGVMrlC9vLiQnQRypMmAbJDG8KCYx6iAoMbsaWyvwIAYrLSpnHQUpMTFKH28dDyk1MdIsNzGfMDYO0i8EIrEV/y/PJOEoiyhXAdQkcgBlAC0AUy1yK0oqVi3nKCIpqSlSHHcyrR3fJ8UqBytVLIUfxyIfMXse9i8IIwUivi+ZLuAXnjBoGjkspCvYJQshhgJcMUEbGRhGI7cwAjDRIpUrUBz+Ghcl0CMHL2wyiTBcL5QwQQM4LhQjhiGuMO0iSxixLtsXgCAMIpIhJi6eMbExei/pME4CKC+uGK4CnTEWHqYwpDCYLg0zuCP3JVMs7y0lLccBNy/dGhks5DB0J6cyaBm0K8UfbCxDL14eNStQL8IwkCG6IZExfCvFIzEsui5yMgwlxiFwGkoy1jEJGTcvHCRQMuImfi5/Ls0chCqUGxkx0TBXIfQtfBkGHqMwPTA5Hs8uvDDaGoEtzAGpMHEe5zIPKCcZ5i5dHmsejyxTHlYkty5aJvsiJDL/KswZhB4ZH6YypDJ7HpccXBy6MagtogFHLNslRwQWM7YZUgL/LzYeYzESItAvEDMdLRIZfSQ+JF8hniZBJ3oqgTClGagnLDM+M9cl2h7LJwgZKBrgL38IAzEYMbIv1y45GD0ydzNlHvIyly2dGwgZ8C/+KkoC2QGWLqAlXjP+GqAzwiAmAqAo+TIQJxQzzS0OHD0eDiiBISsdsh6AMzAaWSjrIh0qzSd6LG0nhjGPI14bCx+bHsgtACPWAd0m/yYtLTosPAjUAVcpTCOGKzwZogGlJ6ke3yDjJ3wreTG6J0ch/ydBGxwwVhvkHd8wNBnbAVwqmyldMrwjIhmEGwgjqyd1Lf8Y4zNNJysBODJzJMsYbRZ0MSoBuzBiJ4sCZBskHdcsvCNtFtsekifnImInoQFAMNozSTM1HM8B0zPUM/civiztInYCQSzOGVks8zFwHEEeuDAyL48juxudMR0diCv4JownAy/jMXgf1DFbMocYjjJ6M/kZfC9sMB00Eyv0GCgbBgUTMwkz0SNLJIMo7S6uGBsypiPJH04kAyPbMzIe+C92LLIzUiS2ARQqlB67M6EwMhuIJz007DM/GOUfCyGiLEI0iysPMjApdjGUM1McXjOdHaMy+ik/GBA0oywQI+suSBpmJn0nDCKQM88ZkDLrLpwymiZfIa8zRDO/M5gsASa8I/wwnij7JgwZOy/gM/AiajS5GDsvjixqLP4nTRw7LyUrwiB6LsUYvSH9HiEq8SE7GbAywyw7LXIl7yDMGlsh+BsvMUYfYSvOLL4ylCnWKNMsrTANL94pdiejAmkxyTJvK68XfAFtAMUaPiDTMnQr1TJ3I/goaikZNM8Z8wFvL9keBC9fJ2Ih8gE0NCA0lhd4LD8mSzQ2MCUy2S4vH9cYOzQgGwEvMyQHB4kxUzIgLBovGS6RCH4x0S5aM78mwDTaKIEtVR43JkAmPiTgBPkuQSdjITgezTTQMcklVy/GJzwu2yViG50v0Q4fK5QqzDBlIB4YfDA/JpUqwzT6GcArkCEsNMw0AQINM7clYiZLLGgeXhi3MyMzNS3TMQwsHys9IQMsKBu0AeE0HTTHKmQzyTRkLJ0lLi26HgM0CSA5CQY0XCcHB5MxeierGSQiiyGaJpUe2SBACqAoMieFMxYoMjIsMxkpPzNMHusyGS4+KvIwYC+XLJAhVTTtIgAC2zJcLTMdazINKh8aLCSWIcczqDMWJBUyQBkFH54hOiwKIY8xey00GoYfODW2AtsjeTRlMC8alyscIxwg2jHeGJcu0S1dL2AxzRueLssvvisTHawz1TBVIcstGS2LIKMlJzDAH1QxIC80MxIkjDLsMiMyfTOOLqQh3CRJJzoxkyt0MKklahnzNKcyESunKgMkRBgKNaMgqzI9KegsFzEZGrEqPSNwHLgxhBmRM84k+TSgKOss7zAwLycZ+jAzMrEzKSl/NKImgSJWK2IBJyrFLCkxtjLMGmQguTLHKM0sOigzMYAllSk8Kn0ctxkvGzYpzjQnJz4xVwGPFXUAcwB1AI8BQTFXLdYyJyn0MP8mgCuLLb0ppgFaGosfPyx+JrA1givoK0I02hlIMTUu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q08IUKABy09PT21PD1DuT9xPshUBUMdPzE8XUMUTdk9oCgtQeE8gUCdQn0+FTxNQFVBuOQRQ7wczEYdPak8bUJRPeU+lAqNPNFA+UNJPyE8DUN5PvU/8T/MKrk8qUDU//k8KUDtQLVD0T0BQyk/DT0IXHFCTTyZQIlCFT45PQlAvUE1Q8k/ITyAC9AZXT5wB2k+HCzVQDlCgBulPFlDGT05QEFA6UFhPm0+BDvsVRVBrTxhQbRClT6JPZVBoUE9PcVCCA3pQOwmHT6sRuDiQT/sVJlAfUFpQa1D0B4gGQFD0T21QG1BIUIlPY1BJULoMS0/4TzdQfFB0Dm9PMlDhApNQblCKUIxQMAp9UG0Ku09KUGZQk08yUG1POVBVUIpQaE/7T/lPh1DHT1ZQphGSUHhPp1BcUGYOmlDRC11Pik+iUJU5pFAeUAVQVVCTT2dQM1CTCqtQuFB8CrpQjRBgA4lQvE9AUMYL0RIYDnhQhE8XAXVQI1B5UE9P5E+1Tz5QxRMkUCZQzVBzP9tPwVDcUNVQxVCOUC1Qy08hBU9QT0/dUL5P/0/BUIRQHg3jUNhQ5VBpT+5QLgazUN9QvVDEUCAMuVDZUIIDQlATUJVQ6lCcUIZQz1A5CoBPE1CpUBwU+1DyUGJPrFBvT8FQ6lDeAr9PtwTwUJ1Pr1BiE/1PmE9AUABRrk8IUVsRGFFbUCEFgFD6UMZQ2VBSUB1RHVHKT1lQPVAbUB1R9FAoUeJQAQsUUa5Qk0/XUGJQ5VAqUfVQzlAsUKtPpguhUJhPDVAnUVxQQVEfUapQj1AsUYxPSFEYUVJQJFAGUFMDk08uUUJRDVFzUGcDAVGRT20DFlCxFhNQTVHSUEQRXFFDUb1PX1GVBZNPVVEKUfFQOlFLUelQaVBRUURRNlEXUZtQ+FCaT1gQUlFiUQxRh08tUZNPAFBQUWxRPhccUXBRJDwhUQ5QJlE0BnJQdFFTUW5RG1DYGHtRilDDUHQOBlE6UeECFVH0UE1RhVE9UZtQ4FCTTzhRyk+SUThRKFEDUJ1QcFBWUZVR5VB6UWM6NlFoUXZRf093UFBPjk8mUCZQilCCUdtP9FDtATdQoVHdDCtQQ1CiUWtQslHJDWsMshU4Ua1RmFG0UKRRvjymUTMMfU+PT0xQhVDFUW1Rc0+bUWNR6VAFUJwMrFEuBiJRo1HBUXVRRlE3B8JRc1GwUUYT1FB+UHoQ2AS/UKBP2FGUUW5RjFEbUPRQLlHjUegW5VGPUedRxlFuUPRQlVAdUXFQQFCYUE9Rc1HmUcxRfFHfUW5QMlAyUPRR+U/sUbNPTlGKUc9R/lEbUABSMFH7UbsG21E+UQ1SKFEkUOpQC1L5UBFSBFKYEhhRXlFzUe9Ry1E5UZ1PAVIcUkQD7FEVBp9QEVIiUts6908kURtSX1B3T1JQjVAdUqpR9E8NUDpQClJpTzhR/APCTzdSeVD0TzZSWU8DUCZRcVCOTzVS8VBDUjAPGw5ZTz1SuwsYUqlPXFHKT7EWG1BWBcdQmVE0UdFRtVEXB9NQMVHqCBVRXFBUUuNPVlK3UfFRLVBVUJhQmFCVUBZR+AVOUlVSflAyUExRV1JvUJ4PlU/kUANRvU+ZUVBStlE8UMhPblKAUZlQcVL/T/hRx1BeUG5QfVKZTxNQTFFlUrRQ4VEzUcdQRVBaURBRl1H+UYxRZwOIUsdQnwGBUp5RCT9hUj1QklJyOYlShE+OT4BS7FBrUoNSkFIwUGJSnVKVUsBQnlKFT2pSDFCZUm5Q5AypUhJQMVJoUkFQq1JUUV5PRBHKUCtQnAbQUPxQYE9nUrdSeFILUd5Rm1AuUcFSslJ5Ui9RU1LCUlQTdlH0UFpPPk9LP8pRLlACUFxQJlC/UQhSxlJ4UbRQy1I+UI5P3lLEUnxPeVIRUdtSl0/EUlxRTFLJT8FQtVJpUJhSJwXcUoxSb1JWUNJS4VJ0UuZPU1FHUc9SVlETUOpSVlBSUB1Q20/2UiFQalGCUBxR9FA1UcJQ91IQUANTClOIBg1S7VLxUoZR3lDmUiNRuFELU/NP11K8UMlS+FIQU0dSOzxvUsBRHFO0UqFRu1K/UslPBVOQUCxR0FIhU81SXVC0UF5SJ1MIAh9R+lIVUxdTFlD+UmtRvU9qTyZT4lJrUMpPRVArUy1TmlLVUi9TElENUzNTHhAHU0NTyVEhUChSAVNKU5VSKVOfAWJQQlNEUyJTMlNPU/NSyFL/T1NT4gxLU1dT81IuUw1TVVBcU+VQXlMUU1ZTTVMOU2xTtVKhUjdTwgtSU1pT2xLwUmFTRFNWUDRSW1MuU0lTEFNaT2pT0wqTT2ZTP1NzUTVTf1NfU3JPqlFsUKA6+1IGUxBSe1DdT1pRQVOoUpBQQQygUeVReVOMU5RTKw2WU71P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vjzCWLtYxFixWEYT3VjAWNhY61jaWL1Yj1iJWLZYlQUoWJRY21hqB+xYw1jlWMVYYhPdWK9Y4ViGWO9Y/Ff6WOhY81j4WOZY6li4CFQEs1exVzIVC1npEBpY3wEYWJhXV1hPWD8JAwTDWAhZ5lhUEwNZyQrLDVEJp1ifUxxZLwIDWJ1Y/1iwD+dYHVnCAT0GxlfRFWANz1csWRMJN1gxWTpYlgjIVz1YO1jIV0BYbhaMOR9ZrFhiP9FY8Fj2WO5YBFiLWARZ8Vj9WLdYRFmsWExYDFkXWCJYp1fGOzMEzjmdVwtZPwkQWcYBrVcLCvcJlj7YWJZYXVniWMtYDwciWZcGxhMZWftYzFgBWWBZkQlAFoJSflgzWTpZTgQ2WcJXLVkzWMxX0VdgWd5YxBLvWOtY3ViWV2oWWVm9DFRZG1gMWX4NElkdWIVZFVlbWNA9WlkkWCBYTlncCuAVw1jJWEJZ31jyWChZI1mSWEpZcFhIWbhSZllGWZYRcFlvWXNZzlc0WaRZN1l/WK0P3AHDPH1YMFk/WEVYfBQRWLlYaFmaWddYnlkpWbxYtFmDWJxZrVh7WcNYTFmPWSBYAzyDWapXqRJVWRNZj1lWWSRYEwlZT4pYz1ghAfZYu1m7AWMU+FfRWXxR9liOWHNYYBp0WTZYNFkzWdAOylc8WHNZolluWctX31l8WAoWTAKCWAJZvVkaWZVZY1kqEoFYRVm3WfdYtlmYWZlYJlk/WalYuVjVWYsOuVntWCYQlFmCEPpZtVlAWf9ZGD5AWVESA1p5WQsS+FeUWf1ZJVk+WSYQ9VmXBgJa91eUWBNa1QPTWfVY7FlnWdZZHFpGWQ5a4FjPWNMTaVkFWe9ZDQqYWPdYJ1r3WRFabj4IWnhZBlr0WNRYZVkvWiZaJVqXWZcGB1oKWutYDloMWqxYK1ohWTdak1kfWvNZo1i7WRhaOj67WUBaG1k3WiFaX1m1WAFaIlr7WTVa9FkFWhhZVlrtWS5aO1r5WERa9lmfU0haUFpdWhRaMlq+WGJaGVqWWT1aaFpmWk8QCloqWFRas1kQWlNaW1pZWoILsFjzWfxZPlpwWEtaYllCWgBaa1o2WrlZ/lgtWnVa8lleWo5YflnKWRNZwlkRWYlZrFeBFh1YCxIRBAlaFlrjWGRa3lgkWoFarzptWihahVq/OMZZHVjAWRNZiFlNWUMJvlFPWncJbFnzFeRZ4Vl+WKtZN1ikWeZZ21l2WJlYBxKUIJ1asliUWTRam1qAWnFaiFhHCalayVfnWTRZrlooWm1YNDu9WrMJClnDWcdZilnJWRQQ2VlWBY9ZU1kNWYNZFlktWpZa/1m6WpRa11hGWlhahQjKWoxaDBSnV6NazlqlWpxaEVo3AitZeFh1PKxZeFjjWTcWQxQHWdFYa1l/WBQP4Fk5WeJZrlnkWU0JOhYPB2Ba8Vh7WkYFSwm5V88VOFkfCaparVk5WKFZ+lrlV5YVVgT/WjQ+alqZWrQWEFt+Wv5ZklmZFNdZfVpFEt5aRlkVW58WfVqYWsha2VoaWnpaf1qPUxpbF1vtWSBbE1tHWR1bRVqZFEpaG1tOEtRZb1ogUxVb2lo9WbJZMVtUWntaHFtzWvtYAVqaCylaQ1oqWx1afRT/Wg5aNFusWB9bQ1v4WRZbI1sYW0hbPVsnWxFbQFpCW5ZZyVg4W4RaG1pGW0ZZVltNWn1aLFvIWm5au1qJOThaHlkkCiBZYFteW3daL1teWvBSfVmaV39Zj1ojWI9ZxFnIWRNZUVlPWDsCH1jqC9BaojqBWRRZ4lpWWHtbpFqOWpBZEVp9FFdbM1unWtVZkTxRCgRbMxbCWqdZ7FqvWstXp1mkWfZaExbQVz9avVj0WjNZm1v1WiEG/VqLWydbFVvpBydblFmaA0Ba1VmkNv9a/Fm2CXZaXloVW6xbN1oVW69bVFttW3BbIhFUWtVZtlstW65bTltdW1FbWVqyWyZZq1ssWptZb1uXBqQ2KVvFWx1aqVvBWzZbWQnMW/BZ6VlrEi0GiFuOWYpZD1mJWqBa5lrZDy8WzhaAWe4NV1mSV0M6I1ijWsRZ61tDCZJa51o4CeBaWFl1WxZYilkgWIZbIFjkWnpb7lsXWkBZiFp5Wx1YqgGwV8lZVD3hWgRcill4W81azFqIW8lZhlvJWaFa4FsMXIpailmTEYJZBlzMWswK1FCwWwNbw1qYW3NZxFpwWT1Yd1nZD9ZYoFv6WixZpln5WjlYolvvWu5aJ1wuXApbpFtwCZJbMVh/WJlbHlyrWvhafliWW3Q7NVzjWeVXVAmOB3VZIVw4XCxZPFxEXDFcflikWQtbrFooXEVcMFzIV7FapFmpWXEESVxOXFZceFggXIcW8VodWnlaoVd0W4dbA1yiWgpcEVxiXGVcC1nPWnhZugXDW/FbYVyfWnZbZFxwXJEJXFx6ClVYjFn6W4dZcVz1W4hb7Fv2WwtcZlxwXBJcHVj4W39cb1zjWopZ/zkWXPNbi1mCW2lcVFjfW4FcsFcJXIJc6lsIXGNc21sTWb9XHwl0XMkKTVjlW5tDg1sPXH5ceVyYXOBbzArvW8sKHFwtXAVbslrtWqxcxFqnWT9cbFieW7tbOVrJAeparFwzWTdcnVvLWwNaJlxKXC9crFxHXKNZwVyTW5o9B1vBWq1cl1tYXLlc5VnEXMxcxlyrXMZcxFrfWZxctFtAWdBauD/FXDVcaTsuWclc0lw1XFpcvFxlWrlZ2Vx/WExcyFeiW+JcQFyZWdBbIFpVWykPR1rWW44UElvuXDBbdhFAW+9ctVyBOadaAVuXWLdaMFpSWyVb11gBW/pXTFvzXMQ9MlstW90SaFvwW2FZplv7XGpc1QuMWxFdxD3PW/FZEVpQFvZchlrwXBBdZFsSXaYRF13YWyNaBl29XNta8FgMXUlbIVsDXYNYAVoOWPBY1VkiEwhdDV3EDP1cK12OWzNdu1DQWTldoAElXQRdYlteXEFZHV0sXTxaYls+XTBdPF2GCBRdH101XTtdZlsbDgpdG10UWi9dk1o6W9xaPV2WWR9bQV1VXWpbI1pEXVdaT13IUEtdGF07WzJd+VzzWf5cNF1ZWzxbZ13XXGFdMQmnWzZbZl0nXXxZNltWFbpbUl0WPU5dJ11FBUddXF1sTCxYSl1xXW9d/1y0XExdZ1uwW3ZdVF0OXZdai13TWFddGl1kXb5acl1cWyZdVl0oXchQiV1hXYJdLVtpXZpddF0CXTZdC11iXWFbo12cXYddAVpBXXVdYV2LEdFallxnXNVaE1kFXItc+Vt6XFZYi1qLXOVaiFvpEBdZ5lgFXWpdMV0vXUVdo12RXSNduVh7WmxcfFG6XCpcOlwsWbBczF3IXDdcTVx4WN1cdVmVW69ZIF2jUHtdl13ZWsJdXFoVXf8Sal3IXQZZ31qEWbZdd1znXYJbEFwjWOxa1lx9FLpdgFxQWeld5lvUWhdcplzZDoEEbV1TXeRdHltyXd5dvl1AXeJdfVq3XKVZy1d5Pfda0V3QXd5cQFgjXMpYJlzTXc1cEF7RXE9crFz9DoJYq12gXStbR13DXYddyAf1XJJd3ljFXbZa/VtvXWYMs1sPWzxdlT9mWy5dWV3+XR9exl2QXapd3115XWIRn13cXRhboxOqW/BccF3gXXtac12XXYJaO1siXswkB136XckDJl4mWfxZfl2MXX1dAl6mXY5dp1opXTNdAVtIXkVefF1wEL5bil1OXh1eWF2tWzxdQ14nXtdbI15CXlVex13wXDlenV0DXpBX5l2lXJFcaFyFXINZFBCoXDhacAZWWMtZmlpXXspbMV4vXmNeYVnsA9tdXV07W2heh13VWS5Yuwg0XHRY51wfXNtciV7rXARYERa9DMBaDF7OWZZaf13EK85ZW11MXmIRY10wXnlZ/11BW/BcyV1BWTcW5FtcWPNdoFx4XG5ey1oZXAFdK1uVXppeNV1RXSBe/1l/XrdbKV5LXo9dmF2iXkFeyl0KXnVZVFyKXsBc41y6WV9er165XkUFMl4AXsRd1A41W2Fdg14gXpZeyAQ7W7terV4dWqJeGF5AXnheN17yWkZebwWFXZZdgV5+XmVeP12jXSpeGV6gXuBdlRRmW4VeW16zXhhbz1k6Xule8Vx4XdBem16lXVxez16dXtFea1tbESpdo12GXiZbxF3YWjNe7l4rW5leel4hXsxeVl7ZXl89aV7/XqJdXF4AX+RcXF7wXuBdj1vJXvtYclulV2BcFVz1XbRdcF72XapeIV+HXG1ee1ySXGNcRwkaArxenl44XaxdwF08XRJfQl0CX/xdaF0BXkdaqlyMXtpZy13AXNBc4VwUXhNePV+JXuBciV6kWXVatVpEXoJeUF4VWzFfK191C/Jcb13GXmpdUl7dXkBYgVv0XbNd6FvcW5Rcp1e4XehbolxbX3Zep17XGCRYHV9dWNldihRTXqFeNF8cXfJe115gXXleJ1lPX+deX1spD4BegF2HXt1ZOV+qWXpflFu+XtxZsVqhW89czV0uXMNeTV9YXlRfa10xX9he4V66XnxeSF+QXVJak12EXWtfKF4lXpRfYl6PX5hd5l4MX1FeWxFeXi5fIl19XiFeA1/KXjReTV33XvVelQUKX+Bed1/jWBteBF+dXv9Zil+wX6Jf1RG2XlBfjl9hXt5eL1+IXyNS7V76XodfcF/sXp9fc18wW25f3F7FX7xbFV+mX2tdYF4AXcde9l4OX/hen176XBFfl1+wXmhPoV+ZX6UF11+5XrReGF/VX6lf0w68X3BfyROoX8BffjvSXwVf1l4tX8lfY1q/X7Vfu19yX5xfvl/EX/RfTxNpX21fuV/PX9lf8V4UX5FfxF69X/NeiF8fW6tfBFoCYJtfjF+LX61fV13HXxlfNluzX8hf918VWpxfnl30Xuhf41/+Xsxf5l8WX/5bc1tuXLFdsF3hWt5bzhCRWRJgjF+2X9NbAmDLX+tf/V0rYOBfNV/yXrVePV5nXq9f5ligWX5fs1o5YK5c01w/XzVcFl5HX7pfHBEzXY9bpF/oXhRf317kXhRfBmAyXxtg+F/6XXVejFl3W39bzFdWX6BcAFyVXHxc/FvUWExfjF20XgBgK1/fX+1f214dWuwDGmDiX4oUOF88X4NfzVyFX2pZEQ3AWrFajl6dWEQ73V92YN1aK14BXtpfRFsOUpxe8V+dWURgKV6VXRNfaGCVWWdgGGAMXXZfl17UWGZg+V/4XklgLV0bW4NgTWCFYBRgKGDYX4lgt1/uX0de5F9kYHoKUWDqXWJf51tOWIxc9F3tWyJgi1yGFCpfmGDQWIhfUVp2YGld9l8KYO9eTGDbOMgBiF46X8tXwF4pXK1afF8NBexcCF+6BSxd+16UXrBgNl8XYKJftF5MYKwK8ltZX5dcfluDXKJgoVwgX7ldz2CfWvhdXmA4XpNgxGCMYEZgLmCbYPJfgWCWX79aNlxzWaMWbGA9YEFf2llLXPlaw14LYItgYVk6WuBgCF9fYPBfmV9iYDZes2DtWZAWjmAtYDBb5FiDXfNgJ1myYAxgmF13XeteNlteDHtgT1vyYJ5gblsrYABgHF6VYJBg3GBhWfxgeWDyXg1hl2D0YO9e3mAxYE5gB2FwX5RZCmH+X4VgGmEFYRJhsV8JWSBgI19WWKleJl9vXqRc0GAiXx9fMmFVWdZarF/wYCFeMGC7G3AJvV0dWiRh6l+IYPc+t1tqYAlbclk5XMhc6FxKYXNZPFyxXM5cSWELXoJfTGFRYUNcO2AyWb5goln8WtVedF9WFThf6mBBWMBgugIUEM1e5V9EYblZ/1uvXTRhXl/WYHFe1GDOYKhgbGE2YSFga2GkYFpf8V1hXyVfeWF4YYxZhFwpX89YmQb5YAVhwmCAEkNfuWASXj5cvmDiXEdhVGGMYVJhVWHcWdJd6GA/YIphWWFQYVdc+FpbYQw7HGEnYINh4QUeYBtfiVuCXucFRmFQXExhmmE8CjYAtFRUCAo5Lk+8VA45jVYyR4VX6j83T3EI6VPHVIxXPE8nBDw5YwkzP7INjQw+OVk5JRJnPMU8Ej7BPDE+Ez5WOU08RQLHPkMMgzyDPEAWUDnBEKg6UDtgCps8gztRDbxh8AX4PlQO/z3uBG85NBQyOQ4/ez7CELcNHT8IP5c85jr6PbcOnhEMPyY/QwwfP94RNw4ZETEPsD2gEigP+Tv1FDw/1T5QOeYRRBJoOYU8PRCyEj87SzupExw+LBRgOUI68RJcP/09Iz9YO70DeBMDPYU6CWBsTIs6ij/0EAEUZ2H6OuYRvT2LW/xhYBaKDlE6sT4ZYg9aYjzGPD0+22FZPVg7hT3zDqYOHjlvO8UTmzzZWV0S1QO7PY45fBHJAx46LA9HEDcKTDu1PtYQtjxePTs+fz3vDLA7XjoZDH0+iAxfOfQOu1+yC0I6Pz+0PsZhYT9fO/o6Tjn/PWMJODwFOowOWzn2YVg7Pw9ePOFdABJrDx9i8gKcP8ABuD5DPtET52FTYhhYDGL3Yb8T8D1eOoQ/iD5pYqcOeT9YCQBi9g+FOkdiwxLDCyU/hA+FOjgKrjkbCEI6azrOE/cPC2JwPHdiSRYdPTs6GQwKYoE+NhF9PzgK2wxpP48+8TmyC8kS4DnvPq8Kvj5IOvQI7j31Oa88bT9vPYk+9RCtPyQLkDomPqI/wU9wEYxiYz+MPe8WeBOrYro+mRJmCzpi8D1TW+s74j38Pk9g8j16FB4TvQjqEyM+rGIZW9wQwwtNP1g7k2JbPZ8BfTl2Ymlim2KaDVU6hTq6YrQSxWKzEmQ+8D3kDFg/Rz0aPy88YD/jPiQ/YBQKElU64A0hEekG1T5jOVw8dhDeB8xipDyxErc8MAzPYu0T5T7HD4c/7WJqYqdiKT4IYjkKcT15PRAU9g8KEgdi8w5mYt8HKRRmCyA81WFSYuFiCj3MYWc/cxSDYigRWhFVVZkNtxQ2Yk8Uhwp7ORQT9RQoMBVjGRQFPy4Lo2LTPiAHNj8CE6sUkxMKFAg+LjldC00SkWLQOgoSRRSFDhRjNjpoPQoSShWIFAI79wRbPfU9AxFBPhtj7DrJObIRmg0+Y74/QBW6Ego6mjnLYQY+hj0+YxU/0DlfFG4OcT33FDYR6DoiYlgDAT8uBZo7WGM/O+E9FhDVW31ifw6AET8LPztTEpM+RxEHDBsQ+WEDETJiQGKIOZIVqzpmCyY+2lxhPiNjCjyQP9U7/jr3PuRhYjr6FAZjTzrpPjc+DRU/Xhc84j3EDiY+ZmLJO5Y/pRDWPc489RQCW1EK2QMkFcMLA2PFYRQ+LQwnB0Y6UhVsPyNjiWJzPF0/6zpIFV8+nmIRPxkUWz3hPfg6cz/zOvY5Mj15YzU+QRXEOYcQYxN4PO4WsGIYPdsTX1PfPJtjWj9MPa08dgkaFWMLbg7LOx89KBWoYyYDJWONPSRiIGP0BmY6ZD6IPFYR+WIZYuU+/hRDFYtivQg+Y2pj6z5KPws/cT2eEuQ8RTzWD8I9ygZYY2k/kWN9PX5i8T7VY5A+tWPGPZI95wvCYykURmJ+OXI/LVjKOoo+mDrWDzA++T5oY7Q7Kz62O0NiYAoCOjMPcDnIO/85PjwZPU8Nh2L2OxMROjzdPRliOFXzPEEM2wwKZFU6BxSuY/kQOz/aY2U/nxDCDGBiJBaVYudjuWO9YiFhKj8QEjA/NhTSY20S2mHIY25j1xNcE0I6wDq0EgcQZTkQEP9imD3LYXc70BQgE4IJFRJHOf49ERTuYVFiEhF4PZw9tzprPpETHw+/O/ZjrmK5T/ljtTvsD58PDmKLEz9kT2KzPggToz7cCpdivmLNY7UPsBI2ZAwTEwelPuE6mQd1EgE/CWPBYrcQsD/bPIs9tmOmYhli2DjePl0M7TnvYycRjBDYOJliej7tPicORT9aEbRi4GINP70IN2MMFdU5mWOTDwE/o2MYYrUTtzwEYsMLmj/PEjcS3z0nP+cTumMqO+gGPTxwFG8TtmIyPIRjWBJgP+pidmKgY8U/gmQzPcs/jj+QW0oURQ7vO786oWIwE/E7a2TsY2YP2jobP4wQU2OjZHhjjj8bPxNiiz6HPnUMaz/UOTETFmRrFHNjrGRiPjBkJGRYEoBj7xSOP6A+NhFOE7Jkfz5SEZJjmT7sOrg+rhYsZJA9DGSPOho8eWMVBsNjgFixYrkMoGQFPF8+9xRTEXk/6haMOiETvhOoOm06ZA7UY3ViqT3mE2MJ2GPQOTxeDGTwPcM6gTvgYxoPZmKWEetjqj4aZOgW3j4fFvNjZAnAEZwR2RCMEDpi82TFYwc9eWRtE/Y74zsGPaU/02QjPfAOVhKyBvhj2RAQZRs/6QcqYuhhdzx5ZPYPmBQ/W79i3BT2Ozk/3D0bZehj2T0CZfgOggONZKIUxw8aOhxlfj3wEoE+xw8FYvxjSxnJPMwW+2RnDodkAQizY0xkGmWBPBwN92QoZdwUpD0fE3kSGWUJZFk/lGQ+E2Fk4gn9Yi9iymELY509iQ3KY8ILIBUcDSU9QGV2P/1kQjxVPgsUoFlrYtJhZ2PBWNkQrz4mOuljUWXwZDIUfGNuEisU+zqsPmxa+zxrZdsMRz/3OnljYWV0ZOFhTju3PCxgKz2EYmtikgkgPPwHYwdsDPdicz9NZCs+bRMtOqddJmLzDgNk0DkFZcMSzWF/ElVk9g9eO1pa+zwhEz5jZzzgCzMUNBDgOlNl6zmZO2plZw4iPusUQD6eEhc+/2OXYyRcimOgP2M6mTtkYrIKZgvvYl5kAWOwOyNk1RCyCqBjDhQaY+s5ZgtdZBERgWULOpwGYTyDZbVlUxBuP8hQDzvDEjg8RAn+ZHAKi2VDOndj2z1lDvY7pjvcEB1kv2CHYjw8VmO5Pollrj67OxdjFQaYZF1igz2oOvY7yAbdZOQ9ymTUZNs6y2WBP+06ImO7Y/cEWmXIP5UR42UFAzU6u2LrEeg6N2VpD8JkbBAgPLoUVzqHYh8+mgo0DAE/bGMjDvVhNDrAFCU88jq5FN9lqGLRO/UUM2MBZiQT02VsDPcPcj2tCbcUz2WpP246KmPCPh4+zD5dZfAM82VeOz87VjqpXJBj2xEyZABkxjn0EcU5zw3tChc/uRPyZBJm4WW1D2Zkc2S0Epxlz2UFAkk7qWVjB1xjT2WPDlU8NTu1YrljKTtNZtwTSWYTWDYTij3VZTEMSWLSZRA6wgw1ZpcPMWMsErE91WQiO0Q8+zxMP3s66WRZZrhlvwXGZcY8ORGNYigL2j7pZA8/YmSnZYVlzQg5Ulg/W2b7PE5jxWM0ZW4NHGW3PoRkvD7SE/djLWOlYoRlSBT+ZXQOhmZSZdsBPmbyC7s+az9oP0UNJT03Y/kUbg3zZRsPIWL0DMcLbRPFYhxl/2JtPccGRmbyDjViw2WyPV05TBIMPj1iIz4mZBIRrmT/ZHQTiGZYP5Bi+2KXEmJiYlERY5dm92OSZrJmIwuWYvs5MQn8YTxZdmaqZokTVmXFYX0O9Ai+ZqVmDz0TEG5mUmJqOvJh3Q1pZvNjHWNzYrRl+2EWDiRZkmWUPmo882ReYxBm1Q99ORJkAmPQZiI9UGTIYdoTMA9PYuRmTjwABzBm1hMUYkIRqzkBOsxioWY8ZuUUpRMCYi0SC2V5Y/I7uz+2ZH8QlDoVO6QN9QHpZq8/c2X4YZNkU2bREi1lXg4HOjljfQkKO7UP8Gb4D8Q/sTokOoZkWmXNYmkKxWYjPgNkv2M1XrNlVmDJZDljfWUlZRASxWJtYnA87GReY889rGPKZIRmGhX9DBNnNRH4Ot4+DlvhDgo/1Q8XPoE+xT/QOSJbkmVTFN9lMGX2PvxlIRE/O2ET+w1OZvZkZj/wZcE/9j6pZEJnf2YZZP9l0mSAPiEMyGS6OSNjuj8jFb4U2WTcFJw6iT/fZIASJhW7ZFpPyxA4FSQTJmZsZ3YOoBQ9D6RkfxByZwk6WzrGZIkRSRXpEXRnNT19Z7UQ4wxwChE7amfzEH5meme0Ec893D0QPI5kxWPkZAVmb2e+DbVkRhUGZ8sHmT7cOz88fz7hPpk+X2JeC2QVY1VJF8VV1055JaBViE5XOKRVSyieBGoYAQKrZ4lHAQL8GXFVyVbrVqsidVVVV20dZVeDTntVfQGJF+1OumePF/kg8E6pGJUXMgCzVV8fhlX4TrVnkRdTACYBuGflP49VOE3CKKRDe1aqSUA3yxdyKVEC1mfJIOZV6FUGRXAFVElpG7RUoWdoVchV2k7LVWxVsBoDQLdOBUBSTdFDeEw+Gi9W7WdSNO9n6S73VQhA3EQCJW1OqlaONZpJ21U0V91Vn0nLZ1AB1Fa6JroB7hwVJxYa61UgRNBV9kCLQJ9NCECtLQdo7CMQaL4ZKSuXVdEpRUzPK1YYiy9iS7kY3ya/NQwfkxURNXEaOCG4R4JEImgzJH43D0OcGZQgXR6tNiVNdicmaPdCMGiQGAVNCCDaQBtoWBigGPhnMFerViwg5EA3RdFWeksAaD0BAmiXKbQnrCf6NIot3VauTnkIzUMNaI5KlicIIAUa8wGQQJ8q3hemMzdoWBjpGIs42lbVVhJoz0JQJFwztzC0REkaHiVENCAvaSyKQ1QCLmj4Sm5A22cETCIomhiKQ6YBa2gPBW5AWGh+Ng4KVmjCIC0sKWh8RxkYI2hOWD4jf2gzJE0bdGhOAioYOCFjJ31oCxqHaFg0qAFJaGoZyDVRQnYnBGh0GQRXXiGIGPovdBlmHl0lgBh3aM0nayvkNp5ommhqGa0BXGgONl5oTEBHLnpoWkBERZYuBhmvNiged2iQSeIYcWhNJxwwa2ixRrcEPh18OG01gkaIaPdCziekaE83l2gUS3wE0Cr4BINo90KtLsNoIDRdNsIlyReLaNIXhAJuQDJolkv/GLFoiSb0Z9IXBUiTaFI0lxvALHAcC0ydIxdoFGi+Rdlo1UTbaKRFu2jVH49oiS/xNQIvYFbRNLIxbhtOAstFymhBJ9AqFSfAaIcl+mh8BPxoqy5uKWtoeEUAaVZCkhrqaBAfrGhqNflF/mhkaMst6jPSaIQlDmlaMTQarS3NTg0ybim2MF4caUgwRS9X7VZRV8wa20JzTkBopBdCaBlXGkSmaA8jgBj2aK1OIUQjRElHdky4SbEho0wgJBdoAyVuaCBHjyQ2abgiMwS4HytoCy/JCo4kLSkRabIZ90rIS+MsYmiRL6loHGi3HdZoGUxTaCskOGl1TS8mO2nlRlJpHBtXadUqviZGad5n+xjVKiNZXGlZaRgbTmkGRRYqLGl7M4otaS9UaEAk3R9XaagYYikCL9ForDaYLqUtYDHQKqQBPWl5L7NoPRzHaL0xfDDVKncngTDxLFVpiTJXaZ8abmm4RXtpnxrqaIsLgmnCKl1p+i45CYppj2lnadkeQWkMJKYJZGlvaLcg0hhRLkFOuUnJCkZpIiYRaZIaeWmdIIFoSR0eaD4azRsfGDpoH2k8aJEiz1YUV6xVFle3ZwFoWFfkQgACpmmTGJwvRCoJaLEaL2kMVzFpoE2gaaNMRydXaf0k2zQVIpJpPxzBK8YjBkt8MP0kvWhSQepoEC9oMJBAgh6yG9hpk2nVH8ppeS5maAIu00gnGtxpjRrWA3dp0jhdLfof4mhLaV83GE2Vaas1RmkONu9pbSmaaTlpRBjzac9MqmkvQ5BpJTcZMZ5p+S+dQOxpu0DWI/hpwwH6abopgCOtaYNXjlZuTvpn2lU5HhNX/WcVV/9nZlcnaYlIHkH6aZJXbiO/aYlWZCKHHcJp8kJ3TCdEUyh+Arlou2lLGIotGUjRaW0z9WmeJI9KXBzHASlqxSIJasgczBkQG7tp0hgCan42qkWOaQwfrwL6aLNozkw8ausuQWopSfZormnYVSBp9huSVmJBlFa1TnkXJmlEaJ0fKSdcaFAllWmNS0xX62dLRSNq7wFFTFoaTxrgaCozaC0IA9cbNGptQlJpDzi7aU0ZAk+xZy5X1kI7aA5qc1bWNdBWyGclaRVqUmqBGuBp8DCZApBoTVabTaE1nU2QJTBpIWoyaZwlK2qYSO5n4GiRHXtpxR9oavRH6mh/CI5qMTeQal1qhDCMajEbYGpeacIdl2r1QjpqCSArAZBqdGnrJHEvCy/pSBsigh7FH7tpRCa5SchpBFZHagtqy1ZQV7BpwiiGHPBWjk0UarhnuGkaRGBW+i9MI3JOfmpLaPBVIGolRA5oZjCSavBnVAJqalBpuEUHapVozGpRLr4M52nkaZkonmpPNfEgpjaLL+5oGCKHLFEunzNraEswPWrNKYhpNRx6AwIbLWrOG/kv4WolG55qPRxqaN1B6mk1HHJpmmrnJ+dqqBjRahZAa2hdNilq+Go4HmkY6mowHdFqqBi9abEYKUnGCuxqAmvTahErzGkHNKRq6ilRIXdpDWsQK7FG6mj+aosvoRvQKvpqVhspSaojrGrRaUtMHGszanIc2C/uNfkc7GrcMepolzZoMAFryS1mapMqfjdDHEhqgymzajQgv2p0av5nfCW2aUNoumoXaoVo3miYKfdnmlXKKHQAzCh+AWhXFU/FJLNMbFc3GG5XHE9wVx5PblVOa4Q4i049H3dXnDgnT544KU98V45WrWE8Hy9PvVSxYZFOs2HmU7VhohfGVIwVyFQ8TyIZzmPAYQtjXTxLYwFiCT4RPjUNgA5QYh85djt7ZF45cGtRZHY8iwUWDic/rBOpZopmQWL7PexmlhLRDI1lhDwGEKET8z4DY2Jj3GH9Y3Jme2MnOwACIj9gCT9iWDyoDLplGxB4a+kTgWsgU35kRGLrOY9rhDxyO8E+gGVjZn1gHmVTYlY+zhNra80JfQ9BP7Fl2T5uYu88jTqlZZBm7wyoDNJmUxRtPpA89jsiZt86pw6FOjNgDGR1ZYZYkmsQP44CP2YMZKFltzxzZVMUsGaBZR5nExCMZpY+rWYrO8wPomViOr5hZjlUOVQM12WpDKgSnWS5DmwM5goNFbo/B2VPZnZcORIDZ9pl/hRPY8djzgTga8NirBLzZfgDLT2oEuwSW2TdYkFkvBKyEFJmQg8pP79lYAPcazBiugKQPGNn92ZcPiZnTBCiEWoMIw+cYnAJpjkJBjZn6Ds4Z7UQ3jvnOWZnbGQHAq8+Fz9TFBU/qRQyDBBsugtSPhdijAQPbNwQ12WvW9pmGQYoE9FiKWyHYhoN32ttZcABGGemJyVsSmIjbFwT+msDbP9lYwcmPqYnPWwFEaNrQ2y4a2BihRM5bEU8R2dBbDlltQrrZVNiaz6YX5w8pA5JEshrx2bsCkVsXAuoOntiN2wcPYUTuxGIa/oICT0fZT5jhT6MP+w6D2RKYjhkH2U1ZO9hEwygZuZkpj+TOudi6mRqPMViXmEzZr45fGWWZL08O2L5PYQUqDprayUQIz3va/g6IWSqa9RmFmeoDAFkhRAEZT89Kz+VawsLUQ96OQ4+cGV3bH8+bBDJZf0JuWOaEyFlLT5uEodkSmeVZa0/8j56a+JhsRGma0o5cWz1ZRQ8oj8RY1Vs0WOJZqUN8wwmbGdnwmRbPqRiO2fODotr02YrEZ5rqWJpbPFrsALPPLBsUxIcDalk0j0pZ3plE2z+OUxmAWxoX35l/GsIEwM9nwG7EV0+WBVpEQZmOmf5ZNQ5DGXaPeo+9D1vDolnJD1tPoxmb2sDYutieToxbDo8bjxpDskO0GRXPQBn0T5/Z4tj6TnkbPZi5mzDbHsRiWR/EtxkJDtKbDFkO2zLPKhrf2yEa6drvTrhCqprUDneawxsfmxtPms+vGWJbIkN0mZtE+9i0g6nO1Y/Lwq9ZXZsyWvPWQttf2RbP4diTmzVA9NrjGxyZGZlSTkrPpwOtmwcbAQ9UmxwO+s8QBfXa7hjt2VGPSBtohP0a0QMJ20wbI49nDt7awxtEmxHFfls2GZsDKNm3D6tP5xlLzz1DmJsUTsrbbwSbz5CDoFnswwAZtZi/GRubIQPLD9zZTli5GxwZ14VShBLOuVrEWyoWC08Z2R4B30PTmwsbQZlXz4+Z1YCAT4YZ/Y7KBRLbMZrPmfXbC1s2gV4a7JYyjuvP19lQGSya2tmwxMlD1QM/GQgPFliSGXhPlpsOwq7bJRnbWSIOacO+hQRZcxlcW0eZ5xrVzsIP1JnzGTBEoNtZw5hZicOXTocZYNsUG3ZZeo+zT17Extsr2TKayxlSz6qbR1mpWSEZuJsAW15Z8I/+TynDjg8+FxcOpxtpWKsbfs8bGynE39tHDvBErVtbhIXYwlsDGUYZ+xkxm37bA1kLGQ6beBmyWuIOi1tqG0zbUgUq2Q2ETg8Aj7fY/4Q4WOyYhkUt2udGBEG3WLMCT8K7BZDPCVizGVgZbRiXWf6YSJmGT/PY1FjE21YZHNsmhBNbYQPeGstDfYPkG0YZxpm02SQbOVkAT/YYhc88WxQPYU612EzZPFt3D2ZbIdsV2ymZY1tuD0wEsBs5muVZf1tJDpcZdFts2bROWhsVBXFY1o+u2QYZUNmsm11Z0UO22yMEsFjNG2iPfs8xW18ZY1sVz3CZpURh2SYZTgPeTzbbbRmUxDMOqMRtGvHYQhtDWPVbBU/JGcIZAxkvj+VZaA+FWyIE005YjkrDrNssWxGbg8QFmYnEXplsj/EOyERZGVPbsk/phBJbpQ/hGalbS89gg6abZ4/9Wx6P2M+m2RCFUoQp2OtY2wMg2efPzxnQm3xZac/6xE8YxpueWPlPkRurDudZnw/f2VSO1Btd23LB/Y5nD44PjVsAmfQOmETVAzIbXxlfGcEZzln8BSDZh1tWGzsPD5tOW5OZENuVj1TPmNnPm50P1UV3jmnDqdmB27cFJQ/JWYtOrRkJBN/XgtttRVGbPkTiAI0bYNuwwtGZWNtIm3tbJQT3m0mCXduT22/EFBsET59DqBrOwqnDhcTM27bOvUS2wyUP1hnnTwxbcxlCWbYawg8aVsVYvJtiD5WAmtrlWNHbuNtuWs0Er9umhKnPHo5vG7pZao62GyHbpc/IQkyDFFtk2c4Y/8+zgSiPxZuIwtdY/dsLDocD2hlfhO1brFuSGZwPBcTpw7Na7RuLmSzPNpu2mWlEt5uDm2/P9ASdWYMbh1srG5ZDzRjkznubLkUI2VcbsFlxWNybpJuF2Kxa1NshAthbERl6m4JPtUIHz29E1QMsWsGbKI8zQ81PIBt9AatDn1u5Wzra/0UaREaDbBslW2/EN9upG0gDXY+vw2WbEBtwggKY7YTkD4bbz1mPQmjEQtuR2w0Bis8pRTFbAhlrG4eb7kL4W7zbapss26gEs5tjG5Kbg5ub2aADp1tm2Wqbko7dG2dOlYWP2+xbRc8NzrPZD09yw7+bjpvBwIyb5Q9eWLWDW0TpmyeFfIQehQvbLNlwwTQbRA7Z2TTOiVsp20Xbg1llhDzPlU6SmWTZmg9PG+pPKVu6QhHbUxvzm6dO2Vv7GvrEe1tdmv0buphgWxqPIhi1WwBPtBmiW0RFF9myG5QPFw9rxM8ZF05qj1PZxs9vT6wbnoOJm4aYhJlUG8uPZ1vyWJsOW1rGBYwEEFvbjyVbxlifWzcFF9sfztWDE0TqD5fOvNjzGI1PJo7uGAAYy0SfT8FbjdkHD3aPIZj6mxIOuFttQq8bh9nxjqeY2RsdjymbPdt/mt/OxFvh29xa99himTIbGpmXm7TEWsUOz8wZmBiKm+BY8ps4m5eb89sPWdEOptuomRtZ8I/Zg5aZ4ZsfGWMZpxmp2/aZsRj8BTXYjBmJmSRb1wU7mWzbIJuTGWVZls7eGbQbgY/ig6SO21vem5lP+lvATo0DONrxBEdB2Y/HGSmbXpsSWW5bdg8agwRZ908jm5aPJ9j+GVQZaVgSD/hD9Nsf281FDM5eWVUPxFjHz6Xb5tmkG0/O19mnA57ZkhkwG0AbCsMIWcOPS9vhWv9Ydc+DmfQbCg7DxKcEUVvSxlLYlgDjm+Bb2oUc250EwgPNzxSb2lvnG9dOTM5MnALCxA+PD4/ZMQQDnBebX5n3ToxE7BlbRNOE4Vs4Q/hZGlu3RHxD0Jl4GyBYzJlZw6sb1puEnADb1A9LW7KP1RwC2ytbZ86927hbBs8X27qFXASM2+7bF8RagkGZntn7W5UbRpt729GCxQ7K2R7EjBwlxLXbrc++m17E2xvdxIvCnUS7ArebCRucG8jCzBnYA6gbXRtDHDqbXE5126IYiY+NWW5ZtkQHW8DcOU7OGL7Y4VvvTqFEhhwD2ePWvlkI28wOgU++m5FPEFuDGVDZFA+5W6bDzhtWW2abSo6zWY1bw8+p2xYOSgP1hNmbM4NAz+cbNwQlD8LFPNuSRMTcO5doT3+b4FtbAvHZahrlD/dC5tnDRWUY/5mtD0sbX5wvTzCcD9ve2/aBWVuxDkMZYBulxSgb9BvQG1YZWtu4QxuDnMPPW0kYhwNbTqhZIRnpA1ZcOZv9j6pOqdv+WQ3bgRtR289ECgPWhYZbikVWmUpbvRs227HOwJuZD9Ub4pi7HA6bL5uPmW0b8Fv1DyUb4NwemKIcOs7gmTpazo83GQXbMc7OWZSZzhlbW+5FOVwGXEBbwlwGBTJZnFrYwlpcJVuHFijbWFwShA9brtkc3BOPo1uJ3HAPc1wBBT2a7hskWflPV9uJ2d/B+sRKDk9EEBwrHCSY+QReD8vZJMTP3AfD1xv321IOi5wIg82bVYC5mIub29lK2NxZbNw1m/4bjVj+nA6PBVn8G1DDx5xNWPkEYNwARJBb+Rus2VFBRQ9dG0scXNt6W8Kbp9sDWIrOcRvZ3AXYiZvKjxAb/tuKRDDb04PX3AnbtlirnDGDL5uoHCeX1VlFG9PDmducmxjDhpsDnDta1EVjG3mCuxskmW/cBNii27/bkxiu2aMDg9xm2IJcas7jnDnb9dlUj9DFYg6WD9Pcc9luQhmZSlx8xK1biFtgRarcakTWG3NDxVxvG2SbJBu6mOQcNoFu249O5xx6zyncVZscHE4D79wfm3LZpQ91Wy4cMMSPTp9D7M6XzrecAgGU3EFDOc58GM4beJtSDxZcXBw9XAjPAk/G219cSVxIT3ZbrdxcwKccDNvtmb9b2ZjnTv+cLRtOG6Ga58T1XExFcA/VHHmcDNw6HANX3E77QcfZL1irT+9BIpw+24CZJpv8m5EZKtZrwpgcEgJ/m3KbmBuJGVkPms8eGdibsI/vQSrcOoQJWQrZn4+l3CCYyQN0HEWcQxvZ2csP4Fk8nBlDj4/fQ/xblVxlmttD8JxVjltOXBmyz7DbwFjoGuUbGBxLXEoZ+JuXHHrPNxrDW27YlVw024NOvBu3m7acOEMG29qbRdyXHDaZAU7rD9JbpBnnz+YBC4/OQ5Wb8luQXIHFRxyIxI3Eyw6jm91cGhxm26Ncd1vz3GTcBsKlz7TbvNjVWT+cN45bQ1ucUY+X27cBFVtCHIpcEE5eG6EEnYL9W98b4BxKj8zD3lt9XEDcBdlwQ9lZiBjpXHBOMMSeXCtZExxwggob8lwPTvaOpFuOz1icA5yzWxMcthx3G8vctxuHTl+a81vkT2OBsBm1gQiZEluInGfb8xjPmwpD0ZsIzpXPclsGHEybdwMn2R0Pg8TsnFwcp4+JHF3b74Udm8QZ0dwhzllZhFtdjsjbo4/h2SibhYOGm87cNFhxmaWcf4TN3HbOoxwNHH9bDgPPnK4bexw33HME7lPm3H1cRoPmBQeOq0SX3EYEzlvTXEbCLtxzGUKbY9yKW9UcvNl/GSbb0MNc3IOcCJsknKxb4ZmynD+AcVi1Wx7POA52290cbFiSnKSb/Nspz+gcswPWjnSbsdylBTeZPZl3gLNZlQM8D1kZfdiIw9tOiMSEA9pDyZmW2/pcfIRRBJXZJhxMmxqZrkUfT/AZBByzHENBBFu8nIIPLduPWQfcOlwcXLwbOJkLxSFE7pwxXAePexyLm3LbYJtUhKQbS0LIHObOlByzHJ0ZiFzaWdActASxW8oE7twl2zJa3sJNBK6Zn4TU28scLU6r27CbTFyzGXxFPM9h2x3cV1ybW0oDhVwkgnKOY5m0nLHCMRw5jpXcANtXXEkDgEMIHA5cIhnrnH8YrdjqXB7ciRxznIDcW5wLXMSc2cFUxXxcEZy3HHqZVFxNxHucOVyZWVKcwFyGG9Qc8hvb2JcbKZymnIJZ3Vy22/aZr0TWnNXZa8PbnPZErBrdGa5cq9mb3J4c7E/ow/LO2BsjT8UZxBxhWEpbW9swHHlYURkWhGrZSUOoQ+AcrcOz2FoDNNsoQ8JZx9umnK+PEE7TT2RcwBkKT7qFCw+hBKaa3s762GAOZVs6WLaCetmOm7tZmcFaW23PPI75W/nbzg8qGLRa38SG3Ixc4EQSGd0bIw+Lm9OcyEDaHJxcfpj+zsjc9JtknBiPkBlvT21cllv5j0GcIty0zvFWY4/1nA+ZAFjz29TPOFxzmt9D3Fi3w0rOogMmnMfZYdtaQ9hc8RzMXGxC2tz3AzgOYlzlzpmcX0/6XMsbq9u5XLYFIZu7mtYElJyYm+PElkSM2c5Y3Vr4nEZEX1vpHANY6BuymRIcws+dRFIc71yQ2WRcstyvWOXPjVz53CXEPByNRHiO9ISlWwGdOFvHXTia2ZwZz2TORNlU2eIbudvoWbdckQRpQ7AbGtxnT5Rc10L/nPJb/IRSmcHcbFiAT/Bbn0UC3E/crw/IA0Dc74UXgwFcGxt2nHYcvxw0W+pE6wUQjoDY6VreWRIbwxun2aFFPMS8XO+Yx1uVAd2P9Jm/mNQbCAJSGVWckwJBjwnDVNsPmKeO2JRqw77bSZ0yz0FcRsVrWRSZ0ZjZ3RzEgxyVHQxc7lsnGMEZr4UyRdZEnJn23BZEjQVHl8YbG501RLCP/FKtFRkVbxD4WfHVQBAyVWlZ9xOzVWoZ88tsGcNV6E4dRe3TuZOtGmgTtAoICm5Z7cXkFWMF35Vv2eUF2MASRv/GJsXNSj3TqIXE2p8JUEAjSggAEgAmHTNZ4IXm3RxajZH1FZNZhsnvzbWKrgBIyp/TlsIgU5NOFABn1XjZ2pVolXmZwJAHGqOTrBqkU6rVVtWFlehTrFVaDh2OMRniAG1VTdrySjMdLpVaTg+OEYtQDiTTRQB4hxpaQRBpmptK1o44VMOV2IByXR2VqBOok6+Tmg4u05tAPRWVgHBTiRp4yjpdHQ4agCPFeJW73Q7a6tJ1mmZJRtqpVWxGuN0oTjmdPFWy3TzdKROoU7QdFkIwk7TdHE41nS8VdJneU7GJAYfQDTPH5pVLSKGdL90iHTkZ6ZnjHSNTrNJ6WfTVWcfoU7DZxk37GcjanBp82pSGh0x4yfVLN0ekEDTafdCRmgGM31p2UoHaysjJ2qgaqsk02oxKxFprmgCI7s0fh/3ShBp/ipzaD8cX2oTTqEsf2nrIh1rSXX0TGtot0FMddoiuUkvdTNoxyJOdWUuQXXUAaRpV3UsLZxqmhosdQRB42r5JedqQkcoa9NICR25ScwZVSenGyp1uR42aTFrtDIORPtnJymzacp0lnRDa1AoeGptIjpqRxyLK81o9UCJQPdAjEAWIQspaAAjddQykEuIajkYqCAlLrh0jHVWHGom3RejApJ1PmhOJTIcvBnUKpd1XDTKHHoC9QGddbMCfEHEGM0zkQijdaxGrwKCGJx1qHX7IdwklnWYda11exoQMNhn12dRAr0noXWkdaR1ZSrRIyIYvSW6dfMwyBe8LKJ1wHXAH/8h8hipdZx1ki2QMxIYwHW3dR4wcRmxdbF1bSCuJ7Z1wXXcMSoYvHW7db0lBi+sdZl1mHUkLtV113XWddl1gRmuddx1lC5BGJ5153X0C3kg2nXjda915R3Wdbp1jCBZRC4A8y9uIfR12C+fM811snXYZx0ev3XSdXQc1yC5dd91vSWMIPFK83X1dQd293WpAfl1znXhaMQeR0T+dc0zZSoeGOZ1xXUrRLEhtxv2dQh2gyQiHeh1nnUMI3Qg8RgZdvZ1jRkBdu91NCynNP11ynWsRqkdMBpnF/p112fkI+t123WxL3whHXZ6Ah92NzbLF+x14CA0K1klJnYSNR0eGHYIdvV12mlnHAx2cimWJWkrO3aIKhsuexgCdkB2vB9KdjN2PHbpLqQYR3YNdtkecEYQdv91qhuaHE52JnY7L7IhBnYidk5UXXZGdi92SHZOGjl2U3a8GW8ZNUgudkd2tyFSdux1bnZWdmh2WHaiH3N2M3bcMSV2AnZ8JzJ2rnXcMTV2FXbpdTQZenaBdtouHitXduZo+ErJdVt2ChsHB3Z2cXYLLTp2bHbAH7tHFHY2dgw2XB5LdlR2TySXHF92fnb7S6wZbHaedkM1HHaEdgw2Eit7GFt23AHuLj52T3YndjhLZhdDdvMvS0wmTpl2xXWPNnosLgC1dgQCshtwST92snaXGpoopXbaaYN2mnajSuYZnXZ/KrB2YHajStUiKnakdcgf6hxwdmh290zFdjt21HZndpN2HStHHb527QK4H012wnYcLisBtHZkduF21R+QZqF21nXldtF2rXZAMt51z3a/GxEd8hjGdtsgqHbJdrgi33bodh9rpzfEdfp2xipkJfB2sCB9du12tizLdvd2wSn5drp2tiz8drV2S0zaRtZ2DHYhHaR2S3aDSQt2d3YVd/Z2F3faLtx2GneRKgl3HXfRMbl2HXZ3JkoRHHdsdqof7BiRdS13PS7NJil3dHbsGdF10natAR1pb2qvabF0rCY+VuZAt2pyKJd0yCZ5dagy73YqdtpAjSAld6h1SmghRFJWIXWFdSEpxGl6JBdoZ0YudVB1bSK5aGN1MS0Kab9EqmqkAQVp/kLoabEe+GilN2YuRSUMNgtrTRzkHShrnDd/Ggo4anf6aQMvWndBQ+B0EUdJaVdDYHdtMhNpBE6vGMtpgC1PQ1NocR4oa/t0EhlbaEZBAGqKQ3t3JEx+HSMz9WooJqBqcR62aL03m0P3SrcxcXc3S5kbNTKFHvhp+CmGaYcYz2mLKo539x0oa04JG2mmM3EtvSLrK/UzmncTGakeYnf+QpYC6mpRAgw2zBled9xn5zM0Jh4eWHW0d2AYXSbuap0jogGJGx0CpS3eaUoZeSyZassto3V+IwlrsjE7JuhogR9BaoUmRHURaDVrvSkFINJ3YXXUdyZrwUGQd0pB8mgRaNpqGyXGSBpoNXW+Nbp39mnVLqA37Gjlab93sjetd2EYG2vYakUsQWplKtN382dvGWJpBi5Sd4l25XdtR6cb1WqHLmxqkHQMavlnNDgPaiJpP2h1auMoQHd3OA91vlWXKZQgvWrZSjF1rB5aOMFp70JOdyR1W2qhTU8n+3fdIXl3ihhcQNUtgywceFxA1S4ieGFqanYJa1RqbHccNxx4n0SVd5Z3+y7Nd+Iz6y4heGIt23fKQuF33nc3eFE06jTXKctqDnbnau4toWqcd+kt43fZHpxoAi7Rd4Iy42iNKiwuZyTsMTh1EyIeeBlMwCEveH423WfsMSBoBjPFaBArwRkQLd93WjGjdRx4BhlWeLUto3VUaNl3jkkrARYe2UiBd8ZpwHZTeNtJ3CNeanB4aHVqakEUpHe9N3pqVHW4HxIrDB1Yd6UxmneKHhka2CFadb9ImGm+JgxO/2hCad1oT0OSaM9IcXibacZBzWr8aaU3PXXqKf8ajzaJeAIvwXdPQw0oYxqBd/RosR95ePtMYHirLi41DE5ndxJrjizcLaR4JEBlNaBpM3WyLkZ46EhEeBMd1SI1Mrl4uXiMdgBrZXjSKilpXmlANr54ChsqeMF4GyZ0eKob7XdgGKJIkXhfGClJlWpZTHdDLWsxSL540WdtaqhWOHdJajNr8CCyaRJqlXQ/d3d1mHT5dIZL1SlWeNEc0HgIaP50HWpJRYN1InVPd8VqSEZVdywngnjlaDBNpGknas5qFCDoaLwZDDaPeGh31h1reIQj3CBJGwR5BXkEed0dAXkATGYXBnkMeUcn5CcAJml4CTOueHJ302r/IaBp3yPLad13+UKedwtK53dPK814U2lDNChr4CX3SqMVZXjzKTUB6mqSd0Y2EjMleTFqRjaiHlJoA2sfSzF5gitqdxh5pjOZR+cpOHk4SngeUBt7eOdCfXfxREB5KyfPaAUoEx2HeCdoIHmhTIs36XfzSglMIU1aeAgjS3mRQ1J5ECtYBVAbbGmTSXM2xndaMbsFY3jPKUt5Vxn+eL03NXnKIOt38iWfeOEgtHj2MQlrHgYJeSgnjix4GXN3W3dyeQckjHcPJxF5BhqqeEpBineJJHB5uS2daeYs13dJK3p5LRvKeO1JjRqmdw9prHi/G1p5dRpZdYp4zXeQLSd5ACa2eMMgE3kweEYuHHgTG713FyxEeRlMl3joShwaDXkGeTMhiHlMeTx5Shl8Lqh5mkOtea91NTL5HAQqKnU3d6ZDcGoEeKxWTGqMTU5qHVbPdEJ30hhOeYkKYHnAaiFERkewIsdWFniGdUpHU02RSxE2J3mDLK0tNXgMHwhp5WoMH4B5aSNBeGkgrXkGL615DUYRaVh4qR47eDB4RWkyNC9rIC/kJ+IwbHkZInp5oQFoeaAg+mmjd5V5ana7aedV33mnAZN3wHjdTQRoTx54eYAu+mlVeOgiTHi3aOh46TDwdz0sfUZSR75WxjeEeSwnNGnFIf15qB2deBUiwwMMNp55PSzHaKA36GizdwxOBHqnMrhoR058ebFCDSi2LJd5WAXDec4t4nkDarpHKXq/TOtFk3dWeftMXXfCJZkpwCosLgYeEHqEGbZ3AiMGeldDX3WNI482BmusJ2BoT0O7NI9qF3lOeT9qJ3q5LX1GuyfuefBpZiYYet5I2XkMH/d3niqXedUsACbdeWNNvnh3Jkx6PB6ad156LjQceF9pzRt8NCUfXHq1eQtEOXe4eVgjU1dNavF0YgG+eeN4gyXzAVd6a3e+aep40iSBaq0i7ngYeCJqoU1HKFRNkxhOeVICEyMZakt5/SQRax56r3m3ISx6CSAIeq0gu2kveX8aJHiSeoh6UXewdxJ4ShkGL5d5NiytLfdqLCVBanoku2mdG754o3oteC4eDHr2GJBKfnhzIJl5Kno5HvUBSnrIF3p5KFc/HIZ67hzlC6RpfSpmKTkeAwKzehJFCnpIA5Z590p6ArF4u2kCH0VMhTbFegJ6DBmYJnp5QTagaUF6cmiCeFN1VkLcGKZ6TyuOetchsnpGNpR5QnrXeZxpenk/aqBpPnqVRZp4l3mtekNOenn5eZAYFStkeacyEnpKGaBK6jPAN4x65za5eqJ3r3qwevV6lHohawIja3hvdQ1EqiYPajVrdHXndOB4RGsLeNl040IoadNqPx2oeUpoxgEtatBVAHUCeLd5cXUFe3wEtmocVhZXcQCRAQYBv0MIdeUX/xu3GgMB51O2YWZrtDgMeEhN6hzQGAkh52r4Hqp5MlbKQ/UrjmmPdGBr7FbaeDp3wijHMxx7QVaIAR97kyJuACJ7xFUle0wBsHR0F8VUile4YTQxDXspAQAC2XlQIdV49EddLHh6T03vVYB1DGjteGgAMQDveE9omjWRS4R3mGlOesYd8mdPJNVpNHoPaY561mqeBFxpbHsJHzp5SXjDePUa23raaZBATQKoeldMz3ffJoZ54Rj7d6kuWnqzeANp8mplMrx6gjKiauopWFkdHn57Nmq9HgdqSXoaa54ugnv0KpBqHHmrLs8BH3Yze1UqpngfeJYllHv/KUV1oyXPeV1FEC1HdV4hcHu4IxV552pcQJt7XzfVLRYednvpHPt6ZRmjeqI3tHvWal1q6mqXe557Cy2ke0cmonsTIpd5kHrII5d5QCTMHjp1rHufewVo+GlIGaI3l3oxG04Jv3umKLh7jCDdeiMvkGq/eo4kGWl1NOQjB2rVd74Zc0dqavJ6azRSRmJ5sCAtaoBpFnpqNVlE+mg6MNsgqHmAaZhAkkCwe4oaoHubGuF6+QFcaXl7kntfGmpqunvoIq57sHqHeYB7qWp6e48tIHmAabJ4zSkJfL0h53tGRNt6vSEJa+cYEC3FeF55jWjGeHYiamoONgV82R+XeaYuEXxKLhkaZGpqGWpq93mXG88rPHovREt5TjEHaoZ34XuoGDJ4uCEEa78wCnqmLvl7amoDM917Yh4OeldM1XveGU55ZBmpe5NKbnYceC9H13gyT9dVMms8ezRrPHdAVvpVuxruQr9DCnsWakBF5HuCR7QBIHlKd9BVTHcWeF57fnqFaqk1pWloLlR7iSTQKtN67COOe5gfU3rjLyN4qhyQe1F48x0ffJ8Y33lJeRd8qnp2eVJCS3m1JQd8wyA4ehJp3WrLd7wftHuwS111YzeEfHN5ZXtSNPd7SUMfdp8z3UHae19FhXt/MR55yCOye3UaGnlCNwJ8JTibGiF8PTcffBYB4XrkJ318oC0Mei56jiSQMxAtmnptRPR3iCXKaoh36TAdeq94bUfyeaEjiHwhQrV85SqGeW8b33lmdT5pnnzWHGp57WiGfNgu/2ouAnt8Uif/aYR8xR8peI98Cy+PefspP2qfe6R8ewIMIzdC7DGVfH5oUS5XGJ1MVnvLLWUZEWknRp8a6nmyeqJpPnm3HYZ5xDe5fDB7H3wuK9Z8mXtoLZl8lEeReQkranxTHwdqPCYMI9NIpHzXGMB8zRwYfFI17CQjJB98hhyKfAB6Jis/dR8amHcgSX98uHfhKoJ8oCEffO1V/iomeuEq9XvvRmx8zxsXfa0egkoMJFAe1nztegZpAwLIfKAhQXxbJut8ukcHaid9nUzyfK94zAHjLP16x3cjeq0fhnn0C+p5xxlZeKFqD3zjLzd9lXgZTHh4KH1OJ81q63vKQglpDTIDAp96l3yiHSR9wXzNas16RX0ZaOwjt2AQLSd1WjEmeegi0nkJLwhpT32ce1x9MHilQFxpSngjR4Z5yDW5aHgegyTqebUv6yxDenwqMnojLxB9WXagfEswXjSTeUJ5xieLH0ZpqXwdHspq1GhBdtN7tyDnfNIec3yTfOQ0rC0WaANpkXxlMlF9fCoXaRFoG31uMZB7XHhkM2Ibf32weGRG93u5K9F5O31lMXR7vB9BfGh8xHfMfP9qi3sxGzN5p3jwejh4YDFzQm58OBsffPl41hymfQZpnXt2GCR4t3wbQglq3iOvfOBojHZTHKR8P2kwfKwxzXdEfWwYk0GbfU91J3iuKP97cH0JIap9oiTheqt3+Rq8e/0yK0R9fCtryCPTakZ5+xhcQO4zm0Cqekh95hj4aY18Z0YdfIck90pQQ/175X1mJlBIBjOXaV0li30Fept9tBjrKvBoXSWEfXYYD0eqasN9MHihaAUfy3wrI+N6snxWRQt8/hj+fCEYtn3tM519vkCgezN94R6SeshpjWrmfQ9+/nt9fDN8sRite3571Wpxewd+fzbrKhV+AkbheuwkvmrBe54erXnGMMp75x1rN4x6AnvPZzMobnq7eXB6VGvOMlN8eHVzehMpTi4kHbcYfnXFdFItxlZ8el17X3v9QCh+0SnNaVky+mnze8B9eCtlfAgtRnxZKWs352pfM2x7mDeteVMe8HzpHFdpLXzuHGJ95XtqGUp9/hjVaXJ790Lce/cv+3liRbloWX07MZBA+n2weqN86H1TKRl9X3ltfhAeAH4Ffugexn3VaukEqiW+fR5rqiVRLgF+WBgKfF1+xhmQagN+gR8nftIer3xMfdgyhnmTGcB6j2h5fXd6+i65N759An1ANQlrMhtBfU4Jln5VfeQ01TX7e9t5FiSBfvVBIH1zfJ1pOEaBfAx6syvdQVF65Uahfn19KzX/eyF6UTSXLKR8PRlBfbN+qHxsfZhH93uDMnRoHn6yfeciGCIIA759L3zTMRZ8qy6rZxFp1S6Tfp9+nh6gefFACS8gfr584xvMfiA0YXoVL8R8ICyhftx9ey9oaOopFnl3IZp++GlgGpV9Dke2fgt94CTPfah9hy/SfGopE3xgfoV99H0UaeF6/TMEKrh76nt+e4p8PxrXKXd+XSRSaFd+YiR9fK99rTDoaJR+lnx/fet9SH6gIEh6vn7ud3ok6GgcfHF+2HnmfdZ9gC5IevZ9DX/rIV1+UgLue6B7s0jue3p52gFBfTl4U3nNey19mCh7QjJqOCMZfWp9QkZ/fd968yLWel0oTnhPMupqFHwzRg9/9nzNHPR8XSVHfsYnOTVmJrsFpSEqfRJ+rigffPx7/nrxePFpKnzKQg59sym/fT5/OnyYeL54eH4fGu978GcHfQgjSHgzaGgYG35vVSl/GH1BdSR8oCEgf41932lOeZloRGobft9+pX0ZfWtD+mjPH+IwaGp+fXdF835efbB6RCFff5ZpG36ZfoR7XX7xeegiZ30SGWAxeiR7f1d8V0cZfUB9AXz0eR19NHx9MepqnX4RfywniH8mf199737Xeox/W3/cJNNqTX+Nf5Ynm33ABVUuG35Yf0I3MX18RSF9GH/oH9B6g3+2GdB6kH6KGM5p8HnSfct4qySgey4krS1defAwWHpzIG93yHdfGmd/m3yuQq4fJB3vfZN9dn8lOI18cnYkHdl9mX/8Hi5/F3+zfysjhHrGf5BJJXgEIgVqxH9YfA18SkKwd9l89iFdf9J72SAlfsId4XoweqcyHn88GRp/fn54TQ8fl3lZROR9mjWYLMt/r3/WGEp+7xjpe24uY3rgfe9/5iXBHD98Cn35fzkc6mgsCFcijzb1eG8YU35pekp8cHUEe3NW3XhUVwt1+SC+Q3J6LHvLTmUgS38nf2FCOn55el8fYyLseGEioU5ffId1zHmJdVECuhuXfXwuRVfMfbB5hjQwe1ApGy5uLq919gHwGRtr8yxhG91qvgwPOIYfhAJcQF9XNys6Qmgaz3iRCBo04EXIS9ZqZRlzeXNqdCTFSpB5L3egIM5MCxvbRzYhhjYLGymAhiA5Q5N4gGn8HWN5w3buIsU3ZTVfM3spNnjIaCtAsyoGK+80v3jnSKYobkOJSW4wkX3WauAEZnooTNUqcIDdaoIc1CFESs0pDk1YQCt2jC9fMwkmVxkUfz4pVAPnJyyARDbHQlIwTYDNHIUZgIB8MeojxkMLG1yAKkGvdQkm3iODgEZEUYC6RJaAhXlXJMwBVxnPAXEyK3arep97z3iYLqOAwi1qRhlNBhpnMMUfS4AVLylMEB6pgOsp2SF2IoUyxhnpBLd/U4CNIJItQjBtacgwtnTMLZItUUAbQq+AUyKHgEomnxgDHlOA0SI7LwMCKUl5AgIxBDAhRnNHV4AhRvpo1xhRLgECmIDPTM82FipmgCl92IBHBDwhrh81aZEueRmDJJYweCtXgF1qc0degAJFCiSGH+UZsB2hgDKA20HpMshLXIAOCn1+tw8GRH0e6UHagJcc8ICFLekZ5RlIgHOAnkSXGbMuy0UEMF8Zy0U9gFCAEDKYVeEgjYAHK7MuuhtJgApAV4ChLW4uxoBkGdYB3hn5KscxxkU6GRkvHUn2gEIwQHySQlguW0oOgSIZmBg7gI9qaRyldXqAYRzAeRaBaRyQezlOEGq1gD826karLXstowJ4gNAZ1mqHaClJ6DWeLg6B4hyjLnsa0hhqRtIqdgL+aE+AxzOAadB8tyD+SJhqXoD6GvJ73IDDAYmAiDEba4lHuCN8gIQvJCk0gFyARxhQKftGhnaTgIWAXhmtgJxpF4GTGAQwczNxJ0GBkIAYa7+AUEOYGHyAKwTWRjopE4FyKmoeFi4rfvVVzBqtVm96CHjtQjJ+E4AMewRPQEXWA8FVXiiPSDt+cSNZah+AP35gfFB3KBv9gHUa2oDzTL8r1BlUJOiAex5CG7pWGjTPNnpNeoHRQHCBB0Y5HD+At4BMI96ADSPaQIdo3yaUHrF5ijaIJxYdUBvWLHCBBmpFJc8rOUMFKjB9sTWRH2QpwyvVKfUaah47gIkrBWgrMgwdrEZTHBsg1xixNcEZEHkDGa0uoGnqMHBo9Ho5Q7gBsYFNGZqA4UUVK8c3nR3AMzJN/yaeHdwtzkyBM4krKC3LgawquXpcgPQruXrpTOJNxIF4H4gnfR+DgVdWUlc/e1B8iYG0Q4uBTnuNgYZL2iiUHhE2YBz1QHt6XHshgMt5JXWhTdoYTx5OMdwoCYFoNW0nOhk8GVQ274EAI6mADC8ESEBArh90GZJCtxgafggZkxWggd0aL4CBHuBFflYkeGoemEqAJMYwMILYGteBoQJNGFUnDzheSXMnOYJtTEKAqEjBVesvDCbcKFaBqTWzSDlox3Q6e0t8bHqsJvdVB3sDdToiEoAKeFV8hksOCl9qoh5/NEFrbwBjAGUAEyFGa4k4lFUrJY04KyVMa0ggHU8wAVBrc1eWOHVXeBUkT1ZrKE97V2YBFVZca7tU31MwT0h8c1UZF8FUhlcoe2VrTHtna7lhHDnOCLZwpW+ZDoVxQDm0PW0Tb2tzazc58XHKCNVdj24xERU+JBLLE7humQmaXAdtyDyNDP9iunLKCE1wmT1bcwAOhoJgCZ6CqBM9cB8SOG0mcmxrIDm0cZBrC3NVYutuhBMHc0cW5xP0bwMT5jqcc6wS5GOQOvFrlYIyB5ZuenCFc61z/GbxYhx0Qw+lFAhwCA0jcGZtYW5Lcvxu6m8LdN1kIW8sFW9wV3KMZ3xluz4pEPtyGQz3cSp0vmS0Ea9tjWcCEktxx3P8Cb1inWVkPqI+u2x6EYxvEWNvblJwjXJsc4g51IJxCdA5LzzxPJIU8D6YbeGC9G3/DWJy4XB5Yy88eXIWYis9FXT0YQpilDz/c2I6rHJPWadkpW3/bWpxP3RTPmVnjHHhDwk75II1bII8Tm2Ja10LOHRtFCIPVjzHZvUSsgsCg6NwvGsID4NwlmMGbGxxJWX8cSKDXBNYYxsK3GPzgpIW0xJ+cj9jcG63ZKlmBYOoElU+VT8bcY4NNoPfZURjVD+YbeI7KGTkcJWCHnCobJ0OIXK0c8Q8w4IFbStspWK2ZQ5lXQuScnM7koLzY6wUg3IqdFeDIIMMbs88Lwo7gyNxZTzscQNyhRDEDitu0xS9bDNvbmUwdNtr+mRjDEI6LzyGZCp082N/Yj0VAHHfbCODP4NpcXtwonKMDl6Dh2IkcfRwgXQ2cMQK+2xsg5Q9dWsPOuVlW2KvPxVybG1/g3F0WBVVcEGDQzwVbRyDthCXg45mj4P4cGMM4nIHY01ugTregoQ+F2Oua+1cRWctEoZnOYN3ZFRmPIPDZrNzanLDcjkOE3IpFalmJIN4g6xmSBQtC7mDvYOkckQTgoPFaxaDv3HsYZRzchNdcWAQ3QvagnKDkIOTgySDOm3aa+0SJIOjb98RgnGMcRVziA5jcVWDyxPCgwY9y4LBbs9zI2M3ZvkQioN/Esxszg7obJQ9Tm+rgz9znoOybM+DP4MOPHFkl4Pegys912xIYq5mwA5acix0nIN4E3IU5jshDGVkmWQWDb07O3P5gzoVSHJwbJqDqj/RPTZyCITZPheDEnOxZD6DeoPbZClz1m4hcU88nXLoZPARZRI2DJ06PYN8gxaEjj+QZC0SRWMccikQHYNOYg9swYJnOSp0Y4NVEFtyrnLOcEI96jySbTtm42IvZEZkWTpuEpVxOm/icjtyQ2eyY0V0xoOVPqpxmXF9g99yp2RzdPllID8EZfyDDnTtcCxkwGSlbR6EBoOlDhs/ODwgY/aDFnO1g6dwN3C6gzF00HJLPNBhFg9cg645aIQShEtxB3OAPWyE+Wsfg588rDonEXY/S2bzDPIS5HIQhKQUNm2dg6gSWoMwhP2DfIT9g0mEAHEbdItw3RFig4GE3IMnO65vozvNPCRsWYRwYyB0qzvqZe+DLGQAYqcNNxItCyuEChNMdG07mYQ6cMWDr3MwbWBxQoQvY6hljoSJZfqCF4RThGVmjWBPOveCroM0b5aEZWaaZV+EhYSSg1+DOm8BPyMUu4MZYgs6yTqnO5WEb4PTg2CELAuthC87r4S4bSSDIGMBP6wUSTs2baWDnGM/hE1xJIMfOzCDEGy9Ygw9y2vfg55xSWcfdBYN5XInZV2DGYSggxN0JWUrcaNwNm+LZwt08YO4hGI+jINWgwpyThT9cq8723GtP2Z0gRCMZnY/nmJ5hM2DDnTuhAAKWWSZg8sTUIR+cyUQLw9HcxBsaj3rPPJzIREEdF0//oLxclw+ZoNeZ1o/3Q4WcitnETzcbG1winIuchaFlGTXc7M/tGUFc3pw6XFbdPQS/4OTgyuE0YT7ORc/R2Svg3RzXmLghPsSFINuZ3OEs3HVcvlyh3MFEe5ypm5zczKEInSeZbhv9W9dPLs74oIxhZJxDIS/OvITyINVEJk/mhTGbhQ8Tz+yg45lhD1AhUJzd3M9hUKFZD5ob+aEm2bpY5ZwSoRfPIGDCmYbYkuFlWWpZk6F2WtJcs6DWIT1EDpmAT/Pa10/OoUUPICDcITPZTRztIRGD7BsU3OZb9I6GQwkg/GEyxMPgyOEAoX6Ybs9joNyhDhyDGRpcFZuehNBczuFdYW5EJOF/RDNcHlyHmOvE/M62jpVOjSFNztKhZSCOXNrhIg/NoVFPRSEj2bTcvxsZWYiZvw6yDmwZaEP+W99YhJzZHOqhXyFR3GRcVmFlYXICbk/KGa+cGiFG4V5Y0l0LHSHhOw6fWRuhQpx84SSb+1vq2/Bb1B0R4TIgk2F3HG6hacMNG0AFPKCKRSRhXaFfHJiPrBxjIJOg7gLvoMshACFbYQYY9A8IXF/hNaFS290a9RvD2bVZtxxZGZGD8VvWIXUD0SFaAzuchyEJ2xahcqFfoVCcx885IS7ZrFzk4RVEKg8i4UqhXg/rWxUbKNssWPrcO+FtYUoOsSF6nCPYriF9mV6hYODtIXeAgOELAz6PhkM2joDPbli9hJjhfk6Bj3ugr4NroXphc9wuW7HYtmFcBK+hNeFX4UoY75yd4XYZDVsZ2ynZN87G2dXPYlxf3QXbzSEpGMZYlplLWePc/dwv4RZDpxyRzrEbLYQiYRJEmWF9mv8hTuFPoWjDg6FCmxiPhxuwXNpESNnHXPThKpvl4TQY1SEXG5COt2Flm0oP0tws4PJYYZxzXD1hbluKIPrbmSGrYK9hWWGkII7ZREU24UjY8NzhT9ubpdyzGUEP5MTgoUqdNsSyQUIg4QSzW3xZLuFBXIJBppnjXPfb8MQ5YS0Etpik3LrbBVwDGPoc4dkDzz/g8iENoSoYoRv4xOhcQVmeGyPhkUTUoVUbCZkKoN9Aj8Tl2faBbFr9g+zZASEAmxOFDBugBOEEtiC4ju7PmdzPXGGhoRbozqicayChDwtD/qDf3OSgoJrLGQ+Y8dse21wc/I6FYUjhT5xnQ0wc5E/anD8c2Ny/zudEMhwsIZrO41rwhCvhmVsrIafhTiE3mMahZcUnW7VbhF0yYOZck4UODwFZEATX2+xhp5rW4R+hvGCtYT7bM49zRHqg4QSYW+oa+tz6Tz7ZU1laz2Eg9IMvW2ShlFspWwudECG/XFFcJyFn4YbBN9lAGESdEmFxG5mcppy6DrSDKOGz264WTo8ZmKYZqeEkIPlchCHuAzXZUFlooR2PM1kOoTHhbk8OIXZYpqGYobnE+aDazvEZouEN3MucwWG1xCHZFSFmW6ybksZnoKpgt6FcIZRbLhmcWy6a91jjIZ/cZhk2jxFbSFw02yvCcBsQoPDhvhzIXHxYx9k5IbKhQxmSVpKPeCDSocqc2SD63HgckoQHnIHhXY7+W2eayU9xGu8cZBl7YZHZ2pxTzxcFIRtj3MaOmGH1nLchFmFw4Rnhag6vT1zhTN0exbDbVWFG4MKgy50bIf2ZeBwjnNOZ7s8onO9Pdpvu4acgqwSu2sJgyc792SUhkuHHYXwghhm7YYvZniHjRNxhgsIlwipgskDc2WLgoFljIdWh6qDBW2ehSEJTXSIb89tNWyWBciGDYRpdMqGqYfPhv+CtHKMZgllAIQZYo48mINHg8I/JYWTcGRjDXOOh8tuDoZlEfg8oYfha42FOoZDZwsU1hMbP30//nIcc2hzzBY7ch9xzIRbPYRvJXAHhBR0axEWZ9RwZwnOOTUVcXCqhxpw9IKSZ9Zx528ldFOGdWPOcg6H9IQlO7I7ZnPtc61ldmLvblM87DnyhpSD3Yd3Z9MQs2xBhpOD8IU2hMdwDoVNhBlwQ16cPA9zsocsZMdwVG5LFDET+YZPh08StGXJbApv+2zkE7dyymb9cCUSvT3DOoNxjobZhGSEzIKSb9MTg4IQELhmYTuHg0ANF4gudK0/AojgOemG1YZWcL8T123og+WDXj/7cDOFqIRTPLdz6oaohT5m0oROhAM9ThNVhJJjpHO8h7RlkwykPheDy2NKU7xumBS9hKNl+GsZcSxiOYeRggwT8DxEZZpiqIesDRtzsDuQPOeHkm+nbsaGAFlOZUJ0pGJ/P9RxWYeTOVmIpm7LbxOHmBIhcMyGa3AvFOqCzoLgh9WCrof2PnY/jxQic05uJHJHdKM8hYeFDqxrGXGwcPAUwWv0YUdzxYaDa9SGDWMAYuuEKhDdhio/QmezhlwR12XGh3GDuG1zg+GG5oXfYwRlSWMJPJRlxWMLOimIDWOHZAuDvj0th4xurIM5Y5BskmK1Yp89gDvVh3CFshFrhfZlEIdxEJiIq26ecyeElXN5a06INoeqc04/q4iNhjsT+YeIZLByF2N2P0mIYjpEEuxv/obMOG1zIXFcYq9vBRSsiESGW4bCiMuDmG9shXWHtXDdZsFf6IJ+bRdzS4YxiB9laz7FYQ0+RIjCbnA/XYUudDtjInB6bw4/soLcPqZxswothuqFuYhsWbJzGoaFOS6EsIUlOu6HST1+ZftvuXDRX/CHOG95ZJmHOjrPiNZi6YfJg9k8PYY4cCSEOWP4ZNCIwoadbU50XW/BiC87m2yAhX5l2jrHbeBreIOWYzIH82WCcwyGZIW6OwSGw4e5PwM9gnPzYt499AwbhAODJHMhZiiJHj32cr6HzBHmczVs02I1bOQMcRB1g8pyI4kVh3aILINkbneHM4PzPUkVIIlfc9SE3A/ViPZlBWNFDUQS1W1tEtITz2XBhMdiDIXzcpRzg4iqcMgQY4hrgyETR4kIhpaFx1rrPPeGeT7JclqJXYg6PM1kU4m9iOeIi4iacuyGw3DAbzpkZRM/hzJmNoYvYySDAz3jhMNwBGXHcF6JV2Yxh0hzjBAMZwB0nof9hSKIIRI2iVKJdYnqY4qJNW4RY5gUHmcZdHeGfGUXh+RwmT5YXwZxhGfSgtyHrYd/EHx0rIfhhwVnARXQhp6JdGw2EXuG+XM5hHM7j4JTYhxlZnTfDsNkI2PGh/VzSYkjYtZk+2Z5iM0P8HAphMVjlIbjc0lkdREdiYSGcwJ/iDmD7A19P6CIzTqoc0s5L4dxhyc7BTrbcYOGNnOMbuduxGSBhnVzajxxbR09E28XdMthcgPScQwTEHPabBMQH2yoCDiHZzveiX9zugikgr5seGQKhJiCRm8/bXJxvYaugn+FGHONgkQ5bjtWOalzeTv0DLRvl3MWbZ9uz2XiZmAOQWMXg1ps3mGSc5A7hBHwhplsMWduiLGJXXTYc9w7XQzfPVIPIoXcPY6FnYmOcVWIWofUc7aGR2NGUN1k1BHpcDeGwXMxE1WGtoaKcRSFpYVfbb4U8jwhht1kdmdvCdKCC4YMbKeGV2PzEEQSy2RwiN+H13HpPNiCPorbOdaCwj9vbpJiJmb5bGuIpomAZ390LgiDb3h0Toq4hu5rGYUgbgQ+BWbEh1eGUob9ETEAtFRqFUQBbRWuYXWCX2tOVy0iYms2TxY5S3vMGotXPBftUy8CNQnZDiCFlxU1P80W/BbeFvgWmxb4FvsW3Dt1Fl1fsRWfOzwWIBbJgrwDbFmGFlcWJVhDFsxXUQMRDRoSh4rWFa1cgQtjFvMCUocQFicG4BWtBPMLyoiFCBdvWxZ8CbtPoBazCfo4HwnTCcgEoIrWZqaKsxatcpWKeIqUFpESUQoOPHQMl4qAYKuKrYoMOyI6nVp9c2gWYRaqit4PoQrEFqKHPQOdPYsW1RlYFmllURaTiraKgYpHCXM+3RX4Fm8SAwRxhDIEhYqyAf1a9WYJVfEWmwqYFtmK4Rb9FiOF9xbxFnwJJmCbilUF72LCislXhRbMV0QC1YpVFumKuwiGioAW7ortijEW54rHXGANw4qRCIoMDltMC5mKZwr7ioGKv4o4FnGKdorNivoWtYr8WAKLzoriFuCK4BZ+im8W4Bb2FpaK/Yrkij8W8YrJC0QWJhJeWc0V8YpAWFgOkQn3ijgW6gvaChkJgYqQEEuECwonZ24WGlwIiwqLdBZOFulY2Q64iiOLGovOEEQWyIqza8eKsj27OvsD5oo0i7MEL4t9EJsVDDsLECBi0YpaBNOKEwmvPWgWy4pnCpgVQ4sSi0KLFIsTCfqKTlEziyGLT4svZf+KKw4LEgIKkF7uDdsWCRbeh9qKLIvXFvsWqQ0RBJIW34oti8kW2IoPi2yL3Ypmiz6LDDvsihyLrVwfi7RX0hX0io+KdIt6i4cW6Io9WHeL9ortio+Kf4s4WBENjAvvMoN0oGfWTuJnGXXBdOVnXhccdWMXnSbLMTh7ZYqzZ5N0MH5aglyCrRfrTr1nvGeadDoi8E5jADgA8U5hACN7+iDGZ6Z033jJKE8AW4ITIaeLzmeEgdpC1FZfIUAaERwOHAY5ZhfaHedCFgGGGWsWEiPgZ4uLh3TsF4l0a1WQi+dnk4HfVdJVnDSDasRqYHuBGg97xmlOHaB8zXs7f38xRH+WaX575WjeIxl9+miyf89+jSd/aaMusHfNe4J5jjfxGLp46YtFftNqk3oZfNp82RgKGemLunhZMrN96VV2fJx+ZH7UQwx6x3yYLOp/fjYRGuZ9NyVfLX93YHURabZ6y2m4f/1pRXodNOR834sgR25EPiPseReAMHhULLB35nkASnV35n8xf9tJdXphf5BqVIEpeVY0nXo/eAknIH+xfl99an7Hf9aL5DQMaSUnA2nlf982pX75NAggBUMbjJtp/ncOMyR53nr+d9YeuUmgdyof2H5kGYB4Kh9/fEc2+XexHmB6F4z6Mwx6mionaid85yn1i+CLfSykaWMDI4xMjNx8AiMnjOt/p2kgf618ZBnPf1KMq375JQN+p3y9InZpbCNFjME06mrOfs54kRvefIclTli9dvKLNTIbICkn5n3+i65CuyoAfkGM/ItojFp1AoxdJSmMeYxrJOZ9xn6lNzaMzniRHUyMgoxoJRMlXmrXSvJ4gIydf24sR4ybHiw40HkJgA9Xa3oZe3NWLn4aVrx5Fleai6+LQnfWA1JpHi1XasmLYgELaG1WzYuNSkF+TzeSehl+nyQ1f1qMO2oxe/xC+Wo8jAyMTnVwfxIZ8GqCG1lpInhUjE6M6nlCjPJ4x3uEI0FqVhx8e0MmPXzcdLh9+4ERV018/oGVVrAXrotwHRSA23SiTRl9ACv9dFh7a1aBdU5or4wHKx5rnR3qaDCMf36dHfhpGYy5GMFVK4yWS3d3LCfqeQ42iCdPjG01T38MGTYpPHWJe6t5oxjVaeaLekeSJCV5inpFffyM+Yx3HghpvYwZHux+ukElehOMW4yiTW93CX0kfqR6E42tNKR6tYyuQnQ28B0MehuNsTMdjQ6MIXlYInRoC4wqH+uMSoxIN+yMUTSuTYgnAn+mKPGMkydraCN9mCwqjTB4MWqFjNh+ITN9freBziCEfrwYMo2rfLkYIxp/fGcwfX4JjP0yihx5fRmN8SbDdweNKXXqeYML2IDiaSY01Wo5Qsl+P4yXd9h+GYA/HMgf74xIjfeLBmnyATd9Wn5CjT5pY413eAx/HIxpddAtJX8ffKU0RGlifv2MOjLNe355KXWqetlpUTKEe0FqNDJ/fE0DfH2qegqNISbhfW+MAWnojBCNq2rmLAVqYIw5aT+NnUB7jQiB84yxfaF5hI2WS1GM9mlxfIofGX1zeAggiRnXaZBAD41WGHkc24vRjEpqcU5OfBtWQHvqF9eMU4JDKNAb3nR1H7WM+BlxQU1oWmp/ep+Nl3nge74ZjBwZfWJ/mY0venh78HnVadV58kfIfe95mCzYi3Qkc3zMjDAhG3yyjJwlD3vIjScZdY3EjUh/nh54jHYuy42zRxN8VXqzR+l7qh8Ya4iMeElUaSN+ex4AjZ0g3I0OHJYXpozaLgVq9B3QahRrNY0DfIuN/HeBHoaM7nd4LeJ+840TGwyNYRygeldMzo15GpKMqy76jVppBo2veJdLCy/TjS9Df3wGNf9qG3+Yeu9q4X3xjZx8Xn//LviMr3h+ja0tBIxDG398czMOjpKN20mhaah8v4yjHG6NcY1kM4NFeX0UddwkQEwQjJwlNnxlfaI2Z3vrKYN+fX4GjrJ+t4w6Gup50n6PLepojIw8G+19+i6ne4p7+o2rJIN91Wk8jn8284wbjuVpHY5UgcaMlxtfadVq0xv4aeZ6SibojWIhOY4bQo+M6kYwjh+MNnw9f+V7pI3beCFpnow/VqiN/4HWjJuLrI02fkuN2RjEfuF0qYwiRD1+tY1hfM4tv3/SeniOo0rxfVOO90yqaiV+NoCLfoF9ISV0eVUqLgKKfNd78WiJftZJlYxKjmtoVHl4Lf59NTQ0jNcgxYzTf0ZMK44BItcpuY1QToMec4w1Mh9rq3/DN56On47kK20pdH4WQ0EYpY6mjn82TIyjdXKMn463dq15mkO4eywbAo4WTEyOhTGZjHJLm4wMgCwgXSs1fiA0Vo6JR31MR0UdgBwcdY6ZgT03amqcee8BqySajYV6Pi6VfZiNoycJa4Z/An7WjrWOaiLdamCNz01ujnEuGo52fup+MHgTKKN9444QjdV88XzVeN4j+HyzjnN/7CMgjttJBGmOJL2NdCR3eFdpzhsSdbEZMXu2e5WOHUjmVRt87o4Zf399inxgfc1FEC1hjiRAJIx3QZt9ywETI3p5Fo15HX18CH/3L9V/EkbrKmuNDzEAeDl7Hmk7e0uCwigqKNmMqE67N5gsjXjpeN+MehVUF34BeQBBAXMAOFfJjvB49yMAgDVEbUtnGpJ9cDRBIwwjIX6jGKNMTX7DRsB6LAJ/fYF6tyHxfWYubSAbfoJG0Xnjeq5/JTc9G+Z9BX+wffF9KI1Nj3COvkJTj89NgX8YKYuOGSInanc253k6dTePPHhBjntqdI1nf/yNNiHGe5Z//TIjf1MsWHl/IJt99XnCTdNqH3rnKzZ60TdMjDqMZWiKfA0kazeCjCh5ywEpgtR+QoLoaH9/5yvAf6RM4XotG2d/3X4oTkeN3Gdhj5p5jY1ZjFuPJUtIelWPQUNDjlpA4Y1CHSYbNX8hjZyPSY5nG5p4Rn4Lj6JL7X+lj5korHtGHRZpyHgkTegiwXn4jqgYrGnDK7GPY45MfMgsp42gjDoiKo8gHC2Ppk7BjumNeI1jGFR5W3xwK5WBw2qujIJ6zYE9j0BCJXnEjyJ8MGoIj7V6BY+7BeQdzI8wIW93837fjgwfUX6Me+pqwH4gL5t+7Ebpfht+UI8JIWR3Ph2Cj7pHb35pjZtpFWlVdZ1MmY8nS+R8c33LaWePYiGnf8t43R6SjmEc145rfqiPo2isJ0aPKBvnfkIZ3Y8oG1iN12rXjyA0CZCUjSU3sAMqedF+u2nyd3xp+mm4e65CMRj/aviObkiQexdozSeHe+kzAo8Odq2PtHr/joYgw3hDfvIpu45gTB6PnIxjTCNpiIFqjqOMwI/vGAOAWo/Fj+t4yI6tjIh18GcRK/J38IuceXJDTnmoatAiknqJj8MB5Y/8jr8biX1WTuuOeRsOkOlVe4+mL5N3iY+hfGs3fY55G+CPhyXYf79EnSX3Skh9pxtejelVUJCSeE6PWDRVkBSPWkCZjg0gWpACRpR/EI1IQmYmg469KWSMRY4GLhZ/RYwNjnYs4H8zQ/mLnzBBjD8qazdrkAwuoHsCKkY2ux0tOASNFUOMfk4kSH0da5t9USHAegUwenkdMk51vH6sJyZVZnfyf+dC6R99aoYsSI9cgft3oBugkN1/QyQAfsiMcjdvfk8nrGpVftRDbZD+Qs4CXUWXj3CQyH5YNF6MJUzkNgUqZnc/apEdPn2SePA0hYznjnmMDEpCjx8wzWgMLu1/Dy6ikIQjbIwheUMue3XAd29+Gy6ekOYtanv3QmYcx5DjL0Z+FSDUkFNJD3tGfRcsfUaYLP4k5niRG0GN3zYpjm0ujx3WkAJGlhcsevMpr3eYkDN/PCV+j/YcYHp2jyocA5BoLF1+eXv3eKV/QSd5aDQmfUYTjySO2pATjwmP9kT4kLpHro7XjaMh/pANj9t+4ZDnkKxMgYAGkSwtZXUgkGqQYHq+kOCLy33jL055zZCpeeyQBmn1LEd5Sib1kMFIJpAnkXd4qneHj3wkMU02JSaPECucjtI2eH/hKrGP9zYEfcqMrhsEfXuPKkHmjihrIS+kfIRMvSJ6kBFoPI3cNTl8SpDXNYF+cilWdbB87HvRjgkl6I+De65MQXz6jUIdbn2oKnuPn4+nGqWQTySQjtsgTpDjIgaAkHkbj5aL2XhKgi6QkSKGgS9+MZCijNiMjIF8VkktQoDkNht9CoKTAYJqyI88kCNqs5BXGFApI5H9Mq+QtH36IWORByKFkGl7SI/1j/cvVJHIF3R+nSawdxeOTEDti5InfJAjQUh6ho1+NhR8kR3VaTKR5n9VLv97VS4TfI99qU5DkYOQnBx+e3Z9KI6kYNsgpnwokZh8onxRf4gtb5CakbKRbUTdjvKOrZAaMuqPGSKMfDl/KTRXMNh+uJBXGUyQhX1+kLcg9oyRaZaREmtjjyU3MAJDkc58gjJlfxArm5D9aTeO7WmZe1sYRn/4aV5JI3w4ke9GCWvXkeSOCo6pHSKQUx+ajfiO1nyfj7obZXqRLvaNZWn/kIV9Vo73gFB5Uhz5j+CLm43ReGY3zXfEe5cxxn3+jxCN3Bf/aj+OwyOjfROREI3egeR+YoyBGuKOdH7vARt+k3hAj5aNIXntI1uPznl1afl7Z34NNguQTUddf+F9vJB6J0GQrSBdfr1/jCTljzuRrnp/fdmRanZdfoqQV0cNj9ORz0Ltjw+MxZHOkQiRFJFbj7Z/FR2QavqNoCWYfjeSd39SkXxHe3/ij9N9m3ifJkWS20nTkMIlJZEDJDd+3RpNkkpLTY0Kj65+rH5/fcxo2SCNkZ8oO44wjfKPsn4DfvlFwHouAoR6h48cJCaMAoBMj10ojXlgSiB/Onp5LiCM85DgLA97DH6aIG9+oH3PQvGOIEfrGGtoyBVBddN/No8Rkekz4pH/i+h5Kx2nkbZNXX9gkC8aZ34OIGKSiY6SJ3OQoSIrf/F+nH7ffaMYDX0ukrB6qSuYfj2S9x2ofs2RKydsj5RHJ46xQvePwyibf16PjUSjdX4eDX02kG0y5HzCkAU1HpGRIWp/n4/eI11+b431Q2d/qI9yRyV5sZI2j46P4Iv+IyJ/bpJNJxUn/mige1ONW0mLf4aRDJJ9fMGSm2klanYsz4/eHAlrX5H6juyNFmnNdy6NvZHYgAWP1ZFlaWN7AEoTkhMb5pFojwGMzZJ5GO1/1JKaIJt9aZJrj5mSJTj1jk0hC3/kfECSJTj0jD4jD3+kkc9MSHr8kmgZNI2IjhaPVETjLKyRKBjxkq5CXRxCj5GSEY3PkveSCZNJklKMD5NgL4GNQIC2fpaSYCfYfpEInXp2kHAvJ2qUkg+QBZA/GPyS/APGe7SRGo0ckQ+MHZMgNK6SXYBBfW0cj38Rj0Q2wXkykw2TwiWLkT5/EZMgR8d8jpL/eeKS8H4+k5Bqg5EGRbppQI9WjrYCiH1zj2qP8o4ukeckaX2ekbFCK5LzHfR5MowxI3t/75I3jJSRgzMlkkUxAX/6kE4le39fk/Yh6GgmArlo8ZGhkjiTKI6kkmJHuX5kMxIrFDTYfiCThJEdNOF6NJHEfRZHL5PVewFL4XwnaneSTH+IerodvJFrkzhogZPYaSiQTUErkMxWZI5/F7VqMJAQgG0dcJFsjjSCkpGakq99eJGeTTCPz4tDS4dqdRoQLUVqGkX1kScZ/3soks1+7DGfjaGRdBn7eOaS2R0Zat+RTiVsey4Zwo2PjfmQMJEEk9kYiny4IL54uyfzjMKPIAGqepeOm0YQLVGSbpB9je+R4Is2f6srmJEIaZuP5hjYfiQvXI0+HTh8m31Dk/KOi3mHJVWTxiu4e6k3tZMqSgUa5o+xKGd/B5C3J+GT6ZLHJHB8GI92fgVqxpM5aWmQKI4ZjcAfXJBMQLGSZSoOjzpA8WmDkrRoHZAGfUF8T0T6fK95gIBVkFN+AJT9eM93ESCSkBmPPY5odUF8jZIMTj+T932DJEGMxzPggLyRkytBfC6Onirxe40bFJTCfLxKmnd2k4STM3dBjCmTaiCqH3uPl44AMA6SS5P4kS4kQI/Dk7J97ZNWRXl8QCuIjot4Ai81k1NofX4Mk6KSZY00G/yPi0FVjelBDHprQ7R+ZJCJeUM0pH4MjmSNbBiegDySmo0SlGQpc3xrkuAsRn/PfQqRQoEckrpEbo1LkYkyMnhVkokys5NJKwyOSY5JTDmSUJE8lL4g2o9AlHUaD3mDfLqT5yc+lCIok3n8ktccbpSwkaZ7jHxKlF99JY3Xfi+MJo68kfAvRUy7GX+UIZFuGx2O85NuG7iTeIzCdTWSSI3KalqTD5CvfH98upEYMFuPWY8aMh2Ox5GCfriTGpJPGt95D5MeMpuPtyHak5cZWJNGlBmOwktUfbCT5ydpfRiTOXrhfc19fy1pfYGSTo1JKwhps5RnlNJIcJRCfd1qU5I8eFZ/okv5ftZ+tyA1lABKAH0UaViQMCFBfEeS45LtfFuU0i6ajRWRhCVglFWBupTsAXWUlxrefcqUpJPBfPyRq5OLfGgw835Qk0uU7BnblItBu34dMR92hY5YGHNCBZLQk11CTh0bfPl7fpPjlFIa2o5fGtuSCGm9lOuUlC5BfTGN7pTlaYONmH3JkSyMhH5IkP2UVpRJTI+RzJPbII+R95GMjYOTh41jlF4okEDClJsaW4+oeCMvh5KDA4GUdEjAeuuTOBqhRY+OB2p4Ra0tgJP0GRaSyGmClJKQZpR3k/kfxYypkrEYoJQRlAuUs5IVkvREwHoOlHOTnZPYfiCSNBtVjqqP4Eu5jEVMz3helKYk/3tFle8Y05QLGwVq+JMSdvOMOpMUkqZ1QX39kzMhrpGYfaiQnR/8k7+SEyPje/aUqB/Cfc6UWCikfAWPZ5PhkliUaBrTlNF505RCkoEanXrskoEa8HmukzAYo5QoHuWTeH3CJfl+1GjvLyqRHYxOJJx5phm5fbR+H3YflFcY5izkI/R55ZRNIYSPXpWnNHSVpigCgL+U+hnckQmQTpEsfaqQ2H7PH5gsj5TTfQCSjYyhaONpHJVajx6VIpPdMeZ+ZH/ckYyMuR6IjgaTTSG8kZmVBh7ckQiUXh6MlNtJ9CJ9j8991Y++jHR+iJBQkjd9bZO4lKgbA2lpk8CVcpO5kWqU1TCCk/qUhZXnMMmVH5OqekWUIo23lFZF75PCHQ6SYJL1k81//5QEGbiTXpL7lPgYBWqplWZO6JPHjZiUjpWTGKZ80JLOkDmVIY4ylP8qPo72fvIk3JOMjFQkA5WzQP+TlyBnlbKVlJNffUCVUh3ckxmR7YwifvqRBBlEfqgs83WleQR5Uhm2jx+PNGv3ZyKP5EK8GCB5FR2ojBuAnE15keKMgnqZkUeA2ZIjJBkaDJP6expraC0Iaa2Ux4BnlXAFx2ogQ+WT844oddNoeSBIj3KVZjcgf1KUSoAuf1uVEyIVedeNDn/+fml9MZKxQt+T5pOsen+UypUlOLIfU5VNk6Yl6JVhk/OM7ZWnJVRopHpakTM3VpRfLDKNBZQdNLyRrJXSlI+OGX5yIqh+ApSfRzqP+3jYlQcrepOGkryR/o3mIh2OKpRtRwh5HX7ejfcdonzNkMYw+JPNJ3GWciK6lFKVvDALkqWRIZZfltIwLn9lkjQZCXzdHqJ8uJGJjMEi84wHkviS6ZVoKg9/ZZWbaViWBJL/fyh8phweRhlqiZXoHkZ8mIyBHm93HTHOGwiTrSoXkB1+f44ikrCMgHvvJSqRP2tjJesqy5GnMtiToxzTaqqRKI7xk2t+w5VMQOCShpYHk3+U0pWsTFCV+Y5Ugfp+bSBIevOSdX6mlkEcqnpDlgkgzY5vKU+O6ZEDHhCSkZYxI+N7YZWJMCiWYDe3IW6WtjYmlqCS+o+le0CPepXdlqpA1Zb9kaMnGZTRN2l+gpbBIqSWAR/pfxiP1Zb0K2eVISzTjomU7pYflaFMZ5Zoe+qWBiiHk0ZEDiIXM90e+ZafMPuWZChIgh2PapG+jjlNuY+Zi6uNQnf8eOOQ1H5Yasd5GJaRS5+Whh/TlvSMIxodfl1+m5Wof4ofsJakjrGOjBxkk2qWoUwXl3srf5TRkVMsXJO4i5t/pZQkl8eRB4z3L+uV4Iv7fJ4zPZUvjV9+RpBLjht+uCpTlVp/4ke6f083GpezkiWXPmoXlTCVQSckIWpI6GhMgbloNpfxIC2X4yQol6cyBHlTleSSuyeJlmVLb36mGaJ8Upe+Qp2Q6pCwjOOQqGkqaA97ZYwzN1aXXUVdl/t9TpdyKVp8khmFjLSVRpRXj2EYXDQbk92Q7pU0jdySaBc1f7Ihy5BPN+N6TDYMI9STXxhcNHZpEBsjeGwjxpQPkCmVMTebfPEmW5YXI1JpwHfkNtUsfpeCG09+9Ec+l7JIVZb4GJCPv0yKlP8mkXbZkE8kkJdxJph/pTf1lkZ3xn/zKZ2VGzjkeRslDpUklF1FepY7SAKXXhlYl+aQmZbpj5KXtym2l0covJecLFl+AJZWRXB7MRwOkiCRyJbNJ294sDYOkmU2bJSmREV13ysFj5yXoitikhp6oI2uQo+S7npPHs2XkEqijsF8V5Dkf6WX1kkCgGSWKBhql199xZc+Hc2XiJchNqqOpY6MdiN4jCd1LKuOeld3guR0LJAGlyoxfxfPAQyX4Eb7d3kcXpTGjoUd/RctAMZ5C1d1TIRqyo7fJfppG5e7dxmCfXx6ffoiEZitfK0nfXyjAXeWPZYlQSuT6iege8lo2GmXeQ9B832xjBaSI5cPGnghwpMgkdyS+2iNkCeTly6vkWqAW4/CeY2QeZKhTD0yX5CElX42Exi3ex2NVpQTRsho8YwkIcB61S7uHIQuyX61ll838QF1k3uU8SC3jv0yHALkNqEblpfmJe1/4hjAl2UgkZV8NnmT3IxImBCNGzbVfROOEJPYfTWTzhxZfmKTmx6UkNCVki0Vk6YB84wylyBHBX0dfmmYinxMmA9rJCLOjO6V1ZRajssYYpBtjIoawRyzkvJ3AxktaNkgnHlUJDor0nrBHNCVnI97mFQegJZuJvV/jpiJj2d+cHc0JsOXbJO6lHwaUmjjls0peJghfzgegpiDLPuLXHraQAiTFTiNmO5/DE5hkSofiZOyarePzBrueU6CPnfJKJGTv3m1jrgs+3qyjXKOB5jIeUB+gnqFGH+WqBixlrRL/36BHi6YSIAofNQZHpKsfUgbsJRLJ1N/whhYlhqW30n/Km+TX3pUaFiXphzMmNxH6GjzlWR4EHjEJ9uYDx8OmCF505j0LACSK0fQmDQZtpEnf4mU7JisTHt+3CTZmIiT8pjvkBZA5I2jHPORI5SzgDSC85FmM6uOD0fElKsuipeKGM8rH33RKdp/mB/WmJeA6yoTRgCY9CN3lvAVFHv0I9yVLpRlaQSZdhjAgQOTaHvoi6WOwSvzTeZ4HjBcjrcn2pdPadmNYUASlucw6ypDang0bHsfmYWSyBjqmCIn+mlHf9p9tYG7adGUQy6faDEcGI9MmBB/GCK0HQt/onqwHP6Sf5QrlvdCmpdZQieWr43vGLiTdi3mGE6ZwpQ8CLh7Amtdfj9rEBsbfruWVxjVKvkY6moMk5cnQo+flCgfqmrPl/d8JY/ylFaZc5QbmYcof4y+l9uW/RoLlmuRPVbUjE9qtZg0kE2YHpJ0kpBIwBdyAL6PrSK8mL6YYnszkhSSHHisTn+XxnwAjgcrJpXqdgl+ipl1gFyXTZH1lRyXRpU5lPF7jBzGfTGOdS2ZlEkkU5UwlO1pK2n7f9x0JnzWk/N/BhvNd90kkEBJmWVp4AQJmYSOxn0YmEF9kyuBfkWTkX/tI5qNJk6xmRKU2mkmlLeWOWlOAq2ZuS3FlfiRS5LuiwwmqpnDmViVxpmvmcqSghtvmBSS7y68jH2YOWkbLLGZLJRCaaaSwEpujbOWv0yVmFJ9w5bdgNOOg5kPOIyQIy/Yl/MpYBjKQXOXfph+JtKZUZVdmNyZjI/se2GYKHm/lYcvLZfMeNuNqI5/e8pBapghHbaXpi4jeV2UmZiXmH+RuhuJmd02s48Gmo+McZkHl3OZjpOndMkoRAEDAX6ZlSJwkXpKpIxmLkA035d7mROagAEvj2EijyWBmYl1BmqkfMOYOGj+GgR9B5rZHXN8nJgEGRCS5JDXJSSWJUvOk+uRCIHOkzuPfy3hfYOXUZXzlPyVTpRLjcUfL5rJmVgnoZEak8uUx35vmUaUJTXggH98FHpuG12WFpS9ljNGu35xl0aUqQviRBqYFIxOmGVpV327Mcpqp5fOkQuZoh35e+qZ05kQlVd4O5qnGgRoEpLokcKZppTMloqSqB8Ham5/EnwakFuaN4zvmbUt/yE4ld2VA3zckKw2S3nPeByY3lZ9fjmYCZNDjCEmupQSlS6YaRysaTMaW4+ceW0WbyqZmCeTjYzuMHuPlZplKo+YzUick+0omncWmXSXe5Uia62YDWoMlrcyCZcxkBKafZkemndK/iAWmqhJD5bEQ7ociCfnARqAKI/7VdQkYgAgAGsA/xtkALdOriJHRyKaPZDyl4kcQ3yWJx6Y0Hs9N11/BZHKJyQdoJrRku2VbJl2SeyPfY1lms6QIZF8fGYm2Jq7f8+SzJqHaEF13prtmSophZZWmuaNiCV0fn2MBEHkfCyVXzeieWQzoSiVfdGURZalLSaaf5EcJFGUMphaku0jupRLJvFpR5phmiyau5X1mpx8dHz1Q/GUupTaMBFoLZoGBZB7GpY2j2iXsi7zfgKZp3hxkqcgGRqulmiWYX2NmW4xdX3RaQMeyncFj+aarDfplE2RE5vOkQiVcH5fRZ6ZA3wblbYwfnvFkiiOA5tGTImWkEmTlMd91Y00gt97139zmnt+DJr7l5tJqJqPk0JWuZqSk2OTqHmzHVma5CoDQLmau5q9mr+aIZqYgTGPoE0HLt9qRn5VmqFMUJbbl5cjhJademyV3Gguf9+XMHsZauSYoUwjGZ6PonyRlQofPHVnmkcxSZplm6J455cNfX2aJTgYmXSX+iy1N/d68TIUfsaasU1Ij3ybYpuCep11f33jLHWb+JHilCeaQDWuff5/9yM6m/posZenGmSbHoGsMQGPhJZ2fjSbGEBqatOYEIFoMCqa8SD6acSapJoDeHKZik10mVxWRJukjLZ23mh7kraaHXWkF3Qog3WAmVGbmpPxII2YoJublpx5bypumJiZJpizjN1B25mQSZ6XFI6/m7gz55SUjz+OICQblMqMMxqujlOOMxqJj9OY2I0ilMqbAhuojgSaLJtzlv96invkkqGbGHsNmjQgdksPgBCaOiguj80o9QE7IBaarwI7ICUBVRc4VzcqRZu2GD2a/HqFjxN4co7km44pg3VQmyKAD4K3f6B8RWpkRpiZhn6ALpGZQ5mhI/yT15J/km8quJMbmQdpOJXDjRAa1WqzGHiYQx3KeqMvEpyVMBAtt5jnJ9OXEpyrajNGgIBsex6cyiAjec2btUj9eBaUPZsEl2mRC4A/m8sYQZvim/kg9puMQAop65vlVjtXd5lrmjI0kR8KlkFr9XR8FyUBXoIWT9kujTjZLmSC1hpmgnJXGk8iT2yCVWsmT2+CqItxgitPozhJe2w4r2EWe7JheoK0YWmKKXt+git7gILtU71GxQq2YCQFxgYvCLo4IWNWBz8H4orsBVcE/AkECCkI6Ac9ULoVcZzLOMUGwDjTAQNQCwiWBu4EZJy3EK2JXQTLBcAHYpxqnAQFewQLELYFtAa5BsUKXwQcCLYlQQjdB61x1Ac/CPoJgQK2Dx4EbwYMCC8EwR0+BkcILgZzB2IGewSbPKwJQASDBmOcsgRLCHsE+BO6BCc6QBe3EPMLdQOrnC4O8wuinKENdJynnI0Espw5CEJc4AMhDaCcQwj/OMYH+zgBEWicl5y2nLcQ9jg/CpScMAUxB3sEx5wzCFwGsBU5Wk5Um5yTnJkHnpx8nNMBtg11A4oLrJzYnNk4MQ2RBsucqFRlB3mc4JzFnF4GLAYDOysHFQzQnDViXxFLPLqcSwTOnDdiMAbAnLkFvZzTnJAFPAZGBMU4+pzoB7gH/gW6Ff+cdnIZBWyc/Qd4FJac3ThsBM84mQfQnM1g6gP3nIwFqwecnOwK7JzMnP0H35wJnfec1AduBDYE1px2nJMD5w73iqcEHJ0MnXWcEQcQnYwHkpwknW2cpJyDnFgHuDiXBd04ogjIODKdLZ2zP+kB1DgqApecRgelnCedyYqOnPk4RAgUnXIEfg3eOBQHNp1FnaBg3DimnGacGVAVnZthvpzUnPAGtZzgnJmJQAI0nbIEPJ2ThZoFaRAInd8GOww0CDkFHANCnaABXBJ1WH+c4Q5WDyKdADngAgwDVg9nnTNiPQZVBaGcuZzInEoOiJyKBOcOIwIQPqKK7AeKBWqddZ3CBw8UbJ06BYOdNVn2nIoFlGKiBkydJwjEnOWcn5yNBFsUc3BlcpgVwR1lB8FX5pzkBeicZJ1uBZGdBp1FCCAI+glMC3SdRgiAnDsPw5zXnAAIAzmBnUGdj5xFAt0xq2FVCIBXpzgpnMBUaAjlU2iKxFRbnGuKTXvsU1sAVgKxa8ASHXASiLqJSoPfhSptSxl+nJ4JR3T9iSiH4wkXbZ+CXhI1h4aHf3PoiYZvMoXfCa2JYQ1thryG54ktYtOG3wkoYlsQ+InHnSo+3Z0FbZxww3H+bJOHPBUQEOGI13CTc0eEMnSlcIhjKT6pgvGIKIaYc7hz7J39EzWIoBISB9iJ84lOg0tz/IJtE3Vk7oWpbKOIlnFNiGKG6wvFiGo892SxcoiCAHTSE+CCPHHdh4lymz47huwUjW8aiOCJH4cIc+CDLogdcsGHOIkbZMI5iQ8CcjSDw25ehEwOfDu1hzyHvxPga+mIKZ5tDQlvZm7cndSdE4mphdgUeol7iNNxoAadiCRxGnFRcFV0RxQkYpmIxp2Zgm2D/gEmhPaGbhJLZrmD82XNchCFynM6hzR0UJ6eElU+jGbNcttz6onTh/BSshH/baxvmW2chTVn7IebEFhzbYimhGZu6W4lPpKEKFD7cx2K3A5ChDETqnJQPUM8YGeuEXpzZ5yHhQMRBYnGWCcRW4RNhsByhG4FO/6HqHCeb22HdYNCYxmHM4leh26eXIjRFLRwjA3EDpGIqoQ2iYqF+4ZWDKUU9AhZbh+KEoUndClntoQTnqGFkp6xgiSJLJ4UPGRvwD4gnqRu0g/AbGhuDoS0EZdzJRByPb1sH4iNnqeepF2ta8uC4QpNg0ueaXJPiOBhd4Nrie+HoIXQiWo+Ioe7nvQ+RZ7Mh2Fi5IWVnqUOuoKIPTCI44YghNiFpnMIE9SeZGe5g7WeXT+ZayEMdD3NEqA5MYMaiABu6IdTDH5wNIrPgilnrHPCYXqH0IU6XV8/WGY6bCJkjAwlbUlxGogTbuZj72TwcZNsJg73CweHnwvRiPRhzmIhZzxl3zmDcXY/AQdPOuOevWPqbakNq4dDb2WJugLzZRlvsIJlnQdw9Z53iLFkrG9CcBU8JwfbcmyJgodDPJE6C4nJc2s7WmLEhC6HsDvMYvcP8jwony50ZAcMcZ1v44n2PCafLmNjbtY6X3Oknr06vm/Nc3FvCoZfPqtkNnQubSxiNGTXD9Fl+zzjh+M5wnNJbkKDtoejibWGaXQZi1WJBokIcl47oQbHcS50GD7IhhKft4ZTbQA/VW5DiiOFtzklbt1t5mVLiqKJ2HEyCkSJL4iVgu1hCmLjcARx4G6GP4iJDA7kiN9lsHGJiFJxk2MDn71sYJ6+hh6JRhN+c/5w8D1enkuD6WEZcYZwb4byiVJk+J2CEQwTvmUnPPA9kW0UhhyJbHJGULBsB3RKnsOeDZ7aCQhmPj8SnqVw2BSshbeIDWeChe+d1ImWcSRwJXKADpSfkm/gcy6eWzw5noiKLoe5P8OJzJ24iMKepGuEB5Se9VCigstzvRJXPoCGKp5HFYieN3A8cB+F8xBycvNxn4fxnYqHAXTzO85kWjv7bo2IYA4uBeKEZw4Zg79h7WEEZUqHvISWbm0SN560coWDTXKfP0UQxA5hhoBsKHHlha1iC4lIiKs6HWfmOWxw3obnb/cPLIdtOzRy6IQYci5ttmt6E11yZ57pn+WFup41cSlmxoiUEycPPYTMhHQ/pW3znYeIKorXb1UV+oU/hRCg0A+1n2+FhYjoc3iDq4J3g9k69RSROmqeqzzSiPmdD293E+5vzp62hpxnZg9ag4iIxIm5C4OEh2LgayOe74K0P6s/4Q8rhv4F0IXlcmdxdISUE5dzTjlCPjeL2J2+bZuH14ivciagbQ47crpz9j5gcjWfvIO2n3s7YXQdPvGe7RMdoJs9xp9wZPyI+zyvbCFnAHImisCF0z1+cCWKxoL0nvUQ3Z9jdF9TGIX2n1aK3G7in4tsEnB1nm2gAW7+n9JtFaBPC1pnG3NNEmRwLG8eFSSfThQtP+ITPGJGZiNs5Ii2b2tzTz/nhnCfNp+Pc/ZtxJ17axVvzoeFED5vcoTFbOSIJ4dIoA1uFok3n8I/FHNgDnWIRofkbz095WQ6oGNkXXBrhkxuLXK9Y/ILUp+Khs49PXKbPW9vLopXijyfk4UzcUeKHIpxiKOJqIitoPVj1xDsg8lvFW9Th/iDwxIKY7UJFp6wY3SgzYLeb/CCqYaUPeGDMoYGPdpiAjpUn0yKN6Arinc+6FlHn3ifboNFoLSChqCjh7uf02EnO79rznLmYsmf0w03iAOdkp/Mb8KgeWbMiZ9zoYeUa7afsw3jCu1loYfcZvCJuQkscrxZLJ+MblMSiZ/fhT5mWoPGnlAUjp/nnaWfoYeDY04UR4rIOeVxh4KlcKNsWHLEZLxv8w4OoQaK9YalcCSGz55EAzuI8AxAZWSJanTEZM0+BDquoIU/kzzAbE5jMRMeOs1ySGUgn7yJHaHWWS6EY2/Lie2CbhKQbDag3TsbnhgSjolIFHSHCqE4dNc9ExD1Yqhy82MgPG9tr4WycpiDA4fdiYVrygtBoDCg51Dyg/UUhIliOm9rAp8bb4mCwYfBbsNrEomkh4xu/p3vPGpkUqC7iAl0L6Dmcb8T+Z89iqFuf4lYg09sE3GBZbSGhGcVilSLMTs4dBdjk2K6h4NyC6DrZMqD5XKTYs46wIIKnhSJdIZOhJtm4oNOhHJjPwv2cx4S6IW3hZGGyJ2lbm6EZBK6hKmFJXMvO9htB4m1iP5s5INSiuw6fYgybT9z+IiBZfiCOw3vcMMLwGRGn3egnp6YPo5j6GXRZkKGHYd2hn8NpaClDlCJBzvdoBcQlqEgYnURHmdzh8WCO3N8c76GmXOmhxVlqHLhnn5znGDAiCU9VxG2g2IVfqBxOT1vw2YjFH2fi4a8BzpmVokIPHw+vnK2bQNjvGtGYlahJzt2PyY+GhNaoceDrBbtiAoPajoocEeF66CdFA2JGnRYC66I6gpkoCERWVR6ExqJgJ4siaODp3JkiPILwaAyPsSHJobRni4G04UrdN1tbogUoPdxr23iOxuJYDpnoJqFPqEFn4pivYIlZzx0GJ6/OsIToZ6UicpkVZ68iA9x76GeDZRvEaJehm0NvWJknoxj124Jbttkd54XYpaf7mKhhw+eyWt5b/+glnEYofCESqHng5uE+zmdY+s8EW5ln9NkGGdEEjOiSW+QiI9zn3LzoQWijXD6YblzdqBxbyyiNGcDn+ht42LmgsqH82PioR5tYYUlorByLaFHhW6IVoiDgq5zUWwWoUegjz3WhnKHoYdYiNCF9KGTUu2G84YqiGWhcp/knTqHIAkLb3J0KYRJFYOFajzAoWif7nAGoNZke6JaolxiqaDqiYRsCKGTof8OlRG4oYeeJYbfgraJ0p4riZeDzIp+nq0NyKGKDgGelYepE8MIa3Pyb9qGfj/AnlaFYjpbigCDOmZdcnVriYiwbzOJ/2GIotBwvTpYcCCI4J4LZ6ahdmX7a9tx0lvfoJKh9YqGiB9lAaJYO+5ldYhCOh2IhKGphX1jx5/1h94HQWwhE1s9+hRcdHE+VGfoZvWgCHToc1A/fYTXnuGEeXEbbgGHhoktntGfg6L2bkygO3HKoDmiwJ/uXe4JCnRTn1mGToQjnvRkAz1NiU1tQJ4jO0CIdQlOoQOeh3Eroj6Hm2L/bcehmROlDkNk/hALha6Kd4m5odafQIjwb44/uoeWnlw5GWL5cUuiBJ/WZD2IMIpuh/Zl1hNknniJxoTuc8Si5BWKDk6eMW4cnkeI+aAvoUae4gtmhes8g4lIc56IvaLsnf2gWlUVZhFkM4ngnWxiRIRzb+6JPolihy6fWKCoa6GI12Qmo/CILGMcnweJV4TfiE+Duom1CcqJdxRkh9Odrw86c3066qE1o7sLGGcBPtGDhKCjP6BlhhNIoeVtjgTlciKh84PHBh+fm4mfob86Jj4GiKSJjj/vZTOJpYhTcAw8vzoeZyiEXHDIojCdDGxloI9TGYrOhmyfaHRUirQR6KJqoytvVz2ynmyII2OhoUJzk4n2bGuetKB4o3ejmonmPRShI2OdoNCiz6EkbsyfoYkxFQJcpgohbxtzkKMIowOfmhEhhm6fM4mcoxluDoNkn6WJHYqYoz+DmgWGniFu6aBAhwtyVGdTceI755+KhvihVKEqC0MVxomqo0wVQA5SisU7HopXPUcEtFRoALpOs52CV/eXhFdYnGNrWpx9grydf4JtispUowGVo6VXYp02DhoCmoqbArxkNxaeXC8ERVhunNajRgl8A/SCBASqDd+jlZ0aESgHJnH1Ag6L7AwXbu0NugHKD8M8rQqsB4YcKFpnAi8W2qM6A98POQKDG0wETVXqCKcMlld6T99Zow4GCb+H7gWNFvld3g/ViiBUZQPwo5IF6aMZZ/mjIFSZDuVXAKQ3BGkamw/ib7IDFqTUhX8DDqRlLqFXIwsDpDWJkQOSmhKkBFgUpAukVE8fFb1RQAMMpIcWNWK3Ehqkfg7/oyAMfwXmo32ezQHto3sEMKQRpOASE6RcoJUCJKQypJpXJ6QspFRPXgI5pCQ8rFcgpCqk0wFmDAakDQrMVBWktgEoWmQKOGxkTyykEQSgV+wDhYLUFS+kA6T4BZgP1YqsBjak7AoLpPsQ1A6RbwA6HKSGFkek+SEXWHMPNaQ/YdajhhasV+dkgVhGbN84LwhBFImL1E4XdTwfpGfGi1NrlDiOllYilYuyZ68XknR3F0KbiAE9nPd0p4t8VakmnXRtHfBOlheGVZYXp4uldDB+SgD2dG0VjlWvdCx+ACnUVm95L3utHW9+WpkNGcGLZ1XDi/0/josbdciLFZbKi+pnO5AjgPBnnHl9FGYhKpGKlEccyJQJJ2d7R5ezQCScrhgGffiOAZgAl5KVLThLmJ6YFZtENiQd5Jo2mMGkrR2KfMeb1n9nfNObiktUaBp/epcmm10oDJPpkH5HRJA9NxV5bpu+lmaPBY+LmPohOpq1f6yWRX1wm00hQpQNkG6aNpiPm4IrqH7OmK58HpWylS9/XCd3miBHZJiRm1wcb5X4j0eVyGiRlRpOTX7bfLykszZOlHmawJKYfXObrkKSaQ6O26RMk255E6XRkv+aoXkPpc0nC5UBJBGZDZu4kyib9Zapk/t+DX36mg4I1nzsmvx6M5YYGIgsd5YTk3gtj5EomxqVgZHhkouWHiKRmLaZBoyffQWPwn2XloSk05nrjj6bD0T8Z+Gbq4s6KI2knaQ3nFF+gyxGeH91bFaCdbOk+5tkRpqNSH2wjnOMjHYJknVpH5dXpfCU0GpYjoQlV5Hxi/CXeSBzfOOk3iMyeGybNo84mpcawpH3lqQaSZSYfWGbjI6jfX6PPiOhfoebEI1cGGt9AoC/pE9pYpblJoF+DJvjLPGMLHY3fUyYLHZClKuSuB9Jm1d4p6S1LQkZOJW/kr0xd5akmQZpnkD6fIOZXpHimmOZ23yVpVlC/2hMmeVEf5TFAeCYnSBIlZMYA5vTG86kUZeWlHt5X378pOWSf3yRkHyWsi6SlOukho4WpXKXt6XtaYMoEWkfArt8X5HqfA0yg5pPSsZ8jqVaMKaYgyoakwiVkxVraDsphHgMk+dBxqUCgP+k4nY7jliWqR2Fm0qa2KXVLchoHJRKJtSOjxzNd44bQX3cal2N4XrRaPtqNnhBfZM2/2ppmtUqQQNRLnmarkK+DKeZCaVCGQylg2kqkTUkF5u0eQ00gX6KfI8Oomh3aZebTzShk56b9HnelEAK0HowljpDBH/SpJ6lBkWMpVYY3hnolwN8lZpUTBCS1S5WpfKLjHYdAgOSW6UdpvAZc3yLmEB8kX1bjx8n8WmSmdtJTQLKjbyRYwM/mlqNP6VjQkSNkqU+aeKL6Rnxma942CD1l0B83IwnjRaQAaUtIOyPupQQkKwnaaUGRFabvJGmHkKPcqU5Hu+Y7ZrgpP2PD395lOiOhJQ3J3Ro86TIHkWmV6ahHup5yyDPksOWgZfCHT6OLZMbSzKNeKXHfxamfjYOmTmcdZNQprSWkpTRmtaa6GoRpmGMsqUOm9YewHqCHsWWfkO6lLlF6qV+Q/hp/B18lwx6mieBptx0o6VWlPdp9Rg7mQpPPHUdV6Wl8SDtjWmm0RwNptArtTcgpSmMcxwWl9scoaWoj0co9pj5S5yNahkwm4cvuHhjpSV8G3yMlZSZD5myLo+RMJqKe6imIJeRaMGNiJaxlxUdpnzUaK6m1TBxk0yYGUoRaXGYO5J7prml4o2WK4amA35+VotCJZkrJ5BmEWlKESl+V5bPmjuTl5sVpm1/aaYJk1qmrhjapfKkwXk5ltohm382lgGOhI8ipSwfe3+bmtgybX8ymzaPk5R9lSAvUJcUNLyRvJV7K8175pmCK3mVbX80pdGS8KbWHdWU9ZldStimgUHnpIaS1ZTbj1MiqnpgkvuYDnzPkqamTED5pf0sPJUapfRHuJMppfiSNZhuSEh606Ykl8Wm+B5rprRofn8Npu2Vu6VZaH+YApZNHPUaUWgGpqYbQqVydZR1spgde7uPnKT4dLGaiUhBHupqdWg4kOsbXXzCmiNqBTBaGh0y/0iYLECXIU1xgFQeuHSgG21NoRwELPSV3UhLQ21NyUvJLYmQOYFCfFKnGyA3NrGTM4G9KYUyv3qFJqmAamgPOKIYKhxyIVAbboHSGKKBcn7PGckcJZWFMo8OrS2jN8gc0B5OHbZ0lZfeI4wnqRicgIwnozdzR+BFNBhTHp5oz3vmgWgeCEewNjmBpCCaSkqneDV8p3FINRyqTlomnYFACsMrNzZ6gcU3kht+pwcZNh5np6o0lEqSm+EeRadlmI1qcjPcTOZVzkyVp1OlkEpjgcYr4YHEK7uAqqcwppsjah6up/sdQEDWA6skpIG2TaKn2R3OTGtDki2+R4Ue9YEQHranDJuRLlkmrhjVNbAd4EVKTgiQm4EJMz+ADy5yllmn3lZugY0gBKbLpyJ5X2kdKHF/VH7agdVW0Keem882sSAQa8ZDhxrBKxYdBWjAK/UYGWpPgfR/yjZ7LRQjbSe7Hb4dzkxPJ3EnnoEspW9phjZ3aUEeXY1jaaSA4St9Q4QZnKdlIDCmMKXVKkFOwVUBqAkhWRuiSouS/UUYggyo/YtcgN6BXDQFKrgjtkYOqKEj0EdjLQMec6fdp+GARZjagNka2yVte0wP2yX8mPmYiCe/p3YnlB7UmBRN8yfcm72OLJyEJaWbFldIpTOncpHTZ2tMzYApgkRCxHnQVW0AxSaAARKXiXXdMzMa9Rq2dGmBFEE/p5mnxyRugX97SSP9i1WAiCWGRkentCBcNLgvana2dN0XJHg9gF4lki15PjE31mq5M2wjgae6Rxs4yIBIRsZDRBiTQban2kYjJJ+baYCiTVmolxwfgVabZKgENtBH5DcRMbaBCKimKLyAmjDGRcpKkiNzgJ4dMCnUmJCnVoLdp2AxK6hsgasZRacAL1ppOqjWHX+B+I9BgSEvVyTYp6MYXYFOJ5JCyDWte6mAJ5ZvKVJJ8DPdp7wYwVVcJCsjboGigB58lB5NHV0xlB6dJuh/X2q0p9wzQqe9gSKTWUTwpTlDSBzhK+BFkR6AqEZ3P4D2GHxGIHjjkDmBxagjKrWdanotkN6b8CAGeDZrL5xtHTWogks7ID+ojShBqH9L75s5IRao3TM5p3oVO6eym+OMpiS2Rg5HIZfaQGeoKmjQgbGBJJqFHnh7LIHkqCgbuYA1k5pG5JTagGZC7BnpgVgb1afASt2nvTZ5KhqoS5BegDdCFSuqRXyNPozCgBoybIEzms94cadZkOGB40EcLkyBVZV3JmuaMyE8qIIb0CkpL3ksb6cSgblJiQo7jdqAHCAjgQiBCalOAk+A2gFpahsuTTEvHb4mdEkMqfIltHQpdZOoTyQwqTOUdyb3ecJ1FTTjIrpK96hRqGQZYadrSWp3JKiqH9+BrQF0SZ0czIEolFJ1lyz7jvyowHnZRHcmTAKeacSAbje7HW8Zv0rSHFEuzYCgN2MteC12qEJ8DqkdCGCna4D/jXWMmZQ4gG6MAamid/+nNCQ5glensCA5grNMhRpTp/QiP6cYRaEt/EIZHUSAeS0zNnKB5xg/ea91mBqgG5WOUKl4LUuokiFdqbd/KUlnqbcdKUmopy2AJHa9IZcvOy+/gMEYLKcFeGaOPXcwp3wlNajZqLwZhjaddZMhFHh0jlGlGXgllYOYqiVNMcchqak+QMAfV6ioH8tE1Jj5N6upgCTcgJIhhH8DGZ96FzTbfa0qJ4GlfZyocIGSgDYeVyTaRm0z1oCfqCSoMXb1jHCo/TPmp2yBtw+xNeenaim2p8BV5CPgRVeCsSHVp/wDKagjk85M/APLqTxC6RylgGopW6eqdXgr4EU1JPd+aaf4qEB4P6cXqJcx4YG6HPJ7xTdwNq0td6k5HIoCvy6ZNlCnX5XRQPUrjXpUJDwmBEiGNv18cELwqfMP/hoZqC2BeDXrR7OoATRlNPCnBhvrRyJOXnVlNC44KCYWqBaqSBvFN1YL/SQwBOGpHagtqNEq26mhSikjcKiAlPQ2dqiQLW1NfqkrI4Y2nRxsNOBFGJjLlsinSYFqdlQ2R6lfGryp5anWHPNHhpJ8qI0nQYGlQPQstnRCqptokIEgqA5H43/wpeBFeRlnkYektnkwqEOlEGozqDGnPpw2qAOCc5ERdU4C8KlNgFo47HTudEKoPZCdJmOomCazgTKpG5KLat1LTajySwwdvaiqRcUiZkCPDnCqe6jUQMaApahqGxA340ofTtwoqIFPK+GBE5W2LLypWBk+TvF/XqmJKqgkAoE8JWZAyKmyN6tO0yPmGM2nTai0GF8poZd7Lfap+BhwqDiASqp0GcZDTQMsqL6BTUG4p5AjpDRZLowclailquuYrKgmqNxoX2ouqX0cWajlC2gudZerquU0KC39N2qBUJnPKzupgiCTqcaAB6qtIBs4saemRDZoEaisgQeTFqlML9WnHqh6JG1M4CsRjG0ng6ovGh6qFU3qe2mob6qsMZ2qqKq+QKmoK0Byp9pAXXd6JOGB8BgsQMhAM4IQHrqosapzILZGeqqqJ+BFxC95IDlD76qYatBHzqo4G7qot6rEHvaoKhyGqRGpKSOGSekyY6erK02omqg/NEwjgGk0qRAab3+1qc6p1TXIHLep9EfMqs97yWmsRuaqGk06KWyBJ6oSGf+Mv4D+qdwkRacWQ8ErP6mbJgpJpqgZSJSnMqmmNpwrOYGpZwuo0h6iSpapDYARakWldXV8JV+qMBd2OLdWdiggAGMfLo8gAH9LIAA2q7RDxRqPFWQASyIpVneZsCPjqBkx3aiIARV4PKeAesQvbyrPK1GrRilvKSGqvjH8qfxCYXbKqvuAanaGRpKnmGpcqBmqR3hZqNGp9UKOqAqqI0qvqASrkaiGKNZqwanIHj+Atw8tjVOpt2ArqD+BcalpI9upknVtJ+KpS0iOqNQqARq0mpqoBQTBVfiq5IyMJwiCwhgiqWAnUaj1pW0nzilIG5iooR5wgdFo14GBq/WNxoDTp8sZOUNGQMsZxTfVNehJ/ariJpmqo6tiIXJHyxmsRjoeVH4JT7grS6iqRWoeOKrOIMSpxkqxgcIfah7nqN80boG5N18z26dAJlNIwqi+jD+BER0jM7SqopcQHUaAfqjQIepoghycK0urKn/0lQZq/SPGgMQBBaiNIG0zUaj0Irl6OanwIy6qDarZHgirnSuTIDon3RpyqjgboKvmq/mqrEb8Afpo16vGSnaoOBqQShuCWXafqepHrIDQqT+q6jMmflGo+UWkNOmq/B7UgSmq6kfwHYmq65bGMHEstacFaN2quKp6JyCo26d7QuSnPYAQrC5IX2qJKvQxTKXGRbypRILCjogspKjypwis6yF0q/UaMCmHNcWjF3tRqnJ1DoCHgYukVwGcqaibIqt5LaKBA5iKVh9qCZjOi+GoBiO2p0c2D2i/eIapoKqTKsiqUyJugbsqTYHOgMupZIAtK9upF0UWgfWpYKlbl7l9sHk/qgcZ8qXZq1qAuB/agN0z2ICugfWny0JZMouALCWRLrQYqTdXJPJLKzgdHs82jqlmN+kyWKuWaamAcCe1JbaqQayNJ8ZD8qrRlmmnJqpUq3UfcIGHH7OBcqxiGxeCpKjGqrEo3C6rNIMsoqr5AS5HYXaSQuVMEyLBp/+olnzGMBSofyDQgY0gzB62dNGB3o+DVoBpDav/HXstigLQqdupu6cpgnKreayhIs6pgRg2HjKpmX5CR++oQyGkpxOqKoC5en6rsU2FMiwBODW1NRkft6wbqvOrJCuGNuABvkiGNi2m+jdjqaKTcqwWlShDFasGGm2rJxngqs41mkqBqXkbIhkuGZirFCCKAnY2oqosdvCplazJSjlDtwF5LLKXLx9jqzYlEYHhrPyoAqk/JkGRpqsQakuowEp3IqGr/CHQgbysviAdgt+rwZmaq/upKkyVqDWTuinVpyFGoEqcrAuNxqxQQyMz7KwUJjopragfKsaAMBoPODAltyUJqb4e5atwgRdMEa3Qd9slvCfRe6ysoqruq6grAqxugdwCezTel6Kq8BjelyurkKfDpkaO14EWL66o6XlrLdWnu6exqDZ5aHjXgdGqSBvdgb+qziCsRt1n1aRfasan6yGtqsGoqaiHq6McSJtHgiassWqlmqOb8CBtkZ+MMH4urEirtxgoLQp2oalyjrNDthc1rE+rZ3xIrNN+H4FFpwcZQHzVpxasA4FBgQZqWa1ZqOKsj5USrGCrWEBEqsKqpUK8qYuppR62pzqtBkQXNPWqzTCoTLl7A6zWHSKtXXcIeWl+xTdCMBSVTKqRqwEfnaqzrOmNf6qHrdIXEqw0reJNhqtiV8moCoADezGoS61njrqPfCVVrSAcQk06q9KoRk0Ml5GBSEH1gRCXCJhYrayACJlOMXqphK3vHxyBV5mtIFeAra2hI1oqrazBfDqsaqiqe/Kly6lfrBVJl6gEMDWqjJuQdgKAjafsH+KA3IAQqiguzzbLqX2tBEF+rMSnnBy0qoUZtJq5e8sgsx2xgbh0VoLUmD8qK6iRgMSsaBqhrHInhpLUmBSpwkoFqIWszx05gdJ7toHdp9aj3R7qrSGq46pSRranbEW9HuuBRiT9I72o560pqbKQx6fXgUOBB6mWKxNJW5djJVpp26dIqE1JkkJwrf2PqYB1rDSBkqrNp7h0BR/Mq6EcpydzgFqtMEa1K1yp/SyaqOZIpZh2qD8wLaW1K5OrwzLhKxUPhpJ7LS8Z60miquUf60m2q9hKxafbqXhpl6twqFipBh6vq4GoGR5IkRAonatzqHAcTJh+VlR+86i4K0aAl6ryQd2nqxv0lW2t/3x8p9KrVX9Fp44ZHkYPrtEY26zQRjlD7B5cmbuqTZmiquBG5qjJrCsy/YvvJ+pGqEa6gaV98Km3RQ524YG+HgR2rEZ9JAR2rSrzTW8ph6mJIHusaxtAkGuY1adtmKGojCeiGYBpdZjrqUAezk7gJRNJvYsFH4ineRovgV1Frqo6f1yorh8Fk7qoJ6njactHQ6dSHJ4fspA8kn+u9a0skv2L7KqbHo2uOjOoH72oUgJWq2mob3kFqFOoT6zrkO6B3FZRJg+qZ6oZMbuT2KwKjrpo5XoAqmyszRyqgd2nzkwvHpwm86k9rQEiAKrMmqga0UBuKYA3yKw/gPwxojcLrFBBoYHIrg0gkkIerv4aoYGSrPMdojcdq8Ucmkr/q3EhLTiMqtIebU0FrmM3LTiKrdsp2aldq0s22kDUrFl2KC3mrmM3/yaTqh8apXUsqnkaOa0dqEGqlamRrZqMy6gxqOCbK6zQqJEXTq00p0BFjSChl7yuGE/FeXErLQDCajasyY+RSz2qEHysaoauRkTUmIJ+WiptqCgmS6mELaxq+qqIgF0mIa4lG16pqzQ2jlOp2aUnq+OZSDbFIaxqJK+NSBxMra6wNhxMMhtXlz6MEK3ZSj+q6ylpqFkbdzdurKeoZCbQRwKv1ZBmQOCui0Q9gh2vmC6DLB2vahCxMyCvdKnheR2p06pwaKxqk65iek2vtqdrmn4j6TKDGxOp4CVQkjKvQIHDK52ubixBge2jaWo2risePam2AgVoUBKRGxsY4jAFrGJDV67PTDKvlqsQHdiszzEDGTKqDB2orDwefa4RepqqPB74qZEqvad8Mi8doQKcK2etPUm+J4Ov4Ui+J2arIU1sM2NNZ6rVLokcYa2gK2GAw49EqZKvN5cPOPNFjjfygeUjKEPXqsM3SEhjGJ2vXnVXr28Y167dNiqvw4+aqL43PYC7NC8d2ho6KXmoKCVcdsurra+yr0Q2CanhGL4nvYtZepJCPTKcJsohQkf4rLV4rSrMAasszQH0gV6pXyGgqzAl3C1jqmNN2KxyKXmn9axNjtWnrJkVK84nh5jCroo2xKvRGPYYACZPgcgc7K6eKpen0RhCraJLza2kRdisBX1NLbA1GR21r/8qPIHir3ci8akAJn6vgiAyr8mv6qn3rwkw2K/ygYcoQmpUqB8qLa7LGFqpNExuqVMYZq8FsFmophnWajFMZkBZLqBprCzJSfevSBzjkL2pCa1Gfj9qoEpqqOB9aq/laXmrkxhsqoo21qw+HcmskysLrxgY/KgWRl6uEK+HLP8m6kcvHS2wqCxxr2KsORwBJck3vqoIsJs38q81r6wqtnTuMyd33K2BGLlJQwJaGkFHLjbGgGuuLja2pzkvdYxfqAwfAatpeWyo8qzbKaOvoDbGrOwk60dxN0SnDrCwqBg2hkbCIpev9a/SF92u4SPxrbQcMLA/rNIX6qftSLqoOhkwsPqn2Uo4r5oaijCkRhetKCUbr9kBEq0IA6RGhK5Ep/1F/avXSmZAjq7TSuKq2xkdqT6ZhrB3N8aA1gPbqakdwUqAMkevCKvzDx2p7q+HCTmCRiRXH8asYo13rNisdSqDmGSwSiYYrk+wEq28q8gcO6/kGeWt3I/8qNOnV5fygQYSmnW5q681GKpHrxupgDI9qc8fdbCrsGWss5cgqZ+sEK6usEKpXUW6r1V//YuIrqo0dbCksEWnZS7fgSM3EqoFrYeqORwEsAklgq7RsFOnnxg/pzuq6Ehugac3vq/wqbapjx3zqeAlu4FtTc2sKCXdrGWuhI40mT6vDkfIpBKtCIJjJe6wQq+krx2wXCnBrJeuUyq2p2cweSy8MW8Yka5DJEGB6CkTqWo287B5LEyYRh4TqfywYxhdsDwlFa5QMzKvJgJCR3ivQKmcK2og5TeUpxWxFK/GgFqvqEjhgZQ0nTYGsKerr65YGa4rDLBRAoKvIK/eam0zIKn4L/SV2a8oJYUyzgFgp+GBsiFDsG6s4a/psGKXdyZWrM8edYxyreasaKwvqPeuUqo6TQd4LKxiAf2uN6gQdUMokxkiV8+rPahQTQuCpKm2jaA3fh4gr1CuZ0eiSJ+p0KxLQxMev0q2dKMCwaikp9+wW0nbJaewEGpzr66pYRxBgc00d2nfK6mvc6dIruMvh5g8sDwlyK0WsEglmTbGsBAaP6f3sNw18ItvseaohpnGK7aqcrAQHuaoia+zNoexI6rlSrMnTIH/qbsnGUZLMetHwa9DS8hAtxkgeAqw0a7ZHiew/hioq5qBvqrUrqVChTL0qXSowpdwqEh97amJqMqrfJj/gKuxk6aFp9Cw5SuGqLGxL40prgGu+CtyrKixeRwhsM4gBK45sFiYzzYwpmd8268dGXdprrHzAUuoozfMe2+A060dNLSquQEurRixziAHgYVFU0h2ry401JgiHpQeoa/mQdWncSxTSNSxvzMTSd+tKh/0sCtpbScgrPCunarDsNQg/ybJrIkq7rGiqvCxEa1kKVSvq4Gfr0KsQXayqJMgRa/VH596OqyxqTCvkyqHrGmwTyQEskSA5bA4N9976qiiAYgqHa4rdtWBjy99fsWqE7IajqstyKhGrU9XSK3MqMwaBnveeDSryShIsViqOKhcV2aw3KgtadBVQathqiNqIarggc+ubTP8RhMttR5FsNqA369Vq4ke76d2qGGpuh3qqPix8DNRqEcYJatwQjeqIq0YqdumRbLSp0uuQRu6p7OtDx/yp/6w/hhEqqM3FKyimLUrOa16GjOArbCGLm+Oa5gtjbUc0a1BsfqXUqrHAVSqNatPAe10N6sKeDmrOyA8qzhXP6tBq18AQ6v7F0arOCojskqxPSqQp/F/yUu0VJxVgk6+dH+kwHTKVa6kxHSwpKdVGbKyTidPMZDVdKNOaDgurJtVCnX7rpZOzXRfAEGrnam9JaGlHQiSl2NXYwE5ATsBCAFzABRPAAEhT3gVeVfCdKyk7xcVT4OyT7EOgqWpFx9ie5MaRJZwLSeYZheHjcoXIEdlLgsZH5BHHLCykEnOTocbRpR9TkwjIxh4aKpnt7I+GVd48RjHk86oqB3JsulVgoH+rsYkaSJOCIUXnThFGICkqbKLdK+kT02sslOxTykSGK+y7Bgpgvos37JXIhIYjByndW+OIZf+Hqd1pqpVe+ayahlqGOQ28x4dfvGy/5Y8GfWycauusk1BUx4uR0J30rJ9ANSyV2vYF9eyAAGqsgOv4KiCeh+wkED7Gsd/ox6gaD9B1BhTGbuxEbPpR7AYNWoUs+GkFrPRk7myBS25sv4eemiBQdEjt7L5q4Kww7LBf9woey39sneZ/7IBs7YYprLtF6iyBbPZsoSySyjBKnayhUvBKsVq07JmFZ040BgEs4+LgqS/adyydo64i/EYBRpqSEazeRy1p+SywqTvsj03aadUHPUa6qlOszSC+LKzJ4x25CdMs3wgwCWbRsmAWrO8aVSzl1Vfs7sFYbO/MzM1W7L7su0cQ6/+shwhO7MAAZ04NgE/swaznylDswuYRbNie4YIbxi1p+IwZbP2JGmnurJjs/saq5YoLacB6H+oJFizf6qlAS+yyB5HQF+zNkmhf46zKbNrsyuzbbMAszyzV2tuGHKzM7OrssNpUpt3syOaebNjGHuz5zB9s1erxBiJGWdGHUmBs5EuKhjkNtEjDZljs1R/Mh5js8uy2iQ+e5Sz+Chus5JOV2s3GJqzzFXasuMaoTbQGDezSE3CsxMpLLOXs8sYL7PFi9iyv7M0s+MaNrOXNdNnxrNQd7qzeVfEF76zw3TAatGzOiqFS9SzUpuNOM0Yw7PSsxB1ZLOkpB5CgbNRs9azV2uWGdmzx4vPs6oidbOes0IZahqRS3EaTnkvAmqz3K+sdr95vRjBHP6z4hcts14Zy7P+P82z2rNGV/wZxLMWT/wZ5lXPGcNVArSWEUCzzLMys86z27MWGAq0SGsMtBs367PZHQS0alUGtO+zFrQ2ARi0ijgatOOMjTgJtOSzOLMWGDqzlrNvs+yzPrOBsloXILRBs8Ims0wktJRVORoIQMiAHLQEGR60MbNAs6dn0LMXtCq0xbM6tCABWhoPtMmzDSM/tDO0FLQHtEpr0LI5s7azgoEutLuzIyFNtGlXc7MlVzkaOLRGnCy0G7RWtHlXhhjuszW0qGddtEW0alc3GC20ArQQJ2W0QrSSi2i03bNGtGu0SLSVs220ySBvtJGLZrNJsd6zR7T9QD20vxh6tMCzYxfcs0ctSGsgAtQsRDFRtH20dLTHswUfOWhitFdrzxeDtPCzdrSNtEE4U7QntFy0NxhetCkBs0x7OJC0AbRLtIOAlbTAaje0abSItHW0XhmQrgG0gjhmHS4AagC5Q/AaAAFfImlXrxdCAJMiaAGJdJoBfSUEHII4+yA4ILe06xtMAFUgwrQYAby0PgG+tIMXgji5Q2wAu0O8TsUmw7R6FVMAukMVF7ZWqXS+Gsm0cgFCa1R8gjh3AIkXawC8Q9K0FU+vF1cA4bQnVtm0u7RUOL20z3SCOGIAhlV5ACJ75bTrG0IA8bQgAOq0yLTstMq07rQOTwwpYQEtItm0q3R5KOu0h05xAQABwCTDF2cXUhkOT1GCd3UEtfS0ehVGAO5C+LSqdEgABLX6tAa1aVebTgq1AzcOT+C0cgDitLxODrXTtIgB57QhtSdWE7XOMhW12rT7tNy0DrXetA5P8LRiAPK0JLURtYgB9rQ0tSAAKrVZIPm0AQEutVsAMX4BglKCgji3VGsAJbVXAVIAWoJHtRm1WRe9tMAkgjj8FxQhPiK0tLEaRAA8IlsIaIrbtEG1ULUOT8600LS9Q1J85LQtItW0z7TXtDu1FLU+tVu1QrUzfiApzbSwIm4A8rTBtGQfSLViAVMAcLX+F8W0NyB0tU21cAAHtYM4hkgKtRt7Dk/oGmsAXwBztX0XN7VXAVe1IbUgAHq1/CAFtU61yrScqc20kkhtOKNJdbUiAFMAlrWUSJG1frXKtJtOgji0SXQAozWZtUMAdEqktfsba7WhtV61iEp9S5m1UwCutVq1QLWAtetA77RATW0VirViAbm0OwFhij+1GrXctKy1GAHHJl8Acky5tS0irHSMQLy1c0yetb20xyYiAII4vI8sjx6ambVKAI8o07Uuj821yrSRk++0dQBiAGIAx7WxGkIA3rXgtQIYa7XctV61fJm+j7C16rXUtX21vbTotWRXGCF8F7RDw2e6tZq187XTP++127Wrjc20+bW0Q15797VTAP+12rXctPG1eRdQKAK25Si/tZK1Brb9tQ5PIVaGVaa1RJv7tQ62a47AtJMiuFSZtUwAGbYTARW2QbUHtjScZDiKAWEfG7YdtgW2BbOrjQ4YDk8yKjsBmbUXtaIpLrYftsu0hAGvtECof7WvF00AN7YFtkG1lLUOTyUBYQBmAMK097UctkG2x7QMtp+13LQ+thgBbbKZteO12bUztku2AQG6QyF7QLZCtnS197VHAFS2PiBFtle2SB/btAABnKmCtegYH7V5AU60sRpXAGa2PLYeVjKn0LUNte5CVq2ZtTy1cbZRtm22NrZGAWMAYbXOMnG297U6tni2aLV7tiAcKLZstlaq9he9dgy1IgEDAQsXQ2tkAHUAmjQNGC0iVACKtjsBIABEAI62WyA8toI4fLYtIkYAgrYztjlrbrZDIHRKKQEtIkq1o7ZrtqC2gjiBF/C00z9ZtgMBrLbmtbS1qbYOT8Ua1hotIk0Avxcetki2vbSzthgB7nRtAGZVThdcAfe1SQBbAZVIA7bnF3MVW7X+tRABw7ZktUgqsheotiZpzbTWtOO0yyhgAWMXZLXVtti0qnRQADK2u7Y+AdS2ZrW8QzC12Lawtdu2gLY9td2237bLtg5PH1Z5ASFWaQARVtW1DVZhALG1IlZrtl1WUbWlVpm1lrZEAfm2tVahtgEBN1eZtUcABLcztvq2Dk/zVvVWvUPnVs62sRoGt/RW5Vadtm8A+FaDtl1WgrWgGBC23rUAtbEaQwActwC3r1XdU820jxWwtSW3FbYAARi36IuItnkXjxVlOC62AraPFSAA3rYttcC1WwDNtE8BdgAPt68XymdyADq3ihdgthdXl1YdtSy3W4LWqGABBQGmtQYBIwFIt7G2wLUItb4yCrVkthgBRrdMt2UABQHFtW8AJbb3tUMAS7fytle3TrcNtlC3fiUrthgBpkl7AV63Tbf9tnlKXbdHt2C3g7YctWAZlrO1tW4BaLdut1i3JLaQtla1bLdpt2+3KLd0txccc7dlAHYAJAF2t1a3Sbf3tUUAhLeMQG23h7dht0m2YbZttlK3greLt4a3X7d4t1q3erevF4q3JAEgAI23l7ePt3+1YrYmHA5PQnshe2O1sRpRACB7PiBqtUC1UbUcAQsXZwH3tUQAsLfKtq63Dk+JF3RK4bWvF08A1CRjAL617bYiAdQk0bb3tVQAw7e2tza3gjgjAcAXVbWvF1QA9Favix+23bVtAOW1xbW6tPe147XUt9IovLWDtgm1FBlaGDK18bSUsmey7nROtve0VADkt1sBa7Zwsv20dR3otLxOlbL3tSe1IrUgAOi3o0nltzO27LdEtV6127bjt/e36rcCtui29rdosqG3yrT6t+F4yCbKt+m3tENvAD+37XT7F5m1A7hgqk8ADrimF4my4LYVTwe4VHyCtSy3cLIuF4m1kbYLuCAARQBnAF+2LrWisgu4bbXIJgq1TBgOT3CycrJXayG4/7dZILi2RKuDtqO3h7YAswCz");
  function decodeNavigationAssets(encoded){
    const bytes=atob(encoded),dictionary=Array.from({length:256},(_,i)=>String.fromCharCode(i)),parts=[];
    let previous='',next=256,total=0;
    if(bytes.length%2)throw Error('Incomplete navigation data');
    for(let i=0;i<bytes.length;i+=2){
      const code=bytes.charCodeAt(i)|(bytes.charCodeAt(i+1)<<8),entry=dictionary[code]??(code===next&&previous?previous+previous[0]:null);
      if(entry===null||total+entry.length>2000000)throw Error('Invalid navigation data');
      parts.push(entry);total+=entry.length;if(previous&&next<65536)dictionary[next++]=previous+entry[0];previous=entry;
    }
    return JSON.parse(parts.join(''));
  }
  function navigatorAsset(file,current=true){
    if(current)try{return JSON.parse(Module.FS.readFile('/data/'+file,{encoding:'utf8'}));}catch{}
    const asset=bundledNavigationAssets[file];if(!asset)throw Error('Map asset unavailable: '+file);
    for(const layer of asset.layers||[])if(layer.runs&&!layer.data){layer.data=[];for(let i=0;i<layer.runs.length;i+=2)for(let n=0;n<layer.runs[i+1];n++)layer.data.push(layer.runs[i]);}
    return asset;
  }
  const apexControls=element('div','','',panel);
  const apexEnabled=element('input','','',apexControls);apexEnabled.type='checkbox';apexEnabled.checked=true;
  apexControls.append(' Hunt Apex · Border gap: ');
  const apexDistance=element('input','number','',apexControls);apexDistance.type='number';apexDistance.min='100';apexDistance.max='2000';apexDistance.value='800';
  const apexStatus=element('div','apex-status','Apex watch ready.',apexControls);
  panel.insertBefore(apexControls,mapbox);
  const apex={queue:[],active:null,seen:new Map(),completed:0,ignored:0,lastError:null};
  function apexDiagnostics(){return {
    world:{protocol:serverWorld.protocol||null,entityProtocol:serverWorld.entityProtocol||null,lastEntityFrameAgeMs:serverWorld.updatedAt?Date.now()-serverWorld.updatedAt:null,lastPlayerFrameAgeMs:serverWorld.own?.at?Date.now()-serverWorld.own.at:null,refreshNeeded:apexNeedsWorldRefresh(),frames:serverWorld.frames,rejected:serverWorld.rejected,records:serverWorld.entities.size,lastReject:serverWorld.lastFailure||null,apexRecords:[...serverWorld.entities.values()].filter(e=>(e.kind===1||e.kind===6)&&e.rarity>=9).map(e=>({id:e.id,type:e.type,catalog:mobIDs[e.type],screen:verifiedMobTypes.get(e.type)?.type,x:e.x,y:e.y,radius:e.radius,hp:e.hp}))},
    catalog:{...mobCatalogStatus,trusted:mobCatalogTrusted},
    screen:{lastFrameAgeMs:Date.now()-visualAt,labels:visualRows.length,pairs:visualPairs,cacheRecovery:{...atlasProbeState},learned:[...verifiedMobTypes].map(([id,v])=>({id,type:v.type,catalog:mobIDs[id]}))},
    hunt:apex.active?{type:apex.active.type,entityId:apex.active.entityId,liveTracked:apexTargetVisible(apex.active),lastSeenAgeMs:apex.active.lastBoss?.at?Date.now()-apex.active.lastBoss.at:null,source:apexTargetVisible(apex.active)?apex.active.trackingSource:apex.active.lastBoss?'Last known position; awaiting a fresh entity':apex.active.trackingSource,viewCoverage:apexViewCoverage(apex.active),searchPlan:apex.active.searchPlan,antennae:!!apex.active.searchPetal,viewScale:apex.active.viewScale,phase}:null
  };}
  button(apexControls,'Copy Apex diagnostics',async()=>{const text=JSON.stringify(apexDiagnostics(),null,2);try{await navigator.clipboard.writeText(text);apexStatus.textContent='Apex diagnostics copied.';}catch{let field=apexControls.querySelector('textarea');if(!field){field=element('textarea','','',apexControls);field.style.width='100%';field.rows=6;}field.value=text;field.focus();field.select();}});
  const apexGroups={garden:'Garden',desert:'Desert',computer:'Computer',sewers:'Sewers',ocean:'Ocean',jungle:'Jungle',ant_hell:'Normal Ant Hell',fire_ant_hell:'Fire Ant Hell',termite_ant_hell:'Termite Ant Hell'};
  let mobCatalog=null,mobIDs=[],mobCatalogRefresh=null,mobCatalogTrusted=false;
  const mobCatalogStatus={source:'Bundled fallback',state:'waiting',count:0,path:null,reason:null};
  function loadMobCatalog(){if(mobCatalog)return true;try{try{mobCatalog=JSON.parse(Module.FS.readFile('/data/mobs.json',{encoding:'utf8'}));mobCatalogTrusted=true;mobCatalogStatus.source='Native client registry';mobCatalogStatus.state='ready';}catch{mobCatalog=navigatorAsset('mobs.json');}mobIDs=Object.keys(mobCatalog).sort();mobCatalogStatus.count=mobIDs.length;return true;}catch{return false;}}
  function apexMobType(e){return mobCatalogTrusted?mobIDs[e.type]:(verifiedMobTypes.get(e.type)?.type||mobIDs[e.type]);}
  function extractPublicMobCatalog(bytes){
    const text=new TextDecoder().decode(bytes);let marker=-1;
    while((marker=text.indexOf('"bee"',marker+1))>=0){
      const start=text.lastIndexOf('\0',marker)+1;if(text[start]!=='{')continue;
      let depth=0,quoted=false,escaped=false,end=start;
      for(;end<text.length;end++){const c=text[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end++;break;}}
      try{const data=JSON.parse(text.slice(start,end));if(['bee','worker_ant','worker_fire_ant','worker_termite'].every(k=>typeof data[k]?.name==='string'&&data[k].groups&&typeof data[k].groups==='object'))return data;}catch{}
    }return null;
  }
  async function refreshPublicMobCatalog(){
    try{
      const current=JSON.parse(Module.FS.readFile('/data/mobs.json',{encoding:'utf8'}));
      if(current.bee&&current.worker_ant){mobCatalog=current;mobIDs=Object.keys(current).sort();mobCatalogTrusted=true;Object.assign(mobCatalogStatus,{source:'Native client registry',state:'ready',count:mobIDs.length});return;}
    }catch{}
    const urls=[];
    try{for(const entry of performance.getEntriesByType('resource').slice().reverse()){
      const url=new URL(entry.name,location.href);
      if(url.origin===location.origin&&/\.wasm(?:\.bin)?$/i.test(url.pathname)&&!urls.includes(url.href))urls.push(url.href);
    }}catch{}
    if(!urls.length&&!/(?:^|\.)flowrix\.(?:pro|sussybite\.dev)$/i.test(location.hostname))return;
    // Read the tab's own loaded build, including the compressed bundle preferred by its loader.
    for(const path of ['bundle.wasm.bin','bundle.wasm']){const url=new URL(path,location.href).href;if(!urls.includes(url))urls.push(url);}
    mobCatalogStatus.state='checking';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      for(const url of urls.slice(0,6)){
        if(controller.signal.aborted)break;
        try{
          const response=await fetch(url,{cache:'force-cache',signal:controller.signal});if(!response.ok)continue;
          let buffer=await response.arrayBuffer();if(buffer.byteLength>16000000)continue;
          if(new URL(url).pathname.endsWith('.bin')){if(typeof DecompressionStream!=='function')continue;buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();}
          if(buffer.byteLength>16000000)continue;const current=extractPublicMobCatalog(new Uint8Array(buffer));if(!current)continue;
          mobCatalog=current;mobIDs=Object.keys(current).sort();mobCatalogTrusted=true;verifiedMobTypes.clear();visualVotes.clear();apexSightings.clear();
          Object.assign(mobCatalogStatus,{source:'Loaded public client registry',state:'ready',count:mobIDs.length,path:new URL(url).pathname,reason:null});return;
        }catch(error){mobCatalogStatus.reason=error.name==='AbortError'?'Client registry lookup timed out':error.message;}
      }
      mobCatalogStatus.state='fallback';if(!mobCatalogStatus.reason)mobCatalogStatus.reason='Current registry not found in the loaded client assets';
    }finally{clearTimeout(timer);}
  }
  function apexMap(type,text){
    const m=mobCatalog?.[type],groups=Array.isArray(m?.groups)?m.groups:Object.keys(m?.groups||{}),maps=[...new Set(groups.map(g=>apexGroups[g]).filter(Boolean))];
    if(maps.length===1)return maps[0];
    if(/termite/i.test(text)&&!/mound/i.test(text))return 'Termite Ant Hell';if(/fire ant/i.test(text))return 'Fire Ant Hell';if(/\bant\b/i.test(text)&&!/mound/i.test(text))return 'Normal Ant Hell';
    for(const map of Object.values(apexGroups))if(text.toLowerCase().includes(map.toLowerCase()))return map;
    return null;
  }
  function observeServerChat(bytes){
    try{
      const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let o=2;
      const str=()=>{if(o+2>bytes.length)throw Error();const n=d.getUint16(o,true);o+=2;if(o+n>bytes.length)throw Error();const t=new TextDecoder().decode(bytes.subarray(o,o+n));o+=n;return t;};
      const sender=str(),html=str();if(sender||o+4!==bytes.length)return; // Player chat cannot start a hunt.
      const text=html.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|amp);/g,' ').trim();
      const match=text.match(/\bApex\s+(.+?)\s+(?:has\s+)?(spawned|has been defeated|been defeated|was defeated|died|killed)/i);if(!match||!loadMobCatalog())return;
      const type=Object.keys(mobCatalog).find(k=>mobCatalog[k].name.toLowerCase()===match[1].trim().toLowerCase()||k.replace(/_/g,' ')===match[1].trim().toLowerCase());if(!type)return;
      if(match[2]!=='spawned'){
        for(const job of [apex.active,...apex.queue].filter(Boolean))if(job.type===type&&!job.dead){job.dead=true;job.killedAt=Date.now();}
        return;
      }
      // The game currently uses #ff00ff for Apex announcements.
      const hex=html.match(/color\s*:\s*#([0-9a-f]{6})/i);if(!hex&&!/color\s*:\s*(?:purple|magenta)/i.test(html))return;if(hex){const c=parseInt(hex[1],16),r=c>>16,g=c>>8&255,b=c&255;if(r<90||b<110||g>Math.min(r,b)*.8)return;}
      const map=apexMap(type,text);if(!map){apex.ignored++;return;}
      const key=map+':'+type,now=Date.now();if(now-(apex.seen.get(key)||0)<30000)return;apex.seen.set(key,now);
      if(apex.queue.some(j=>j.type===type&&j.map===map)||apex.active?.type===type&&apex.active?.map===map)return;
      apex.queue.push({type,map,name:mobCatalog[type].name,spawnedAt:now,dead:false,entityId:null,lastBoss:null,samples:[],travelMs:null,returnETA:null});if(apex.queue.length>16)apex.queue.shift();
      apexStatus.textContent=`Apex ${mobCatalog[type].name} detected in ${map}.`;
    }catch{}
  }
  const apexSightings=new Map();
  function apexObservedRealm(){return serverWorld.realm||(liveRealm&&Date.now()-liveRealm.at<3000?liveRealm.id:null);}
  function rememberApexSightings(){
    const realm=apexObservedRealm();if(!realm||Date.now()-serverWorld.updatedAt>1500||!loadMobCatalog())return;
    for(const [key,sighting] of apexSightings)if(Date.now()-sighting.at>15000)apexSightings.delete(key);
    for(const e of serverWorld.entities.values()){
      const type=apexMobType(e);
      if((e.kind!==1&&e.kind!==6)||e.rarity<9||!type||!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.radius))continue;
      const key=realm+':'+type+':'+e.id;
      if(e.hp<=0){apexSightings.delete(key);continue;}
      apexSightings.set(key,{type,realm,id:e.id,x:e.x,y:e.y,radius:e.radius,hp:e.hp,vx:e.vx||0,vy:e.vy||0,at:serverWorld.updatedAt});
    }
    while(apexSightings.size>128)apexSightings.delete(apexSightings.keys().next().value);
  }
  function seedApexSighting(job){
    if(job.lastBoss||!pos)return;
    const candidates=[...apexSightings.values()].filter(b=>b.type===job.type&&b.realm===mapFile(job.map)&&b.hp>0&&Date.now()-b.at<15000);
    candidates.sort((a,b)=>b.at-a.at||distance(pos,a)-distance(pos,b));
    if(candidates[0]){job.lastBoss={...candidates[0]};job.entityId=null;job.identityReset=true;job.samples=[];job.trackingSource='Recent sighting; awaiting live confirmation';}
  }
  function observeApexEntities(){
    rememberApexSightings();const job=apex.active,realm=apexObservedRealm();if(!job||job.dead||realm&&realm!==mapFile(job.map)||!loadMobCatalog())return;
    const tracked=serverWorld.entities.get(job.entityId),verified=tracked&&!mobCatalogTrusted&&verifiedMobTypes.get(tracked.type);
    if(verified&&verified.type!==job.type){job.entityId=null;job.zeroHP=null;job.lastBoss=null;job.samples=[];job.standTarget=null;job.hazard=null;}
    if(tracked&&(tracked.kind===1||tracked.kind===6)&&tracked.rarity>=9&&(verified?.type||mobIDs[tracked.type])===job.type&&tracked.hp===0&&Date.now()-serverWorld.updatedAt<1500){if(job.zeroHP?.id!==tracked.id)job.zeroHP={id:tracked.id,at:serverWorld.updatedAt};if(serverWorld.updatedAt-job.zeroHP.at>=350){job.dead=true;job.killedAt=Date.now();job.lastBoss={...job.lastBoss,x:tracked.x,y:tracked.y,radius:tracked.radius,hp:0,at:serverWorld.updatedAt,id:tracked.id};}return;}if(tracked?.hp>0)job.zeroHP=null;
    const candidates=[...serverWorld.entities.values()].filter(e=>(e.kind===1||e.kind===6)&&apexMobType(e)===job.type&&e.rarity>=9&&Number.isFinite(e.hp)&&e.hp>0&&Number.isFinite(e.x)&&Number.isFinite(e.y));
    let boss=job.entityId!=null?candidates.find(e=>e.id===job.entityId):candidates.sort((a,b)=>b.radius-a.radius)[0];
    if(!boss&&!tracked&&job.lastBoss?.at>0&&Date.now()-serverWorld.updatedAt<1500&&Date.now()-job.lastBoss.at>2000){
      const age=Math.min(10,(Date.now()-job.lastBoss.at)/1000),limit=Math.max(2000,Math.hypot(job.lastBoss.vx||0,job.lastBoss.vy||0)*age+1000);
      boss=candidates.filter(e=>distance(e,job.lastBoss)<=limit&&e.hp<=job.lastBoss.hp+.03&&Math.abs(e.radius-job.lastBoss.radius)<=Math.max(50,job.lastBoss.radius*.25)).sort((a,b)=>distance(a,job.lastBoss)-distance(b,job.lastBoss))[0];
    }
    if(!boss)return;if(job.entityId!==boss.id){job.zeroHP=null;job.samples=[];job.standTarget=null;job.hazard=null;}job.trackingSource=mobCatalogTrusted?'Current game registry':verifiedMobTypes.has(boss.type)?'Screen-confirmed name':'Catalog ID';job.entityId=boss.id;job.identityReset=false;job.lastBoss={x:boss.x,y:boss.y,hp:boss.hp,radius:boss.radius,vx:boss.vx||0,vy:boss.vy||0,angle:boss.angle,at:serverWorld.updatedAt,id:boss.id};
    const observedAt=serverWorld.updatedAt||Date.now();
    if(job.samples.length&&boss.hp>job.samples.at(-1).hp+.02)job.samples=[];
    if(!job.samples.length||observedAt-job.samples.at(-1).at>700){job.samples.push({hp:boss.hp,at:observedAt});job.samples=job.samples.filter(s=>Date.now()-s.at<30000).slice(-40);}
  }
  function apexTargetVisible(job,age=1500){return !!(job&&!job.dead&&!job.identityReset&&job.lastBoss&&job.lastBoss.hp>0&&Date.now()-job.lastBoss.at<age);}
  function apexDecay(job){
    const list=job.samples;if(list.length<3)return null;const first=list[0],last=list.at(-1);if(last.at-first.at<2000)return null;
    const meanT=list.reduce((n,s)=>n+(s.at-first.at)/1000,0)/list.length,meanHP=list.reduce((n,s)=>n+s.hp,0)/list.length;
    let cov=0,variance=0;for(const s of list){const t=(s.at-first.at)/1000-meanT;cov+=t*(s.hp-meanHP);variance+=t*t;}
    const rate=-cov/variance;return Number.isFinite(rate)&&rate>1e-10?rate:null;
  }
  async function ensureApexVision(job,token){
    if(job.searchPetal&&job.searchPetalPreset===job.preset)return true;
    if(!await swapTravelLoadout(token,['1']))return false;
    job.searchPetal=true;job.searchPetalPreset=job.preset;job.visionSince=Date.now();job.viewScale=null;return true;
  }
  function measureApexView(){
    const job=apex.active,now=Date.now();if(!job||job.dead||!job.searchPetal||job.viewScale?.source==='Rendered terrain grid'&&now-job.viewScale.at<500||now-(job.visionSince||now)<300||now-(job.viewMeasuredAt||0)<250||!pos||now-serverWorld.updatedAt>1000)return;job.viewMeasuredAt=now;
    const byType=new Map();for(const e of serverWorld.entities.values())if((e.kind===1||e.kind===6)&&e.hp>0){const type=apexMobType(e);if(!type)continue;const key=type+':'+e.rarity;if(byType.has(key))byType.set(key,null);else byType.set(key,e);}
    const names=visualRows.filter(r=>r.type),scales=[];
    for(const rarity of visualRows.filter(r=>r.rarity!==undefined).sort((a,b)=>b.rarity-a.rarity).slice(0,60)){
      const score=n=>renderedLabelScore(rarity,n),matches=names.filter(n=>n.fontSize>rarity.fontSize*1.05&&n.x<=rarity.x+20&&score(n)<Math.max(2,3*(n.textScale||1))).sort((a,b)=>score(a)-score(b));
      if(!matches[0]||matches[1]&&score(matches[1])-score(matches[0])<=.75)continue;
      const e=byType.get(matches[0].type+':'+rarity.rarity);if(!e||Math.abs(e.x-pos.x)<500)continue;
      const scale=(rarity.x-game.width/2)/(e.x-pos.x);if(Number.isFinite(scale)&&scale>.002&&scale<5)scales.push(scale);
    }
    if(scales.length<3)return;scales.sort((a,b)=>a-b);const median=scales[Math.floor(scales.length/2)],close=scales.filter(v=>Math.abs(v-median)<median*.2);if(close.length>=3)job.viewScale={scale:median,at:now};
  }
  function apexViewCoverage(job){
    const view=job?.viewScale;if(!view||Date.now()-view.at>3000)return null;
    const width=game.width/view.scale,height=game.height/view.scale,required=job.lastBoss?apexStandRadius(job):null;return {widthUnits:Math.round(width),heightUnits:Math.round(height),requiredCenterDistance:required===null?null:Math.round(required),centerMayBeBeyondView:required!==null&&required>Math.hypot(width,height)/2};
  }
  function apexScanWidth(job=apex.active){const view=job?.viewScale;return job?.searchPetal&&view&&Date.now()-view.at<3000?Math.max(600,Math.min(2200,Math.floor(Math.min(game.width,game.height)/(view.scale*2.8)/100)*100)):600;}
  function apexSpawnMask(type,grouped=false){
    if(!type||!gardenData?.map)return null;
    const groups=mobCatalog?.[type]?.groups,names=grouped?(Array.isArray(groups)?groups:Object.keys(groups||{})):[type];if(!names.length)return null;
    const zones=(gardenData.map.layers.find(l=>l.name==='spawns')?.objects||[]).filter(o=>String(props(o).mobs||'').split(/[^a-z_]+/i).some(t=>names.includes(t)));
    if(!zones.length)return null;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=gardenData.size;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.scale(gardenData.size/gardenData.worldW,gardenData.size/gardenData.worldH);ctx.fillStyle='#fff';for(const o of zones){shapePath(ctx,o);ctx.fill();}
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;return Uint8Array.from(gardenOpen,(_,i)=>pixels[i*4+3]>127?1:0);
  }
  function apexOrderTargets(g,source,entries){
    const remaining=new Map();for(const entry of entries){const cell=g.nearest(mapping.toMap(entry.world),'Search point',3),old=remaining.get(cell);if(!old||entry.priority<old.priority)remaining.set(cell,entry);}
    const targets=[],seen=new Uint32Array(g.open.length),queue=new Uint32Array(g.open.length);let stamp=0,current=source;
    while(remaining.size){
      const priority=Math.min(...[...remaining.values()].map(e=>e.priority));stamp++;let head=0,tail=1,chosen=-1;queue[0]=current;seen[current]=stamp;
      while(head<tail){const cell=queue[head++],entry=remaining.get(cell);if(entry&&entry.priority===priority){chosen=cell;break;}for(const next of neighbors(g,cell))if(g.open[next]&&seen[next]!==stamp){seen[next]=stamp;queue[tail++]=next;}}
      if(chosen<0)break;targets.push(remaining.get(chosen).world);remaining.delete(chosen);current=chosen;
    }return targets;
  }
  function apexSearchTargets(wide=false){
    if(!gardenReady){const first=chooseArea(position()),targets=[first.goal];for(let i=0;i<first.count;i++){const a=chooseArea(position(),i),p=zonePoints(a);targets.push(p.center,...p.corners);}return targets;}
    const g=grid(),reachable=search(g,mapping.toMap(position())),buckets=new Map(),width=apexScanWidth(),special=apexSpawnMask(apex.active?.type),family=wide?apexSpawnMask(apex.active?.type,true):null;
    for(let i=0;i<g.open.length;i++){
      const ultra=gardenRanks[i]>=6&&gardenRanks[i]!==255,preferred=!!special?.[i];
      if(!g.open[i]||reachable.steps[i]<0||!wide&&!ultra)continue;
      const world=mapping.toWorld(g.point(i)),bx=Math.floor(world.x/width),by=Math.floor(world.y/width),priority=ultra?0:preferred?1:family?.[i]?2:3,key=priority+':'+bx+':'+by;
      const error=Math.hypot(world.x-(bx+.5)*width,world.y-(by+.5)*width),old=buckets.get(key);
      if(!old||error<old.error)buckets.set(key,{world,error,priority});
    }
    // Follow walking distance through doors and corridors, rather than proximity through walls.
    if(!buckets.size&&!wide)return apexSearchTargets(true);
    const targets=apexOrderTargets(g,reachable.source,[...buckets.values()]);
    if(apex.active)apex.active.searchPlan={wide,spacing:width,points:targets.length,specificSpawn:!!special,familySpawn:!!family,createdAt:Date.now()};
    return targets;
  }
  function apexReacquireTargets(job){
    const b=job.lastBoss,bearing=Math.atan2(pos.y-b.y,pos.x-b.x),offset=apexStandRadius(job)+Math.hypot(gardenData.worldW,gardenData.worldH)/gardenData.size,targets=[];
    const age=Math.min(1.2,Math.max(0,(Date.now()-b.at)/1000)),speed=Math.hypot(b.vx||0,b.vy||0),factor=speed?Math.min(age,1000/speed):0,predicted={x:b.x+(b.vx||0)*factor,y:b.y+(b.vy||0)*factor};
    const centers=speed>50?[predicted,b]:[b];
    for(const center of centers)for(const turn of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8]){const angle=bearing+turn*Math.PI/8;targets.push({x:center.x+Math.cos(angle)*offset,y:center.y+Math.sin(angle)*offset});}
    try{const g=grid(apexSafetyMask(job)),reachable=search(g,mapping.toMap(position())),used=new Set(),candidates=[];for(const wanted of targets){try{const cell=g.nearest(mapping.toMap(wanted),'Apex reacquisition point',8),world=mapping.toWorld(g.point(cell));if(used.has(cell)||reachable.steps[cell]<0||distance(world,b)<apexStandRadius(job))continue;used.add(cell);candidates.push({world,priority:0});}catch{}}return apexOrderTargets(g,reachable.source,candidates);}catch{return targets;}
  }
  function apexRecordCoverage(job){
    if(!job||job.dead||phase!=='searching Apex Ultra+ zone'||!pos||Date.now()-serverWorld.updatedAt>1000||serverWorld.realm&&serverWorld.realm!==mapFile(job.map))return;
    const seen=job.coverageSeen||(job.coverageSeen=new Map()),now=Date.now(),width=600,bx=Math.floor(pos.x/width),by=Math.floor(pos.y/width),view=job.viewScale,radius=view&&now-view.at<3000?Math.max(400,Math.min(2500,Math.min(game.width,game.height)/view.scale*.3)):400,extent=Math.ceil(radius/width);
    for(let y=by-extent;y<=by+extent;y++)for(let x=bx-extent;x<=bx+extent;x++)if(Math.hypot(pos.x-(x+.5)*width,pos.y-(y+.5)*width)<radius)seen.set(x+':'+y,now);
    if(seen.size>4000)for(const [key,at] of seen)if(now-at>60000)seen.delete(key);
  }
  function apexRecentlyScanned(job,target){return Date.now()-(job.coverageSeen?.get(Math.floor(target.x/600)+':'+Math.floor(target.y/600))||0)<30000;}
  function apexWorldStale(){return serverWorld.rejected>20&&Date.now()-serverWorld.updatedAt>2000;}
  function apexNeedsWorldRefresh(){
    const records=[...serverWorld.entities.values()],complete=e=>(e.kind===1||e.kind===6)&&Number.isFinite(e.type)&&Number.isFinite(e.rarity),job=apex.active;
    const missing=records.filter(e=>e.kind<0||(e.kind===1||e.kind===6)&&!Number.isFinite(e.type)).length,badRate=serverWorld.rejected>20&&serverWorld.rejected/(serverWorld.frames+serverWorld.rejected)>.1;
    if(missing>=5&&(!records.some(complete)||missing/records.length>.15||badRate))return true;
    if(job&&!job.lastBoss&&missing&&phase==='searching Apex Ultra+ zone'&&Date.now()-(job.searchBeganAt||Date.now())>15000)return true;
    return !records.length&&serverWorld.rejected>20&&(serverWorld.lastFailure||serverWorld.lastReject)?.stage==='world entities';
  }
  function shouldRejoinApex(job,etaSeconds){const rate=apexDecay(job);if(!job.lastBoss)return true;if(rate===null)return job.lastBoss.hp>.20;const stale=Math.max(0,(Date.now()-job.lastBoss.at)/1000);job.returnETA=etaSeconds;return job.lastBoss.hp-rate*(etaSeconds+stale)>.20;}
  async function selectLoadout(number,token){
    release();alt('keyup');if(!await liveGate(token)||scene()!=='play')return false;
    const valid=()=>running&&token===version&&scene()==='play'&&!document.hidden&&document.hasFocus();
    send('keydown','l');await wait(100);if(!valid()){send('keyup','l');return false;}
    send('keydown',String(number));await wait(100);send('keyup',String(number));if(!valid()){send('keyup','l');return false;}
    await wait(60);send('keyup','l');if(!valid())return false;await wait(40);if(valid()&&apex.active){apex.active.searchPetal=false;apex.active.viewScale=null;if(apex.active.preset!==number)apex.active.movementSpeed=300;apex.active.preset=number;}return valid();
  }
  function mapFile(name){if(name==='Jellyfish zone')return 'ocean';return name.endsWith('Ant Hell')?'ant_hell':name.toLowerCase();}
  function setFarmMap(name,rarity='Ultra+'){
    spawnSelect.value=name;gardenReady=false;gardenData=null;mapping=null;gridCache=null;realmShapeCache=null;colorPixels=null;terrainPixels=null;patrolPreview=null;route=[];raritySelect.value=rarity;
    if(!initGarden())throw Error('Automatic Apex navigation requires the game map assets.');raritySelect.value=[...raritySelect.options].some(o=>o.value===rarity)?rarity:'Ultra+';
  }
  async function apexEnsureSpawn(job,token,loadout=2){
    let clicked=0,chosen=false,lastKind='',loaded=false;
    while(running&&token===version){
      if(!await liveGate(token))return false;
      const info=screenInfo();
      if(info.kind==='play'){
        const tutorial=freshText('Skip Tutorial');if(tutorial){await clickPoint(tutorial,token);await wait(150);}
        if(serverWorld.realm&&serverWorld.realm!==mapFile(job.map)){await returnToSpawnMenu(token);await wait(200);continue;}
        if(!pos||Date.now()-pos.updatedAt>1500){await preparePosition(token);await wait(100);continue;}
        if(!loaded){if(!await selectLoadout(loadout,token))continue;loaded=true;job.searchPetal=false;job.viewScale=null;firstLoadoutSwapDone=true;deathLoadoutSwapPending=false;deathLoadoutLatched=false;}
        return true;
      }
      release();if(lastKind!==info.kind){clicked=0;chosen=false;lastKind=info.kind;}
      if(Date.now()-clicked>1500){
        if(info.kind==='menu'&&!chosen){const p=spawnPoint(info);if(p){await clickPoint(p,token);chosen=true;clicked=Date.now()-1000;}}
        else{await clickPoint(info.button,token);clicked=Date.now();}
      }
      await wait(180);
    }return false;
  }
  function apexThreats(){
    if(Date.now()-serverWorld.updatedAt>1000)return [];
    return [...serverWorld.entities.values()].filter(e=>((e.kind===1&&e.rarity>=6&&e.hp>0)||(e.kind===3))&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&distance(position(),e)<3000+(e.radius||0));
  }
  function apexInUltraZone(){
    if(!gardenReady||!mapping||!pos||!gardenRanks)return false;
    const m=mapping.toMap(position()),x=Math.floor(m.x+.5),y=Math.floor(m.y+.5),size=gardenData.size;
    return x>=0&&y>=0&&x<size&&y<size&&gardenOpen[y*size+x]&&gardenRanks[y*size+x]>=6&&gardenRanks[y*size+x]!==255;
  }
  function apexGap(){return Math.max(100,Math.min(2000,Number(apexDistance.value)||800));}
  function apexKnownBoss(job){
    const b=job?.lastBoss;return !job?.dead&&b&&b.hp>0?b:null;
  }
  function apexHealthGuard(){
    const job=apex.active,own=serverWorld.own;if(!job||job.dead||!own||Date.now()-own.at>1000||!Number.isFinite(own.hp)||!Number.isFinite(own.maxHP)||own.maxHP<=0)return 0;
    const fraction=own.hp/own.maxHP;if(fraction<=.45)job.healthRetreat=true;else if(fraction>=.7)job.healthRetreat=false;
    return job.healthRetreat?240:0;
  }
  function apexStandRadius(job){
    const b=job.lastBoss,moving=Date.now()-b.at<1500;
    return (b.radius||0)+apexGap()+apexHealthGuard()+80+(moving?Math.min(450,Math.hypot(b.vx||0,b.vy||0)*.25):0);
  }
  function apexSafetyBosses(job){
    if(job?.dead)return [];
    const known=apexKnownBoss(job),list=known?[known]:[];
    if(Date.now()-serverWorld.updatedAt<1000)for(const e of serverWorld.entities.values()){
      if((e.kind===1||e.kind===6)&&e.rarity>=9&&e.hp>0&&e.id!==known?.id&&Number.isFinite(e.x)&&Number.isFinite(e.y))list.push({...e,at:serverWorld.updatedAt});
    }return list;
  }
  function apexSafetyMask(job){
    const bosses=apexSafetyBosses(job);let mask=null;
    for(const b of bosses){const circle=apexCircleMask(b,apexStandRadius({lastBoss:b}));if(!mask)mask=circle;else for(let i=0;i<mask.length;i++)mask[i]&=circle[i];}
    return mask;
  }
  function apexCircleMask(b,radius){
    const mask=new Uint8Array(gardenOpen.length).fill(1),c=mapping.toMap(b),size=gardenData.size;
    const cellX=gardenData.worldW/size,cellY=gardenData.worldH/size,rx=radius/cellX+.5,ry=radius/cellY+.5;
    // Exclude every cell whose footprint intersects the safety circle, not just its center.
    for(let y=Math.max(0,Math.floor(c.y-ry));y<Math.min(size,Math.ceil(c.y+ry)+1);y++)for(let x=Math.max(0,Math.floor(c.x-rx));x<Math.min(size,Math.ceil(c.x+rx)+1);x++){
      const dx=Math.max(0,Math.abs(x-c.x)-.5)*cellX,dy=Math.max(0,Math.abs(y-c.y)-.5)*cellY;
      if(Math.hypot(dx,dy)<radius)mask[y*size+x]=0;
    }return mask;
  }
  function apexRetreatPoint(job){
    const b=job.lastBoss,p=position(),g=grid(),offset=apexStandRadius(job),buffer=Math.hypot(gardenData.worldW,gardenData.worldH)/gardenData.size;
    const bearing=Math.atan2(p.y-b.y,p.x-b.x),r=distance(p,b);let best=null;
    for(const turn of [0,1,-1,2,-2,3,-3,4,-4]){
      const angle=bearing+turn*Math.PI/8,dx=Math.cos(angle),dy=Math.sin(angle),dot=(p.x-b.x)*dx+(p.y-b.y)*dy;
      if(dot<-.01)continue;
      const toRing=-dot+Math.sqrt(Math.max(0,dot*dot+(offset+buffer)**2-r*r));
      for(const step of [toRing,240,120,60]){
        if(step<=0)continue;const world={x:p.x+dx*step,y:p.y+dy*step};
        if(distance(world,b)<=r+1||!clearLine(g,mapping.toMap(p),mapping.toMap(world)))continue;
        const score=(distance(world,b)-r)/step+(step===toRing?2:0);
        if(!best||score>best.score)best={world,path:[mapping.toMap(p),mapping.toMap(world)],retreat:true,score};
        break;
      }
    }return best;
  }
  function apexSafeKeys(job,keys,seconds=.09,speed=300){
    const bosses=apexSafetyBosses(job);if(!bosses.length||!gardenReady)return keys;
    if(!pos||Date.now()-pos.updatedAt>1500)return [];
    const p=position(),own=serverWorld.own;
    const liveSpeed=own&&Date.now()-own.at<1000?Math.hypot(own.vx||0,own.vy||0):0;
    job.movementSpeed=Math.max(speed,liveSpeed,(job.movementSpeed||300)*.85);
    const duration=seconds+.06,step=job.movementSpeed*duration,g=grid();
    const direction=list=>({x:Number(list.includes('d'))-Number(list.includes('a')),y:Number(list.includes('s'))-Number(list.includes('w'))});
    const safe=list=>{
      const d=direction(list),len=Math.hypot(d.x,d.y);
      const dx=len?d.x/len*step:0,dy=len?d.y/len*step:0,q={x:p.x+dx,y:p.y+dy};
      if(len&&!clearLine(g,mapping.toMap(p),mapping.toMap(q)))return false;
      const projectiles=apexThreats().filter(e=>e.kind===3&&e.hp>0);
      for(const e of projectiles){const rx=p.x-e.x,ry=p.y-e.y,vx=dx-(e.vx||0)*duration,vy=dy-(e.vy||0)*duration,t=Math.max(0,Math.min(1,-(rx*vx+ry*vy)/(vx*vx+vy*vy||1))),current=Math.hypot(rx,ry),radius=(e.radius||20)+85;
        if(current<radius){if(len&&(rx*dx+ry*dy<0||Math.hypot(rx+dx,ry+dy)<=current))return false;}
        else if(Math.hypot(rx+vx*t,ry+vy*t)<radius)return false;
      }
      return bosses.every(b=>{
        const radius=apexStandRadius({lastBoss:b}),current=distance(p,b),moving=Date.now()-b.at<1500,rx=p.x-b.x,ry=p.y-b.y,vx=dx-(moving?b.vx||0:0)*duration,vy=dy-(moving?b.vy||0:0)*duration;
        const t=Math.max(0,Math.min(1,-(rx*vx+ry*vy)/(vx*vx+vy*vy||1))),closest=Math.hypot(rx+vx*t,ry+vy*t);
        if(current<radius)return rx*dx+ry*dy>=-.01&&Math.hypot(rx+dx,ry+dy)>current+1;
        return closest>=radius;
      });
    };
    if(safe(keys))return keys;
    job.gapBlockedAt=Date.now();
    if(safe([]))return [];
    const directions=[['d'],['d','s'],['s'],['s','a'],['a'],['a','w'],['w'],['w','d']];
    const candidates=directions.filter(safe).sort((a,c)=>{
      const score=list=>{const d=direction(list),len=Math.hypot(d.x,d.y);return Math.min(...bosses.map(b=>Math.hypot(p.x+d.x/len*step-b.x,p.y+d.y/len*step-b.y)-apexStandRadius({lastBoss:b})));};return score(c)-score(a);
    });return candidates[0]||[];
  }
  function apexTravelMask(){
    if(!gardenReady||!mapping)return null;
    const threats=apexThreats().filter(e=>e.kind===3),p=position(),bossMask=apexSafetyMask(apex.active),blocked=[];
    for(const [id,until] of apex.active?.blockerAvoid||[]){if(until<Date.now()){apex.active.blockerAvoid.delete(id);continue;}const e=serverWorld.entities.get(id);if(e&&distance(p,e)>(e.radius||20)+100)blocked.push(e);}
    if(!threats.length&&!bossMask&&!blocked.length)return null;const mask=bossMask||new Uint8Array(gardenOpen.length).fill(1);
    for(const e of blocked){const circle=apexCircleMask(e,(e.radius||20)+80);for(let i=0;i<mask.length;i++)mask[i]&=circle[i];}
    for(const e of threats){const radius=(e.radius||20)+90;if(distance(p,e)<radius)continue;const m=mapping.toMap(e),rx=radius*gardenData.size/gardenData.worldW,ry=radius*gardenData.size/gardenData.worldH;
      for(let y=Math.max(0,Math.floor(m.y-ry));y<Math.min(gardenData.size,Math.ceil(m.y+ry));y++)for(let x=Math.max(0,Math.floor(m.x-rx));x<Math.min(gardenData.size,Math.ceil(m.x+rx));x++)if(((x-m.x)/rx)**2+((y-m.y)/ry)**2<1)mask[y*gardenData.size+x]=0;
    }return mask;
  }
  async function clearApexBlocker(id,job,token){
    const savedPhase=phase,fight={standDistance:150};let lastHP=Infinity,damageAt=Date.now(),encounterAt=Date.now();phase='clearing route mob';
    try{
      while(running&&token===version&&!job.dead&&scene()==='play'){
        if(apexWorldStale()){release();alt('keyup');return true;}
        if(!await liveGate(token))return false;
        const mob=serverWorld.entities.get(id);if(!mob||mob.hp<=0)return true;
        if(Date.now()-encounterAt>12000){(job.blockerAvoid??=new Map()).set(id,Date.now()+30000);apexStatus.textContent='Route mob is delaying the Apex hunt. Trying another path.';return true;}
        if(mob.hp<lastHP-1e-7){lastHP=mob.hp;damageAt=Date.now();}else if(Date.now()-damageAt>6000){
          (job.blockerAvoid??=new Map()).set(id,Date.now()+20000);apexStatus.textContent='Route mob is taking no damage. Continuing the Apex search by another path.';return true;
        }
        if(!job.zoneEntered&&apexInUltraZone())job.zoneEntered=true;
        if(job.zoneEntered&&job.preset!==3&&!await selectLoadout(3,token))continue;
        if(!await ensureApexVision(job,token))continue;
        if(apexTargetVisible(job))return true;
        alt('keyup');send(job.preset===3?'keydown':'keyup',' ');
        fight.lastBoss=mob;fight.standDistance=(mob.radius||0)+140;const stand=apexStandPoint(fight),name=mobCatalog?.[mobIDs[mob.type]]?.name||'mob';
        apexStatus.textContent=`Clearing ${name} (${(mob.hp*100).toFixed(1)}% HP) with L${job.preset||2}.`;
        if(!stand||distance(position(),stand.world)<60){hold([]);await wait(100);continue;}
        const next=mapping.toWorld(stand.path[Math.min(1,stand.path.length-1)]),p=position(),keys=[];
        if(Math.abs(next.x-p.x)>25)keys.push(next.x>p.x?'d':'a');if(Math.abs(next.y-p.y)>25)keys.push(next.y>p.y?'s':'w');hold(apexSafeKeys(job,keys));await wait(90);
      }return false;
    }finally{if(token===version){release();phase=savedPhase;}job.blockerId=null;}
  }
  async function apexNavigate(destination,job,token,ignoreDeath=false){
    let attempts=0,failedPlans=0;job.navigateOutcome=null;
    while(running&&token===version&&(ignoreDeath||!job.dead)&&scene()==='play'){
      if(!ignoreDeath&&!job.worldRefreshed&&apexNeedsWorldRefresh()){release();alt('keyup');job.navigateOutcome='snapshot';return true;}
      if(!ignoreDeath&&apexWorldStale()){release();alt('keyup');apexStatus.textContent='Apex movement paused until fresh mob updates arrive.';job.navigateOutcome='world';return true;}
      if(!ignoreDeath&&phase==='searching Apex Ultra+ zone'&&apexTargetVisible(job)){job.navigateOutcome='found';return true;}
      const known=!ignoreDeath&&gardenReady&&apexSafetyBosses(job).find(b=>distance(position(),b)<apexStandRadius({lastBoss:b})+80);
      if(known){
        const escape=apexRetreatPoint({...job,lastBoss:known});const p=position(),next=escape?.world,keys=[];
        if(next){if(Math.abs(next.x-p.x)>25)keys.push(next.x>p.x?'d':'a');if(Math.abs(next.y-p.y)>25)keys.push(next.y>p.y?'s':'w');}
        hold(apexSafeKeys(job,keys));apexStatus.textContent='Retreating to restore the Apex border gap.';await wait(90);continue;
      }
      goal=destination;try{
        if(job.zoneEntered&&job.preset===3&&!ignoreDeath){alt('keyup');send('keydown',' ');}
        const allowed=ignoreDeath?null:apexTravelMask(),g=grid(allowed),cell=g.nearest(mapping.toMap(destination),'Apex route destination',allowed?16:3),safeGoal=mapping.toWorld(g.point(cell));
        const path=plan(position(),safeGoal,allowed);
        const result=await navigate(path,token,false);
        if(result==='engage'&&job.blockerId){if(!await clearApexBlocker(job.blockerId,job,token))return false;continue;}
        if(result==='arrived'||result==='found'||result==='zone'||result==='view'||result==='snapshot'){job.navigateOutcome=result;return true;}if(result==='screen'||result==='stopped')return false;
      }catch(error){apex.lastError=error.message;if(++failedPlans>=3){release();job.navigateOutcome='blocked';return false;}}
      if(++attempts>20){release();apexStatus.textContent='Checking another route around the map walls.';return false;}release();await wait(180);
    }return false;
  }
  function apexStandPoint(job){
    const b=job.lastBoss,p=position(),radius=(b.radius||0)+45,offset=job.standDistance?Math.max(radius+25,job.standDistance):apexStandRadius(job);
    if(!job.standDistance&&distance(p,b)<offset+80){job.standTarget=null;return apexRetreatPoint(job);}
    const inside=distance(p,b)<radius;if(!job.side||inside)job.side=p.x<b.x?-1:1;const sign=job.side;
    // Keep routes around the boss's body as well as the map's walls.
    let allowed=null;
    if(!inside){
      const exclusion=job.standDistance?radius:offset;
      if(!job.hazard||distance(job.hazard.center,b)>0||job.hazard.radius!==exclusion||!job.standDistance&&apexSafetyBosses(job).length>1){
        const mask=job.standDistance?apexCircleMask(b,exclusion):apexSafetyMask(job);
        job.hazard={mask,center:{x:b.x,y:b.y},radius:exclusion};
      }allowed=job.hazard.mask;
    }
    const threats=apexThreats().filter(e=>e.kind===3&&e.id!==b.id);if(threats.length){allowed=allowed?allowed.slice():new Uint8Array(gardenOpen.length).fill(1);for(const e of threats){const r=(e.radius||20)+85;if(distance(p,e)<r)continue;const c=mapping.toMap({x:e.x+(e.vx||0)*.2,y:e.y+(e.vy||0)*.2}),rx=r*gardenData.size/gardenData.worldW,ry=r*gardenData.size/gardenData.worldH;for(let y=Math.max(0,Math.floor(c.y-ry));y<Math.min(gardenData.size,Math.ceil(c.y+ry));y++)for(let x=Math.max(0,Math.floor(c.x-rx));x<Math.min(gardenData.size,Math.ceil(c.x+rx));x++)if(((x-c.x)/rx)**2+((y-c.y)/ry)**2<1)allowed[y*gardenData.size+x]=0;}}
    const g=grid(allowed),candidates=[],bearing=Math.atan2(p.y-b.y,p.x-b.x),sampleOffset=offset+(job.standDistance?0:Math.hypot(gardenData.worldW,gardenData.worldH)/gardenData.size);
    // Reuse a valid nearby stand-off target instead of changing sides every frame.
    const prior=job.standTarget,slack=Math.max(100,sampleOffset-offset+80);
    if(prior&&distance(prior.boss,b)<60&&distance(p,prior.world)<Math.max(400,offset*.6)&&distance(prior.world,b)>=offset&&distance(prior.world,b)<=offset+slack){try{
      const path=plan(p,prior.world,allowed);return {world:prior.world,path,vertical:Math.abs(prior.world.y-b.y)>Math.abs(prior.world.x-b.x)};
    }catch{}}
    // Sample the whole circle, starting on the player's current side.
    if(inside){const dx=p.x-b.x,dy=p.y-b.y,len=Math.hypot(dx,dy)||1;candidates.push({x:b.x+dx/len*sampleOffset,y:b.y+dy/len*sampleOffset});}
    for(const turn of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8]){const angle=bearing+turn*Math.PI/8;candidates.push({x:b.x+Math.cos(angle)*sampleOffset,y:b.y+Math.sin(angle)*sampleOffset});}
    for(const wanted of candidates){try{
      const cell=g.nearest(mapping.toMap(wanted),'Apex stand-off',8),world=mapping.toWorld(g.point(cell));
      if(distance(world,b)<radius||!job.standDistance&&distance(world,b)<offset)continue;
      const path=plan(p,world,allowed);job.standTarget={world,boss:{x:b.x,y:b.y}};return {world,path,vertical:Math.abs(world.y-b.y)>Math.abs(world.x-b.x)};
    }catch{}}
    return null;
  }
  async function runApex(job,token){
    const saved={map:spawnSelect.value,rarity:raritySelect.value};job.savedFarm=saved;apex.active=job;release();travelLoadoutActive=false;
    let tripBegan=Date.now(),arrived=false,dps=false,searchIndex=0,searchTargets=null,searchFailures=0,searchWide=false,lootStarted=null;
    try{
      if(mobCatalogRefresh){apexStatus.textContent='Checking the current public mob identities…';await mobCatalogRefresh;if(!running||token!==version)return;}
      setFarmMap(job.map,'Ultra+');phase='Apex travel';
      if(!await apexEnsureSpawn(job,token))return;
      seedApexSighting(job);observeApexEntities();
      // A console hook attached mid-life can receive coordinates without the original mob type records.
      if(!job.worldRefreshed&&apexNeedsWorldRefresh()){
        job.worldRefreshed=true;apexStatus.textContent='Refreshing incomplete mob records through the spawn menu…';
        await returnToSpawnMenu(token);if(!running||token!==version)return;
        if(scene()!=='play'&&!await apexEnsureSpawn(job,token))return;
      }
      tripBegan=Date.now();job.searchBeganAt=tripBegan;
      while(running&&token===version){
        if(!await liveGate(token))return;
        if(job.dead)break;
        if(scene()==='play'&&!job.worldRefreshed&&apexNeedsWorldRefresh()){
          job.worldRefreshed=true;release();phase='refreshing mob snapshot';apexStatus.textContent='Player updates work, but mob records are incomplete. Refreshing once through the spawn menu.';
          await returnToSpawnMenu(token);if(!running||token!==version)return;
          if(scene()!=='play'&&!await apexEnsureSpawn(job,token))return;
          dps=false;arrived=false;searchTargets=null;searchIndex=0;job.zoneEntered=false;job.engagedThisLife=false;tripBegan=Date.now();continue;
        }
        if(scene()!=='play'){
          release();alt('keyup');dps=false;
          const eta=Math.max(8,(job.travelMs||Date.now()-tripBegan)/1000+8);
          if(shouldRejoinApex(job,eta)){phase='Apex respawn';apexStatus.textContent=job.lastBoss?`Respawning: expected Apex HP on return >20% (${Math.round(eta)}s).`:'Respawning to continue searching; Apex HP has not been observed yet.';if(!await apexEnsureSpawn(job,token))return;tripBegan=Date.now();arrived=false;job.zoneEntered=false;job.engagedThisLife=false;}
          else{phase='waiting dead for Apex';apexStatus.textContent='Waiting for the Apex defeat announcement; estimated HP on return is below 20%.';await wait(250);}
          continue;
        }
        if(apexWorldStale()){
          release();alt('keyup');phase='waiting for mob updates';const failure=serverWorld.lastFailure;
          apexStatus.textContent='Mob updates are unavailable; holding while the stream recovers'+(failure?.reason?' ('+failure.reason+').':'.');await wait(250);continue;
        }
        if(!await ensureApexVision(job,token))continue;observeApexEntities();
        if(!job.zoneEntered&&apexInUltraZone())job.zoneEntered=true;
        if(job.zoneEntered&&!dps){dps=job.preset===3||await selectLoadout(3,token);if(!dps)continue;if(!await ensureApexVision(job,token))continue;alt('keydown');}
        const boss=apexTargetVisible(job,1800)?job.lastBoss:null;
        if(!boss){
          alt('keyup');if(dps)send('keydown',' ');phase='searching Apex Ultra+ zone';
          const spacing=apexScanWidth(job),oldSpacing=job.searchPlan?.spacing||600;if(!searchTargets||spacing>=oldSpacing*1.3||spacing<oldSpacing*.8){searchTargets=apexSearchTargets(searchWide);searchIndex=0;}
          if(searchIndex>=searchTargets.length){searchWide=true;searchTargets=apexSearchTargets(true);searchIndex=0;}
          if(!searchTargets.length){release();apexStatus.textContent='No reachable Apex search floor with the current wall margin.';await wait(500);continue;}
          const canReacquire=job.lastBoss&&Date.now()-job.lastBoss.at<60000&&job.reacquireExhaustedAt!==job.lastBoss.at;
          let skipped=0;while(!canReacquire&&searchIndex<searchTargets.length&&apexRecentlyScanned(job,searchTargets[searchIndex])&&skipped++<searchTargets.length)searchIndex++;
          if(searchIndex>=searchTargets.length){searchTargets=apexSearchTargets(true);searchWide=true;searchIndex=searchTargets.findIndex(p=>!apexRecentlyScanned(job,p));if(searchIndex<0){searchIndex=searchTargets.length;release();apexStatus.textContent='Nearby search floor was just scanned. Watching for fresh Apex sightings.';await wait(500);continue;}}
          let target=searchTargets[searchIndex%searchTargets.length];
          let reacquiring=false;
          if(canReacquire){
            if(!job.reacquire)job.reacquire={targets:apexReacquireTargets(job),index:0};
            if(job.reacquire.index<job.reacquire.targets.length){target=job.reacquire.targets[job.reacquire.index];reacquiring=true;apexStatus.textContent='Apex moved out of view. Checking reachable floor around its last known position.';}
            else{job.reacquireExhaustedAt=job.lastBoss.at;job.reacquire=null;}
          }
          if(!reacquiring){
            apexStatus.textContent=`Searching for ${job.name}: ${searchWide?'Ultra+ first, then wider biome':'Ultra+'} coverage point ${searchIndex%searchTargets.length+1}/${searchTargets.length}.`;
          }
          if(apexViewCoverage(job)?.centerMayBeBeyondView)apexStatus.textContent+=' · The Apex center may be beyond the current Antennae view at this border gap.';
          if(await apexNavigate(target,job,token)){if(['world','snapshot'].includes(job.navigateOutcome)){await wait(50);continue;}if(!['found','zone','view','snapshot'].includes(job.navigateOutcome)){if(reacquiring)job.reacquire.index++;else searchIndex++;}searchFailures=0;if(job.zoneEntered&&!arrived){job.zoneTravelMs=Date.now()-tripBegan;arrived=true;}if(job.zoneEntered&&!dps){dps=job.preset===3||await selectLoadout(3,token);if(dps)alt('keydown');}await wait(200);}else{if(scene()==='play'&&++searchFailures>=2){if(reacquiring)job.reacquire.index++;else searchIndex++;searchFailures=0;apexStatus.textContent='Search point blocked. Trying another reachable area.';}await wait(200);}continue;
        }
        job.reacquire=null;
        if(!job.engagedThisLife){job.travelMs=Date.now()-tripBegan;job.engagedThisLife=true;}
        if(!dps||job.preset!==3){if(!await selectLoadout(3,token))continue;dps=true;}
        if(!await ensureApexVision(job,token))continue;
        phase='Apex DPS';alt('keydown');send('keydown',' ');const rate=apexDecay(job);
        apexStatus.textContent=`${job.name}: ${(boss.hp*100).toFixed(1)}% HP · ${job.trackingSource||'Tracked'} · ${Math.round(distance(position(),boss)-(boss.radius||0))}-unit border gap${rate?' · '+(rate*100).toFixed(2)+'%/s':''}`;
        if(!job.damageWatch||boss.hp<job.damageWatch.hp-1e-7)job.damageWatch={hp:boss.hp,at:Date.now()};
        if(apexHealthGuard())apexStatus.textContent+=' · Low HP: increasing retreat distance until recovered';
        else if(Date.now()-job.damageWatch.at>15000)apexStatus.textContent+=' · No boss HP decrease observed: attack reach/build may be insufficient at this gap';
        const stand=apexStandPoint(job);
        if(!stand){const escapeKeys=apexSafeKeys(job,[]);hold(escapeKeys);apexStatus.textContent=escapeKeys.length?'Retreating from the Apex; searching for safe floor.':`No reachable floor with the requested ${Number(apexDistance.value)||800}-unit border gap. Holding position while tracking the Apex.`;await wait(90);continue;}
        const dx=stand.world.x-pos.x,dy=stand.world.y-pos.y;
        if(Math.abs(dx)<45&&Math.abs(dy)<60){hold(apexSafeKeys(job,[],.08));await wait(80);continue;}
        // Follow one short, collision-checked segment and refresh the moving boss.
        const next=mapping.toWorld(stand.path[Math.min(1,stand.path.length-1)]),sx=next.x-pos.x,sy=next.y-pos.y,keys=[];
        if(Math.abs(sx)>30)keys.push(sx>0?'d':'a');if(Math.abs(sy)>45)keys.push(sy>0?'s':'w');hold(apexSafeKeys(job,keys));if(stand.retreat)apexStatus.textContent='Too close to Apex. Retreating to restore the border gap.';await wait(90);
      }
      if(!running||token!==version)return;
      release();alt('keyup');phase='Apex loot';
      let magnetReady=scene()==='play'&&job.preset===3;
      if(magnetReady){if(!await swapTravelLoadout(token,['2']))return;}
      else if(!await apexEnsureSpawn(job,token))return;
      // Keep L3 and equip the magnet immediately after a living kill; use L2 for a respawn trip.
      const kill=job.lastBoss;if(kill){while(running&&token===version){if(scene()!=='play'){magnetReady=false;if(!await apexEnsureSpawn(job,token))return;}if(await apexNavigate({x:kill.x,y:kill.y},job,token,true))break;}}
      if(!magnetReady&&(!await selectLoadout(3,token)||!await swapTravelLoadout(token,['2'])))return;lootStarted=Date.now();
      while(running&&token===version&&Date.now()-lootStarted<45000){
        if(scene()!=='play'){if(!await apexEnsureSpawn(job,token))return;if(kill)await apexNavigate(kill,job,token,true);if(!await selectLoadout(3,token)||!await swapTravelLoadout(token,['2']))continue;}
        const drops=[...serverWorld.entities.values()].filter(e=>e.kind===4&&kill&&Math.hypot(e.x-kill.x,e.y-kill.y)<1200).sort((a,b)=>distance(pos,a)-distance(pos,b));
        if(!drops.length){await wait(800);if(Date.now()-lootStarted>2500)break;continue;}
        await apexNavigate(drops[0],job,token,true);await wait(150);
      }
      apex.completed++;apexStatus.textContent=`Apex ${job.name} complete. Returning to ${saved.map}.`;
    }finally{
      if(token===version){release();alt('keyup');}if(apex.active===job)apex.active=null;
      if(running&&token===version){
        if(scene()==='play')await selectLoadout(4,token);if(!running||token!==version)return;setFarmMap(saved.map,saved.rarity);
        phase='returning to farm';if(await apexEnsureSpawn({map:saved.map},token,4)&&running&&token===version){apexResumeBuild=true;travelLoadoutActive=false;deathLoadoutSwapPending=false;}
      }else if(!running&&spawnSelect.value===job.map){
        spawnSelect.value=saved.map;gardenReady=false;gardenData=null;mapping=null;gridCache=null;rebuildRarities();raritySelect.value=saved.rarity;
      }
    }
  }

  function zoneDepth(area){
    const g=grid(area.mask),depth=new Uint16Array(g.open.length),queue=[];
    for(let i=0;i<g.open.length;i++)if(g.open[i]){
      const p=g.point(i);if(p.x===0||p.y===0||p.x===g.W-1||p.y===g.H-1||neighbors(g,i).some(n=>!g.open[n])){depth[i]=1;queue.push(i);}
    }
    let max=1;for(let q=0;q<queue.length;q++)for(const n of neighbors(g,queue[q]))if(g.open[n]&&!depth[n]){depth[n]=depth[queue[q]]+1;max=Math.max(max,depth[n]);queue.push(n);}
    return {g,depth,max};
  }
  function zonePoints(area){
    const {g,depth,max}=zoneDepth(area),cells=[];
    for(let i=0;i<g.open.length;i++)if(g.open[i])cells.push(i);
    if(cells.length<4)throw new Error('This area is too small for four patrol corners.');
    const sewerBox=sewerPatrolBox();
    if(sewerBox){
      const room=cells.filter(i=>depth[i]>=3&&inSewerBox(mapping.toWorld(g.point(i)),sewerBox,256));
      if(room.length>=16){
        const fractions=[.08,.36,.64,.92],used=new Set(),corners=[];
        const nearest=world=>{let best=-1,error=Infinity;for(const i of room)if(!used.has(i)){const d=distance(mapping.toWorld(g.point(i)),world);if(d<error){error=d;best=i;}}return best;};
        for(let row=0;row<4;row++)for(const column of row%2?[...fractions].reverse():fractions){
          const wanted={x:sewerBox.minX+(sewerBox.maxX-sewerBox.minX)*column,y:sewerBox.minY+(sewerBox.maxY-sewerBox.minY)*fractions[row]},i=nearest(wanted);used.add(i);corners.push(mapping.toWorld(g.point(i)));
        }
        const center=nearest({x:(sewerBox.minX+sewerBox.maxX)/2,y:(sewerBox.minY+sewerBox.maxY)/2});return {center:mapping.toWorld(g.point(center>=0?center:room[0])),corners};
      }
    }
    // Use an inset inside the zone, rather than points on its extreme boundary.
    const inset=Math.max(2,Math.floor(max*.35)),safe=cells.filter(i=>depth[i]>=inset),pool=safe.length>=4?safe:cells;
    const points=pool.map(g.point),xs=points.map(p=>p.x).sort((a,b)=>a-b),ys=points.map(p=>p.y).sort((a,b)=>a-b);
    const quantile=(list,f)=>list[Math.floor((list.length-1)*f)],minX=quantile(xs,.08),maxX=quantile(xs,.92),minY=quantile(ys,.08),maxY=quantile(ys,.92);
    const wanted=[{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}],used=new Set();
    const corners=wanted.map(p=>{let best=-1,d=Infinity;for(const i of pool)if(!used.has(i)){const v=distance(g.point(i),p);if(v<d){d=v;best=i;}}used.add(best);return mapping.toWorld(g.point(best));});
    if(gardenData?.family==='termite_ant_hell'){
      // Green mark: the right-hand passage below the old upper-right point.
      const target={x:g.W*.915,y:g.H*.925},otherCorners=new Set([...used].filter((_,i)=>i!==1));
      let best=-1,error=Infinity;
      for(const i of pool)if(!otherCorners.has(i)){const d=distance(g.point(i),target);if(d<error){error=d;best=i;}}
      if(best>=0)corners[1]=mapping.toWorld(g.point(best));
    }
    const average={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
    const deep=cells.filter(i=>depth[i]>=Math.max(2,Math.floor(max*.75))),centerPool=deep.length?deep:pool;
    let center=centerPool[0],d=Infinity;for(const i of centerPool){const v=distance(g.point(i),average);if(v<d){d=v;center=i;}}
    return {center:mapping.toWorld(g.point(center)),corners};
  }
  function patrolPlan(startWorld,goalWorld,area){
    const map=mapping.toMap(startWorld),g=grid(area.mask),x=Math.round(map.x),y=Math.round(map.y);
    if(x>=0&&y>=0&&x<g.W&&y<g.H&&g.open[y*g.W+x])return plan(startWorld,goalWorld,area.mask);
    // Knockback outside the zone: re-enter nearby, then continue the same patrol target.
    const full=grid(),reachable=search(full,map);let target=-1,best=Infinity;
    for(let i=0;i<g.open.length;i++)if(g.open[i]&&reachable.steps[i]>=0&&reachable.steps[i]<best){best=reachable.steps[i];target=i;}
    if(target<0)throw new Error('Waiting for a clear way back into the farming zone.');
    const reentry=mapping.toWorld(g.point(target)),approach=plan(startWorld,reentry),inside=plan(reentry,goalWorld,area.mask);
    return approach.concat(inside.slice(1));
  }
  async function bootSpawn(token,farming=true){
    phase='checking spawn';if(apexFarmRestorePending&&scene()==='play'){if(!await selectLoadout(4,token))return false;apexFarmRestorePending=false;travelLoadoutActive=false;}const tutorial=freshText('Skip Tutorial');if(tutorial)await clickPoint(tutorial,token);await wait(450);if(scene()!=='play')throw new Error('SCREEN');if(!await autoCalibrate(token,true))return false;
    if(!farming){terrainPixels=new Uint8ClampedArray(readMap());phase='travel swap';return prepareTravelLoadout(token);}
    if(gardenReady){phase='travel swap';return prepareTravelLoadout(token);}
    phase='capturing maps';
    if(!colorPixels){const ok=await captureMaps(true);if(!ok){awaitingPalette=true;status.textContent='Hold Alt and click Capture colors manually. The loop will wait.';while(running&&token===version&&!colorPixels){if(scene()!=='play')throw new Error('SCREEN');await wait(250);}}}
    else{alt('keyup');await wait(200);terrainPixels=new Uint8ClampedArray(readMap());}
    if(scene()!=='play')throw new Error('SCREEN');
    awaitingPalette=true;
    while(running&&token===version){try{rarityMask();break;}catch{teaching=true;showColors=true;mapbox.style.display='block';status.textContent=`One-time setup: click the ${raritySelect.value==='Ultra+'?'Ultra':raritySelect.value} color below. It will be remembered.`;await wait(250);if(scene()!=='play')throw new Error('SCREEN');}}
    awaitingPalette=false;teaching=false;if(token!==version)return false;
    phase='travel swap';if(!await prepareTravelLoadout(token))throw new Error('SCREEN');return true;
  }
  async function start(farming){
    if(running||capturing)return;stop();running=true;const token=++version;root.activeElement?.blur();teaching=false;saveSettings();
    let booted=false,area=null,points=null,stage='entry',corner=0,swappedBack=false,lastClick=0,spawnChosen=false,lastScreen='',recoveries=0;
    try{
      while(running&&token===version){
        if(!await liveGate(token))return;
      if(farming&&apexEnabled.checked&&apex.queue.length&&!apex.active){const job=apex.queue.shift();if(!job.dead){try{await runApex(job,token);}catch(e){apex.lastError=e.message;apexStatus.textContent='Apex hunt interrupted: '+e.message;}booted=false;area=null;points=null;stage='entry';swappedBack=true;continue;}}
        const info=screenInfo();
        if(info.kind!=='play'){
          if(info.kind==='death')queueDeathLoadoutSwap();
          release();route=[];booted=false;area=null;points=null;stage='entry';corner=0;swappedBack=false;awaitingPalette=false;recoveries=0;
          phase='respawning';if(info.kind!==lastScreen){lastClick=0;if(info.kind==='death')spawnChosen=false;lastScreen=info.kind;}
          status.textContent=`Detected ${info.kind} screen (${info.source||'button'}).`;
          if(Date.now()-lastClick>1800){
            if(info.kind==='menu'&&!spawnChosen){const spawn=spawnPoint(info);if(spawn)await clickPoint(spawn,token);spawnChosen=true;lastClick=Date.now()-1200;}
            else{await clickPoint(info.button,token);lastClick=Date.now();}
          }
          await wait(250);continue;
        }
        lastScreen='play';
        if(!booted){
          try{if(!await bootSpawn(token,farming))return;booted=true;}catch(error){if(error.message==='SCREEN')continue;throw error;}
          if(token!==version)return;
        }
        const p=await freshPosition(token);if(!p)continue;
        if(!farming){
          const m=input.value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(!m)throw new Error('Enter desired x, y coordinates.');goal={x:Number(m[1]),y:Number(m[2])};
          const result=await navigate(plan(p,goal),token,false);if(result==='recover'){release();await wait(180);continue;}if(result==='arrived'){if(await swapTravelLoadout(token,['3','4']))travelLoadoutActive=false;stop('Destination reached.');return;}continue;
        }
        if(!area){area=chooseArea(p);points=zonePoints(area);patrolPreview=points;stage='entry';corner=0;swappedBack=false;}
        goal=stage==='entry'?area.goal:stage==='center'?points.center:points.corners[corner];phase=stage==='entry'?'traveling to zone':stage==='center'?'moving to zone center':`patrol point ${corner+1}/${points.corners.length}`;
        let path;
        try{path=stage==='entry'?plan(p,goal):patrolPlan(p,goal,area);}catch{
          try{if(stage!=='entry')throw new Error('Patrol route temporarily blocked.');path=plan(p,goal);}catch(error){
            phase='recovering position';
            const saved={entry:mapping.toMap(area.goal),center:mapping.toMap(points.center),corners:points.corners.map(mapping.toMap)};
            try{release();recoveries++;await wait(180);if(scene()==='play'){area.goal=mapping.toWorld(saved.entry);points.center=mapping.toWorld(saved.center);points.corners=saved.corners.map(mapping.toWorld);}}catch(e){if(e.message!=='SCREEN')throw e;}
            continue;
          }
        }
        let result;
        try{result=await navigate(path,token,true);}catch(error){if(/blocked|unexpected movement/i.test(error.message))result='recover';else throw error;}
        if(token!==version)return;
        if(result==='screen')continue;
        if(result==='recover'){
          phase='recovering from knockback';release();status.textContent='Knockback detected. Replanning from live coordinates toward the same target.';
          const saved={entry:mapping.toMap(area.goal),center:mapping.toMap(points.center),corners:points.corners.map(mapping.toMap)};
          try{release();recoveries++;await wait(180);if(scene()==='play'){area.goal=mapping.toWorld(saved.entry);points.center=mapping.toWorld(saved.center);points.corners=saved.corners.map(mapping.toWorld);}}catch(error){if(error.message!=='SCREEN')throw error;}continue;
        }
        if(result!=='arrived')continue;
        recoveries=0;
        if(stage==='entry'){
          if(!swappedBack){if(!await verifyFarmLoadout(token))continue;apexResumeBuild=false;swappedBack=true;travelLoadoutActive=false;}
          stage='center';
        }else if(stage==='center')stage='patrol';else corner=(corner+1)%points.corners.length;
        await wait(180);
      }
    }catch(error){if(token===version)stop(error.message);}finally{if(token===version)release();}
  }
  function go(){return start(false);}
  function button(parent,text,action){const b=element('button','',text,parent);b.onclick=action;}
  button(setup,'Select minimap (fallback)',selectMap);button(setup,'Auto calibrate',calibrate);
  button(setup,'Show/hide map',()=>{if(region)mapbox.style.display=mapbox.style.display==='block'?'none':'block';});
  button(setup,'Capture maps',()=>captureMaps(false));button(setup,'Capture colors manually',captureColorsManually);
  button(setup,'Teach color',teachColor);button(setup,'Add higher rarity',addRarity);
  button(actions,'Go to coords',go);button(actions,'Start automatic loop',()=>start(true));button(actions,'Stop',()=>stop());button(actions,'Close',()=>window.flowrixNav.destroy());
  raritySelect.onchange=()=>{stop('Target changed. Press Start automatic loop.');saveSettings();};
  spawnSelect.onchange=()=>{stop('Respawn map changed.');mapping=null;region=null;terrainPixels=null;colorPixels=null;gardenReady=false;gardenData=null;rebuildRarities();if(spawnSelect.value==='Jellyfish zone')raritySelect.value='Jellyfish zone';else if(!raritySelect.value)raritySelect.value='Ultra+';gridCache=null;temporaryBlocks.clear();obstacleVersion++;patrolPreview=null;setup.style.display='block';saveSettings();};
  let panelPress=null,lastPanelActivation=null;
  function actionTarget(target){
    if(overlay&&target===overlay)return overlay;
    if(target===view)return view;
    return target.closest?.('button')||null;
  }
  function activatePanel(target,e){
    lastPanelActivation={target,at:performance.now()};target.onclick?.(e);
  }
  function movePanel(clientX,clientY){
    (drag.element||host).style.setProperty('left',`${Math.max(0,Math.min(innerWidth-(drag.element||host).offsetWidth,clientX-drag.x))}px`,'important');
    (drag.element||host).style.setProperty('top',`${Math.max(0,Math.min(innerHeight-40,clientY-drag.y))}px`,'important');
  }
  function events(e){
    if(!e.isTrusted)return;
    const path=e.composedPath(),target=path[0],inside=path.includes(host),action=inside?actionTarget(target):null;
    if(inside&&e.type==='pointerdown'&&e.pointerType==='mouse')lastPanelActivation=null;
    if(e.type==='pointerdown'&&(target===title||(target===lifeTitle&&!lifeMedia.matches))&&(e.button===0||e.pointerType!=='mouse')&&e.isPrimary!==false){
      const element=target===lifeTitle?lifePanel:host,r=element.getBoundingClientRect();if(element===lifePanel)element.style.right='auto';drag={x:e.clientX-r.left,y:e.clientY-r.top,id:e.pointerId,element,handle:target};panelPress=null;
      target.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();return;
    }
    if(drag&&e.pointerId===drag.id&&['pointermove','pointerup','pointercancel'].includes(e.type)){
      if(e.type==='pointermove')movePanel(e.clientX,e.clientY);else{const {id,handle}=drag;drag=null;if(handle.hasPointerCapture?.(id))handle.releasePointerCapture(id);}
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    if(e.type==='pointerdown'&&action&&e.pointerType!=='mouse'&&e.isPrimary!==false){
      panelPress={target:action,id:e.pointerId,x:e.clientX,y:e.clientY,cancelled:false};
    }
    if(panelPress&&e.pointerId===panelPress.id){
      if(e.type==='pointermove'&&Math.hypot(e.clientX-panelPress.x,e.clientY-panelPress.y)>12)panelPress.cancelled=true;
      if(e.type==='pointercancel')panelPress=null;
      else if(e.type==='pointerup'){
        const press=panelPress;panelPress=null;const r=press.target.getBoundingClientRect();
        if(!press.cancelled&&inside&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){
          e.preventDefault();e.stopImmediatePropagation();activatePanel(press.target,e);return;
        }
      }
    }
    // Touch events must not reach the game's global handlers; keep native field editing and scrolling.
    if(inside&&['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','click','touchstart','touchmove','touchend','touchcancel','wheel'].includes(e.type)){
      e.stopImmediatePropagation();
      if(e.type==='click'&&action){
        const duplicate=e.detail!==0&&lastPanelActivation?.target===action&&performance.now()-lastPanelActivation.at<800;
        if(!duplicate)activatePanel(action,e);
      }
      return;
    }
    if(e.type==='keydown'&&e.code==='Escape'){stop();removeOverlay();}
    if(inside&&['keydown','keyup','keypress'].includes(e.type))e.stopImmediatePropagation();
  }
  const names=['keydown','keyup','keypress','pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','click','touchstart','touchmove','touchend','touchcancel','wheel'];
  for(const name of names)window.addEventListener(name,events,{capture:true,passive:false});
  function blur(){drag=null;panelPress=null;release();alt('keyup');if(running)status.textContent='Paused while the game is not focused.';}
  function visibility(){if(document.hidden){release();alt('keyup');}}
  window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
    // The offline build exposes its read-only bundled assets through Emscripten FS.
  let gardenData=null, gardenOpen=null, gardenRanks=null, gardenReady=false;
  const gardenColors=[[126,236,92],[238,238,74],[77,82,232],[133,60,218],[234,70,70],[99,225,230],[242,165,99]];
  function props(object){return Object.fromEntries((object.properties||[]).map(p=>[p.name,p.value]));}
  function shapePath(ctx,o){
    ctx.beginPath();
    if(o.polygon){o.polygon.forEach((p,i)=>i?ctx.lineTo(o.x+p.x,o.y+p.y):ctx.moveTo(o.x+p.x,o.y+p.y));ctx.closePath();}
    else if(o.ellipse)ctx.ellipse(o.x+o.width/2,o.y+o.height/2,o.width/2,o.height/2,0,0,Math.PI*2);
    else ctx.rect(o.x,o.y,o.width,o.height);
  }
  function initGarden(){
    if(gardenReady)return true;
    const jellyfish=spawnSelect.value==='Jellyfish zone';if(jellyfish)raritySelect.value='Jellyfish zone';const name=jellyfish?'Ocean':spawnSelect.value,files={Garden:'garden',Desert:'desert',Sewers:'sewers','Ant Hell':'ant_hell',Computer:'computer',Ocean:'ocean',Jungle:'jungle','Normal Ant Hell':'ant_hell','Fire Ant Hell':'ant_hell','Termite Ant Hell':'ant_hell'},file=files[name],family=name==='Normal Ant Hell'?'ant_hell':name==='Fire Ant Hell'?'fire_ant_hell':name==='Termite Ant Hell'?'termite_ant_hell':null;
    if(!file)return false;
    let map,tiles;
    try{map=JSON.parse(Module.FS.readFile('/data/'+file+'.tmj',{encoding:'utf8'}));tiles=JSON.parse(Module.FS.readFile('/data/tileset.tsj',{encoding:'utf8'}));}catch{try{map=navigatorAsset(file+'.tmj',false);tiles=navigatorAsset('tileset.tsj',false);}catch{return false;}}
    const size=512,sub=4,worldW=map.width*map.tilewidth,worldH=map.height*map.tileheight;
    const collision=document.createElement('canvas');collision.width=collision.height=size*sub;
    const ctx=collision.getContext('2d',{willReadFrequently:true});ctx.scale(size*sub/worldW,size*sub/worldH);
    const byId=new Map(tiles.tiles.map(t=>[t.id,t])),first=map.tilesets[0].firstgid;
    const layers=map.layers.filter(l=>l.type==='tilelayer'),solid=layers.filter(l=>props(l).has_collision),decks=layers.filter(l=>props(l).negate_collision);
    for(const layer of [...solid,...decks]){
      const negate=!!props(layer).negate_collision;ctx.globalCompositeOperation=negate?'destination-out':'source-over';ctx.fillStyle='black';
      for(let i=0;i<layer.data.length;i++){
        const rawGid=layer.data[i]>>>0,gid=(rawGid&0x0fffffff)>>>0;if(!gid)continue;
        const tile=byId.get(gid-first),overlap=negate?Math.max(worldW,worldH)/(size*sub):0;
        // Adjacent bridge tiles must form one deck. Fractional raster edges left
        // blocked seams when each tile erased the underlying wall separately.
        const objects=tile?.objectgroup?.objects||[{x:-overlap,y:-overlap,width:map.tilewidth+2*overlap,height:map.tileheight+2*overlap}];
        ctx.save();ctx.translate((i%map.width)*map.tilewidth,Math.floor(i/map.width)*map.tileheight);
        // Tiled applies diagonal flip before horizontal/vertical flip.
        if(rawGid&0x80000000){ctx.translate(map.tilewidth,0);ctx.scale(-1,1);}
        if(rawGid&0x40000000){ctx.translate(0,map.tileheight);ctx.scale(1,-1);}
        if(rawGid&0x20000000)ctx.transform(0,1,1,0,0,0);
        for(const o of objects){ctx.save();if(o.rotation){ctx.translate(o.x,o.y);ctx.rotate(o.rotation*Math.PI/180);shapePath(ctx,{...o,x:0,y:0});}else shapePath(ctx,o);ctx.fill();ctx.restore();}
        ctx.restore();
      }
    }
    const alpha=ctx.getImageData(0,0,size*sub,size*sub).data,open=new Uint8Array(size*size);
    // Reserve roughly 24 world units for the flower's collision radius.
    const radius=24,rx=Math.ceil(radius*size*sub/worldW),ry=Math.ceil(radius*size*sub/worldH);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const cx=x*sub+sub/2,cy=y*sub+sub/2;let clear=true;
      for(let dy=-ry;dy<=ry&&clear;dy++)for(let dx=-rx;dx<=rx;dx++){
        if((dx*worldW/(size*sub))**2+(dy*worldH/(size*sub))**2>(radius+8)**2)continue;
        const xx=cx+dx,yy=cy+dy;if(xx<0||yy<0||xx>=size*sub||yy>=size*sub||alpha[(yy*size*sub+xx)*4+3]>32){clear=false;break;}
      }
      open[y*size+x]=clear?1:0;
    }
    // Farm paths must not enter the activation radius of map-changing portals.
    for(const portal of map.layers.find(l=>l.name==='teleporters')?.objects||[]){
      if(!props(portal).to)continue;const px=portal.x*size/worldW,py=portal.y*size/worldH,rx=240*size/worldW,ry=240*size/worldH;
      for(let y=Math.max(0,Math.floor(py-ry));y<Math.min(size,Math.ceil(py+ry));y++)for(let x=Math.max(0,Math.floor(px-rx));x<Math.min(size,Math.ceil(px+rx));x++)if(((x+.5-px)/rx)**2+((y+.5-py)/ry)**2<=1)open[y*size+x]=0;
    }
    const zoneCanvas=document.createElement('canvas');zoneCanvas.width=zoneCanvas.height=size;
    const zc=zoneCanvas.getContext('2d',{willReadFrequently:true});zc.clearRect(0,0,size,size);zc.scale(size/worldW,size/worldH);
    const coverageCanvas=document.createElement('canvas');coverageCanvas.width=coverageCanvas.height=size;const coverage=coverageCanvas.getContext('2d',{willReadFrequently:true});coverage.scale(size/worldW,size/worldH);coverage.fillStyle='white';
    let familyBands=0;const availableRanks=new Set();const thresholds=[0,15,29.5,53,67,85,100];
    for(const o of map.layers.find(l=>l.name==='spawns')?.objects||[]){
      const properties=props(o);if(properties.singular)continue;shapePath(coverage,o);coverage.fill();
      if(family&&!String(properties.mobs||'').split(/[^a-z_]+/).includes(family))continue;familyBands++;
      const difficulty=Number(properties.difficulty||0);let rank=0;
      for(let r=1;r<thresholds.length;r++)if(Math.abs(difficulty-thresholds[r])<Math.abs(difficulty-thresholds[rank]))rank=r;
      if(/ultra/i.test(o.name))rank=6;else if(/mythic/i.test(o.name))rank=5;else if(/legendary/i.test(o.name))rank=4;else if(/^epic/i.test(o.name))rank=3;
      availableRanks.add(rank);zc.fillStyle=`rgb(${rank+1},0,0)`;shapePath(zc,o);zc.fill();
    }
    const zones=zc.getImageData(0,0,size,size).data,ranks=new Uint8Array(size*size),terrain=new Uint8ClampedArray(size*size*4),colors=new Uint8ClampedArray(size*size*4);
    for(let i=0;i<open.length;i++){
      ranks[i]=zones[i*4+3]>=128?Math.max(0,Math.min(6,zones[i*4]-1)):255;
      const n=i*4,v=open[i]?224:0,rgb=open[i]?(ranks[i]===255?[190,200,190]:gardenColors[ranks[i]]):[0,0,0];terrain[n]=terrain[n+1]=terrain[n+2]=v;terrain[n+3]=255;
      colors[n]=rgb[0];colors[n+1]=rgb[1];colors[n+2]=rgb[2];colors[n+3]=255;
    }
    realmShapeCache=null;gardenData={name,file,family,familyBands,availableRanks:[...availableRanks].sort((a,b)=>a-b),map,worldW,worldH,size};temporaryBlocks.clear();obstacleVersion++;gridCache=null;gardenOpen=open;gardenRanks=ranks;gardenReady=true;
    region={w:size,h:size,directMap:true,mapName:name};raw.width=view.width=size;raw.height=view.height=size;
    mapping=makeMapping(size/worldW,-.5,size/worldH,-.5);terrainPixels=terrain;colorPixels=colors;showColors=true;
    if(family==='termite_ant_hell'){
      // User-marked Ultra chamber: the enclosed southern room at bottom right.
      // Follow the full Ant Hell collision map on approach; patrol only this room.
      const chamber=new Uint8Array(open.length);
      for(let i=0;i<open.length;i++){const x=i%size,y=Math.floor(i/size);if(open[i]&&x>=size*.625&&y>=size*.88)chamber[i]=1;}
      const local=grid(chamber),seed=local.nearest({x:size*.8,y:size*.94},'Termite Ultra chamber',32),queue=[seed],seen=new Uint8Array(open.length);seen[seed]=1;
      for(let q=0;q<queue.length;q++)for(const next of neighbors(local,queue[q]))if(local.open[next]&&!seen[next]){seen[next]=1;queue.push(next);}
      if(queue.length<64)throw new Error('The marked Termite Ultra chamber does not match this Ant Hell map.');
      for(let i=0;i<open.length;i++){
        if(ranks[i]===6)ranks[i]=255;
        if(seen[i])ranks[i]=6;
        const rgb=open[i]?(ranks[i]===255?[190,200,190]:gardenColors[ranks[i]]):[0,0,0];colors[i*4]=rgb[0];colors[i*4+1]=rgb[1];colors[i*4+2]=rgb[2];
      }
      availableRanks.add(6);gardenData.availableRanks=[...availableRanks].sort((a,b)=>a-b);gardenData.termiteTarget='bottom-right chamber';
      if(!familyBands||!availableRanks.has(rarityNames.indexOf(raritySelect.value)))raritySelect.value='Ultra+';
    }
    const present=[...availableRanks].sort((a,b)=>a-b);if(family&&familyBands&&raritySelect.value!=='Any rarity'&&!present.includes(raritySelect.value==='Ultra+'?6:rarityNames.indexOf(raritySelect.value)))raritySelect.value=rarityNames[present[0]];
    const selectedRarity=raritySelect.value;raritySelect.replaceChildren();for(const rank of present)element('option','',rarityNames[rank],raritySelect).value=rarityNames[rank];element('option','','Any rarity',raritySelect).value='Any rarity';if(present.includes(6))element('option','','Ultra+',raritySelect).value='Ultra+';if(name==='Ocean')element('option','','Jellyfish zone',raritySelect).value='Jellyfish zone';raritySelect.value=[...raritySelect.options].some(o=>o.value===selectedRarity)?selectedRarity:(present.length?rarityNames[present[0]]:'Any rarity');
    gardenColors.forEach((rgb,i)=>palette.set(rarityNames[i],rgb));updatePalette();paletteInfo.textContent=family==='termite_ant_hell'?'Termite Ultra: your marked bottom-right chamber.':name+' zones loaded from the game map.';mapbox.style.display='block';setup.style.display='none';title.textContent='Flowrix '+name+' farmer — drag here';
    status.textContent=name+' collision shapes, bridges and rarity zones loaded automatically.';return true;
  }
  let realmShapeCache=null;
  function realmMismatch(){
    if(!gardenReady)return false;
    if(serverWorld.realm)return serverWorld.realm!==gardenData.file;
    if(realmShapeCache&&Date.now()-realmShapeCache.at<900)return realmShapeCache.mismatch;
    const image=frame(),{W,H,pixels}=image;
    const borders=components(image,(p,n)=>p[n]>180&&p[n+1]>140&&p[n+2]<100&&p[n+1]>p[n]*.6,[Math.floor(W*.7),0,W,Math.ceil(H*.35)]).filter(c=>{const w=c.maxX-c.minX+1,h=c.maxY-c.minY+1;return w>60&&h>60&&w/h>.8&&w/h<1.25&&c.count>1.1*(w+h);}).sort((a,b)=>b.count-a.count);
    if(!borders.length)return false;
    const c=borders[0],yellowAt=(x,y)=>{if(x<0||y<0||x>=W||y>=H)return false;const n=(y*W+x)*4;return pixels[n]>180&&pixels[n+1]>140&&pixels[n+2]<100;};
    // A partially obscured minimap is not evidence of a realm transfer.
    for(let side=0;side<4;side++){let hits=0;for(let k=0;k<20;k++){const f=(k+.5)/20,x=side<2?Math.round(c.minX+(c.maxX-c.minX)*f):side===2?c.minX:c.maxX,y=side<2?side===0?c.minY:c.maxY:Math.round(c.minY+(c.maxY-c.minY)*f);if(yellowAt(x,y)||yellowAt(x-1,y)||yellowAt(x+1,y)||yellowAt(x,y-1)||yellowAt(x,y+1))hits++;}if(hits<16)return false;}
    const x0=c.minX+2,y0=c.minY+2,w=c.maxX-c.minX-3,h=c.maxY-c.minY-3;let floor=0,wall=0,floorMatches=0,wallMatches=0;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const xx=Math.min(W-1,Math.floor(x0+(x+.5)*w/64)),yy=Math.min(H-1,Math.floor(y0+(y+.5)*h/64)),n=(yy*W+xx)*4,actual=Math.max(pixels[n],pixels[n+1],pixels[n+2])>140,expected=gardenOpen[Math.floor((y+.5)*gardenData.size/64)*gardenData.size+Math.floor((x+.5)*gardenData.size/64)]!==0;
      if(expected){floor++;if(actual)floorMatches++;}else{wall++;if(!actual)wallMatches++;}
    }
    const score=(floorMatches/Math.max(1,floor)+wallMatches/Math.max(1,wall))/2,mismatch=score<(gardenData.file==='computer'?.60:.76);
    realmShapeCache={at:Date.now(),mismatch,score};if(!mismatch){liveRealm={id:gardenData.file,at:Date.now()};window.flowrixRealm=liveRealm;}return mismatch;
  }
  async function returnToSpawnMenu(token){
    release();phase='returning to selected map';status.textContent='Map transfer detected. Returning to '+actualSpawnName()+'…';
    const image=frame(true),{W,H,rect}=image,candidates=components(image,(p,n)=>p[n]>190&&p[n+1]<80&&p[n+2]<100,[0,0,Math.ceil(W*.6),Math.ceil(H*.12)]).filter(c=>{const w=c.maxX-c.minX+1,h=c.maxY-c.minY+1;return w*rect.width/W>=25&&w*rect.width/W<=85&&w/h>.8&&w/h<1.25&&c.count/(w*h)>.4;}).sort((a,b)=>b.maxX-a.maxX);
    if(candidates.length){const c=candidates[0];await clickPoint({x:(c.minX+c.maxX)/2,y:(c.minY+c.maxY)/2,at:Date.now()},token);}
    await wait(350);
  }
  function positionCheckboxUnchecked(row){
    const image=frame(true),{W,H,pixels,rect}=image,scale=rect.height/900,x=Math.round(row.left-19*row.scale),y=Math.round(row.y);let total=0,sum=0;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)return false;const n=(yy*W+xx)*4,r=pixels[n],g=pixels[n+1],b=pixels[n+2];if(Math.max(r,g,b)-Math.min(r,g,b)>14)return false;sum+=(r+g+b)/3;total++;}
    const brightness=sum/total;return brightness>=80&&brightness<=145;
  }
  let debugRequested=0, lastPositionValue=null;
  async function preparePosition(token){
    if(pos&&Date.now()-pos.updatedAt<1200)return;
    release();refreshTextCache();await wait(160);if(pos&&Date.now()-pos.updatedAt<1200)return;
    if(pos&&!(apex.active&&apexKnownBoss(apex.active))){for(const key of ['d','w','a','s']){if(!running||token!==version||scene()!=='play')return;send('keydown',key);await wait(150);release();await wait(80);if(pos&&Date.now()-pos.updatedAt<1200)return;}}
    // Let the initial spawn and tutorial UI finish rendering before reading controls.
    for(let i=0;i<8&&running&&token===version;i++){
      const skip=freshText('Skip Tutorial');if(skip){await clickPoint(skip,token);await wait(180);}
      if(pos&&Date.now()-pos.updatedAt<1200)return;
      await wait(100);
    }
    if(Date.now()-debugRequested<5000)return;
    debugRequested=Date.now();status.textContent='Enabling the game coordinate display automatically…';
    const r=game.getBoundingClientRect(),scale=r.height/900,gear={x:28*scale*game.width/r.width,y:28*scale*game.height/r.height,at:Date.now()};
    if(!freshText('Graphics')){await clickPoint(gear,token);await wait(200);}
    const graphics=freshText('Graphics');
    if(graphics){await clickPoint(graphics,token);await wait(200);}
    const stats=freshText('Show Performance Stats');
    if(stats&&positionCheckboxUnchecked(stats)&&!(pos&&Date.now()-pos.updatedAt<1200)){
      await clickPoint({...stats,x:stats.left-19*stats.scale,at:Date.now()},token);await wait(300);
    }
    const settings=freshText('Settings');
    if(settings){const close={x:settings.left+375*settings.scale,y:settings.y,at:Date.now()};await clickPoint(close,token);await wait(200);if(freshText('Settings'))await clickPoint({...close,at:Date.now()},token);}
  }

  const temporaryBlocks=new Map();let obstacleVersion=0,gridCache=null;
  function hold(keys){const next=new Set(keys);for(const key of heldKeys)if(!next.has(key))send('keyup',key);for(const key of next)if(!heldKeys.has(key))send('keydown',key);heldKeys=next;}
  function gardenGrid(allowed){
    let changed=false;for(const [i,until] of temporaryBlocks)if(Date.now()>until){temporaryBlocks.delete(i);changed=true;}if(changed)obstacleVersion++;
    if(gridCache&&gridCache.allowed===allowed&&gridCache.version===obstacleVersion)return gridCache.g;
    const W=gardenData.size,H=W,point=i=>({x:i%W,y:Math.floor(i/W)}),open=gardenOpen.slice();
    for(let i=0;i<open.length;i++)if((allowed&&!allowed[i])||temporaryBlocks.has(i))open[i]=0;
    function nearest(p,label,limit){
      if(p.x<-.5||p.y<-.5||p.x>=W-.5||p.y>=H-.5)throw new Error(`${label} is outside ${gardenData.name}.`);
      let best=-1,d=Infinity;const px=Math.round(p.x),py=Math.round(p.y),radius=Math.ceil(limit);
      for(let y=Math.max(0,py-radius);y<=Math.min(H-1,py+radius);y++)for(let x=Math.max(0,px-radius);x<=Math.min(W-1,px+radius);x++){
        const i=y*W+x;if(!open[i])continue;const dd=Math.hypot(x-p.x,y-p.y);if(dd<d){d=dd;best=i;}
      }
      if(best<0||d>limit)throw new Error(`${label} is not near reachable floor.`);return best;
    }
    const g={W,H,open,point,nearest};gridCache={allowed,version:obstacleVersion,g};return g;
  }
  function clearLine(g,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,n=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*4);let last=null;
    for(let k=0;k<=n;k++){
      const f=n?k/n:0,x=Math.round(a.x+dx*f),y=Math.round(a.y+dy*f);
      if(x<0||y<0||x>=g.W||y>=g.H||!g.open[y*g.W+x])return false;
      if(last&&x!==last.x&&y!==last.y&&(!g.open[last.y*g.W+x]||!g.open[y*g.W+last.x]))return false;
      last={x,y};
    }
    return true;
  }
  function astar(g,start,target){
    const source=g.nearest(start,'Player position',7),previous=new Int32Array(g.open.length).fill(-1),cost=new Float64Array(g.open.length).fill(Infinity),closed=new Uint8Array(g.open.length),heap=[],targetP=g.point(target);
    function push(i,value){let k=heap.length;heap.push({i,value});while(k){const p=(k-1)>>1;if(heap[p].value<=value)break;heap[k]=heap[p];k=p;}heap[k]={i,value};}
    function pop(){const first=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let child=k*2+1;if(child+1<heap.length&&heap[child+1].value<heap[child].value)child++;if(heap[child].value>=last.value)break;heap[k]=heap[child];k=child;}heap[k]=last;}return first.i;}
    const heuristic=i=>{const p=g.point(i),dx=Math.abs(p.x-targetP.x),dy=Math.abs(p.y-targetP.y);return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);};
    previous[source]=source;cost[source]=0;push(source,heuristic(source));
    while(heap.length){const i=pop();if(closed[i])continue;closed[i]=1;if(i===target)break;const x=i%g.W,y=Math.floor(i/g.W);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=g.W||yy>=g.H)continue;const next=yy*g.W+xx;if(!g.open[next]||closed[next])continue;
        if(dx&&dy&&(!g.open[y*g.W+xx]||!g.open[yy*g.W+x]))continue;
        const value=cost[i]+(dx&&dy?Math.SQRT2:1);if(value<cost[next]){cost[next]=value;previous[next]=i;push(next,value+heuristic(next));}
      }
    }
    return {source,previous};
  }
  function smooth(g,nodes){
    const result=[nodes[0]];let at=0;
    while(at<nodes.length-1){let next=at+1;while(next+1<nodes.length&&clearLine(g,nodes[at],nodes[next+1]))next++;result.push(nodes[next]);at=next;}
    return result;
  }
  async function navigateGarden(path,token,farming){
    route=path.slice();const finalGoal=mapping.toWorld(route[route.length-1]);let last=position(),stuckAt=Date.now(),stuckPos=last,segmentFrom=last,progressDistance=Infinity,progressTarget=null,heading=null,lastTick=performance.now(),measuredSpeed=300;
    if(route.length>1&&distance(last,mapping.toWorld(route[0]))<75)route.shift();
    while(running&&token===version){
      if(apex.active&&!apex.active.dead&&!apex.active.worldRefreshed&&phase==='searching Apex Ultra+ zone'&&apexNeedsWorldRefresh()){release();alt('keyup');return 'snapshot';}
      if(apex.active&&!apex.active.dead&&apexWorldStale()){release();alt('keyup');return 'world';}
      if(apex.active&&phase==='searching Apex Ultra+ zone'&&apexTargetVisible(apex.active)){release();return 'found';}
      if(apex.active&&phase==='searching Apex Ultra+ zone'&&apex.active.searchPlan){const spacing=apexScanWidth(apex.active),prior=apex.active.searchPlan.spacing;if(spacing>=prior*1.3||spacing<prior*.8){release();return 'view';}}
      if(farming&&apexEnabled.checked&&apex.queue.length&&!apex.active){release();return 'apex';}
      if(scene()!=='play'){release();return 'screen';}if(realmMismatch()){release();await returnToSpawnMenu(token);return 'screen';}if(!await liveGate(token))return 'stopped';
      if(!pos||Date.now()-pos.updatedAt>1800){release();await preparePosition(token);const p=await freshPosition(token);if(!p)return 'screen';last=p;stuckPos=p;stuckAt=Date.now();}
      const p=position(),mp=mapping.toMap(p),now=performance.now(),dt=Math.max(.025,(now-lastTick)/1000);lastTick=now;
      if(apex.active&&phase==='searching Apex Ultra+ zone'&&!apex.active.zoneEntered&&apexInUltraZone()){apex.active.zoneEntered=true;release();return 'zone';}
      const moved=distance(p,last);const serverSpeed=serverWorld.own&&Date.now()-serverWorld.updatedAt<1000?Math.hypot(serverWorld.own.vx,serverWorld.own.vy):0;
      if(moved>1&&moved/dt<20000)measuredSpeed=measuredSpeed*.8+moved/dt*.2;if(serverSpeed>measuredSpeed)measuredSpeed=serverSpeed;
      const tolerance=Math.max(32,Math.min(160,measuredSpeed*dt*1.7));
      // The first route node is the snapped source cell, not a destination to circle around.
      while(route.length){
        const target=mapping.toWorld(route[0]),vx=target.x-segmentFrom.x,vy=target.y-segmentFrom.y,len=Math.hypot(vx,vy)||1;
        const passed=((p.x-segmentFrom.x)*vx+(p.y-segmentFrom.y)*vy)/(len*len)>=1;
        if(distance(p,target)>tolerance&&!(passed&&distance(p,target)<Math.max(85,measuredSpeed*dt*2)))break;
        segmentFrom=mapping.toWorld(route.shift());
      }
      if(!route.length){release();return 'arrived';}
      const target=mapping.toWorld(route[0]),dx=target.x-p.x,dy=target.y-p.y;
      const vx=target.x-segmentFrom.x,vy=target.y-segmentFrom.y,len=Math.hypot(vx,vy)||1,progress=((p.x-segmentFrom.x)*vx+(p.y-segmentFrom.y)*vy)/(len*len),look=Math.max(0,Math.min(1,progress+Math.max(100,Math.min(180,measuredSpeed*.4))/len));
      const steerX=distance(p,target)<100?dx:segmentFrom.x+vx*look-p.x,steerY=distance(p,target)<100?dy:segmentFrom.y+vy*look-p.y;
      if(apex.active&&!apex.active.dead){const length=Math.hypot(steerX,steerY)||1,advance=Math.max(150,Math.min(500,measuredSpeed*.4)),ahead={x:p.x+steerX/length*advance,y:p.y+steerY/length*advance},threats=apexThreats();
        const blocker=threats.filter(e=>e.kind===1&&e.id!==apex.active.entityId&&e.rarity<9&&!(apex.active.blockerAvoid?.get(e.id)>Date.now())&&distance(ahead,e)<(e.radius||20)+150&&distance(ahead,e)<distance(p,e)).sort((a,b)=>distance(p,a)-distance(p,b))[0];
        if(blocker){apex.active.blockerId=blocker.id;release();return 'engage';}
        if(threats.some(e=>e.kind===3&&distance(ahead,e)<(e.radius||20)+75&&distance(ahead,e)<distance(p,e)-10)){release();return 'recover';}}
      const desired=Math.atan2(steerY,steerX),laneError=Math.abs((p.x-segmentFrom.x)*vy-(p.y-segmentFrom.y)*vx)/len;
      const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
      // Keep the current heading through small sensor corrections instead of chattering.
      if(heading===null||Math.abs(angleDifference(desired,heading*Math.PI/4))>Math.PI/5||laneError>40)heading=((Math.round(desired/(Math.PI/4))%8)+8)%8;
      const directions=[['d'],['d','s'],['s'],['s','a'],['a'],['a','w'],['w'],['w','d']],keys=directions[heading];
      const jump=distance(p,last);
      if(jump>Math.max(180,measuredSpeed*dt*3+50)){release();return 'recover';}
      const remaining=Math.hypot(dx,dy),targetId=route[0];
      if(progressTarget!==targetId||remaining<progressDistance-24){progressTarget=targetId;progressDistance=remaining;stuckPos=p;stuckAt=Date.now();}
      if(remaining>progressDistance+100){release();return 'recover';}
      if(Date.now()-stuckAt>1800){
        release();const length=Math.hypot(dx,dy)||1,ahead=mapping.toMap({x:p.x+dx/length*80,y:p.y+dy/length*80}),x=Math.round(ahead.x),y=Math.round(ahead.y);
        // Avoid this local collision briefly; retain the same patrol target and mapping.
        for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if(xx>=0&&yy>=0&&xx<gardenData.size&&yy<gardenData.size)temporaryBlocks.set(yy*gardenData.size+xx,Date.now()+15000);
        obstacleVersion++;return 'recover';
      }
      status.textContent=`${phase} · ${route.length} route points · ${Math.round(distance(p,finalGoal))} units remaining`;
      const safeKeys=apex.active&&!apex.active.dead?apexSafeKeys(apex.active,keys,.025,measuredSpeed):keys;
      if(apex.active&&!apex.active.dead&&safeKeys.length===0&&keys.length){release();return 'recover';}
      hold(safeKeys);last=p;await wait(25);
    }
    release();return 'stopped';
  }

  // Per-life statistics: exact saved game totals; unavailable data stays unknown.
  const lifePanel=element('section','life-panel','',root);
  Object.assign(lifePanel.style,{position:'fixed',right:'12px',top:'min(220px, 35vh)',width:'min(280px, calc(100vw - 24px))',maxHeight:'55vh',overflow:'auto',boxSizing:'border-box',padding:'12px',background:'#222',color:'#fff',border:'1px solid #666',borderRadius:'8px',font:'13px Arial',pointerEvents:'auto'});
  lifePanel.setAttribute('aria-label','Life statistics');
  const lifeTitle=element('div','life-title','Life statistics — drag here',lifePanel);
  const lifeMedia=matchMedia('(max-width: 680px)');
  function layoutLifePanel(){
    if(lifeMedia.matches){panel.append(lifePanel);Object.assign(lifePanel.style,{position:'static',width:'100%',maxHeight:'none',marginTop:'12px',left:'auto',right:'auto',top:'auto'});lifeTitle.textContent='Life statistics';}
    else{root.append(lifePanel);Object.assign(lifePanel.style,{position:'fixed',width:'min(280px, calc(100vw - 24px))',maxHeight:'55vh',marginTop:'0',left:'auto',right:'12px',top:'min(220px, 35vh)'});lifeTitle.textContent='Life statistics — drag here';}
  }
  layoutLifePanel();lifeMedia.addEventListener('change',layoutLifePanel);
  const lifeBody=element('div','','',lifePanel);
  const currentLifeText=element('div','','Waiting for your next spawn…',lifeBody);currentLifeText.style.whiteSpace='pre-line';
  const lifeSourceText=element('div','','',lifeBody);lifeSourceText.style.cssText='margin:8px 0;color:#ffe08a;font-size:12px';
  element('strong','','Past lives · latest 3',lifeBody);
  const pastLivesList=element('ol','','',lifeBody);pastLivesList.style.cssText='padding-left:20px;white-space:pre-line';
  button(lifePanel,'Show/hide stats',()=>{lifeBody.hidden=!lifeBody.hidden;});
  const statsDiagnosticText=element('textarea','','',lifeBody);statsDiagnosticText.readOnly=true;statsDiagnosticText.hidden=true;statsDiagnosticText.style.cssText='width:100%;height:140px;box-sizing:border-box;margin-top:8px;font:11px monospace';statsDiagnosticText.setAttribute('aria-label','Safe statistics diagnostics');
  function statsDiagnostics(){
    const module=window.Module;const paths={};
    for(const path of ['/state','/persist']){try{paths[path]=module.FS.readdir(path);}catch{paths[path]='Unavailable';}}
    const globals={};
    for(const name of Object.getOwnPropertyNames(window).filter(n=>/^(?:player|playerStats|profile|gameState|game|flowrixPlayerStats)$/i.test(n))){const d=Object.getOwnPropertyDescriptor(window,name);if(d&&'value'in d)globals[name]=d.value&&typeof d.value==='object'?Object.keys(d.value).slice(0,40):typeof d.value;}
    return {source:readLifeTotals()?.source||'Unavailable',network:{...networkLifeStatus,worldFrames:serverWorld.frames,worldRejected:serverWorld.rejected,lastProfileAgeMs:networkLifeStatus.lastProfileAt?Date.now()-networkLifeStatus.lastProfileAt:null},moduleFields:module?Object.keys(module).filter(k=>/player|stat|profile|xp|kill|net|canvas/i.test(k)):[],paths,globals};
  }
  button(lifePanel,'Copy stats diagnostics',async()=>{const text=JSON.stringify(statsDiagnostics(),null,2);statsDiagnosticText.value=text;statsDiagnosticText.hidden=false;try{await navigator.clipboard.writeText(text);lifeSourceText.textContent='Diagnostics copied. Paste them in chat.';}catch{statsDiagnosticText.focus();statsDiagnosticText.select();}});
  const lifeStorageKey='flowrixLifeStatsV1';
  let pastLives=[],currentLife=null,lifeNumber=1,lifeAccountId=null,lifeSessionToken=null;
  try{const saved=JSON.parse(localStorage.getItem(lifeStorageKey)||'null');if(saved){pastLives=(saved.past||[]).filter(v=>Number.isFinite(v.timeAliveMs)).slice(0,3);lifeNumber=Number.isInteger(saved.next)&&saved.next>0?saved.next:1;}}catch{}
  function countKills(value){if(typeof value==='number')return Number.isFinite(value)?Math.max(0,value):0;if(!value||typeof value!=='object')return 0;return Object.values(value).reduce((n,v)=>n+countKills(v),0);}
  let networkLifeTotals=null,lifeNetworkHook=null;
  const networkLifeStatus={attached:false,profilesDecoded:0,profilesRejected:0,lastProfileAt:0};
  function decodePlayerTotals(bytes){
    if(bytes[0]!==3)return null;
    const preferred=networkLifeStatus.profileProtocol||(serverWorld.protocol==='delta-header'||mobCatalogStatus.source==='Loaded public client registry'?'public':'legacy');
    for(const profileProtocol of [preferred,preferred==='public'?'legacy':'public'])try{
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=1;
      const requireBytes=n=>{if(!Number.isInteger(n)||n<0||offset+n>bytes.length)throw new Error('Truncated player profile');};
      const u8=()=>{requireBytes(1);return view.getUint8(offset++);};
      const u16=()=>{requireBytes(2);const value=view.getUint16(offset,true);offset+=2;return value;};
      const u32=()=>{requireBytes(4);const value=view.getUint32(offset,true);offset+=4;return value;};
      const f64=()=>{requireBytes(8);const value=view.getFloat64(offset,true);offset+=8;return value;};
      const skip=n=>{requireBytes(n);offset+=n;};
      const string=()=>{const length=u16();if(length>1024)throw new Error('Unsupported profile string');requireBytes(length);const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,offset+length));offset+=length;return value;};
      const username=string(),xp=f64(),level=u16(),stars=f64();
      if(!username||!Number.isFinite(xp)||xp<0||xp>Number.MAX_SAFE_INTEGER||level<1||level>10000||!Number.isFinite(stars)||stars<0)throw new Error('Invalid player totals');
      const inventory=u16();skip(inventory*7);
      const loadout=u8();if(loadout>40)throw new Error('Unsupported loadout');const equipped=[];for(let i=0;i<loadout;i++)equipped.push({type:u16(),rarity:u8()});
      if(profileProtocol==='public'){u32();const remaps=u16();if(remaps>40)throw new Error('Unsupported slot map');for(let i=0;i<remaps;i++)if(u8()>9||u8()>9)throw new Error('Invalid slot map');}
      else{string();string();const skills=u16();if(skills>4096)throw new Error('Unsupported skill table');skip(skills*2);}
      const entries=u16();if(entries>8192)throw new Error('Unsupported kill table');
      let kills=0;const pairs=new Set();
      for(let i=0;i<entries;i++){const mob=u16(),rarity=u8(),count=u32(),key=mob+':'+rarity;if(mob>8192||rarity>31||pairs.has(key))throw new Error('Invalid kill table');pairs.add(key);kills+=count;}
      if(profileProtocol==='public'){u32();u32();const presets=u8();if(presets>20)throw new Error('Unsupported saved loadout count');for(let i=0;i<presets;i++){const key=u8(),slots=u8();if(key>=20||slots>40)throw new Error('Invalid saved loadout');skip(slots*3);}if(offset!==bytes.length)throw new Error('Unsupported public profile trailer');}
      else if(bytes.length-offset<9)throw new Error('Incomplete profile trailer');
      return {xp,kills,equipped,id:'network:'+username,protocol:profileProtocol,source:'Live server player totals',receivedAt:Date.now()};
    }catch{}return null;
  }
  function ensureLifeNetworkHook(){
    const net=window.Module?.flixNet;if(!net||typeof net.deliver!=='function'||lifeNetworkHook?.net===net)return;
    lifeNetworkHook?.detach();
    const original=net.deliver,streams=new WeakMap();let active=true;
    const consume=(slot,value)=>{
      if(!active||!slot||typeof slot!=='object'||slot.listener||slot.peer==='loopback')return;
      const bytes=value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):null;if(!bytes?.length)return;
      let stream=streams.get(slot);if(!stream){stream={buffer:new Uint8Array(0),synced:false};streams.set(slot,stream);}
      const merged=new Uint8Array(stream.buffer.length+bytes.length);merged.set(stream.buffer);merged.set(bytes,stream.buffer.length);stream.buffer=merged;
      let offset=0;
      if(!stream.synced){
        // Attaching mid-session may begin inside a frame. Synchronize only on a
        // complete, validated own-player profile, never on arbitrary world data.
        for(let i=0;i+5<=merged.length;i++){
          if(merged[i+4]!==3&&merged[i+4]!==5)continue;
          const n=new DataView(merged.buffer,merged.byteOffset+i,4).getUint32(0,true);
          if(n<30||n>262144||i+4+n>merged.length)continue;
          const body=merged.subarray(i+4,i+4+n),valid=body[0]===3?decodePlayerTotals(body):decodeOwnPlayer(body);
          if(valid){acceptServerFrame(body);offset=i+4+n;stream.synced=true;break;}
        }
        if(!stream.synced){stream.buffer=merged.slice(-262144);return;}
      }
      while(offset+4<=merged.length){
        const n=new DataView(merged.buffer,merged.byteOffset+offset,4).getUint32(0,true);
        if(n<1||n>4194304){stream.synced=false;offset++;break;}
        if(offset+4+n>merged.length)break;
        acceptServerFrame(merged.subarray(offset+4,offset+4+n));
        offset+=4+n;
      }
      stream.buffer=merged.slice(offset);if(stream.buffer.length>4194308){stream.buffer=new Uint8Array(0);stream.synced=false;}
    };
    function wrapped(slot,bytes){const result=original.apply(this,arguments);try{consume(slot,bytes);}catch{}return result;}
    net.deliver=wrapped;networkLifeStatus.attached=true;
    lifeNetworkHook={net,detach(){active=false;if(net.deliver===wrapped)net.deliver=original;networkLifeStatus.attached=false;}};
  }

  // Read-only native server observations. A rejected frame never mutates entities.
  const serverWorld={entities:new Map(),own:null,realm:null,updatedAt:0,frames:0,rejected:0,lastFailure:null};
  function decodeOwnPlayer(bytes,skipLegacy=false){
    if(bytes[0]!==5)return null;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),now=Date.now();
    const fail=reason=>{serverWorld.lastReject={reason,stage:'player header',bytes:bytes.length,at:now};return null;};
    const countsValid=o=>o+4<=bytes.length&&view.getUint16(o,true)<=20000&&view.getUint16(o+2,true)<=20000;
    // Older offline clients send the complete player state at fixed offsets.
    if(!skipLegacy&&bytes.length>=72&&serverWorld.protocol!=='delta-header'){
      const own={x:view.getFloat32(17,true),y:view.getFloat32(21,true),vx:view.getFloat32(25,true),vy:view.getFloat32(29,true),hp:view.getFloat32(33,true),maxHP:view.getFloat32(37,true),xp:view.getFloat64(49,true),level:view.getUint16(57,true),at:now,serverTime:view.getFloat64(5,true),sequence:view.getUint32(1,true),protocol:'fixed-header',entityOffset:68+bytes[67]*6};
      if([own.x,own.y,own.vx,own.vy,own.hp,own.maxHP,own.xp].every(Number.isFinite)&&Math.abs(own.x)<=1e7&&Math.abs(own.y)<=1e7&&own.hp>=0&&own.maxHP>0&&own.hp<=own.maxHP*1.01&&own.xp>=0&&own.xp<=Number.MAX_SAFE_INTEGER&&own.level>=1&&own.level<=10000&&bytes[67]<=40&&countsValid(own.entityOffset))return own;
    }
    // The current public client uses x/y followed by optional state groups.
    // Group 1: HP/max HP, group 2: shield/max shield, group 4: XP/level/stars.
    try{
      if(bytes.length<30)throw Error('Truncated delta player header');
      let offset=22;const mask=bytes[21];if(mask&~7)throw Error('Unknown delta player flags: '+mask);
      const own={x:view.getFloat32(13,true),y:view.getFloat32(17,true),vx:0,vy:0,at:now,serverTime:view.getFloat64(5,true),sequence:view.getUint32(1,true),protocol:'delta-header'};
      if(!Number.isFinite(own.x)||!Number.isFinite(own.y)||!Number.isFinite(own.serverTime)||own.serverTime<0||own.serverTime>Number.MAX_SAFE_INTEGER||Math.abs(own.x)>1e7||Math.abs(own.y)>1e7)throw Error('Invalid delta player coordinates');
      const previous=serverWorld.own?.protocol==='delta-header'?serverWorld.own:null;
      if(previous){for(const key of ['hp','maxHP','shield','maxShield','xp','level','stars'])own[key]=previous[key];const serverDt=(own.serverTime-previous.serverTime)/1000,dt=Number.isFinite(serverDt)&&serverDt>=.005&&serverDt<1?serverDt:(now-previous.at)/1000;if(dt>=.005&&dt<1){const vx=(own.x-previous.x)/dt,vy=(own.y-previous.y)/dt;if(Math.hypot(vx,vy)<20000){own.vx=vx;own.vy=vy;}}}
      if(!(mask&4)&&Number.isFinite(networkLifeTotals?.xp))own.xp=networkLifeTotals.xp;
      const need=n=>{if(offset+n>bytes.length)throw Error('Truncated delta player group');};
      if(mask&1){need(8);own.hp=view.getFloat32(offset,true);own.maxHP=view.getFloat32(offset+4,true);offset+=8;if(!Number.isFinite(own.hp)||!Number.isFinite(own.maxHP)||own.hp<0||own.maxHP<=0||own.hp>own.maxHP*1.01)throw Error('Invalid delta player HP');}
      if(mask&2){need(8);own.shield=view.getFloat32(offset,true);own.maxShield=view.getFloat32(offset+4,true);offset+=8;if(!Number.isFinite(own.shield)||!Number.isFinite(own.maxShield)||own.shield<0||own.maxShield<0)throw Error('Invalid delta player shield');}
      if(mask&4){need(18);own.xp=view.getFloat64(offset,true);own.level=view.getUint16(offset+8,true);own.stars=view.getFloat64(offset+10,true);offset+=18;if(!Number.isFinite(own.xp)||own.xp<0||own.xp>Number.MAX_SAFE_INTEGER||own.level<1||own.level>10000||!Number.isFinite(own.stars)||own.stars<0)throw Error('Invalid delta player XP');}
      need(1);const petals=bytes[offset++];if(petals>40)throw Error('Unsupported delta petal count');need(petals*6+4);offset+=petals*6;own.entityOffset=offset;
      if(!countsValid(offset))throw Error('Invalid delta entity counts');return own;
    }catch(error){return fail(error.message);}
  }
  function decodeWorld(bytes,header=null){
    const own=header||decodeOwnPlayer(bytes);if(!own)return null;
    const preferred=mobCatalogStatus.source==='Loaded public client registry'&&own.protocol==='delta-header'?'public':serverWorld.entityProtocol||(own.protocol==='delta-header'&&mobCatalogStatus.source!=='Native client registry'?'public':'legacy');
    const first=decodeWorldEntities(bytes,own,preferred);if(first||serverWorld.entityProtocolConfirmed)return first;
    const firstError=serverWorld.lastReject,second=decodeWorldEntities(bytes,own,preferred==='public'?'legacy':'public');if(!second)serverWorld.lastReject=firstError;return second;
  }
  function decodeWorldEntities(bytes,own,entityProtocol){
    const publicEntities=entityProtocol==='public';
    for(let attempt=0;attempt<27;attempt++){let unknownIndex=0,context={offset:own.entityOffset,section:'counts'};try{
      const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let o=own.entityOffset;
      const need=n=>{context.offset=o;if(o+n>bytes.length)throw Error('Truncated world');};
      const u8=()=>{need(1);return d.getUint8(o++);},u16=()=>{need(2);const v=d.getUint16(o,true);o+=2;return v;},u32=()=>{need(4);const v=d.getUint32(o,true);o+=4;return v;},f32=()=>{need(4);const v=d.getFloat32(o,true);o+=4;if(!Number.isFinite(v))throw Error('Invalid world number');return v;};
      const skip=n=>{need(n);o+=n;},str=()=>{const n=u16();if(n>1024)throw Error('Invalid entity string');need(n);const v=new TextDecoder().decode(bytes.subarray(o,o+n));o+=n;return v;};
      const nc=u16(),dc=u16();if(nc>20000||dc>20000)throw Error('Invalid world entity counts');
      const changes=new Map(),removed=[];let lastID=0;const entityID=()=>{if(!publicEntities)return u32();let value=0;for(let shift=0;shift<=28;shift+=7){const byte=u8();if(shift===28&&byte>15)throw Error('Invalid public entity ID');value+=(byte&127)*2**shift;if(!(byte&128)){lastID=(lastID+value)>>>0;return lastID;}}throw Error('Invalid public entity ID');};
      for(let i=0;i<nc;i++){
        const id=entityID(),kind=u8(),type=u16(),rarity=u8(),flags=u8(),x=f32(),y=f32(),angle=u16(),radius=f32(),hpLowBits=u16(),hpHighBits=flags&8?u16():null;
        const encoded=new DataView(new ArrayBuffer(4));encoded.setUint16(0,hpLowBits,true);if(hpHighBits!==null)encoded.setUint16(2,hpHighBits,true);const hp=hpHighBits!==null?1-encoded.getFloat32(0,true):hpLowBits/65535;
        if(![0,1,2,3,4,5,6].includes(kind)||rarity>31||radius<0||radius>1e6||!Number.isFinite(hp))throw Error('Unsupported entity kind or fields: '+kind);
        context={offset:o,section:'creation',id,kind};const e={id,kind,type,rarity,flags,x,y,angle,radius,hp,hpLowBits,hpHighBits,hpFloat:hpHighBits!==null,at:own.at,poseAt:own.at,poseServerTime:own.serverTime,vx:0,vy:0};
        if(publicEntities){e.mobFlags=u8();if(kind===0){skip(14);e.skin=str();}else if(kind===2)skip(4);if(flags&1)e.name=str();}
        else if(kind===0){skip(10);str();str();skip(3);e.name=str();}
        else if(kind===2)skip(5);else e.mobFlags=u8();
        changes.set(id,e);
      }
      lastID=0;for(let i=0;i<dc;i++){
        const id=entityID(),mask=u8(),old=changes.get(id)||serverWorld.entities.get(id);context={offset:o,section:'delta',id,kind:old?.kind??null,mask};
        // Low-mask updates have the same width for all entity kinds and can be
        // consumed even when the console hook was attached after their creation.
        let inferred=null;if(!publicEntities&&(!old||old.kind<0)&&(mask&32)){if(unknownIndex>=3)throw Error('Too many missing entity records');inferred=[0,2,1][Math.floor(attempt/3**unknownIndex)%3];unknownIndex++;}
        const e={...(old||{id,kind:-1}),at:own.at};if(inferred!==null)e.kind=inferred;
        if(publicEntities&&mask&128){need(4);const dx=d.getInt16(o,true)/32,dy=d.getInt16(o+2,true)/32;o+=4;if(Number.isFinite(old?.x)&&Number.isFinite(old?.y)){e.x=old.x+dx;e.y=old.y+dy;const serverDt=(own.serverTime-old.poseServerTime)/1000,dt=Number.isFinite(serverDt)&&serverDt>=.005&&serverDt<1?serverDt:Math.max(.01,(own.at-(old.poseAt||own.at))/1000);e.vx=dx/dt;e.vy=dy/dt;e.poseAt=own.at;e.poseServerTime=own.serverTime;}}
        if(mask&1&&!(publicEntities&&mask&128)){e.x=f32();e.y=f32();const serverDt=(own.serverTime-old?.poseServerTime)/1000,dt=Number.isFinite(serverDt)&&serverDt>=.005&&serverDt<1?serverDt:Math.max(.01,(own.at-(old?.poseAt||own.at))/1000);if(old&&Number.isFinite(old.x)&&Number.isFinite(old.y)){const vx=(e.x-old.x)/dt,vy=(e.y-old.y)/dt;if(Math.hypot(vx,vy)<20000){e.vx=vx;e.vy=vy;}}e.poseAt=own.at;e.poseServerTime=own.serverTime;}if(mask&2)e.angle=u16();const publicHP=publicEntities&&(mask&4)?(mask&64?1-f32():u16()/65535):null,hpLow=!publicEntities&&mask&4?u16():null;if(mask&8)e.flags=u8();if(mask&16)e.radius=f32();
        if(mask&32){if(publicEntities){skip(14);e.skin=str();}else if(e.kind===0){skip(9);str();str();skip(3);}else if(e.kind===2)skip(5);else e.mobFlags=u8();}
        const hpHigh=!publicEntities&&mask&64?u16():null;
        if(mask&8){e.hpFloat=!!(e.flags&8);if(!e.hpFloat)e.hpHighBits=null;}
        if(hpLow!==null)e.hpLowBits=hpLow;if(hpHigh!==null&&(e.flags===undefined||e.flags&8)){e.hpHighBits=hpHigh;e.hpFloat=true;}
        if(hpLow!==null||hpHigh!==null){
          if(e.flags===undefined?e.hpFloat:!!(e.flags&8)){if(e.hpLowBits!==undefined&&e.hpHighBits!==null&&e.hpHighBits!==undefined){const encoded=new DataView(new ArrayBuffer(4));encoded.setUint16(0,e.hpLowBits,true);encoded.setUint16(2,e.hpHighBits,true);e.hp=1-encoded.getFloat32(0,true);}}
          else if(hpLow!==null)e.hp=hpLow/65535;
        }
        if(publicHP!==null)e.hp=publicHP;
        if(e.hp!==undefined&&(!Number.isFinite(e.hp)||e.hp<-.02||e.hp>1.02))throw Error('Unsupported health encoding');if(e.hp!==undefined)e.hp=Math.max(0,Math.min(1,e.hp));if(!publicEntities&&mask&128)skip(1);changes.set(id,e);
      }
      context={offset:o,section:'removals'};const count=u16();lastID=0;for(let i=0;i<count;i++)removed.push(entityID());context={offset:o,section:'effects'};const effects=u16();for(let i=0;i<effects;i++){need(26);const kind=bytes[o];context={offset:o,section:'effects',index:i,kind};skip(26);if(kind===7){const points=u8();skip(points*8);}}if(o!==bytes.length)throw Error('Unsupported world trailer');
      return {own,changes,removed,entityProtocol,entityProtocolConfirmed:!!(nc||dc||count)};
    }catch(error){if(!unknownIndex||attempt===26)serverWorld.lastReject={reason:error.message,stage:'world entities',protocol:own.protocol,entityProtocol,bytes:bytes.length,...context,at:Date.now()};if(!unknownIndex)return null;}}return null;
  }
  function acceptServerFrame(bytes){
    if(bytes[0]===3){const totals=decodePlayerTotals(bytes);if(totals){if(networkLifeTotals&&networkLifeTotals.id!==totals.id){serverWorld.own=null;serverWorld.protocol=null;serverWorld.entityProtocol=null;serverWorld.entityProtocolConfirmed=false;serverWorld.entities.clear();}networkLifeTotals=totals;networkLifeStatus.profilesDecoded++;networkLifeStatus.profileProtocol=totals.protocol;networkLifeStatus.lastProfileAt=totals.receivedAt;}else networkLifeStatus.profilesRejected++;return;}
    if((bytes[0]===4&&bytes.length>=34)||(bytes[0]===24&&bytes.length>=18)){
      const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=bytes[0]===4?25:9,code=bytes[offset],names={0:'garden',3:'desert',4:'computer',5:'ocean',6:'jungle',8:'ant_hell',9:'sewers'};
      if(d.getUint16(offset+1,true)>0&&d.getUint16(offset+3,true)>0&&d.getUint32(offset+5,true)===bytes.length-offset-9){serverWorld.entities.clear();if(apex.active){apex.active.entityId=null;apex.active.zeroHP=null;apex.active.identityReset=true;apex.active.coverageSeen=null;apex.active.standTarget=null;apex.active.hazard=null;apex.active.reacquire=null;}verifiedMobTypes.clear();visualVotes.clear();visualPending.clear();visualRows=[];serverWorld.realm=names[code]||null;if(serverWorld.realm){liveRealm={id:serverWorld.realm,at:Date.now(),source:'server'};window.flowrixRealm=liveRealm;}realmShapeCache=null;}
      return;
    }
    if(bytes[0]===5){
      let own=decodeOwnPlayer(bytes,mobCatalogStatus.source==='Loaded public client registry'&&serverWorld.protocol!=='fixed-header');if(!own){serverWorld.rejected++;serverWorld.lastFailure=serverWorld.lastReject;return;}
      let frame=decodeWorld(bytes,own);
      if(!frame&&own.protocol==='fixed-header'&&serverWorld.protocol!=='fixed-header'){
        const alternate=decodeOwnPlayer(bytes,true);if(alternate){const alternateFrame=decodeWorld(bytes,alternate);if(alternateFrame){own=alternate;frame=alternateFrame;}}
      }
      // An ambiguous startup header cannot authorize coordinates until one complete world establishes the layout.
      if(!frame&&!serverWorld.protocol){serverWorld.rejected++;serverWorld.lastFailure=serverWorld.lastReject;return;}
      // Publish one selected header only; a rejected candidate cannot overwrite XP or position.
      serverWorld.own=own;pos={x:own.x,y:own.y,updatedAt:own.at};window.flowrixPosition=pos;if(networkLifeTotals&&Number.isFinite(own.xp))networkLifeTotals={...networkLifeTotals,xp:own.xp};
      if(!frame){serverWorld.rejected++;serverWorld.lastFailure=serverWorld.lastReject;return;}serverWorld.frames++;serverWorld.protocol=own.protocol;serverWorld.entityProtocol=frame.entityProtocol;serverWorld.entityProtocolConfirmed=serverWorld.entityProtocolConfirmed||frame.entityProtocolConfirmed;serverWorld.updatedAt=own.at;
      for(const [id,e] of frame.changes)serverWorld.entities.set(id,e);for(const id of frame.removed)serverWorld.entities.delete(id);
      observeApexEntities();apexRecordCoverage(apex.active);return;
    }
    if(bytes[0]===6)observeServerChat(bytes);
  }

  function readLifeTotals(){
    // A client may expose its own cumulative totals directly. Never infer kills
    // from disappearing sprites or infer exact XP from a level bar.
    const supplied=window.flowrixPlayerStats;
    if(supplied&&Number.isFinite(supplied.totalXP)&&supplied.mobKills!==undefined)return {xp:supplied.totalXP,kills:countKills(supplied.mobKills),source:'Game player totals',id:supplied.id||'client'};
    if(networkLifeTotals)return networkLifeTotals;
    try{
      const fs=window.Module?.FS;if(!fs)return networkLifeTotals;
      const db=JSON.parse(fs.readFile('/state/inventory.json',{encoding:'utf8'}));
      let session='';try{session=fs.readFile('/persist/session',{encoding:'utf8'}).trim().split(/\s/)[0];}catch{}
      if(session&&session!==lifeSessionToken&&window.crypto?.subtle){lifeSessionToken=session;crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)).then(hash=>{if(lifeSessionToken!==session)return;const key=[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');try{const latest=JSON.parse(fs.readFile('/state/inventory.json',{encoding:'utf8'}));lifeAccountId=latest.sessions?.[key]?.userId||null;}catch{}}).catch(()=>{});}
      let id=lifeAccountId;
      if(!id){const users=Object.values(db.users||{}).filter(u=>u?.id&&db.players?.[u.id]);if(users.length===1)id=users[0].id;}
      const player=id&&db.players?.[id];
      if(!player||!Number.isFinite(player.totalXP))return networkLifeTotals;
      return {xp:player.totalXP,kills:countKills(player.mobKills||{}),source:'Offline saved player totals',id};
    }catch{return networkLifeTotals;}
  }
  function lifeDuration(ms){const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`;}
  function updateLifeTotals(totals,now=Date.now()){
    if(!currentLife||!totals)return;
    if(!currentLife.last){currentLife.last=totals;currentLife.xp=0;currentLife.kills=0;currentLife.countsSince=now;return;}
    if(currentLife.last.id!==totals.id)return;
    currentLife.xp+=Math.max(0,totals.xp-currentLife.last.xp);currentLife.kills+=Math.max(0,totals.kills-currentLife.last.kills);currentLife.last={...totals,xp:Math.max(currentLife.last.xp,totals.xp),kills:Math.max(currentLife.last.kills,totals.kills)};
  }
  let renderedPastLives=null;
  function renderLifeStats(now){
    const number=v=>v===null?'Unavailable':v.toLocaleString();
    currentLifeText.textContent=currentLife?`Current life #${currentLife.number}\nKills: ${number(currentLife.kills)} · XP gained: ${number(currentLife.xp)}\nTime alive: ${lifeDuration(now-currentLife.startedAt)}`:'Waiting for your next spawn…';
    lifeSourceText.textContent=currentLife?.last?`${currentLife.last.source}${currentLife.countsSince-currentLife.startedAt>2000?' · counters started after data became available':''}`:(networkLifeStatus.attached?'Waiting for the next player-stat update from the server.':'Exact kill/XP totals unavailable from this client; time tracking starts with live coordinates.');
    const historyKey=JSON.stringify(pastLives);if(historyKey===renderedPastLives)return;renderedPastLives=historyKey;pastLivesList.replaceChildren();
    for(const life of pastLives){const row=element('li','',`Life #${life.number} · ${lifeDuration(life.timeAliveMs)}\n${number(life.kills)} kills · ${number(life.xp)} XP`,pastLivesList);row.style.marginBottom='10px';}
    if(!pastLives.length)element('li','','No completed lives yet.',pastLivesList);
  }
  function finishLife(kind,now){
    if(!currentLife)return;
    pastLives.unshift({number:currentLife.number,endedAt:now,endedBy:kind,timeAliveMs:now-currentLife.startedAt,xp:currentLife.xp,kills:currentLife.kills,source:currentLife.last?.source||null});
    pastLives=pastLives.slice(0,3);currentLife=null;
    try{localStorage.setItem(lifeStorageKey,JSON.stringify({past:pastLives,next:lifeNumber}));}catch{}
  }
  function tickLifeStats(kind=screenInfo().kind,totals=readLifeTotals(),now=Date.now()){
    if(currentLife?.last&&totals&&currentLife.last.id!==totals.id)finishLife('account changed',now);
    if(kind==='play'&&!currentLife&&pos&&now-pos.updatedAt<1500){currentLife={number:lifeNumber++,startedAt:now,last:null,xp:null,kills:null};updateLifeTotals(totals,now);}
    else updateLifeTotals(totals,now);
    if(kind==='death')queueDeathLoadoutSwap();
    if(kind==='death'||kind==='menu')finishLife(kind,now);
    renderLifeStats(now);
  }
  renderLifeStats(Date.now());
  ensureLifeNetworkHook();
  const lifeTimer=setInterval(()=>{try{ensureLifeNetworkHook();tickLifeStats();}catch{}},100);

  const timer=setInterval(()=>{
    live.textContent=(pos?`${Date.now()-pos.updatedAt>1500?'Remembered position':'Position'}: ${pos.x}, ${pos.y}`:'Waiting for the game position display…')+` | ${phase}`;if(!region)return;
    try{
      if(capturing)return;
      if(showColors&&colorPixels)vc.putImageData(new ImageData(colorPixels,region.w,region.h),0,0);
      else if(gardenReady)vc.putImageData(new ImageData(terrainPixels,region.w,region.h),0,0);else{readMap();vc.drawImage(raw,0,0);}
      if(patrolPreview&&mapping){
        vc.lineWidth=2;vc.font='18px Arial';
        patrolPreview.corners.forEach((world,index)=>{const p=mapping.toMap(world);vc.strokeStyle='#ffff55';vc.fillStyle='#ffffff';vc.beginPath();vc.arc(p.x,p.y,6,0,Math.PI*2);vc.stroke();vc.fillText(String(index+1),p.x+8,p.y-8);});
        const p=mapping.toMap(patrolPreview.center);vc.strokeStyle='#ff88ff';vc.beginPath();vc.arc(p.x,p.y,8,0,Math.PI*2);vc.stroke();
      }
      if(route.length){vc.strokeStyle='#ff9900';vc.beginPath();route.forEach((p,i)=>i?vc.lineTo(p.x,p.y):vc.moveTo(p.x,p.y));vc.stroke();}
      for(const p of samples){vc.fillStyle='#ffdd00';vc.fillRect(p.map.x-1,p.map.y-1,3,3);}
      if(mapping&&pos){const p=mapping.toMap(pos);vc.strokeStyle='#00ff00';vc.beginPath();vc.moveTo(p.x-4,p.y);vc.lineTo(p.x+4,p.y);vc.moveTo(p.x,p.y-4);vc.lineTo(p.x,p.y+4);vc.stroke();}
      if(mapping&&goal){const p=mapping.toMap(goal);vc.strokeStyle='#ff3333';vc.beginPath();vc.arc(p.x,p.y,3,0,Math.PI*2);vc.stroke();}
    }catch(error){stop(error.message);}
  },150);
  loadSettings();
  visualRAF=requestAnimationFrame(visualFrame);refreshTextCache();
  mobCatalogRefresh=refreshPublicMobCatalog();
  window.flowrixNav={stop,statsDiagnostics,apexDiagnostics,state:()=>({apex:{active:apex.active?{name:apex.active.name,map:apex.active.map,hp:apex.active.lastBoss?.hp,dead:apex.active.dead,entityId:apex.active.entityId,borderGap:apex.active.lastBoss&&pos?distance(pos,apex.active.lastBoss)-(apex.active.lastBoss.radius||0):null,targetBorderGap:apexGap(),lastSeenMs:apex.active.lastBoss?Date.now()-apex.active.lastBoss.at:null}:null,queued:apex.queue.map(j=>({name:j.name,map:j.map})),completed:apex.completed,lastError:apex.lastError},networkWorld:{frames:serverWorld.frames,rejected:serverWorld.rejected,entities:serverWorld.entities.size,realm:serverWorld.realm},position:pos,phase,running,garden:gardenReady&&gardenData?.name==='Garden',map:gardenData?.name,directMap:gardenReady,family:gardenData?.family,familyBands:gardenData?.familyBands,realm:liveRealm?.id,realmScore:realmShapeCache?.score,life:{current:currentLife?{number:currentLife.number,startedAt:currentLife.startedAt,kills:currentLife.kills,xp:currentLife.xp}:null,past:pastLives.map(v=>({...v}))},route:route.slice(),goal,patrol:patrolPreview,blocks:temporaryBlocks.size,texts:[...textPoints]}),destroy(){visualEnabled=false;cancelAnimationFrame(visualRAF);stop();clearInterval(timer);clearInterval(lifeTimer);lifeNetworkHook?.detach();lifeMedia.removeEventListener('change',layoutLifePanel);removeOverlay();host.remove();for(const name of names)window.removeEventListener(name,events,true);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);for(const h of hooks)if(h.proto[h.name]===h.wrapped)h.proto[h.name]=h.original;}};
})();
