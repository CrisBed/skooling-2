import {DrawingSurface, downloadBlob} from './strumenti.js';
const canvas=document.querySelector('#canvas'), state=document.querySelector('#stato');
const log=[],errors=[],checks=[];let moves=0,commits=0,mode='skooling',raw=null,rawCount=0;
function add(item){log.push({modalita:mode,ms:Math.round(performance.now()),...item});if(log.length>2000)log.shift();document.querySelector('#eventi').textContent=log.slice(-12).map(x=>JSON.stringify(x)).join('\n');}
const surface=new DrawingSurface(canvas,{onChange(elements){commits++;state.textContent=`Tratti registrati: ${elements.length} · salvataggi simulati: ${commits}`;}});
surface.setTool('penna');surface.setDrawWithFinger(false);
// La prova diretta usa soltanto cerchi e segmenti Canvas, senza pressione,
// filtri di distanza, cronologia, gesti o salvataggi del motore Skooling.
surface.resizeObserver?.disconnect();
function eventData(e){return {evento:e.type,punta:e.pointerType,id:e.pointerId,pressione:Math.round(e.pressure*1000)/1000,pulsanti:e.buttons,tratti:surface.elements.length,punti:surface.active?.punti?.length||0,gesto:surface.gesto.attivo,tocchi:surface.gesto.touches.size};}
function checkPixels(source){const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i])pixels++;checks.push({modalita:mode,origine:source,pixelVisibili:pixels,tratti:surface.elements.length,trattiDiretti:rawCount,ms:Math.round(performance.now())});}
function direct(e){e.preventDefault();e.stopImmediatePropagation();if(e.pointerType!=='pen')return;
 const r=canvas.getBoundingClientRect(), p={x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};const ctx=canvas.getContext('2d'),w=3*canvas.width/r.width;ctx.strokeStyle='#183e35';ctx.fillStyle='#183e35';ctx.lineWidth=w;ctx.lineCap='round';
 if(e.type==='pointerdown'){raw={id:e.pointerId,...p};rawCount++;if(!e.fromTouch){try{canvas.setPointerCapture(e.pointerId);}catch{}}ctx.beginPath();ctx.arc(p.x,p.y,w/2,0,Math.PI*2);ctx.fill();}
 else if(raw?.id===e.pointerId){ctx.beginPath();ctx.moveTo(raw.x,raw.y);ctx.lineTo(p.x,p.y);ctx.stroke();raw={id:e.pointerId,...p};if(e.type==='pointerup'||e.type==='pointercancel')raw=null;}
 if(e.type!=='pointermove'||++moves%10===0)add({...eventData(e),trattiDiretti:rawCount});

}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel']){
 canvas.addEventListener(type,e=>{if(mode==='diretta')direct(e);else if(mode==='touch'){e.stopImmediatePropagation();if(type!=='pointermove'||++moves%10===0)add(eventData(e));}},true);
 canvas.addEventListener(type,e=>{if(e.type!=='pointermove'||++moves%10===0)add(eventData(e));if(e.type==='pointerup'||e.type==='pointercancel'){const el=surface.elements.at(-1),points=el?.punti||[];add({evento:'tratto-concluso',punti:points.length,coordinateNonFinite:points.filter(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)).length,larghezza:el?.spessore});}});
 // Anche gli eventi destinati fuori dal foglio aiutano a distinguere un
 // contatto non consegnato al canvas da un errore del motore.
 if(type!=='pointermove')document.addEventListener(type,e=>add({evento:'documento-'+type,punta:e.pointerType,id:e.pointerId,sulFoglio:e.target===canvas}),true);
}
canvas.addEventListener('lostpointercapture',e=>add(eventData(e)));
// In questa modalità il disegno dipende esclusivamente dai Touch Events.
// Non si cancellano i Pointer Events con preventDefault: vengono solo esclusi
// dal motore, per poter osservare entrambi i flussi sullo stesso dispositivo.
const touchNames={touchstart:'pointerdown',touchmove:'pointermove',touchend:'pointerup',touchcancel:'pointercancel'};
for(const type of Object.keys(touchNames)){
 document.addEventListener(type,e=>{
  if(type!=='touchmove')for(const t of e.changedTouches)add({evento:'documento-'+type,id:t.identifier,tipoTouch:t.touchType||'non-disponibile',sulFoglio:t.target===canvas});
 },{capture:true,passive:true});
 canvas.addEventListener(type,e=>{
  const changed=Array.from(e.changedTouches);
  if(type!=='touchmove'||++moves%10===0)add({evento:type,contatti:changed.map(t=>({id:t.identifier,tipoTouch:t.touchType||'non-disponibile',pressione:t.force})),touchAttivi:e.touches.length});
  if(mode!=='touch')return;
  // Un dito non deve diventare inchiostro. Se WebKit non espone touchType,
  // si segnala il limite invece di classificare il palmo come penna.
  for(const t of changed){
   if(t.touchType!=='stylus'){if(type==='touchstart'&&!t.touchType)state.textContent='Il browser non identifica la penna nei Touch Events. Copia la diagnosi.';continue;}
   direct({type:touchNames[type],pointerType:'pen',pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY,pressure:t.force||0,buttons:type==='touchend'||type==='touchcancel'?0:1,fromTouch:true,preventDefault:()=>e.preventDefault(),stopImmediatePropagation:()=>e.stopImmediatePropagation()});
   state.textContent=`Penna alternativa (touch) · tratti: ${rawCount}`;
  }
 },{passive:false});
}

window.addEventListener('error',e=>errors.push({messaggio:e.message,riga:e.lineno}));
window.addEventListener('unhandledrejection',e=>errors.push({messaggio:String(e.reason)}));
function clear(){surface.setElements([]);raw=null;rawCount=0;state.textContent='Foglio pulito. La diagnosi delle prove viene conservata.';}
document.querySelector('#modalita').onchange=e=>{mode=e.target.value;clear();add({evento:'cambio-prova'});};
document.querySelector('#pulisci').onclick=()=>{clear();add({evento:'pulisci'});};
document.querySelector('#manca').onclick=()=>{checkPixels('segno-mancante');add({evento:'utente-segnala-segno-mancante'});state.textContent='Segno mancante annotato. Puoi passare alla seconda prova o copiare la diagnosi.';};
function report(){checkPixels('diagnosi');return JSON.stringify({test:'Skooling confronto penna 3 (pointer / touch)',browser:navigator.userAgent,dimensioni:{css:[canvas.clientWidth,canvas.clientHeight],pixel:[canvas.width,canvas.height]},commits,tratti:surface.elements.length,trattiDiretti:rawCount,errori:errors,controlli:checks,eventi:log},null,2);}
document.querySelector('#copia').onclick=async()=>{try{await navigator.clipboard.writeText(report());state.textContent='Diagnosi copiata. Incollala nella chat.';}catch{state.textContent='Usa Salva diagnosi e allega il file alla chat.';}};
document.querySelector('#scarica').onclick=()=>downloadBlob(new Blob([report()],{type:'text/plain'}),'diagnosi-penna.txt');
