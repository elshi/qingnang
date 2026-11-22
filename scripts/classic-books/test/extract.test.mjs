import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSource} from '../extract.mjs';
const part={url:'https://example.org/book/index.html',sha256:'test'};
test('retains parent prose, nested notes, repeated titles and section order',()=>{
  const html='<main><header><h1>metadata</h1></header><h1 data-sec="h1">卷一</h1><div data-sec="p">總論一兩。</div><h2 data-sec="h2">方</h2><div data-sec="p">黃耆三錢。<small class="雙行夾注">古人注</small><span data-rev="校">現代校語</span><span data-rev="古版" data-jc-innerhtml="芪"></span></div><span data-rev="注"><div data-sec="p">方後古注。</div></span><h1 data-sec="h1">卷二</h1><h2 data-sec="h2">方</h2><div data-sec="p">甘草一分。</div></main>';
  const r=parseSource(html,part);
  assert.equal(r.chapters.length,3);
  assert.equal(r.chapters[0].content,'总论一两。');
  assert.equal(r.chapters[1].volume,'卷一');
  assert.equal(r.chapters[2].volume,'卷二');
  assert.match(r.chapters[1].content,/黄耆三钱。.*古注.*古人注/);
  assert.match(r.chapters[1].content,/古注：方后古注/);
  assert.doesNotMatch(r.chapters[1].content,/現代|现代|芪/);
  assert.equal(r.excludedNotes.length,1);
  assert.equal(r.stats.represented_paragraph_blocks,4);
  assert.equal(new Set(r.chapters.map(c=>c.chapter_key)).size,3);
});
test('typographic small text is not mislabelled as commentary',()=>{
  const r=parseSource('<main><div data-sec="p">愧恨，<small>瑭</small>何人斯。</div></main>',part);
  assert.equal(r.chapters[0].content,'愧恨，瑭何人斯。');
});
test('Nanjing Benyi marks original clauses and following ancient commentary',()=>{
  const r=parseSource('<main><h1 data-sec="h1">上卷</h1><div data-sec="p">一難曰：經文。</div><div data-sec="p">注釋。</div><div data-sec="p">二難曰：經文二。</div><div data-sec="p">注二。</div></main>',part,{clauseAnnotations:true});
  assert.equal(r.chapters.length,2);
  assert.equal(r.chapters[0].content,'【经文】一难曰：经文。\n【滑寿注】注释。');
});
test('selects a named section and includes its descendants, not adjacent sections',()=>{
  const r=parseSource('<main><h1 data-sec="h1">卷四</h1><h2 data-sec="h2">前篇</h2><div data-sec="p">前文</div><h2 data-sec="h2">目標篇</h2><div data-sec="p">本文</div><h3 data-sec="h3">附注</h3><div data-sec="p">古注</div><h2 data-sec="h2">後篇</h2><div data-sec="p">後文</div></main>',part,{sourceSection:'目標篇'});
  assert.deepEqual(r.chapters.map(c=>c.content),['本文','古注']);
  assert.throws(()=>parseSource('<main/>',part,{sourceSection:'missing'}),/Section missing/);
});
test('records omitted images and converts rare glyphs and numbers without loss',()=>{
  const r=parseSource('<main><h2 data-sec="h2">藥</h2><div data-sec="p">𠮷字，藥一萬兩。鞦韆。</div><figure><img src="a.jpg" alt="穴位圖"></figure></main>',part);
  assert.equal(r.images[0].source,'https://example.org/book/a.jpg');
  assert.match(r.chapters[0].content,/𠮷字，药一万两。秋千。/);
  assert.match(r.chapters[0].content,/图版未收录/);
  assert.equal(r.chapters[0].conversion.numerals_preserved,true);
});
