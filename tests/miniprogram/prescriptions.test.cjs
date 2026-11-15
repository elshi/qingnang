const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function harness(file, modules) {
  let definition;
  const timers = new Map(); let timerId = 0;
  const routes = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    Page: value => { definition = value; },
    require: name => { const key = Object.keys(modules).find(key => name.endsWith(key)); if (!key) throw Error(name); return modules[key]; },
    getApp: () => ({getDisclaimer: () => '学习说明'}),
    wx: { navigateTo: ({url}) => routes.push(url) },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  const page = { ...definition, data: structuredClone(definition.data), requestId: 0,
    setData(patch, cb) { Object.assign(this.data, patch); if (cb) cb(); },
    createSelectorQuery() { return { select(){return this;}, boundingClientRect(){return this;}, scrollOffset(){return this;}, exec(cb){cb([]);} }; }
  };
  return {page, routes, timers, flush: async () => {const pending=[...timers.values()];timers.clear();for(const fn of pending) await fn();}};
}
const listFile = 'miniprogram/pages/prescriptions/index/index.js';
const detailFile = 'miniprogram/pages/prescriptions/detail/detail.js';
const response = (items, more=false) => ({items,total:23,has_more:more});
const row = id => ({id,title:'处方'+id,source:'出处',tags:[],summary:'主治'});
const deferred = () => {let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('pagination uses real IDs, deduplicates overlap and retries the failed page', async () => {
  const calls=[]; let fail=true;
  const {page}=harness(listFile, {'prescriptions-api':{getPrescriptions:async q=>{
    calls.push(q.page); if(q.page===1)return response([row(0),row(1)],true);
    if(fail){fail=false;throw Error('断网');}return response([row(1),row(2)]);
  }}});
  await page.loadList(true); await page.loadMore(); assert.equal(page.data.page,2);assert.equal(page.data.items.length,2);
  assert.equal(page.data.error,'断网'); page.setData({error:''});await page.loadList(false);
  assert.deepEqual(calls,[1,2,2]); assert.deepEqual(Array.from(page.data.items,x=>x.id),[0,1,2]);assert.equal(page.data.hasMore,false);
  await page.loadMore();assert.equal(calls.length,3);
});

test('typing immediately invalidates in-flight data before debounce and keeps only final keyword', async () => {
  const old=deferred();const calls=[];
  const {page,flush}=harness(listFile, {'prescriptions-api':{getPrescriptions:q=>{calls.push(q.keyword);return q.keyword?Promise.resolve(response([row(2)])):old.promise;}}});
  const first=page.loadList(true);page.onKeywordInput({detail:{value:'桂枝'}});page.onKeywordInput({detail:{value:'度瘴'}});
  old.resolve(response([row(99)]));await first;assert.equal(page.data.items.length,0);
  await flush();await Promise.resolve();assert.deepEqual(calls,['','度瘴']);assert.equal(page.data.items[0].id,2);
});

test('unload drops pending results and clear resets a filtered empty list', async () => {
  const pending=deferred();const {page}=harness(listFile, {'prescriptions-api':{getPrescriptions:()=>pending.promise}});
  const request=page.loadList(true);page.onUnload();pending.resolve(response([row(9)]));await request;assert.equal(page.data.items.length,0);
  const empty=harness(listFile, {'prescriptions-api':{getPrescriptions:async()=>response([])}}).page;
  empty.data.keyword='missing';empty.data.isSearching=true;await empty.loadList(true);empty.clearSearch();await Promise.resolve();
  assert.equal(empty.data.keyword,'');assert.equal(empty.data.isSearching,false);assert.equal(empty.data.items.length,0);
});

test('list scrolling stays native and search resets through a one-shot anchor', () => {
  const markup=fs.readFileSync(path.join(root,'miniprogram/pages/prescriptions/index/index.wxml'),'utf8');
  assert.equal(markup.includes('scroll-top='),false);
  assert.equal(markup.includes('bindscroll="onListScroll"'),false);
  assert.equal(markup.includes('scroll-into-view="{{scrollIntoView}}"'),true);
  assert.equal(markup.includes('id="prescription-list-top"'),true);

  const {page}=harness(listFile, {'prescriptions-api':{getPrescriptions:async()=>response([])}});
  page.updateKeyword('桂枝',300);
  assert.equal(page.data.scrollIntoView,'prescription-list-top');
});

test('detail preserves original dose and newlines; hides only empty sections', async () => {
  const dose='防风（各3g） 乌头（炮）干姜 桂心（各3.8g）';
  const {page}=harness(detailFile, {'prescriptions-api':{getPrescriptionDetail:async()=>({id:1,title:'度瘴散',modern_dose:dose,decoction:'第一行\r\n第二行',indications:null,explanation:'  '})}});
  page.prescriptionId='1';await page.loadDetail();assert.equal(page.data.sections.length,2);
  assert.equal(page.data.sections[0].content,dose);assert.equal(page.data.sections[1].content,'第一行\r\n第二行');
});

test('invalid and missing IDs never display a fallback prescription; zero is a valid ID', async () => {
  let count=0;
  const {page}=harness(detailFile, {'prescriptions-api':{getPrescriptionDetail:async()=>{count++;throw Error('未找到该处方');}}});
  for(const id of ['', 'prescription-001','-1','4294967296']) {page.prescriptionId=id;await page.loadDetail();assert.equal(page.data.error,'处方 ID 无效');}
  assert.equal(count,0);page.prescriptionId='0';await page.loadDetail();assert.equal(count,1);assert.equal(page.data.item,null);assert.equal(page.data.error,'未找到该处方');
});

test('homepage uses API prescriptions only, preserves IDs, and passes keywords to more results', async () => {
  let fail=false;
  const modules={
    'books-api':{getBooks:async()=>({items:[]})},'cases-api':{getCases:async()=>({items:[]})},
    'prescriptions-api':{getPrescriptions:async()=>{if(fail)throw Error('offline');return {items:[row(8)],has_more:true};}},
    'meridians-api':{getMeridians:async()=>({items:[]})},'acupoints-api':{getAcupoints:async()=>({items:[]})},
    'search':{typeTextMap:{prescription:'处方'},routeMap:{prescription:'/pages/prescriptions/detail/detail'}}
  };
  const {page,routes}=harness('miniprogram/pages/home/home.js',modules);
  page.updateSearch('度瘴 散');assert.equal(page.data.searchResults.length,0);
  const token=page.searchRequest;await page.searchLibrary('度瘴 散',token);
  assert.equal(page.data.searchResults[0].id,8);assert.equal(page.data.hasMorePrescriptions,true);
  page.openMorePrescriptions();assert.equal(routes[0],'/pages/prescriptions/index/index?keyword='+encodeURIComponent('度瘴 散'));
  fail=true;await page.searchLibrary('度瘴',token);assert.equal(page.data.searchFailed,true);assert.equal(page.data.searchResults.length,0);assert.equal(page.data.hasMorePrescriptions,false);
});


test('API encodes keywords and IDs and translates transport errors without hiding server errors', async () => {
  const calls=[];let failure=null;const api={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/prescriptions-api.js'),'utf8'), {
    module:api,require:()=>({request:async options=>{calls.push(options.path);if(failure)throw Error(failure);return {items:[]};}})
  });
  await api.exports.getPrescriptions({keyword:'麻黄 & 桂心',page:1,page_size:20,unused:''});
  assert.equal(calls[0],'/api/prescriptions?keyword='+encodeURIComponent('麻黄 & 桂心')+'&page=1&page_size=20');
  await api.exports.getPrescriptionDetail(0);assert.equal(calls[1],'/api/prescriptions/0');
  failure='request:fail';await assert.rejects(api.exports.getPrescriptions(),/网络连接失败/);
  failure='未找到该处方';await assert.rejects(api.exports.getPrescriptionDetail(99),/未找到该处方/);
});
