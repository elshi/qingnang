import fs from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';
import {groups} from './extra-candidates.mjs';
import {catalog as core} from './catalog.mjs';
import {DATA,BATCH,snapshot,writeJson} from './common.mjs';
if(BATCH!=='extra-300')throw new Error('Set CLASSIC_BOOKS_BATCH=extra-300');
const index=await snapshot('https://jicheng.tw/tcm/book/index.html');
const license=await snapshot('https://jicheng.tw/tcm/copyright.html');
const links=JSON.parse(await fs.readFile(new URL('./source-index.json',import.meta.url),'utf8'));
const queue=Object.entries(groups).flatMap(([category,ids])=>ids.map(id=>({id,category,...links[id]})));
if(new Set(queue.map(x=>x.url)).size!==queue.length)throw new Error('Duplicate candidate URL');
if(queue.some(x=>core.some(b=>b.sourceTitle===x.title)))throw new Error('Candidate overlaps core corpus');
const results=[];let next=0;
async function worker(){while(next<queue.length){const item=queue[next++];try{
  const result=await snapshot(item.url),$=load(result.html),main=$('main');
  const metadata={};main.children('header').find('dt').each((_,e)=>metadata[$(e).text().trim()]=$(e).next('dd').text().trim());
  const headings=main.find('[data-sec]').filter((_,e)=>/^h\d$/.test($(e).attr('data-sec'))).map((_,e)=>$(e).text().trim()).get();
  const paragraphs=main.find('[data-sec="p"]');
  results.push({...item,...result.metadata,metadata,heading_count:headings.length,paragraph_count:paragraphs.length,first_headings:headings.slice(0,4),last_headings:headings.slice(-4),edition_links:main.children('header').find('a[href]').map((_,e)=>({label:$(e).text(),url:new URL($(e).attr('href'),item.url).href})).get(),revision_url:$('footer a').filter((_,e)=>$(e).text().includes('編輯記錄')).attr('href')||null,header_text:main.children('header').text().trim(),sample_start:paragraphs.first().text().slice(0,120),sample_end:paragraphs.last().text().slice(-120)});
}catch(e){results.push({...item,error:e.message});}
if(results.length%20===0||results.length===queue.length){await writeJson(path.join(DATA,'candidate-capture.json'),{generated_at:new Date().toISOString(),index:index.metadata,license:license.metadata,candidates:results.slice().sort((a,b)=>a.id-b.id)});console.log(`${results.length}/${queue.length} captured`);}}}
await Promise.all(Array.from({length:4},worker));
