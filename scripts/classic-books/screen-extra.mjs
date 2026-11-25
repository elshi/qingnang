import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {DATA,BATCH,readJson,writeJson} from './common.mjs';
import {parseSource,simplify} from './extract.mjs';
if(BATCH!=='extra-300')throw new Error('Wrong batch');
const captured=await readJson(path.join(DATA,'candidate-capture.json'));
const results=[];
for(const c of captured.candidates){
  const reasons=[],metadata=c.metadata||{};
  if(c.error)reasons.push('capture_error');
  if(!metadata['底本'])reasons.push('edition_missing');
  if(!metadata['作者']||!metadata['朝代'])reasons.push('authorship_or_era_missing');
  if(/日本|朝鮮|高麗/.test(metadata['作者']||''))reasons.push('outside_chinese_author_scope');
  if(!/漢|汉|魏|晉|晋|隋|唐|宋|金|元|明|清|五代|梁|南北朝/.test(metadata['朝代']||''))reasons.push('not_identified_as_ancient');
  const years=(metadata['年份']||'').match(/(?:公元)?(1[0-9]{3}|20[0-9]{2})年/g)?.map(s=>Number(s.match(/\d+/)[0]))||[];
  if(years.some(y=>y>=1912))reasons.push('publication_after_1911');
  if(/遺失|遗失|未完成|缺[章卷]|不全|待補|待补/.test(metadata['品質']||''))reasons.push('explicitly_incomplete');
  if(/译注|譯注|白话|白話|今译|今譯|译解|譯解|评注|評注|現代|现代|1981年馬繼興/.test(metadata['底本']||''))reasons.push('modern_annotation_in_edition');
  if(/版權|版权|授權|授权|CC[ -]BY|保留.*權利/.test(c.header_text||''))reasons.push('individual_rights_statement_needs_review');
  if(!c.paragraph_count)reasons.push('no_transcribed_paragraphs');
  let parsed;
  if(!c.error&&c.file){
    try{
      const html=gunzipSync(await fs.readFile(path.join(DATA,c.file))).toString('utf8');
      parsed=parseSource(html,c);
      if(!parsed.chapters.length)reasons.push('no_body');
      if(parsed.unknown.length||parsed.stats.represented_paragraph_blocks!==parsed.stats.nonempty_paragraph_blocks)reasons.push('unrepresented_source_text');
      if(parsed.chapters.some(x=>!x.conversion.numerals_preserved||!x.conversion.paragraphs_preserved))reasons.push('conversion_invariant');
      if(parsed.chapters.some(x=>/[\uFFFD\u0000]/u.test(x.content)))reasons.push('invalid_characters');
      if(parsed.chapters.some(x=>[...x.title].length>100||[...x.volume||''].length>100||Buffer.byteLength(x.content)>16777215))reasons.push('live_schema_length');
      const modernMatches=parsed.chapters.flatMap(x=>[...x.content.matchAll(/.{0,24}(?:民国|中华人民共和国|中医研究院|人民卫生出版社|一九[二三四五六七八九][〇零一二三四五六七八九]|(?:19[2-9]\d|20[012]\d)年|ISBN|现代药理|编者按|整理说明|出版说明|校点说明|点校说明|校注说明).{0,35}/g)].map(m=>({title:x.title,text:m[0]})));
      if(modernMatches.length)reasons.push('possible_modern_prose');
      const indexes=[...new Set([0,Math.floor(parsed.chapters.length/2),parsed.chapters.length-1])];
      results.push({id:c.id,title:c.title,name:simplify(c.title),category:c.category,metadata,reasons,modernMatches,chapters:parsed.chapters.length,characters:parsed.chapters.reduce((n,x)=>n+[...x.content].length,0),images:parsed.images.length,gap_units:parsed.gaps.length,excluded_notes:parsed.excludedNotes.length,first_titles:parsed.chapters.slice(0,14).map(x=>x.title),last_titles:parsed.chapters.slice(-5).map(x=>x.title),samples:indexes.filter(i=>i>=0).map(i=>({chapter_key:parsed.chapters[i].chapter_key,title:parsed.chapters[i].title,text:parsed.chapters[i].content.slice(0,160)}))});
    }catch(e){results.push({id:c.id,title:c.title,category:c.category,metadata,reasons:[...reasons,'parse_error'],error:e.message});}
  }else results.push({id:c.id,title:c.title,category:c.category,metadata,reasons});
}
await writeJson(path.join(DATA,'candidate-screening.json'),{generated_at:new Date().toISOString(),candidates:results});
const counts={};for(const r of results){counts[r.category]??={checked:0,eligible:0};counts[r.category].checked++;if(!r.reasons.length)counts[r.category].eligible++;}
console.log(JSON.stringify({checked:results.length,eligible:results.filter(r=>!r.reasons.length).length,categories:counts},null,2));
