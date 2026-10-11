import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBackupBooks} from '../db.js';
const books=[{id:'a',titolo:'Matematica',materia:'Matematica',blob:new Blob(['pdf']),copertina:new Blob(['copertina'])},{id:'b',titolo:'Storia',materia:'Storia',blob:new Blob(['pdf'])}];
test('essential includes a book with any annotation, excludes binary and covers from missing-book list',()=>{
 const selected=selectBackupBooks(books,[{idLibro:'a',tipo:'evidenziatore'}],'essenziale');
 assert.deepEqual(selected.books.map(b=>b.id),['a']);assert.deepEqual(selected.excluded,[{id:'b',titolo:'Storia',materia:'Storia'}]);
 const untouched=selectBackupBooks(books,[],'essenziale');assert.equal(untouched.books.length,0);assert.equal(untouched.excluded.length,2);assert.equal('blob' in untouched.excluded[0],false);assert.equal('copertina' in untouched.excluded[0],false);
});
test('complete keeps all PDFs, and an invalid mode cannot silently omit books',()=>{
 assert.equal(selectBackupBooks(books,[],'completo').books.length,2);assert.deepEqual(selectBackupBooks(books,[],'completo').excluded,[]);assert.throws(()=>selectBackupBooks(books,[],'invalid'));
});
