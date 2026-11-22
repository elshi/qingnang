import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {sha256} from '../common.mjs';
import {importDatasets} from '../import-core.mjs';

function dataset(name='伤寒论',aliases=[]){return {book:{key:'test',name,summary:'新简介',dynasty:'汉',author:'张仲景',jp:'SHL',aliases},chapters:['第一篇','第二篇','第三篇'].map((title,i)=>({chapter_key:`c${i}`,order:i+1,title,volume:'卷一',content:`古籍原文${i}𠮷`,content_sha256:sha256(`古籍原文${i}𠮷`),shiyi:null}))};}
const port=process.env.BOOKS_TEST_PORT;
test('real MySQL isolated import scenarios',{skip:!port},async t=>{
  const database=`qingnang_books_test_${randomBytes(8).toString('hex')}`;
  const db=await mysql.createConnection({host:'127.0.0.1',port:Number(port),user:process.env.BOOKS_TEST_USER||'root',password:process.env.BOOKS_TEST_PASSWORD||'',charset:'utf8mb4'});
  try{
    await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    await db.query(`USE \`${database}\``);
    async function reset(title='title',type='MEDIUMTEXT',extra=''){
      await db.query('DROP TABLE IF EXISTS t_book_chapters');await db.query('DROP TABLE IF EXISTS t_books');
      await db.query('CREATE TABLE t_books (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,summary TEXT,dynasty VARCHAR(50),author VARCHAR(100),jp VARCHAR(100),custom_value VARCHAR(100) DEFAULT \'untouched\') ENGINE=InnoDB');
      await db.query(`CREATE TABLE t_book_chapters (id INT AUTO_INCREMENT PRIMARY KEY,book_id INT NOT NULL,${title} VARCHAR(255) NOT NULL,volume VARCHAR(255),content ${type},shiyi TEXT,item_order INT NOT NULL,${extra} INDEX(book_id)) ENGINE=InnoDB`);
    }
    async function count(table){const [[r]]=await db.query(`SELECT COUNT(*) AS n FROM ${table}`);return Number(r.n);}
    await t.test('default preflight makes no writes; new import and repeat are idempotent',async()=>{
      await reset();const data=dataset();
      const dry=await importDatasets(db,database,[data]);assert.equal(dry.summary.planned_new_books,1);assert.equal(await count('t_books'),0);
      const first=await importDatasets(db,database,[data],{apply:true});assert.equal(first.summary.inserted_books,1);assert.equal(first.summary.inserted_chapters,3);
      const second=await importDatasets(db,database,[data],{apply:true});assert.equal(second.summary.inserted_books,0);assert.equal(second.summary.inserted_chapters,0);assert.equal(await count('t_book_chapters'),3);
    });
    await t.test('existing book metadata and ID are never changed; missing tail appended',async()=>{
      await reset();await db.query("INSERT INTO t_books (id,name,summary,dynasty,author,jp,custom_value) VALUES (73,'伤寒论','用户简介','用户朝代','用户作者','OLD','keep')");
      const [before]=await db.query('SELECT * FROM t_books');const data=dataset();
      const one={...data,chapters:data.chapters.slice(0,1)};await importDatasets(db,database,[one],{apply:true});
      const report=await importDatasets(db,database,[data],{apply:true});assert.equal(report.summary.inserted_books,0);assert.equal(report.summary.inserted_chapters,2);
      const [after]=await db.query('SELECT * FROM t_books');assert.deepEqual(after,before);
      const [relations]=await db.query('SELECT DISTINCT book_id FROM t_book_chapters');assert.deepEqual(relations,[{book_id:73}]);
    });
    await t.test('declared alias reuses record; duplicate aliases are a conflict',async()=>{
      await reset();await db.query("INSERT INTO t_books (id,name) VALUES (19,'八十一难经')");
      const data=dataset('难经',['八十一难经']);const one=await importDatasets(db,database,[data],{apply:true});assert.equal(one.books[0].book_id,19);assert.equal(one.summary.inserted_books,0);
      await db.query("INSERT INTO t_books (name) VALUES ('难经')");const two=await importDatasets(db,database,[data],{apply:true});assert.equal(two.summary.conflicts,1);assert.equal(await count('t_books'),2);
    });
    await t.test('same-name duplicates do not cause another book insertion',async()=>{
      await reset();await db.query("INSERT INTO t_books (name) VALUES ('伤寒论'),('伤寒论')");const r=await importDatasets(db,database,[dataset()],{apply:true});assert.equal(r.summary.conflicts,1);assert.equal(await count('t_book_chapters'),0);
    });
    await t.test('chapter name alias is supported; original shiyi is preserved',async()=>{
      await reset('name');const data=dataset();await importDatasets(db,database,[data],{apply:true});await db.query("UPDATE t_book_chapters SET shiyi='原有释义' WHERE item_order=1");const r=await importDatasets(db,database,[data],{apply:true});assert.equal(r.summary.errors,0);const [[row]]=await db.query('SELECT shiyi FROM t_book_chapters WHERE item_order=1');assert.equal(row.shiyi,'原有释义');
    });
    await t.test('content differences and middle gaps never overwrite or reorder',async()=>{
      await reset();const data=dataset();await importDatasets(db,database,[data],{apply:true});await db.query("UPDATE t_book_chapters SET content='用户原文' WHERE item_order=1");const [before]=await db.query('SELECT * FROM t_book_chapters');const r=await importDatasets(db,database,[data],{apply:true});assert.equal(r.summary.conflicts,1);const [after]=await db.query('SELECT * FROM t_book_chapters');assert.deepEqual(after,before);
      await reset();await importDatasets(db,database,[data],{apply:true});await db.query('DELETE FROM t_book_chapters WHERE item_order=2');const gap=await importDatasets(db,database,[data],{apply:true});assert.equal(gap.summary.conflicts,1);assert.equal(await count('t_book_chapters'),2);
    });
    await t.test('failure rolls back both new book and already-inserted chapters',async()=>{
      await reset();const r=await importDatasets(db,database,[dataset()],{apply:true,beforeChapterInsert:c=>{if(c.order===2)throw new Error('injected failure');}});assert.equal(r.summary.errors,1);assert.equal(r.summary.inserted_books,0);assert.equal(await count('t_books'),0);assert.equal(await count('t_book_chapters'),0);
    });
    await t.test('TEXT byte overflow and required unknown fields fail before writing',async()=>{
      await reset('title','TEXT');const data=dataset();data.chapters[0].content='字'.repeat(23000);data.chapters[0].content_sha256=sha256(data.chapters[0].content);const r=await importDatasets(db,database,[data],{apply:true});assert.equal(r.summary.errors,1);assert.equal(await count('t_books'),0);
      await reset('title','MEDIUMTEXT','required_unknown INT NOT NULL,');await assert.rejects(()=>importDatasets(db,database,[dataset()],{apply:true}),/Unmapped required/);assert.equal(await count('t_books'),0);
    });
    await t.test('legacy abbreviation and manual primary keys preserve rows and remain idempotent',async()=>{
      await reset('name');
      await db.query('ALTER TABLE t_books MODIFY id INT UNSIGNED NOT NULL DEFAULT 0, CHANGE jp abbreviation VARCHAR(50)');
      await db.query('ALTER TABLE t_book_chapters MODIFY id INT UNSIGNED NOT NULL DEFAULT 0');
      await db.query("INSERT INTO t_books(id,name,abbreviation,custom_value) VALUES(317,'已有书','old','keep')");
      await db.query("INSERT INTO t_book_chapters(id,book_id,name,volume,content,item_order) VALUES(5000,317,'已有章','旧卷','原文',1)");
      const [oldBooks]=await db.query('SELECT * FROM t_books');
      const [oldChapters]=await db.query('SELECT * FROM t_book_chapters');
      const dry=await importDatasets(db,database,[dataset()]);assert.equal(dry.summary.planned_new_books,1);assert.equal(await count('t_books'),1);
      const first=await importDatasets(db,database,[dataset()],{apply:true});
      assert.equal(first.summary.errors,0);assert.equal(first.books[0].book_id,318);assert.equal(first.summary.inserted_chapters,3);
      const [added]=await db.query('SELECT id,book_id FROM t_book_chapters WHERE book_id=318 ORDER BY id');
      assert.deepEqual(added,[5001,5002,5003].map(id=>({id,book_id:318})));
      const [[book]]=await db.query('SELECT abbreviation FROM t_books WHERE id=318');assert.equal(book.abbreviation,'SHL');
      assert.deepEqual((await db.query('SELECT * FROM t_books WHERE id=317'))[0],oldBooks);
      assert.deepEqual((await db.query('SELECT * FROM t_book_chapters WHERE id=5000'))[0],oldChapters);
      const repeat=await importDatasets(db,database,[dataset()],{apply:true});assert.equal(repeat.summary.errors,0);assert.equal(repeat.summary.inserted_books,0);assert.equal(repeat.summary.inserted_chapters,0);
      const failed=await importDatasets(db,database,[dataset('另一新书')],{apply:true,beforeChapterInsert:c=>{if(c.order===2)throw new Error('injected failure');}});
      assert.equal(failed.summary.errors,1);assert.equal(await count('t_books'),2);assert.equal(await count('t_book_chapters'),4);
      await db.query('ALTER TABLE t_book_chapters DROP PRIMARY KEY');
      await assert.rejects(()=>importDatasets(db,database,[dataset()]),/single-column unique index/);
    });
  }finally{
    if(!/^qingnang_books_test_[a-f0-9]{16}$/.test(database))throw new Error('Refusing to drop non-test database');
    await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end();
  }
});
