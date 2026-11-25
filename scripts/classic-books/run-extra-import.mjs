import path from 'node:path';
import mysql from 'mysql2/promise';
import {DATA,BATCH,inside,readJson,sha256,writeJson} from './common.mjs';
import {assertDataset,importDatasets,inspectSchema} from './import-core.mjs';
import {connectionOptions} from './connection.mjs';

if(BATCH!=='extra-300')throw new Error('Set CLASSIC_BOOKS_BATCH=extra-300');
const args=process.argv.slice(2);
if(args.length>1||args.some(arg=>arg!=='--apply'))throw new Error('Usage: node run-extra-import.mjs [--apply]');
const apply=args.includes('--apply');
const reportDir=path.join(DATA,'reports');
const database='qingnang';
const manifest=await readJson(path.join(DATA,'books.json'));
const reviews=await readJson(path.join(DATA,'review.json'));
const validation=await readJson(path.join(DATA,'validation-report.json'));
if(manifest.books.length!==300||!validation.passed||validation.total_books!==300)throw new Error('Expected 300 validated works');

const datasets=[];
const names=new Map();
for(const book of manifest.books){
  const data=await readJson(inside(DATA,book.chapter_file));
  const review=reviews.books.find(item=>item.key===book.key);
  const checked=validation.books.find(item=>item.key===book.key);
  if(sha256(JSON.stringify(data))!==book.dataset_sha256||review?.status!=='reviewed_with_caveats'||review.dataset_sha256!==book.dataset_sha256||checked?.dataset_sha256!==book.dataset_sha256||checked.errors.length)throw new Error(`Data or review mismatch: ${book.name}`);
  assertDataset(data);
  for(const name of [data.book.name,...data.book.aliases]){
    if(names.has(name)&&names.get(name)!==book.key)throw new Error(`Ambiguous catalogue name: ${name}`);
    names.set(name,book.key);
  }
  datasets.push(data);
}

const env=process.env;
let options;
if(env.BOOKS_DB_PRESENTED_CERTIFICATE_ONLY==='1'){
  // One explicitly enabled TLS connection using the server's presented certificate.
  if(!env.BOOKS_DB_HOST||!env.BOOKS_DB_USER||env.BOOKS_DB_PASSWORD===undefined)throw new Error('Explicit connection settings required');
  options=await connectionOptions({...env,BOOKS_DB_HOST:'127.0.0.1',BOOKS_DB_SSL_CA:'',BOOKS_DB_DATABASE:database});
  options.host=env.BOOKS_DB_HOST;
  options.ssl={rejectUnauthorized:false,minVersion:'TLSv1.2'};
}else options=await connectionOptions({...env,BOOKS_DB_DATABASE:database});
const db=await mysql.createConnection(options);

