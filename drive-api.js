const API='https://www.googleapis.com/drive/v3/files';
export class DriveAPI {
 constructor(token,fetcher=globalThis.fetch){this.token=token;this.fetcher=fetcher;this.cache=new Map();}
 async request(url,options={}){
  const response=await this.fetcher(url,{...options,headers:{...options.headers,Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(45000)});
  if(response.status===401)throw Error('Accesso Google scaduto. Premi Ricollega Google.');
  if(!response.ok)throw Error(response.status===403?'Google non ha autorizzato questa operazione. Controlla account e permessi.':`Drive non disponibile (${response.status}). Riprova più tardi.`);
  return response;
 }
 async profile(){const r=await this.request('https://www.googleapis.com/oauth2/v3/userinfo');const p=await r.json();if(!p.sub||!p.email)throw Error('Google non ha restituito un account valido.');return{sub:p.sub,email:p.email};}
 async list(){const files=[];let next;do{const q=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='skooling' and value='operations-v1' }",fields:'nextPageToken,files(id,name,size)',pageSize:'1000'});if(next)q.set('pageToken',next);const data=await(await this.request(`${API}?${q}`)).json();files.push(...data.files||[]);next=data.nextPageToken;}while(next);return files;}
 async read(file){if(this.cache.has(file.id))return this.cache.get(file.id);if(Number(file.size)>10*1024*1024)throw Error('Una modifica su Drive è troppo grande. Nessun dato è stato sostituito.');const r=await this.request(`${API}/${encodeURIComponent(file.id)}?alt=media`);const blob=await r.blob();if(blob.size>10*1024*1024)throw Error('File Drive troppo grande.');const value=JSON.parse(await blob.text());this.cache.set(file.id,value);return value;}
 async append(envelope){const media=JSON.stringify(envelope);if(new Blob([media]).size>10*1024*1024)throw Error('Le modifiche superano il limite di 10 MB per invio. Nessun dato locale è stato cancellato.');const boundary='skooling_'+crypto.randomUUID();const metadata={name:`skooling-${crypto.randomUUID()}.json`,parents:['appDataFolder'],appProperties:{skooling:'operations-v1'}};const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${media}\r\n--${boundary}--`;return(await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json();}
}
