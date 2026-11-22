import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {catalog} from './catalog.mjs';
import {DATA,readJson,writeJson,sha256} from './common.mjs';
import {parseSource} from './extract.mjs';

const captured=await readJson(path.join(DATA,'capture-report.json'));
if(captured.books.length!==50||captured.books.some(b=>b.error))throw new Error('Capture must contain all 50 source records');
const sources=[],books=[],quality=[];
for(const book of catalog){
  const capture=captured.books.find(x=>x.key===book.key),chapters=[],partReports=[],originalEvents=[];
  if(capture.parts[0].title!==book.sourceTitle)throw new Error(`Run capture.mjs after changing source: ${book.name}`);
  for(const part of capture.parts){
    const html=gunzipSync(await fs.readFile(path.join(DATA,part.file))).toString('utf8');
    if(sha256(html)!==part.sha256)throw new Error(`Source checksum mismatch: ${book.name}`);
    const parsed=parseSource(html,part,{sourceSection:book.sourceSection,clauseAnnotations:book.key==='nanjing',prefix:book.key==='yizongjinjian'&&part!==capture.parts[0]?part.title.replace('醫宗金鑑·',''):''});
    chapters.push(...parsed.chapters);originalEvents.push({source_url:part.url,sha256:part.sha256,events:parsed.originals});
    const {chapters:unused,originals:events,...audit}=parsed;
    partReports.push({source_url:part.url,...audit});
  }
  chapters.forEach((c,i)=>c.order=i+1);
  const record={key:book.key,name:book.name,summary:book.summary,dynasty:book.dynasty,author:book.author,jp:book.jp,aliases:book.aliases};
  const data={schema_version:1,book:record,chapters};
  await writeJson(path.join(DATA,'chapters',`${book.key}.json`),data);
  await fs.mkdir(path.join(DATA,'original'),{recursive:true});
  await fs.writeFile(path.join(DATA,'original',`${book.key}.json.gz`),gzipSync(JSON.stringify(originalEvents),{level:9}));
  await writeJson(path.join(DATA,'audit',`${book.key}.json`),partReports);
  const issues=[];
  if(!chapters.length)issues.push('no_text');
  if(partReports.some(p=>p.unknown.length))issues.push('unhandled_source_text');
  if(partReports.some(p=>p.stats.represented_paragraph_blocks!==p.stats.nonempty_paragraph_blocks))issues.push('paragraph_loss');
  if(chapters.some(c=>!c.conversion.numerals_preserved||!c.conversion.paragraphs_preserved))issues.push('conversion_invariant');
  const warnings=[];
  if(partReports.some(p=>p.images.length))warnings.push('figures_not_included');
  if(partReports.some(p=>p.gaps.length))warnings.push('source_has_gap_markers');
  if(partReports.some(p=>p.excludedNotes.length))warnings.push('modern_editorial_notes_excluded');
  const editionMissing=capture.parts.filter(p=>!p.metadata['底本']);
  if(editionMissing.length)warnings.push('physical_edition_not_identified');
  const bytes=chapters.map(c=>Buffer.byteLength(c.content));
  const item={key:book.key,name:book.name,chapter_count:chapters.length,characters:chapters.reduce((n,c)=>n+[...c.content].length,0),max_content_bytes:Math.max(0,...bytes),chapters_exceeding_mysql_text:bytes.filter(n=>n>65535).length,issues,warnings,source_declared_quality:capture.parts.map(p=>({url:p.url,quality:p.metadata['品質']||null})),manual_review:'pending',structural_status:issues.length?'failed':'passed'};
  books.push({...record,category:book.category,chapter_file:`chapters/${book.key}.json`,chapter_count:chapters.length,dataset_sha256:sha256(JSON.stringify(data)),original_file:`original/${book.key}.json.gz`});
  sources.push({key:book.key,name:book.name,selection:book.sourceSection?{section:book.sourceSection}:null,edition_policy:'选用固定快照的中医笈成电子整理本；源站所列参校底本不视为同一刻本。',license:{original:'public-domain ancient work (economic rights expired)',digital_edits:'CC0-1.0 per source declaration; individual exceptions require review',url:captured.license.url,sha256:captured.license.sha256},parts:capture.parts});
  quality.push(item);console.log(`${books.length}/50 ${book.name}: ${chapters.length} chapters; issues=${issues.join(',')||'none'}`);
}
await writeJson(path.join(DATA,'books.json'),{schema_version:1,books});
await writeJson(path.join(DATA,'sources.json'),{schema_version:1,license_snapshot:captured.license,sources});
await writeJson(path.join(DATA,'quality-report.json'),{generated_at:new Date().toISOString(),scope:'Text collection and structural validation; not a claim of line-by-line collation against printed originals.',books:quality,total_books:books.length,total_chapters:quality.reduce((s,b)=>s+b.chapter_count,0),total_characters:quality.reduce((s,b)=>s+b.characters,0)});
if(quality.some(b=>b.issues.length))process.exitCode=1;
