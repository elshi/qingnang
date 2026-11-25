import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {load} from 'cheerio';
import {DATA,BATCH,inside,readJson,writeJson} from './common.mjs';

if(BATCH!=='extra-300')throw new Error('Wrong batch');
const manifest=await readJson(path.join(DATA,'books.json'));
const screening=await readJson(path.join(DATA,'candidate-screening.json'));
const selection=await readJson(path.join(DATA,'selection-report.json'));
const sources=await readJson(path.join(DATA,'sources.json'));
const checks=await readJson(path.join(DATA,'validation-report.json'));
const quality=await readJson(path.join(DATA,'quality-report.json'));
const progress=await readJson(path.join(DATA,'assistant-review-progress.json'));
if(!checks.passed||checks.total_books!==300)throw new Error('Complete validation before recording review');

const books=[];
for(const book of manifest.books){
  const id=Number(book.key.split('_')[1]);
  const source=screening.candidates.find(c=>c.id===id);
  const sourceRecord=sources.sources.find(s=>s.key===book.key);
  const checked=checks.books.find(b=>b.key===book.key);
  const assessed=quality.books.find(b=>b.key===book.key);
  if(!progress.reviewed_ids.includes(id)||!source||source.reasons.length||checked?.dataset_sha256!==book.dataset_sha256||assessed?.structural_status!=='passed')throw new Error(`Review missing or stale: ${book.name}`);
  for(const part of sourceRecord.parts){
    const $=load(gunzipSync(await fs.readFile(inside(DATA,part.file))).toString('utf8'));
    $('footer a').filter((_,e)=>/^(?:著作權聲明|隱私政策)$/.test($(e).text().trim())&&/(?:privacy|copyright)\.html$/.test($(e).attr('href')||'')).remove();
    const text=$('footer').text().replace(/©\s*2009\s*[–-]\s*20\d\d\s*中醫笈成/gu,'');
    if(/著作權|版权|版權|授權|CC[ -]BY|保留.*權利/iu.test(text))throw new Error(`Review page-specific rights notice: ${book.name}`);
  }
  books.push({key:book.key,name:book.name,dataset_sha256:book.dataset_sha256,status:'reviewed_with_caveats',source_snapshots:sourceRecord.parts.map(({url,sha256})=>({url,sha256})),assistant_excerpt_checks:source.samples.map(s=>s.chapter_key),automatic_sample_count:checked.sampled_units,source_warnings:assessed.warnings,notes:[progress.notes[id],source.metadata['品質']?`源站品质标示：${source.metadata['品質']}。`:null].filter(Boolean)});
  assessed.manual_review='assistant_excerpt_check; see review.json';
}
await writeJson(path.join(DATA,'review.json'),{reviewed_at:new Date().toISOString(),reviewer:'Codex assistant',method:'逐书核对电子来源所列作者、朝代、底本和首、中、末节选。全量校验章节顺序、段落映射、简繁转换和原文校验值。保留古籍流传中的缺文和辑佚说明。未逐页校勘影印底本。',rights_basis:'公有领域古籍正文与古注。来源声明对公有领域文本的电子整理成果采用 CC0。站点编写的资料按 CC BY 4.0 保留来源。',license_url:sources.license_snapshot.url,books});
await writeJson(path.join(DATA,'quality-report.json'),quality);
selection.deferred.forEach(record=>{if(progress.notes[record.id])record.review_note=progress.notes[record.id];});
await writeJson(path.join(DATA,'selection-report.json'),selection);
console.log(JSON.stringify({reviewed_books:books.length,chapter_count:checks.total_chapters,automatic_samples:checks.total_sampled_units,characters:quality.total_characters}));
