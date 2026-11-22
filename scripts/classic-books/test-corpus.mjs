// Writes only a uniquely named disposable schema on a separate local test server.
import assert from 'node:assert/strict';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {DATA,readJson,writeJson} from './common.mjs';
import {importDatasets} from './import-core.mjs';

const port=Number(process.env.BOOKS_TEST_PORT);
if(!Number.isInteger(port)||port<1024||port>65535||port===3306)throw new Error('Use BOOKS_TEST_PORT for a separate isolated MySQL server, not port 3306');
const database=`qingnang_books_test_${randomBytes(8).toString('hex')}`;
const db=await mysql.createConnection({host:'127.0.0.1',port,user:process.env.BOOKS_TEST_USER||'root',password:process.env.BOOKS_TEST_PASSWORD||'',charset:'utf8mb4'});
try{
  const manifest=await readJson(path.join(DATA,'books.json'));
  const validation=await readJson(path.join(DATA,'validation-report.json'));
  if(!validation.passed)throw new Error('Corpus validation must pass before importing into test schema');
  const datasets=[];for(const b of manifest.books)datasets.push(await readJson(path.join(DATA,b.chapter_file)));
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  await db.query(`USE \`${database}\``);
  await db.query('CREATE TABLE t_books(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(255) NOT NULL,summary TEXT,dynasty VARCHAR(50),author VARCHAR(255),jp VARCHAR(100),custom_value VARCHAR(100)) ENGINE=InnoDB');
  // Canonical deployment shape: no item_order. The API sorts by generated id.
  await db.query('CREATE TABLE t_book_chapters(id INT AUTO_INCREMENT PRIMARY KEY,book_id INT NOT NULL,title VARCHAR(255) NOT NULL,volume VARCHAR(1024),content MEDIUMTEXT,shiyi TEXT,INDEX(book_id)) ENGINE=InnoDB');
  await db.query("INSERT INTO t_books(id,name,summary,dynasty,author,jp,custom_value) VALUES(97,'伤寒论','保留本地简介','原朝代','原作者','OLD','unchanged')");
  const [[before]]=await db.query('SELECT * FROM t_books WHERE id=97');
  const dry=await importDatasets(db,database,datasets);
  assert.equal(dry.summary.errors,0);assert.equal(dry.summary.conflicts,0);
  console.log('Full corpus preflight passed');
  const first=await importDatasets(db,database,datasets,{apply:true});
  assert.equal(first.summary.errors,0);assert.equal(first.summary.conflicts,0);
  assert.equal(first.summary.inserted_books,49);assert.equal(first.summary.inserted_chapters,validation.total_chapters);
  console.log(`First import passed: ${first.summary.inserted_chapters} chapters`);
  const second=await importDatasets(db,database,datasets,{apply:true});
  assert.equal(second.summary.errors,0);assert.equal(second.summary.conflicts,0);assert.equal(second.summary.inserted_books,0);assert.equal(second.summary.inserted_chapters,0);
  const [[after]]=await db.query('SELECT * FROM t_books WHERE id=97');assert.deepEqual(after,before);
  const [[counts]]=await db.query('SELECT (SELECT COUNT(*) FROM t_books) AS books,(SELECT COUNT(*) FROM t_book_chapters) AS chapters');
  assert.equal(Number(counts.books),50);assert.equal(Number(counts.chapters),validation.total_chapters);
  await writeJson(path.join(DATA,'corpus-import-test-report.json'),{generated_at:new Date().toISOString(),isolated:true,schema:database,shape:'canonical title column, no item_order, MEDIUMTEXT content',passed:true,existing_book_preserved:true,counts,preflight:dry.summary,first_import:first.summary,repeat_import:second.summary,dataset_hashes:manifest.books.map(b=>({key:b.key,sha256:b.dataset_sha256}))});
  console.log(JSON.stringify({passed:true,counts,existing_book_preserved:true,repeat:second.summary},null,2));
}finally{
  if(!/^qingnang_books_test_[a-f0-9]{16}$/.test(database))throw new Error('Refusing to drop non-test schema');
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end();
}
