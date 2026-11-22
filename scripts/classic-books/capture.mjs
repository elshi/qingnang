import path from 'node:path';
import {load} from 'cheerio';
import {catalog,yizongParts} from './catalog.mjs';
import {DATA,snapshot,writeJson} from './common.mjs';

const refresh=process.argv.includes('--refresh');
const indexUrl='https://jicheng.tw/tcm/book/index.html';
const index=await snapshot(indexUrl,refresh);
const license=await snapshot('https://jicheng.tw/tcm/copyright.html',refresh);
const $=load(index.html);
const links=$('main a[href]').toArray().map(e=>({title:$(e).text().trim(),url:new URL($(e).attr('href'),indexUrl).href}));
const report={generated_at:new Date().toISOString(),index:index.metadata,license:license.metadata,books:[]};
for(const book of catalog){
  try {
    const found=links.find(x=>x.title===book.sourceTitle);
    if(!found) throw new Error(`Source title absent: ${book.sourceTitle}`);
    const parts=[found];
    if(book.key==='yizongjinjian') {
      for(const name of yizongParts){
        const part=links.find(x=>x.title===`醫宗金鑑·${name}`);
        if(!part)throw new Error(`Missing Yizong part ${name}`);
        parts.push(part);
      }
      if(parts.length!==16) throw new Error(`Expected parent and 15 Yizong parts, got ${parts.length}`);
    }
    const captured=[];
    for(const part of parts){
      const result=await snapshot(part.url,refresh), doc=load(result.html), main=doc('main');
      const metadata={};
      main.children('header').find('dt').each((_,e)=>{metadata[doc(e).text().trim()]=doc(e).next('dd').text().trim();});
      const headers=main.find('[data-sec]').filter((_,e)=>/^h\d$/.test(doc(e).attr('data-sec'))).map((_,e)=>doc(e).text().trim()).get();
      captured.push({...part,...result.metadata,metadata,heading_count:headers.length,first_headings:headers.slice(0,4),last_headings:headers.slice(-4),edition_links:main.children('header').find('a[href]').map((_,e)=>({label:doc(e).text(),url:new URL(doc(e).attr('href'),part.url).href})).get(),revision_url:doc('footer a').filter((_,e)=>doc(e).text().includes('編輯記錄')).attr('href')||null});
    }
    report.books.push({key:book.key,name:book.name,parts:captured});
    console.log(`${report.books.length}/50 ${book.name}: ${captured.map(x=>x.heading_count).reduce((a,b)=>a+b,0)} headings`);
  } catch(e) {report.books.push({key:book.key,name:book.name,error:e.message});console.log(`ERROR ${book.name}: ${e.message}`);}
  await writeJson(path.join(DATA,'capture-report.json'),report);
}
if(report.books.some(b=>b.error))process.exitCode=1;
