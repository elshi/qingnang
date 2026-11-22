import path from 'node:path';
import mysql from 'mysql2/promise';
import {DATA,readJson,writeJson,sha256,inside} from './common.mjs';
import {importDatasets,assertDataset} from './import-core.mjs';
import {connectionOptions} from './connection.mjs';

const args=process.argv.slice(2);
let db;
try{
  const apply=args.includes('--apply');
  const keyIndex=args.indexOf('--book'),selected=keyIndex>=0?args[keyIndex+1]:null;
  const allowed=new Set(['--apply','--book',selected].filter(Boolean));
  if(args.some(a=>!allowed.has(a))||(keyIndex>=0&&!selected))throw new Error('Usage: node import.mjs [--book KEY] [--apply]');
  const manifest=await readJson(path.join(DATA,'books.json'));
  const reviews=await readJson(path.join(DATA,'review.json'));
  const quality=await readJson(path.join(DATA,'quality-report.json'));
  const books=manifest.books.filter(b=>!selected||b.key===selected);
  if(!books.length)throw new Error('No matching book');
  const datasets=[];
  for(const b of books){
    const data=await readJson(inside(DATA,b.chapter_file));
    if(sha256(JSON.stringify(data))!==b.dataset_sha256)throw new Error(`Dataset checksum mismatch: ${b.key}`);
    assertDataset(data);
    const review=reviews.books.find(r=>r.key===b.key);
    if(!review||review.dataset_sha256!==b.dataset_sha256||review.status!=='reviewed_with_caveats')throw new Error(`Source review absent or stale: ${b.key}`);
    if(quality.books.find(q=>q.key===b.key)?.structural_status!=='passed')throw new Error(`Structural checks failed: ${b.key}`);
    datasets.push(data);
  }
  const options=await connectionOptions(),database=options.database;
  db=await mysql.createConnection(options);
  const report=await importDatasets(db,database,datasets,{apply});
  const target=path.join(DATA,'reports',`${apply?'import':'preflight'}-${Date.now()}.json`);
  await writeJson(target,report);
  console.log(JSON.stringify({report:target,...report.summary},null,2));
  if(report.summary.errors||report.summary.conflicts)process.exitCode=1;
}catch(e){console.error(e.code||e.message);process.exitCode=1;}
finally{if(db)await db.end();}
