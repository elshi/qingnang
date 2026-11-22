const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const share = require('../../miniprogram/utils/content-share');

function harness(file, modules = {}, wxExtra = {}, stack = [{}]) {
  let definition;
  const navigation = [], timers = new Map(), storage = new Map();
  let timerId = 0;
  const defaults = {
    'content-share': share,
    'search': require('../../miniprogram/utils/search'),
    'books-api': {}, 'cases-api': {}, 'prescriptions-api': {}, 'meridians-api': {}, 'acupoints-api': {},
    'learning-store': {}, 'speech-input': {}, 'meridians': require('../../miniprogram/utils/meridians'), ...modules
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    Page: value => { definition = value; }, Component: value => { definition = value; },
    require: name => {
      const key = Object.keys(defaults).find(key => name.endsWith('/' + key));
      if (!key) throw Error(name);
      return defaults[key];
    },
    getApp: () => ({ getDisclaimer: () => '学习参考' }), getCurrentPages: () => stack,
    wx: {
      getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
      getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 20 }),
      getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32 }),
      navigateTo: args => navigation.push(['navigateTo', args.url]),
      switchTab: args => navigation.push(['switchTab', args.url]),
      navigateBack: () => navigation.push(['navigateBack']), showToast: () => {}, ...wxExtra
    },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  const page = { ...definition, ...definition.methods, data: structuredClone(definition.data),
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); } };
  return { page, definition, navigation, storage,
    flush: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const home = 'miniprogram/pages/home/home.js';
const reader = 'miniprogram/pages/books/reader/reader.js';

test('home shows only the first three API formulas and preserves zero IDs', async () => {
  const calls = [];
  const { page, navigation } = harness(home, { 'prescriptions-api': { getPrescriptions: async query => {
    calls.push(query); return { items: [0,1,2,3].map(id => ({ id, title: '经方' + id })) };
  } } });
  await page.loadFeaturedPrescriptions();
  assert.equal(calls[0].page_size, 3);
  assert.deepEqual(Array.from(page.data.featuredPrescriptions, item => item.id), [0,1,2]);
  page.openPrescription({ currentTarget: { dataset: { id: 0 } } });
  assert.equal(navigation[0][1], '/pages/prescriptions/detail/detail?id=0');
});

test('home formula retries ignore stale and unloaded responses', async () => {
  const first = deferred(); let calls = 0;
  const { page } = harness(home, { 'prescriptions-api': { getPrescriptions: () => ++calls === 1 ? first.promise : Promise.resolve({ items: [{ id: 2 }] }) } });
  const old = page.loadFeaturedPrescriptions();
  await page.loadFeaturedPrescriptions(); first.resolve({ items: [{ id: 1 }] }); await old;
  assert.equal(page.data.featuredPrescriptions[0].id, 2);
  const pending = deferred();
  const another = harness(home, { 'prescriptions-api': { getPrescriptions: () => pending.promise } }).page;
  const task = another.loadFeaturedPrescriptions(); another.onUnload(); pending.resolve({ items: [{ id: 3 }] }); await task;
  assert.equal(another.data.featuredPrescriptions.length, 0);
});

test('home history refreshes after sync, resumes reading, and clears on logout', async () => {
  let loggedIn = true, rows = [], opened;
  const store = { account: () => loggedIn ? { id:'user' } : null, scope: () => loggedIn ? 'user' : 'guest',
    records: () => rows, sourceLabel: () => '医书章节', open: (...args) => { opened=args; },
    synchronize: async () => { rows = [1,2,3,4].map(id => ({ key:'history:'+id, ref:{type:'chapter', id:7, chapterId:id}, scrollTop:320, contentMode:'original' })); } };
  const { page } = harness(home, { 'learning-store': store });
  await page.loadHistory(); assert.equal(page.data.recentHistory.length, 3);
  page.openHistoryItem({ currentTarget: { dataset: { key:'history:1' } } });
  assert.equal(opened[0].chapterId, 1); assert.equal(opened[1].scrollTop, 320);
  loggedIn = false; page.refreshHistory(); assert.equal(page.data.recentHistory.length, 0);
  assert.equal(page.data.loggedIn, false);
});

test('home retains cached history and reports a recoverable sync failure', async () => {
  const store = { account: () => ({ id:'a' }), scope: () => 'a', sourceLabel: () => '医案',
    records: () => [{ key:'a', title:'缓存医案' }], synchronize: async () => { throw Error('offline'); } };
  const { page } = harness(home, { 'learning-store':store });
  await page.loadHistory(); assert.equal(page.data.recentHistory[0].title, '缓存医案');
  assert.match(page.data.historyError, /缓存/); assert.equal(page.data.historyLoading, false);
});

test('all public details share public content with a fixed image and never personal state', () => {
  for (const [type, file] of [['case','cases'],['prescription','prescriptions'],['meridian','meridians'],['acupoint','acupoints']]) {
    const { page } = harness(`miniprogram/pages/${file}/detail/detail.js`);
    page.data.item = { id:0, title:'内容标题' }; page.data.activeTab = 'notes';
    const result = page.onShareAppMessage();
    assert.equal(result.path, `/pages/${file}/detail/detail?id=0`);
    assert.equal(result.title, '内容标题'); assert.ok(fs.existsSync(path.join(root,'miniprogram',result.imageUrl)));
    assert.equal(Object.keys(result).sort().join(','), 'imageUrl,path,title');
  }
  const { page } = harness(reader);
  page.data.book = { id:7, name:'伤寒论' }; page.data.chapter = { id:0, title:'第一章' }; page.data.contentMode = 'notes';
  assert.equal(page.onShareAppMessage().path, '/pages/books/reader/reader?id=7&chapterId=0');
  assert.equal(page.onShareAppMessage().title, '伤寒论 · 第一章');
  assert.equal(share.contentShare('case', null).path, '/pages/home/home');
});

test('reader notes never overwrite original scroll position or persist a notes reading mode', () => {
  const visits = [];
  const { page, storage, flush } = harness(reader, { 'learning-store': { reference: (type,item,extra) => ({type,id:item.id,...extra}), visit: (...args) => visits.push(args) } });
  page.bookId = '7'; page.data.book = {id:7,name:'伤寒论'}; page.data.chapter = {id:1,title:'第一章'};
  page.data.selectedChapterId = 1; page.data.currentChapterIndex = 0; page.currentScrollTop = 320;
  page.toggleContentMode(); assert.equal(page.data.contentMode, 'notes');
  page.onReaderScroll({detail:{scrollTop:0}}); assert.equal(page.currentScrollTop, 320);
  page.persistProgress(); assert.equal(visits.at(-1)[1].scrollTop, 320);
  assert.equal(storage.get('bookReaderProgress:7').contentMode, 'original');
  page.toggleContentMode(); flush(); assert.equal(page.data.contentMode, 'original');
  page.onReaderScroll({detail:{scrollTop:420}}); flush(); assert.equal(visits.at(-1)[1].scrollTop, 420);
});

test('reader migrates old local and linked shiyi positions to original top; keeps original positions', async () => {
  for (const mode of ['shiyi','original']) {
    const { page, storage } = harness(reader, {'books-api':{ getBookDetail: async () => ({id:7,name:'医书',chapters:[{id:1,title:'第一章'}]}) }});
    let selected;
    page.loadChapter = id => { selected=id; };
    storage.set('bookReaderProgress:7',{chapterId:1,contentMode:mode,scrollTop:320});
    page.bookId = 7; await page.loadBook();
    assert.equal(selected,1); assert.equal(page.restoreScrollTop,mode==='shiyi'?0:320); assert.equal(page.data.contentMode,'original');
    page.loadBook = () => {};
    page.onLoad({id:'7',chapterId:'1',resume:'1',scrollTop:'480',contentMode:mode});
    assert.equal(page.resumeScrollTop,mode==='shiyi'?0:480);
  }
});

test('chapter changes refresh original paragraphs and reset note scrolling', async () => {
  const { page, flush } = harness(reader, { 'books-api': {getBookChapter:async () => ({id:2,title:'第二章',content:'正文',shiyi:'旧释义'})} });
  page.persistProgress = () => {}; page.bookId=7; page.data.chapters=[{id:1},{id:2}];
  page.data.contentMode='notes'; page.data.chapter={id:1}; page.currentScrollTop=320;
  await page.loadChapter(2); flush();
  assert.equal(page.data.chapter.id,2); assert.equal(page.data.contentParagraphs[0].text,'正文');
  assert.equal(page.data.notesScrollTop,0); assert.equal(page.currentScrollTop,0); assert.equal(page.data.contentMode,'notes');
});

test('related notes refresh on return, switch chapters, and never retain another account notes', async () => {
  let owner='a', rows=[{key:'a',content:'私有内容',updatedAt:1}], requested;
  const store = { account:()=>owner==='guest'?null:{id:owner}, scope:()=>owner,
    reference:(type,item,extra)=>item?{type,id:item.id,...extra}:null,
    relatedNotes:ref=>{requested=ref;return rows;}, dateLabel:()=> '11月22日', synchronize:async()=>0 };
  const { page, definition } = harness('miniprogram/components/learning-actions/index.js', {'learning-store':store});
  Object.assign(page.data,{showNotes:true,type:'chapter',item:{id:7,name:'书'},chapter:{id:1,title:'第一章'}});
  await page.reloadNotes(); assert.equal(requested.chapterId,'1'); assert.equal(page.data.items[0].key,'a');
  page.data.chapter={id:2,title:'第二章'}; definition.observers['type,item,chapter'].call(page);
  assert.equal(requested.chapterId,'2');
  rows=[]; await page.reloadNotes(); assert.equal(page.data.items.length,0);
  owner='guest'; rows=[{key:'old'}]; await page.reloadNotes(); assert.equal(page.data.items.length,0);
});

test('related note synchronization cannot update detached components', async () => {
  const pending=deferred();
  const { page, definition }=harness('miniprogram/components/learning-actions/index.js',{'learning-store':{
    account:()=>({id:'a'}),scope:()=> 'a',reference:()=>null,relatedNotes:()=>[],synchronize:()=>pending.promise
  }});
  const task=page.reloadNotes(); definition.lifetimes.detached.call(page);
  page.setData=()=>{throw Error('detached update');}; pending.resolve(0); await task;
});

test('profile note entry and standalone editor save use tab navigation', async () => {
  const {page,navigation}=harness('miniprogram/pages/profile/index/index.js',{'learning-store':{requireLogin:async()=>({id:'a'})}});
  await page.openPage({currentTarget:{dataset:{page:'notes'}}});
  assert.deepEqual(navigation,[['switchTab','/pages/notes/index/index']]);
  const editor=harness('miniprogram/pages/notes/editor/editor.js',{'learning-store':{scope:()=> 'a',saveNote:async()=>({version:1})}});
  editor.page.owner='a'; editor.page.data.busy=false; editor.page.note=()=>({title:'笔记',content:'正文'});
  await editor.page.save(); assert.deepEqual(editor.navigation,[['switchTab','/pages/notes/index/index']]);
});

test('shared content cold starts can return to home', () => {
  const {page,navigation}=harness(reader); page.persistProgress=()=>{}; page.goBack();
  assert.deepEqual(navigation,[['switchTab','/pages/home/home']]);
  const nav=harness('miniprogram/components/custom-nav/custom-nav.js'); nav.page.goBack();
  assert.deepEqual(nav.navigation,[['switchTab','/pages/home/home']]);
});
