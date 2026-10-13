const frame=document.querySelector('#frame'),screen=document.querySelector('#screen'),status=document.querySelector('#status'),details=document.querySelector('#details');
let chain=Promise.resolve(),pointer=null,lastMove=0,frameURL=null,busy=false;
const held=new Set();
function control(data){
  const result=chain.then(async()=>{
    const response=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const reply=await response.json();if(!response.ok)throw new Error(reply.error||'Control failed');return reply;
  });
  chain=result.catch(error=>{status.textContent=error.message;});return result;
}
function point(event){const r=frame.getBoundingClientRect();return {x:(event.clientX-r.left)*1280/r.width,y:(event.clientY-r.top)*900/r.height};}
screen.addEventListener('pointerdown',event=>{if(pointer!==null)return;event.preventDefault();screen.focus();pointer=event.pointerId;screen.setPointerCapture(pointer);control({type:'pointer',action:'down',...point(event)}).catch(()=>{});});
screen.addEventListener('pointermove',event=>{if(event.pointerId!==pointer||Date.now()-lastMove<40)return;lastMove=Date.now();control({type:'pointer',action:'move',...point(event)}).catch(()=>{});});
function pointerUp(event){if(event.pointerId!==pointer)return;pointer=null;control({type:'pointer',action:'up',...point(event)}).catch(()=>{});}
screen.addEventListener('pointerup',pointerUp);screen.addEventListener('pointercancel',pointerUp);
screen.addEventListener('wheel',event=>{event.preventDefault();control({type:'wheel',...point(event),deltaY:event.deltaY}).catch(()=>{});},{passive:false});
const keyName=event=>event.key===' '?'Space':event.key;
screen.addEventListener('keydown',event=>{event.preventDefault();if(event.repeat)return;const key=keyName(event);held.add(key);control({type:'key',action:'down',key}).catch(()=>{});});
window.addEventListener('keyup',event=>{const key=keyName(event);if(!held.delete(key))return;event.preventDefault();control({type:'key',action:'up',key}).catch(()=>{});});
function release(){held.clear();pointer=null;control({type:'release'}).catch(()=>{});}
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
window.addEventListener('pagehide',()=>{fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'release'}),keepalive:true}).catch(()=>{});});
for(const button of document.querySelectorAll('[data-key]')){
  const key=button.dataset.key;button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);control({type:'key',action:'down',key}).catch(()=>{});});
  const up=()=>control({type:'key',action:'up',key}).catch(()=>{});button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
}
document.querySelector('#text-form').addEventListener('submit',event=>{event.preventDefault();const input=document.querySelector('#text');control({type:'text',text:input.value}).then(()=>{input.value='';}).catch(()=>{});});
document.querySelector('#inject').onclick=()=>control({type:'inject'}).catch(()=>{});
document.querySelector('#start').onclick=async()=>{try{await control({type:'settings',values:{biome:document.querySelector('#biome').value,rarity:document.querySelector('#rarity').value}});await control({type:'start'});}catch{}};
document.querySelector('#stop').onclick=()=>control({type:'stop'}).catch(()=>{});
async function pollFrame(){
  if(!document.hidden&&!busy){busy=true;try{const response=await fetch('/frame',{cache:'no-store'});if(response.status===401){location.reload();return;}if(response.ok){const blob=await response.blob(),url=URL.createObjectURL(blob);await new Promise(resolve=>{frame.onload=resolve;frame.onerror=resolve;frame.src=url;});if(frameURL)URL.revokeObjectURL(frameURL);frameURL=url;}}catch{}finally{busy=false;}}
  setTimeout(pollFrame,250);
}
async function pollStatus(){
  try{const response=await fetch('/api/status');if(response.status===401){location.reload();return;}const info=await response.json();status.textContent=info.error||(!info.ready?'Launching browser…':info.state?.running?`Farming · ${info.state.phase}`:info.injected?'Game ready · script loaded':'Game ready · waiting for runtime');const life=info.state?.life?.current;details.textContent=life?`This life: ${life.kills??'unavailable'} kills · ${life.xp??'unavailable'} XP. Apex completed: ${info.state?.apex?.completed??0}.`:'Use the game login screen, then choose your farming settings and press Start farming.';}catch{status.textContent='Server unavailable. Check Replit.';}setTimeout(pollStatus,2000);
}
pollFrame();pollStatus();
