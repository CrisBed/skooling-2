import { DB, createId } from './db.js';
import { CLIENT_ID } from './drive-config.js';
import { DriveAPI } from './drive-api.js';
import { synchronize } from './sync-engine.js';
import { otherDeviceResolutions } from './sync-model.js';

let token='',expires=0,profile,drive,client,working=false,scriptPromise;
const el=id=>document.getElementById(id);
const status=text=>{el('sync-status').textContent=text;};
const idle=()=>!document.body.classList.contains('workspace-open')&&document.querySelector('#progress-overlay')?.hidden&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable=true]');
function loadGIS(){return scriptPromise||=(new Promise((resolve,reject)=>{if(globalThis.google?.accounts?.oauth2)return resolve();const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>{scriptPromise=null;reject(Error('Google non è raggiungibile. Controlla Internet.'));};document.head.append(script);}));}
async function render(){
 const owner=(await DB.get('impostazioni','sync-owner'))?.valore;
 const saved=(await DB.get('impostazioni','sync-state'))?.valore;
 el('sync-account').textContent=owner?`Archivio collegato a ${owner.email}`:'Nessun account collegato';
 el('sync-last').textContent=saved?.lastSync?`Ultimo aggiornamento: ${new Date(saved.lastSync).toLocaleString('it-IT')}`:'Nessuna sincronizzazione completata';
 el('sync-now').disabled=!token||working;el('sync-disconnect').disabled=!token||working;
 el('sync-connect').disabled=!client||working;el('sync-connect').textContent=owner?'Ricollega Google':'Collega Google Drive';
 const list=el('sync-conflicts');list.replaceChildren();
 const other=otherDeviceResolutions(saved?.conflicts||[],saved?.device);
 if(other.length){const button=document.createElement('button');button.className='button secondary';button.textContent="Mantieni tutte le versioni dell’altro dispositivo";button.disabled=!token||working;button.onclick=async()=>{if(!confirm('Mantenere le versioni dell’altro dispositivo per tutti i conflitti? Le copie alternative saranno conservate su questo dispositivo.'))return;try{const archive=(await DB.get('impostazioni','sync-conflict-archive'))?.valore||[];await DB.put('impostazioni',{id:'sync-conflict-archive',valore:[...archive,...saved.conflicts.map(c=>({...c,savedAt:new Date().toISOString()}))]});await run(other);}catch(e){status(e.message);}};list.append(button);}
 for(const conflict of saved?.conflicts||[]){const box=document.createElement('div');box.className='sync-conflict';const[store,id]=JSON.parse(conflict.key);const title=document.createElement('strong');title.textContent=`Due versioni di ${store}: ${conflict.versions.find(v=>v.value)?.value?.titolo||id}`;box.append(title);
  const copy=document.createElement('p');copy.textContent='Le copie sono conservate. Scegli quale mantenere su tutti i dispositivi.';box.append(copy);
  for(const variant of conflict.versions){const detail=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre'),button=document.createElement('button');summary.textContent=variant.value===null?'Eliminazione':`${variant.device===saved.device?'Questo dispositivo':'Altro dispositivo'} · ${new Date(variant.at).toLocaleString('it-IT')}`;pre.textContent=variant.value===null?'Voce eliminata':JSON.stringify(variant.value,null,2);button.className='button secondary';button.textContent='Usa questa versione';button.disabled=!token||working;button.onclick=async()=>{if(!confirm('Usare questa versione su tutti i dispositivi? Le altre copie saranno conservate su questo dispositivo.'))return;try{const archive=(await DB.get('impostazioni','sync-conflict-archive'))?.valore||[];await DB.put('impostazioni',{id:'sync-conflict-archive',valore:[...archive,{...conflict,savedAt:new Date().toISOString()}]});await run([{key:conflict.key,id:variant.id}]);}catch(e){status(e.message);}};detail.append(summary,pre,button);box.append(detail);
  }list.append(box);
 }
}
async function configure(){
 client=null;const id=(await DB.get('impostazioni','sync-client-id'))?.valore||CLIENT_ID;
 if(!id){status('Collegamento Google in preparazione. Puoi continuare a lavorare e fare backup locali.');await render();return;}
 try{await loadGIS();client=google.accounts.oauth2.initTokenClient({client_id:id,scope:'openid email https://www.googleapis.com/auth/drive.appdata',callback:async response=>{
  if(response.error){status('Accesso Google non completato. I dati restano sul dispositivo.');return;}
  try{const api=new DriveAPI(response.access_token),account=await api.profile(),owner=(await DB.get('impostazioni','sync-owner'))?.valore;
   if(owner&&owner.sub!==account.sub)throw Error(`Questo archivio appartiene a ${owner.email}. Ricollega lo stesso account per evitare di mescolare i dati.`);
   if(!owner&&!confirm(`Collegare il lavoro presente su questo dispositivo al Drive di ${account.email}? Saranno inviati scritte, quaderni, appunti testuali, compiti, risultati e routine. PDF, foto e audio resteranno locali.`)){status('Collegamento annullato.');return;}
   if(!owner)await DB.put('impostazioni',{id:'sync-owner',valore:account});
   token=response.access_token;expires=Date.now()+Number(response.expires_in||3600)*1000;profile=account;drive=api;await run();
  }catch(e){token='';status(e.message);await render();}
 },error_callback:()=>status('La finestra Google è stata chiusa o bloccata. Premi di nuovo Collega Google.')});status('Pronto per collegare Google. I PDF resteranno locali.');}catch(e){status(e.message);}await render();
}
async function run(resolutions=[]){
 if(working)return;if(!idle()){status('Chiudi prima il libro o il quaderno e attendi la fine del backup.');return;}
 if(!token||Date.now()>=expires){token='';status('Premi Ricollega Google per aggiornare i dispositivi.');await render();return;}
 const execute=async lock=>{if(lock===null){status('Sincronizzazione già in corso in un’altra scheda.');return;}working=true;status('Sincronizzo il tuo lavoro…');await render();
  const account=profile;
  try{const result=await synchronize(DB,drive,account,()=>createId('sync'),resolutions,()=>idle()&&Boolean(token)&&profile?.sub===account.sub);status(result.conflicts.length?'Ci sono versioni da confrontare qui sotto. Nessuna è stata sovrascritta.':'Tutto aggiornato. I PDF restano su questo dispositivo.');document.dispatchEvent(new Event('skooling:sync-applied'));}
  catch(e){status(e.message);if(e.message.includes('scaduto'))token='';}
  finally{working=false;await render();}
 };
 if(navigator.locks)await navigator.locks.request('skooling2-sync',{ifAvailable:true},execute);else await execute(true);
}
export const DriveSync={
 async init(){
  el('sync-connect').onclick=()=>{if(client)client.requestAccessToken({prompt:''});};
  el('sync-now').onclick=()=>run();el('sync-disconnect').onclick=async()=>{token='';expires=0;profile=null;status('Google scollegato. I dati e l’associazione all’account restano conservati.');await render();};
  el('sync-save-config').onclick=async()=>{const id=el('sync-client-id').value.trim();if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(id)){status('Inserisci un ID client OAuth Google valido.');return;}await DB.put('impostazioni',{id:'sync-client-id',valore:id});await configure();};
  document.addEventListener('skooling:backup-importing',()=>{token='';profile=null;render();status('Backup in importazione. Ricollega Google dopo il ripristino.');});
  setInterval(()=>{if(navigator.locks&&token&&!working&&Date.now()<expires&&document.visibilityState==='visible'&&navigator.onLine&&idle())run();},30000);
  window.addEventListener('online',()=>{if(!client&&!token)configure();});
  configure().catch(e=>status(e.message));
 },disconnect(){token='';expires=0;profile=null;}
};
