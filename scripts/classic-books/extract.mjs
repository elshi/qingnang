import {load} from 'cheerio';
import * as OpenCC from 'opencc-js';
import {sha256} from './common.mjs';

export const simplify=OpenCC.Converter({from:'t',to:'cn'});
export const normalize=text=>String(text).replace(/\r/g,'').replace(/[\t \u00a0\u3000]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const headingLevel=e=>/^h[1-6]$/.test(e.attribs?.['data-sec']||'')?Number(e.attribs['data-sec'][1]):null;
const excluded=e=>['校','訂'].includes(e.attribs?.['data-rev']);

// Render only textual content. Hidden alternate glyphs are not concatenated with
// the displayed version. Ancient notes remain explicitly labelled; modern
// editorial notes are logged separately, not copied into the import text.
export function parseSource(html,part,{sourceSection=null,prefix='',clauseAnnotations=false}={}){
  const $=load(html), main=$('main').first();
  if(!main.length)throw new Error('Source has no main element');
  const chapters=[],toc=[],images=[],excludedNotes=[],gaps=[],unknown=[],events=[];
  let sourceOrdinal=0, active=!sourceSection, sectionDepth=0, sectionFound=false;
  function textOf(node,noteContext=false){
    if(node.type==='text')return node.data;
    if(node.type==='comment')return '';
    const a=node.attribs||{},tag=node.tagName;
    if(['script','style','rt','rp'].includes(tag))return '';
    if(a['data-rev']==='古版')return '';
    if(excluded(node)){excludedNotes.push({ordinal:sourceOrdinal,kind:a['data-rev'],text:normalize($(node).text())});return '';}
    if(tag==='br')return '\n';
    if(tag==='img'){
      const label=a.alt||'未题名图',src=a.src?new URL(a.src,part.url).href:a['data-orig-src']||null;
      images.push({ordinal:sourceOrdinal,label,source:src});
      return `〔图版未收录：${label}〕`;
    }
    const isNote=/(?:^|\s)雙行夾注(?:\s|$)/u.test(a.class||'')||a['data-rev']==='注'||a['data-rev']==='疏';
    let text=(node.children||[]).map(n=>textOf(n,noteContext||isNote)).join('');
    if(!text&&a['data-jc-innerhtml'])text=$.load(a['data-jc-innerhtml']).root().text();
    if(isNote&&!noteContext&&normalize(text))return `【古注：${normalize(text)}】`;
    return text;
  }
  function walk(node,note=false){
    if(node.type==='text'){
      if(node.data.trim()&&active)unknown.push({ordinal:sourceOrdinal,text:node.data.trim().slice(0,150)});
      return;
    }
    if(node.type==='comment'||['header','script','style'].includes(node.tagName))return;
    const level=headingLevel(node),a=node.attribs||{};
    if(level){
      sourceOrdinal++;
      const title=normalize(textOf(node));
      if(sourceSection&&title===sourceSection){active=true;sectionDepth=level;sectionFound=true;}
      else if(sourceSection&&active&&level<=sectionDepth)active=false;
      if(active)events.push({type:'heading',level,title,ordinal:sourceOrdinal});
      return;
    }
    if(!active){for(const child of node.children||[])walk(child,note);return;}
    if(excluded(node)){textOf(node);return;}
    if(a['data-rev']==='古版')return;
    if(a['data-sec']==='p'||node.tagName==='figure'){
      sourceOrdinal++;
      let text=normalize(textOf(node,note));
      if(note&&text)text=`【古注：${text}】`;
      events.push({type:'paragraph',text,ordinal:sourceOrdinal});
      return;
    }
    const childNote=note||['注','疏'].includes(a['data-rev']);
    // Some source sections wrap p/h nodes in spans, jc-t or divs.
    if($(node).find('[data-sec],figure').length){for(const child of node.children||[])walk(child,childNote);return;}
    if(normalize($(node).text())){
      sourceOrdinal++;
      const text=normalize(textOf(node,note));
      if(text)events.push({type:'paragraph',text:childNote?`【古注：${text}】`:text,ordinal:sourceOrdinal});
    }
  }
  for(const e of main[0].children||[])walk(e);
  if(sourceSection&&!sectionFound)throw new Error(`Section missing: ${sourceSection}`);
  let stack=[],current=null,inAnnotatedClause=false;
  const fallbackTitle=events.some(e=>e.type==='heading')?'卷首':'全文';
  function flush(){
    if(!current)return;
    const original=normalize(current.paragraphs.join('\n'));
    if(!original)return;
    const content=simplify(original);
    const title=simplify(current.title),ancestors=current.path.slice(0,-1);
    const volume=simplify([prefix,...ancestors].filter(Boolean).join(' / '))||null;
    const ch={chapter_key:sha256(`${part.url}:${current.ordinal}`).slice(0,24),title,volume,content,shiyi:null,source_url:part.url,source_ordinal:current.ordinal,source_path:current.path,source_sha256:part.sha256,original_sha256:sha256(original),content_sha256:sha256(content),paragraph_count:content.split('\n').length,paragraph_ordinals:current.ordinals};
    chapters.push(ch);
    if(/[�□〓]|缺[字文葉页頁]|闕[文字]|原[缺阙闕]/u.test(original))gaps.push({chapter_key:ch.chapter_key,title,reason:'source_gap_or_uncertain_glyph',snippets:[...original.matchAll(/.{0,18}(?:[�□〓]|缺[字文葉页頁]|闕[文字]|原[缺阙闕]).{0,18}/gu)].slice(0,10).map(x=>x[0])});
    // 鞦韆 -> 秋千 introduces a non-numeric 千; do not mistake that word for
    // a changed dosage. Actual number sequences are still compared verbatim.
    const numerals=s=>s.replaceAll('鞦韆','秋千').match(/[0-9〇零一二三四五六七八九十百千萬万億亿兩两壹貳贰叁肆伍陸陆柒捌玖拾佰仟半廿卅]+/g)?.map(simplify).join('|')||'';
    ch.conversion={engine:'opencc-js@1.4.2',from:'t',to:'cn',numerals_preserved:numerals(original)===numerals(content),paragraphs_preserved:original.split('\n').length===content.split('\n').length,original_codepoints:[...original].length,simplified_codepoints:[...content].length};
    current=null;
  }
  for(const event of events){
    if(event.type==='heading'){
      inAnnotatedClause=false;
      flush();stack=stack.filter(x=>x.level<event.level);stack.push(event);
      toc.push({ordinal:event.ordinal,level:event.level,title:event.title,path:stack.map(x=>x.title)});
      current={title:event.title,path:stack.map(x=>x.title),ordinal:event.ordinal,paragraphs:[],ordinals:[]};
    }else if(event.text){
      // Numbered clauses in works without marked headings become native units.
      const clause=event.text.match(/^(?:〖([〇一二三四五六七八九十百]+)[、，.]?〗|([一二三四五六七八九十百]+)難曰)/u);
      if(clause){flush();const title=clause[2]?`${clause[2]}難`:`第${clause[1]}条`;current={title,path:[...stack.map(x=>x.title),title],ordinal:event.ordinal,paragraphs:[],ordinals:[]};inAnnotatedClause=Boolean(clause[2]&&clauseAnnotations);}
      if(inAnnotatedClause){event.role=clause?'classic_text':'ancient_commentary';event.text=`${clause?'【经文】':'【滑寿注】'}${event.text}`;}
      if(!current)current={title:prefix||fallbackTitle,path:stack.map(x=>x.title).length?stack.map(x=>x.title):[prefix||fallbackTitle],ordinal:event.ordinal,paragraphs:[],ordinals:[]};
      current.paragraphs.push(event.text);current.ordinals.push(event.ordinal);
    }
  }
  flush();
  return {chapters,toc,images,excludedNotes,gaps,unknown,stats:{heading_count:toc.length,paragraph_blocks:events.filter(e=>e.type==='paragraph').length,nonempty_paragraph_blocks:events.filter(e=>e.type==='paragraph'&&e.text).length,represented_paragraph_blocks:chapters.reduce((n,c)=>n+c.paragraph_ordinals.length,0)},originals:events};
}