const fingerprint=rows=>new Map(rows.map(row=>[Number(row.id),row.row_sha256]));
async function fingerprints(tableName,columns){
  if(columns.some(column=>!/^[a-zA-Z0-9_]+$/.test(column)))throw new Error('Unexpected schema column');
  const list=columns.map(column=>'`'+column+'`').join(',');
  const [rows]=await db.query(`SELECT id,SHA2(CAST(JSON_ARRAY(${list}) AS CHAR CHARACTER SET utf8mb4),256) AS row_sha256 FROM ${tableName} ORDER BY id`);
  return rows;
}
const planned=report=>report.books.filter(book=>book.planned_chapters||book.action==='insert');
const planSignature=report=>sha256(JSON.stringify(planned(report).map(({key,action,book_id,planned_chapters})=>[key,action,book_id,planned_chapters])));
try{
  const [tls]=await db.query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
  if(options.ssl&&!tls.some(row=>row.Variable_name==='Ssl_cipher'&&row.Value))throw new Error('TLS did not establish');
  const transport={tls,certificate_chain_verified:options.ssl?.rejectUnauthorized===true};
  const schema=await inspectSchema(db,database);
  const preflight=await importDatasets(db,database,datasets);
  if(!apply){
    await writeJson(path.join(reportDir,'database-preflight.json'),{...preflight,transport,signature:planSignature(preflight)});
    console.log(JSON.stringify({summary:preflight.summary,errors:preflight.books.filter(b=>b.error),new_books:planned(preflight).map(({key,name,action,planned_chapters})=>({key,name,action,planned_chapters}))}));
  }else{
    const approvedPlan=await readJson(path.join(reportDir,'database-preflight.json'));
    if(preflight.summary.errors||approvedPlan.signature!==planSignature(preflight))throw new Error('Preflight changed or has errors; run and review preflight again');
    const beforeBooks=await fingerprints('t_books',[...schema.books.keys()]);
    const beforeChapters=await fingerprints('t_book_chapters',[...schema.chapters.keys()]);
    await writeJson(path.join(reportDir,'database-before.json'),{generated_at:new Date().toISOString(),books:beforeBooks,chapters:beforeChapters});
    const targets=new Set(planned(preflight).map(book=>book.key));
    const selected=datasets.filter(data=>targets.has(data.book.key));
    console.log(JSON.stringify({phase:'apply',books:selected.length,chapters:preflight.summary.planned_chapters}));
    let attempted=0;
    const report=await importDatasets(db,database,selected,{apply:true,chapterBatchSize:80,beforeChapterInsert:()=>{
      if(++attempted%2000===0)console.log(JSON.stringify({phase:'inserting',attempted_chapters:attempted}));
    }});
    await writeJson(path.join(reportDir,'database-import.json'),{...report,transport,preflight:preflight.summary,skipped:preflight.books.filter(book=>!targets.has(book.key))});
    console.log(JSON.stringify({phase:'committed',summary:report.summary,errors:report.books.filter(book=>book.error||book.conflicts?.length).map(({key,name,error,conflicts})=>({key,name,error,conflicts:conflicts?.slice(0,3)}))}));

    const repeat=await importDatasets(db,database,datasets);
    await writeJson(path.join(reportDir,'database-postflight.json'),repeat);
    const afterBooks=await fingerprints('t_books',[...schema.books.keys()]);
    const afterChapters=await fingerprints('t_book_chapters',[...schema.chapters.keys()]);
    const bookHashes=fingerprint(afterBooks),chapterHashes=fingerprint(afterChapters);
    const changedBooks=beforeBooks.filter(row=>bookHashes.get(Number(row.id))!==row.row_sha256).map(row=>row.id);
    const changedChapters=beforeChapters.filter(row=>chapterHashes.get(Number(row.id))!==row.row_sha256).map(row=>row.id);
    const insertedBooks=report.books.filter(book=>book.inserted_books).map(({key,name,book_id,inserted_chapters})=>({key,name,id:book_id,chapters:inserted_chapters}));
    const verification={generated_at:new Date().toISOString(),database,transport,passed:report.summary.errors===0&&report.summary.conflicts===0&&report.summary.inserted_books===preflight.summary.planned_new_books&&report.summary.inserted_chapters===preflight.summary.planned_chapters&&repeat.summary.planned_new_books===0&&repeat.summary.planned_chapters===0&&repeat.summary.errors===0&&changedBooks.length===0&&changedChapters.length===0&&afterBooks.length-beforeBooks.length===report.summary.inserted_books&&afterChapters.length-beforeChapters.length===report.summary.inserted_chapters,processed_books:datasets.length,inserted_books:report.summary.inserted_books,inserted_chapters:report.summary.inserted_chapters,skipped_existing_books:preflight.summary.existing_books,skipped_conflicts:preflight.summary.conflicts,original_books:beforeBooks.length,original_chapters:beforeChapters.length,final_books:afterBooks.length,final_chapters:afterChapters.length,changed_existing_books:changedBooks,changed_existing_chapters:changedChapters,repeat_preflight:repeat.summary,inserted:insertedBooks};
    await writeJson(path.join(reportDir,'database-verification.json'),verification);
    console.log(JSON.stringify({phase:'verified',...verification,inserted:undefined}));
    if(!verification.passed)process.exitCode=1;
  }
}finally{await db.end();}
