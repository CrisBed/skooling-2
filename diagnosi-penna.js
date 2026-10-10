import {DrawingSurface, downloadBlob} from './strumenti.js';
const canvas=document.querySelector('#canvas');const log=[];let moves=0,commits=0;
const state=document.querySelector('#stato');
const surface=new DrawingSurface(canvas,{onChange(elements){commits++;state.textContent=`Tratti registrati: ${elements.length} · salvataggi locali simulati: ${commits}`;}});
surface.setTool('penna');surface.setDrawWithFinger(false);
function snapshot(e){if(e.type==='pointermove' && ++moves%10!==0)return;log.push({evento:e.type,punta:e.pointerType,id:e.pointerId,pressione:Math.round(e.pressure*100)/100,pulsanti:e.buttons,tratti:surface.elements.length,punti:surface.active?.punti?.length||0,gesto:surface.gesto.attivo,tocchi:surface.gesto.touches.size,ms:Math.round(performance.now())});if(log.length>100)log.shift();document.querySelector('#eventi').textContent=log.slice(-12).map(x=>JSON.stringify(x)).join('\n');}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,snapshot);
function report(){return JSON.stringify({test:'Skooling penna, motore versione 31/6',browser:navigator.userAgent,commits,tratti:surface.elements.length,eventi:log},null,2);}
document.querySelector('#pulisci').onclick=()=>{surface.setElements([]);log.length=0;commits=0;moves=0;state.textContent='Tratti registrati: 0';document.querySelector('#eventi').textContent='';};
document.querySelector('#copia').onclick=async()=>{try{await navigator.clipboard.writeText(report());state.textContent='Diagnosi copiata. Incollala nella chat.';}catch{state.textContent='Usa Salva diagnosi e allega il file alla chat.';}};
document.querySelector('#scarica').onclick=()=>downloadBlob(new Blob([report()],{type:'text/plain'}),'diagnosi-penna.txt');
