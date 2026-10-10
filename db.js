// Persistenza locale di Skooling. Nessun dato lascia il dispositivo.
export const DB_NAME = 'skooling2-db';
export const DB_VERSION = 6;
export const STORE_NAMES = [
  'libri',
  'annotazioni',
  'segnalibri',
  'quaderni',
  'paginequaderno',
  'compiti',
  'impostazioni',
  'album',
  'foto',
  'letture',
  'argomenti',
  'materiali',
  'risultati',
];

// L'indice del testo dei libri si ricostruisce leggendo di nuovo i PDF, quindi
// non entra nel backup: ci farebbe crescere il file di molti megabyte senza
// aggiungere niente che non si possa rifare.
export const STORE_NAMES_DERIVATI = ['indicelibri'];

// Gli archivi che ci sono da sempre: un backup deve averli tutti, altrimenti
// non e' un backup buono. Quelli aggiunti dopo, come le foto dell'album,
// possono mancare in un file salvato con una versione precedente: in quel caso
// si importano vuoti invece di rifiutare tutto il ripristino.
export const STORE_NAMES_STORICI = [
  'libri',
  'annotazioni',
  'segnalibri',
  'quaderni',
  'paginequaderno',
  'compiti',
  'impostazioni',
];

const STORE_OPTIONS = {
  argomenti: { keyPath: 'id' },
  materiali: { keyPath: 'id' },
  risultati: { keyPath: 'id' },
  libri: { keyPath: 'id' },
  annotazioni: { keyPath: 'id' },
  segnalibri: { keyPath: 'id' },
  quaderni: { keyPath: 'id' },
  paginequaderno: { keyPath: 'id' },
  compiti: { keyPath: 'id' },
  impostazioni: { keyPath: 'id' },
  // Gli album delle fotografie: una cartella con un nome, di solito la data del
  // giorno in cui si e' scattato. Le foto stanno nell'archivio qui sotto e
  // dicono a quale album appartengono.
  album: { keyPath: 'id' },
  foto: { keyPath: 'id' },
  // A che pagina si e' arrivati, tenuto a parte dal libro. Sta qui e non dentro
  // il libro perche' salvare il segnaposto dentro il libro vuol dire riscrivere
  // tutto il PDF: con un libro da 400 MB sono mezzo secondo e 400 MB di scrittura
  // a ogni voltata di pagina.
  letture: { keyPath: 'id' },
  indicelibri: { keyPath: 'id' },
};

let openPromise;

export function createId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function blobToDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const block = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += block) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + block));
    if (offset && offset % (block * 32) === 0) await new Promise(requestAnimationFrameSafe);
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function dataURLToBlob(value) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(value ?? '');
  if (!match) throw new Error('Il backup contiene un file non leggibile.');
  const type = match[1] || 'application/octet-stream';
  const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function requestAnimationFrameSafe(resolve) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
}

async function encodeValue(value) {
  if (value instanceof Blob) return { __skoolingBlob: await blobToDataURL(value) };
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) result.push(await encodeValue(item));
    return result;
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = await encodeValue(item);
    return result;
  }
  return value;
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === 'object') {
    if (typeof value.__skoolingBlob === 'string') return dataURLToBlob(value.__skoolingBlob);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
  }
  return value;
}

export function validateBackup(value) {
  if (!value || value.formato !== 'skooling' || value.versione !== 1 || !value.stores) {
    throw new Error('Questo non è un backup di Skooling valido.');
  }
  for (const name of STORE_NAMES_STORICI) {
    if (!Array.isArray(value.stores[name])) {
      throw new Error('Il backup di Skooling è incompleto e non è stato importato.');
    }
  }
  return value;
}

function openDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('Il salvataggio locale non è disponibile in questo browser.'));
  }
  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of [...STORE_NAMES, ...STORE_NAMES_DERIVATI]) {
          if (!database.objectStoreNames.contains(name)) {
            const store = database.createObjectStore(name, STORE_OPTIONS[name]);
            if (name === 'annotazioni') store.createIndex('libroPagina', ['idLibro', 'pagina']);
            if (name === 'segnalibri') store.createIndex('libro', 'idLibro');
            if (name === 'paginequaderno') store.createIndex('quaderno', 'idQuaderno');
            if (name === 'compiti') store.createIndex('consegna', 'consegna');
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Skooling non riesce ad aprire il suo archivio. Ricarica la pagina.'));
      request.onblocked = () => reject(new Error('Chiudi le altre finestre di Skooling e riprova.'));
    });
  }
  return openPromise;
}

function requestResult(request, fallback) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? fallback);
    request.onerror = () => reject(new Error('Non sono riuscito a salvare. Riprova tra poco.'));
  });
}

async function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(new Error('Il salvataggio non è riuscito. I dati precedenti sono al sicuro.'));
    transaction.onabort = () => reject(new Error('Operazione interrotta. I dati precedenti sono al sicuro.'));
  });
}

export const DB = {
  async init() {
    await openDatabase();
    return this;
  },

  async getAll(storeName) {
    const database = await openDatabase();
    return requestResult(database.transaction(storeName).objectStore(storeName).getAll(), []);
  },

  async get(storeName, id) {
    const database = await openDatabase();
    return requestResult(database.transaction(storeName).objectStore(storeName).get(id), null);
  },

  async put(storeName, value) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
    return value;
  },

  async putMany(storeName, values) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const value of values) store.put(value);
    await transactionDone(transaction);
    return values;
  },

  async delete(storeName, id) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    await transactionDone(transaction);
  },

  async deleteWhere(storeName, predicate) {
    const values = await this.getAll(storeName);
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const value of values) if (predicate(value)) store.delete(value.id);
    await transactionDone(transaction);
  },

  async exportBackup(onProgress = () => {}) {
    const stores = {};
    for (let index = 0; index < STORE_NAMES.length; index += 1) {
      stores[STORE_NAMES[index]] = await encodeValue(await this.getAll(STORE_NAMES[index]));
      onProgress((index + 1) / STORE_NAMES.length);
    }
    return new Blob([JSON.stringify({
      formato: 'skooling',
      versione: 1,
      applicazione: 'skooling2',
      creatoIl: new Date().toISOString(),
      stores,
    })], { type: 'application/x-skooling+json' });
  },

  async importBackup(file, onProgress = () => {}) {
    let parsed;
    try {
      parsed = validateBackup(JSON.parse(await file.text()));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('Il file scelto non è un backup di Skooling valido.');
      throw error;
    }
    const decoded = {};
    // Un backup piu' vecchio non ha gli archivi aggiunti dopo: restano vuoti.
    for (const name of STORE_NAMES) decoded[name] = decodeValue(parsed.stores[name] ?? []);
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAMES, 'readwrite');
    for (const name of STORE_NAMES) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const value of decoded[name]) store.put(value);
    }
    await transactionDone(transaction);
    onProgress(1);
    return parsed;
  },

  async storageStatus() {
    let persisted = false;
    if (navigator.storage?.persist) persisted = await navigator.storage.persist();
    if (!navigator.storage?.estimate) return { persisted, usage: 0, quota: 0, remaining: Infinity, low: false };
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const remaining = Math.max(0, quota - usage);
    return { persisted, usage, quota, remaining, low: quota > 0 && (remaining / quota < 0.15 || remaining < 250 * 1024 * 1024) };
  },
};
