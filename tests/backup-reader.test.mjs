import test from 'node:test';
import assert from 'node:assert/strict';
import {readBackup} from '../backup-reader.js';
import {appendBackupValue} from '../db.js';
async function backup(value){const parts=[];await appendBackupValue(value,parts);return new Blob(parts);}
test('incremental backup reader restores escaped text, unicode and binary across chunk boundaries',async()=>{
 for(const size of [0,1,2,3,98300,98301,196608,400001]){
  const bytes=Uint8Array.from({length:size},(_,i)=>i%251),rows=[];
  const file=await backup({formato:'skooling',versione:1,stores:{libri:[{id:'libro',titolo:'à😀\\\n"',blob:new Blob([bytes],{type:'application/pdf'})}]}});
  file.text=()=>{throw Error('Full-file reading forbidden');};
  const meta=await readBackup(file,{requiredStores:['libri'],onRow:(_,row)=>rows.push(row)});
  assert.equal(meta.conteggi.libri,1);assert.equal(rows[0].titolo,'à😀\\\n"');assert.equal(rows[0].blob.type,'application/pdf');assert.deepEqual(new Uint8Array(await rows[0].blob.arrayBuffer()),bytes);
 }
});
test('reader rejects missing stores, truncation, trailing junk and damaged blobs',async()=>{
 for(const text of ['{"formato":"skooling","versione":1,"stores":{}}','{"formato":"skooling","versione":1,"stores":{"libri":[','{"formato":"skooling","versione":1,"stores":{"libri":[]}}x','{"formato":"skooling","versione":1,"stores":{"libri":[{"id":"x","blob":{"__skoolingBlob":"data:application/pdf;base64,AAAA!"}}]}}'])await assert.rejects(readBackup(new Blob([text]),{requiredStores:['libri']}));
});
