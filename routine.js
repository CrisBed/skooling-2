import {DB,createId} from './db.js';
import {schoolClock,schoolQuiet,dueRoutine,initialRoutines,timeMinutes} from './routine-model.js';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups={mattina:'Prima di uscire',pomeriggio:'Il pomeriggio',sera:'Prima di dormire'};
let api,config,done={},day='',timer,playing,playURL,checking=false,shown=new Set();
function stopAudio(){globalThis.speechSynthesis?.cancel();if(playing){playing.pause();playing=null;}if(playURL){URL.revokeObjectURL(playURL);playURL=null;}}
async function load(){config=(await DB.get('impostazioni','routine-config'))?.valore||{items:initialRoutines(),audio:false};const current=schoolClock().day;if(day!==current){shown.clear();day=current;}done=(await DB.get('impostazioni','routine-done-'+day))?.valore||{};}
function permitted(){return !schoolQuiet() && document.visibilityState==='visible';}
async function speak(item){
 if(!permitted()){stopAudio();return false;}
 stopAudio();
 if(item.audio instanceof Blob){playURL=URL.createObjectURL(item.audio);playing=new Audio(playURL);await playing.play();}
 else if(globalThis.speechSynthesis){const utterance=new SpeechSynthesisUtterance(item.title);utterance.lang='it-IT';globalThis.speechSynthesis.speak(utterance);}else throw new Error('Voce non disponibile in questo browser.');return true;
}
async function saveConfig(){await DB.put('impostazioni',{id:'routine-config',valore:config});}
async function tick(){
 if(checking)return;checking=true;
 try{
 if(!permitted()){stopAudio();return;}
 const previousDay=day;await load();
 if(previousDay!==day && document.querySelector('#routine')?.classList.contains('active'))await Routine.render();
 if(!permitted())return;
 const due=config.items.filter(item=>dueRoutine(item,done)&&!shown.has(item.id));
 due.forEach(item=>shown.add(item.id));
 if(due.length){api.notify('Promemoria: '+due.map(x=>x.title).join('; '));if(config.audio)await speak({...due[0],title:due.map(x=>x.title).join('. '),audio:due.length===1?due[0].audio:null});}
 }catch(e){console.warn('Routine:',e.message);}finally{checking=false;}
}
async function edit(item){
 const d=document.createElement('dialog');d.innerHTML=`<form class="dialog-form"><h2>${item?'Modifica attività':'Nuova attività'}</h2><label>Attività<input name="title" required maxlength="150" value="${h(item?.title)}"></label><label>Momento<select name="group">${Object.entries(groups).map(([id,title])=>`<option value="${id}" ${item?.group===id?'selected':''}>${title}</option>`).join('')}</select></label><label>Orario, Italia<input name="time" required type="time" value="${item?.time||'15:00'}"></label><fieldset><legend>Giorni</legend>${['Dom','Lun','Mar','Mer','Gio','Ven','Sab'].map((label,i)=>`<label class="routine-day"><input type="checkbox" name="days" value="${i}" ${(item?.days||[1,2,3,4,5]).includes(i)?'checked':''}>${label}</label>`).join('')}</fieldset><label class="routine-day"><input name="enabled" type="checkbox" ${item?.enabled===false?'':'checked'}>Attività attiva</label><label>Audio personale facoltativo<input type="file" name="audio" accept="audio/*"></label>${item?.audio?'<label class="routine-day"><input type="checkbox" name="removeAudio">Rimuovi audio personale</label>':''}<p class="small-copy">Senza file verrà letta l’attività con la voce del dispositivo. Il silenzio 8:30–13:30 resta sempre attivo.</p><p role="alert" class="form-error"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Annulla</button><button class="button primary">Salva</button></div></form>`;
 document.body.append(d);d.onclose=()=>d.remove();d.querySelector('[data-close]').onclick=()=>d.close();d.querySelector('form').onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.target);const b=d.querySelector('.primary');b.disabled=true;
 try{const title=f.get('title').trim();if(!title)throw new Error('Scrivi il nome dell’attività.');timeMinutes(f.get('time'));const days=f.getAll('days').map(Number);if(!days.length)throw new Error('Scegli almeno un giorno.');const file=f.get('audio');let audio=item?.audio;if(f.has('removeAudio'))audio=null;if(file?.size){if(!file.type.startsWith('audio/')||file.size>10*1024*1024)throw new Error('Scegli un audio di massimo 10 MB.');audio=file;}
 await load();const value={...item,id:item?.id||createId('routine'),title,group:f.get('group'),time:f.get('time'),days,enabled:f.has('enabled'),audio};config.items=item?config.items.map(x=>x.id===item.id?value:x):[...config.items,value];await saveConfig();d.close();await Routine.render();
 }catch(e){d.querySelector('.form-error').textContent=e.message;}finally{b.disabled=false;}};d.showModal();
}
export const Routine={
 async init(a){api=a;await load();timer=setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(!permitted())stopAudio();else tick();});window.addEventListener('pagehide',stopAudio);window.addEventListener('focus',()=>{load().then(()=>{if(document.querySelector('#routine').classList.contains('active'))return this.render();}).catch(()=>{});});document.querySelector('#import-backup')?.addEventListener('change',stopAudio);await tick();},
 async render(){
 await load();const clock=schoolClock();const items=config.items.filter(x=>x.enabled&&x.days.includes(clock.weekday));const count=items.filter(x=>done[x.id]).length;
 const root=document.querySelector('#routine');root.innerHTML=`<div class="view-heading"><div><p class="eyebrow">Skooling 2.0 · Le mie routine</p><h1>Una cosa alla volta</h1><p class="subtitle">${count} di ${items.length} attività fatte oggi · ${new Date().toLocaleDateString('it-IT',{timeZone:'Europe/Rome'})}</p></div><button id="routine-add" class="button primary">Aggiungi attività</button></div><div class="routine-quiet"><strong>Silenzio scuola: tutti i giorni, dalle 8:30 alle 13:30, ora italiana.</strong><p>Nessun promemoria, suono o voce in questa fascia. I promemoria scaduti non vengono recuperati alle 13:30.</p><label class="routine-day"><input id="routine-audio" type="checkbox" ${config.audio?'checked':''}>Promemoria audio fuori dall’orario scolastico</label><p class="small-copy">I promemoria funzionano mentre l’app è aperta e visibile. Non sono sveglie con app chiusa o iPad bloccato.</p></div>${Object.entries(groups).map(([group,title])=>`<article class="study-panel routine-group"><h2>${title}</h2><div class="routine-list">${config.items.filter(x=>x.group===group).map(item=>`<div class="routine-row ${done[item.id]?'routine-done':''}"><label class="routine-check"><input type="checkbox" data-done="${h(item.id)}" ${done[item.id]?'checked':''} ${!item.enabled||!item.days.includes(clock.weekday)?'disabled':''}><span><strong>${h(item.title)}</strong><small>${item.time} · ${item.days.map(i=>['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][i]).join(', ')}${!item.enabled?' · Disattivata':''}</small></span></label><div class="routine-controls"><button class="button secondary" data-edit="${h(item.id)}">Modifica</button><button class="button secondary" data-up="${h(item.id)}" aria-label="Sposta prima ${h(item.title)}">↑</button><button class="button secondary" data-down="${h(item.id)}" aria-label="Sposta dopo ${h(item.title)}">↓</button><button class="button secondary" data-speak="${h(item.id)}">Ascolta</button><button class="button secondary" data-delete="${h(item.id)}">Elimina</button></div></div>`).join('')||'<p>Nessuna attività. Aggiungine una quando vuoi.</p>'}</div></article>`).join('')}`;
 const handle=fn=>async e=>{try{await fn(e);}catch(err){api.notify(err.message,true);}};
 root.querySelector('#routine-add').onclick=handle(()=>edit());root.querySelector('#routine-audio').onchange=handle(async e=>{await load();config.audio=e.target.checked;await saveConfig();if(!config.audio)stopAudio();else if(permitted())await speak({title:'Promemoria audio attivati'});});
 root.querySelectorAll('[data-done]').forEach(b=>b.onchange=handle(async()=>{await load();done[b.dataset.done]=b.checked;await DB.put('impostazioni',{id:'routine-done-'+day,valore:done});await this.render();}));
 root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=handle(()=>edit(config.items.find(x=>x.id===b.dataset.edit))));
 root.querySelectorAll('[data-speak]').forEach(b=>b.onclick=handle(async()=>{if(!permitted())return;await speak(config.items.find(x=>x.id===b.dataset.speak));}));
 for(const direction of ['up','down'])root.querySelectorAll('[data-'+direction+']').forEach(b=>b.onclick=handle(async()=>{await load();const id=b.dataset[direction],i=config.items.findIndex(x=>x.id===id),group=config.items[i].group;let j=i+(direction==='up'?-1:1);while(j>=0&&j<config.items.length&&config.items[j].group!==group)j+=direction==='up'?-1:1;if(j>=0&&j<config.items.length){[config.items[i],config.items[j]]=[config.items[j],config.items[i]];await saveConfig();await this.render();}}));
 root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=handle(async()=>{if(!confirm('Eliminare questa attività dalla routine?'))return;await load();config.items=config.items.filter(x=>x.id!==b.dataset.delete);await saveConfig();await this.render();}));
 }
};
