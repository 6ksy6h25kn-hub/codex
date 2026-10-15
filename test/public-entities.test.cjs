const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),test=require('node:test'),assert=require('node:assert/strict');
const varint=value=>{const out=[];do{const byte=value&127;value=Math.floor(value/128);out.push(byte|(value?128:0));}while(value);return Buffer.from(out);};
const str=value=>{const text=Buffer.from(value),n=Buffer.alloc(2);n.writeUInt16LE(text.length);return Buffer.concat([n,text]);};
function record(id,kind,flags=0){const b=Buffer.alloc(26);b.writeUInt32LE(id);b[4]=kind;b.writeUInt16LE(kind===1?7:0,5);b[7]=kind===1?9:0;b[8]=flags;b.writeFloatLE(6000,9);b.writeFloatLE(6200,13);b.writeFloatLE(200,19);b.writeUInt16LE(65535,23);const parts=[b];if(kind===0)parts.push(Buffer.alloc(14),str('fixture-skin'));else if(kind===2)parts.push(Buffer.alloc(4));if(flags&1)parts.push(str(kind===0?'Fixture Player':'Named Apex'));return Buffer.concat(parts);}
function packet(records=[],deltas=[],removed=[]){const h=Buffer.alloc(23);h[0]=5;h.writeDoubleLE(12345,5);h.writeFloatLE(5000,13);h.writeFloatLE(6200,17);const c=Buffer.alloc(4);c.writeUInt16LE(records.length);c.writeUInt16LE(deltas.length,2);const encode=items=>{let previous=0;return items.map(b=>{const id=b.readUInt32LE(0),out=Buffer.concat([varint((id-previous)>>>0),b.subarray(4)]);previous=id;return out;});};const count=Buffer.alloc(2);count.writeUInt16LE(removed.length);let previous=0;const ids=removed.map(id=>{const b=varint((id-previous)>>>0);previous=id;return b;});return Buffer.concat([h,c,...encode(records),...encode(deltas),count,...ids,Buffer.alloc(2)]);}
test('Current public entity layout handles nearby players, named mobs, compact movement and float HP',async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<canvas width="1100" height="800"></canvas>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const p=await browser.newPage();await p.goto('http://127.0.0.1:'+server.address().port);const source=fs.readFileSync(path.join(__dirname,'../navigator.js'),'utf8').replace('window.flowrixNav={stop',`clearInterval(lifeTimer);window.entityTest={accept:a=>acceptServerFrame(Uint8Array.from(a)),clearSnapshot:()=>{serverWorld.snapshotNeededAt=null;serverWorld.snapshotNeededReason=null;},state:()=>({frames:serverWorld.frames,rejected:serverWorld.rejected,protocol:serverWorld.entityProtocol,rows:[...serverWorld.entities.values()],refreshNeeded:apexNeedsWorldRefresh(),refreshReason:serverWorld.snapshotNeededReason,error:serverWorld.lastReject})};window.flowrixNav={stop`);await p.evaluate(source);
 await p.evaluate(a=>entityTest.accept(a),[...packet([record(91,0,1),record(92,1,1),record(93,2)])]);let r=await p.evaluate(()=>entityTest.state());assert.equal(r.rejected,0,JSON.stringify(r.error));assert.equal(r.protocol,'public');assert.equal(r.rows[0].name,'Fixture Player');assert.equal(r.rows[0].skin,'fixture-skin');assert.equal(r.rows[1].name,'Named Apex');assert.equal(r.rows[1].rarity,9);
 const move=Buffer.alloc(9);move.writeUInt32LE(92);move[4]=128;move.writeInt16LE(-320,5);move.writeInt16LE(640,7);await p.evaluate(a=>entityTest.accept(a),[...packet([],[move])]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.rows[1].x,5990);assert.equal(r.rows[1].y,6220);assert.equal(r.rows[1].radius,200);
 const update=Buffer.alloc(38);update.writeUInt32LE(91);update[4]=127;update.writeFloatLE(6100,5);update.writeFloatLE(6300,9);update.writeUInt16LE(1200,13);update.writeFloatLE(.6,15);update[19]=8;update.writeFloatLE(250,20);await p.evaluate(a=>entityTest.accept(a),[...packet([],[Buffer.concat([update,str('changed-skin')])])]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.rejected,0,JSON.stringify(r.error));assert.equal(r.frames,3);assert.equal(r.rows[0].x,6100);assert.equal(r.rows[0].radius,250);assert(Math.abs(r.rows[0].hp-.4)<1e-6);assert.equal(r.rows[0].skin,'changed-skin');
 const quantized=Buffer.alloc(7);quantized.writeUInt32LE(91);quantized[4]=4;quantized.writeUInt16LE(16384,5);await p.evaluate(a=>entityTest.accept(a),[...packet([],[quantized])]);r=await p.evaluate(()=>entityTest.state());assert(Math.abs(r.rows[0].hp-.25)<1e-5,'Public delta mask selects HP encoding independently of entity flags');
 const bad=packet([],[move]);await p.evaluate(a=>entityTest.accept(a),[...bad.subarray(0,bad.length-3)]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.frames,4);assert.equal(r.rows[1].x,5990,'A truncated public stream cannot publish partial movement');await p.evaluate(a=>entityTest.accept(a),[...packet([record(20000,1),record(4294967295,1)],[],[92,93,20000,4294967295])]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.frames,5);assert.deepEqual(r.rows.map(e=>e.id),[91],'Each creation/delta/removal section resets its variable-length ID accumulator');
 // The native client reads ancillary fields after compact position, including when bit 1 is set.
 for(let low=0;low<128;low++){
  const parts=[],head=Buffer.alloc(9);head.writeUInt32LE(91);head[4]=128|low;head.writeInt16LE(32,5);head.writeInt16LE(-64,7);parts.push(head);
  if(low&2){const b=Buffer.alloc(2);b.writeUInt16LE(1200);parts.push(b);}
  if(low&4){const b=Buffer.alloc(low&64?4:2);if(low&64)b.writeFloatLE(.6);else b.writeUInt16LE(16384);parts.push(b);}
  if(low&8)parts.push(Buffer.from([8]));
  if(low&16){const b=Buffer.alloc(4);b.writeFloatLE(250);parts.push(b);}
  if(low&32)parts.push(Buffer.alloc(14),str('mixed-skin'));
  await p.evaluate(a=>entityTest.accept(a),[...packet([],[Buffer.concat(parts)],[])]);
  r=await p.evaluate(()=>entityTest.state());assert.equal(r.frames,6+low,JSON.stringify(r.error));assert.equal(r.rows[0].x,6101+low);assert.equal(r.rows[0].y,6298-2*low);assert.equal(r.protocol,'public');
  if(low&4)assert(Math.abs(r.rows[0].hp-(low&64?.4:16384/65535))<1e-6);
  if(low&32)assert.equal(r.rows[0].skin,'mixed-skin');
 }

 // A legacy body must not be accepted as a fallback after public format is established.
 const legacyHead=Buffer.alloc(23);legacyHead[0]=5;legacyHead.writeFloatLE(5000,13);legacyHead.writeFloatLE(6200,17);const legacyCount=Buffer.alloc(4);legacyCount.writeUInt16LE(1);const legacyPacket=Buffer.concat([legacyHead,legacyCount,record(200,1),Buffer.alloc(4)]);
 const before=r.frames;await p.evaluate(a=>entityTest.accept(a),[...legacyPacket]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.frames,before,'Established public format cannot fall back to a legacy body');assert.equal(r.protocol,'public');assert.deepEqual(r.rows.map(e=>e.id),[91]);
 // A rare malformed creation must retain the actual record identity and request
 // a snapshot even when subsequent empty delta frames keep the feed fresh.
 await p.evaluate(()=>entityTest.clearSnapshot());const creationBefore=r.frames;
 await p.evaluate(a=>entityTest.accept(a),[...packet([record(12,6),record(13,174)])]);r=await p.evaluate(()=>entityTest.state());
 assert.equal(r.frames,creationBefore);assert.deepEqual(r.rows.map(e=>e.id),[91]);assert.equal(r.error.kind,174);assert.equal(r.error.id,13);assert.equal(r.error.index,1);assert.equal(r.error.creationCount,2);assert(r.error.sample.hex.length<=96);assert(r.refreshNeeded);
 await p.evaluate(a=>entityTest.accept(a),[...packet()]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.frames,creationBefore+1);assert(r.refreshNeeded,'Fresh delta traffic cannot restore discarded creation records');assert.match(r.refreshReason,/new entities/);
 const reset=Buffer.alloc(18);reset[0]=24;reset.writeUInt16LE(100,10);reset.writeUInt16LE(100,12);await p.evaluate(a=>entityTest.accept(a),[...reset]);r=await p.evaluate(()=>entityTest.state());assert.equal(r.refreshNeeded,false,'A realm snapshot reset acknowledges the refresh');assert.equal(r.rows.length,0);
 await p.evaluate(()=>flowrixNav.destroy());
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
