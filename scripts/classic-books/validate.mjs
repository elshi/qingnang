import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {DATA,readJson,writeJson,sha256,inside} from './common.mjs';
import {assertDataset} from './import-core.mjs';
import {normalize,simplify} from './extract.mjs';
import {catalog} from './active-catalog.mjs';

const manifest=await readJson(path.join(DATA,'books.json'));
const sources=await readJson(path.join(DATA,'sources.json'));
const quality=await readJson(path.join(DATA,'quality-report.json'));
if(manifest.books.length!==catalog.length||new Set(manifest.books.map(b=>b.key)).size!==catalog.length||catalog.some(c=>!manifest.books.some(b=>b.key===c.key)))throw new Error('Manifest does not match the batch catalogue');
const results=[],rawChecked=new Set();
for(const b of manifest.books){
  const errors=[],dataset=await readJson(inside(DATA,b.chapter_file));
  try{assertDataset(dataset);}catch(e){errors.push(e.message);}
  if(sha256(JSON.stringify(dataset))!==b.dataset_sha256)errors.push('dataset_checksum');
  const original=JSON.parse(gunzipSync(await fs.readFile(inside(DATA,b.original_file))).toString('utf8'));
  const eventsByUrl=new Map(original.map(p=>[p.source_url,new Map(p.events.map(e=>[e.ordinal,e]))]));
  const src=sources.sources.find(s=>s.key===b.key);
  if(!src)throw new Error(`Missing source: ${b.key}`);
  for(const p of src.parts){
    if(rawChecked.has(p.file))continue;
    if(sha256(gunzipSync(await fs.readFile(inside(DATA,p.file))))!==p.sha256)errors.push('raw_checksum');
    rawChecked.add(p.file);
  }
  for(const c of dataset.chapters){
    const events=eventsByUrl.get(c.source_url);
    const originalText=normalize(c.paragraph_ordinals.map(o=>events.get(o)?.text??'').join('\n'));
    if(sha256(originalText)!==c.original_sha256||simplify(originalText)!==c.content)errors.push(`conversion_or_paragraph_mapping:${c.order}`);
    if(!c.conversion.numerals_preserved||!c.conversion.paragraphs_preserved)errors.push(`invariant:${c.order}`);
  }
  const audit=await readJson(path.join(DATA,'audit',`${b.key}.json`));
  for(const p of audit)if(p.unknown.length||p.stats.represented_paragraph_blocks!==p.stats.nonempty_paragraph_blocks)errors.push(`source_block_loss:${p.source_url}`);
  if(quality.books.find(q=>q.key===b.key).structural_status!=='passed')errors.push('structural_report_failed');
  const chapters=dataset.chapters;
  const sampled=new Map();
  for(const [reason,index] of [['first',0],['middle',Math.floor(chapters.length/2)],['last',chapters.length-1]]){
    const c=chapters[index];if(c)sampled.set(c.chapter_key,{c,reasons:[reason]});
  }
  const volumes=new Set();
  for(const c of chapters){
    const volume=c.source_path.find(s=>/卷[一二三四五六七八九十百上下中零〇0-9之]|^[上中下]卷/.test(s));
    const volumeKey=c.source_url+'|'+(volume||'whole');
    if(!volumes.has(volumeKey)){volumes.add(volumeKey);const entry=sampled.get(c.chapter_key)||{c,reasons:[]};entry.reasons.push(`volume:${volume||'whole'}`);sampled.set(c.chapter_key,entry);}
  }
  const samples=[...sampled.values()].map(({c,reasons})=>({chapter_key:c.chapter_key,order:c.order,title:c.title,volume:c.volume,source_url:c.source_url,source_ordinal:c.source_ordinal,reasons,excerpt:c.content.slice(0,120),numerals_preserved:c.conversion.numerals_preserved,conversion_reproduced:true}));
  results.push({key:b.key,name:b.name,dataset_sha256:b.dataset_sha256,chapter_count:chapters.length,errors,sampled_units:samples.length,volume_groups:volumes.size,samples});
}
const report={generated_at:new Date().toISOString(),method:'All raw checksums; all extracted paragraph mappings; full deterministic traditional-to-simplified conversion; automatic first/middle/last and per-volume samples. Printed facsimiles were not collated line-by-line.',passed:results.every(r=>!r.errors.length),total_books:results.length,total_chapters:results.reduce((s,b)=>s+b.chapter_count,0),raw_snapshots_checked:rawChecked.size,total_sampled_units:results.reduce((s,b)=>s+b.sampled_units,0),books:results};
await writeJson(path.join(DATA,'validation-report.json'),report);
console.log(JSON.stringify({passed:report.passed,books:report.total_books,chapters:report.total_chapters,samples:report.total_sampled_units,errors:results.filter(r=>r.errors.length).map(({key,errors})=>({key,errors}))},null,2));
if(!report.passed)process.exitCode=1;
