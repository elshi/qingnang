const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const meridianUtils = require('../../miniprogram/utils/meridians');
const { meridians, getGroup, findMeridian, pointRows, pointRowsFromPoints } = meridianUtils;

function pageContext(file, modules = {}) {
  modules = { 'content-share': require('../../miniprogram/utils/content-share'), 'learning-store': {}, ...modules };
  let definition; const navigation = []; const toasts = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    Page(value) { definition = value; },
    require(name) {
      const key = Object.keys(modules).find((candidate) => name.endsWith(candidate));
      if (key) return modules[key];
      if (name.endsWith('utils/meridians') || name.endsWith('utils\\meridians')) return meridianUtils;
      throw Error(name);
    },
    wx: {
      navigateTo(value) { navigation.push(value.url); },
      showToast(value) { toasts.push(value); },
      getWindowInfo() { return { statusBarHeight: 24 }; },
      getMenuButtonBoundingClientRect() { return { top: 30, height: 32 }; }
    },
    getApp: () => ({ getDisclaimer: () => '学习说明' }),
    setTimeout,
    clearTimeout
  });
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(value, callback) { Object.assign(this.data, value); if (callback) callback(); }
  };
  return { page, navigation, toasts };
}

const flush = async () => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
};
const catalog = meridians.map((item, index) => ({ id: index, title: item.title, summary: item.route }));
const apiPoints = (channel) => {
  const item = meridians.find((candidate) => candidate.title === channel);
  const points = item ? item.points.map((point, index) => ({ id: index, name: point.name, code: point.code, title: point.name })) : [];
  return { items: points, total: points.length, has_more: false };
};

test('catalog contains twelve ordinary and eight extraordinary meridians, with all 361 standard points', () => {
  assert.equal(getGroup('regular').length, 12); assert.equal(getGroup('extraordinary').length, 8);
  const counts = [11,20,45,21,9,19,67,27,44,14,23,9,24,28];
  assert.deepEqual(meridians.slice(0,14).map((item) => item.acupoints.length), counts);
  assert.equal(counts.reduce((a,b)=>a+b),361);
  assert.equal(new Set(meridians.map((item)=>item.id)).size,20);
  for (const item of meridians) assert.equal(new Set(item.acupoints).size,item.acupoints.length);
});

test('point rows preserve order and use exactly five columns', () => {
  for (const item of meridians) {
    const rows=pointRows(item);
    assert.ok(rows.every((row)=>row.cells.length===5));
    assert.deepEqual(rows.flatMap((row)=>row.cells).filter((point)=>point.name).map((point)=>point.name),item.acupoints);
  }
  const rows=pointRowsFromPoints([{id:0,name:'中府',code:'LU1'},{id:1,name:'云门',code:'LU2'}]);
  assert.equal(rows[0].cells.length,5);assert.equal(rows[0].cells[0].clickable,true);assert.equal(rows[0].cells[2].clickable,false);
});

test('extraordinary meeting points are distinguished from independently assigned points', () => {
  for (const item of meridians.slice(14)) { assert.equal(item.pointLabel,'交会穴'); assert.ok(item.points.every((point)=>!point.code)); }
  assert.equal(findMeridian('ren').points[23].code,'CV24');
  assert.equal(findMeridian('du').points[27].code,'GV28');
  assert.equal(findMeridian('meridian-001').key,'du');
  assert.equal(findMeridian('meridian-002').key,'ren');
  assert.equal(findMeridian('invalid'),undefined);
});

test('index maps database IDs, keeps tab selections, loads real points and opens both details', async () => {
  const modules = {
    'meridians-api': { getMeridians: async () => ({ items: catalog }) },
    'acupoints-api': { getAcupoints: async ({channel}) => apiPoints(channel) }
  };
  const {page,navigation}=pageContext('miniprogram/pages/meridians/index/index.js',modules);
  page.onLoad({}); await flush();
  assert.equal(page.data.selected.key,'lung');assert.equal(page.data.detailReady,true);assert.equal(page.data.selectedDbId,0);
  assert.equal(page.data.pointTotal,11);assert.equal(page.data.rows.length,3);

  const event=(key)=>({currentTarget:{dataset:{key}}});
  page.selectMeridian(event('bladder'));await flush();
  assert.equal(page.data.pointTotal,67);assert.equal(page.data.rows.length,14);
  page.selectTab(event('extraordinary'));await flush();assert.equal(page.data.selected.key,'ren');
  page.selectMeridian(event('dai'));await flush();assert.equal(page.data.pointTotal,3);
  page.selectTab(event('regular'));await flush();assert.equal(page.data.selected.key,'bladder');
  page.selectTab(event('extraordinary'));await flush();assert.equal(page.data.selected.key,'dai');

  page.openDetail();
  page.openAcupoint({currentTarget:{dataset:{id:0}}});
  assert.match(navigation[0],/^\/pages\/meridians\/detail\/detail\?id=\d+$/);
  assert.equal(navigation[1],'/pages/acupoints/detail/detail?id=0');
});

test('rapid meridian switching drops stale acupoint responses', async () => {
  const lung=deferred();const stomach=deferred();
  const modules={
    'meridians-api':{getMeridians:async()=>({items:catalog})},
    'acupoints-api':{getAcupoints:({channel})=>channel==='手太阴肺经'?lung.promise:stomach.promise}
  };
  const {page}=pageContext('miniprogram/pages/meridians/index/index.js',modules);
  page.onLoad({});
  page.selectMeridian({currentTarget:{dataset:{key:'stomach'}}});
  lung.resolve({items:[{id:1,name:'旧穴',code:''}],total:1});await flush();
  assert.equal(page.data.rows.length,0);
  stomach.resolve({items:[{id:2,name:'足三里',code:'ST36'}],total:1});await flush();
  assert.equal(page.data.rows[0].cells[0].name,'足三里');
});

test('all on-figure labels are tappable and select only meridians from the current tab', () => {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/components/meridian-viewer/index.js'),'utf8'), {
    Component(value) { definition=value; },
    require() { return { getGroup, findMeridian }; }
  });
  const events=[];
  const viewer={data:{},properties:{group:'regular',selected:'lung'},setData(value){Object.assign(this.data,value);},triggerEvent(name,detail){events.push({name,detail});}};
  definition.observers['group, selected'].call(viewer,'regular','lung');
  assert.equal(viewer.data.labels.length,12);assert.ok(viewer.data.labels.every((item)=>item.side&&Number.isFinite(item.top)));
  definition.methods.selectLabel.call(viewer,{currentTarget:{dataset:{key:'stomach'}}});
  assert.deepEqual(events.map((event)=>event.detail.key),['stomach']);
  viewer.properties.group='extraordinary';
  definition.observers['group, selected'].call(viewer,'extraordinary','ren');
  assert.equal(viewer.data.labels.length,8);
  definition.methods.selectLabel.call(viewer,{currentTarget:{dataset:{key:'lung'}}});assert.equal(events.length,1);
});

test('figure labels have no background and the selected icon uses the selected text color', () => {
  const markup=fs.readFileSync(path.join(root,'miniprogram/components/meridian-viewer/index.wxml'),'utf8');
  const styles=fs.readFileSync(path.join(root,'miniprogram/components/meridian-viewer/index.wxss'),'utf8');
  assert.match(markup,/wx:if="\{\{selected === item\.key\}\}" class="selection-icon"/);
  assert.match(styles,/\.chart-callout\s*\{[^}]*background:transparent;/);
  assert.match(styles,/\.chart-callout\.is-current\s*\{[^}]*color:#9b631f;[^}]*background:transparent;/);
  const selectedRule=styles.match(/\.chart-callout\.is-current\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(selectedRule,/border-bottom|box-shadow|text-decoration/);
  assert.match(styles,/\.selection-icon\s*\{[^}]*border:2rpx solid currentColor;[^}]*color:currentColor;/);
});

test('meridian detail validates IDs, loads clean sections and opens database acupoints', async () => {
  const modules={
    'meridians-api':{getMeridianDetail:async()=>({id:1,title:'手太阴肺经',english_name:'Lung Meridian',classification:'十二正经',section:'肺',abbreviation:'styfj',indications:'主治',measured:'分寸歌',acupoints:''})},
    'acupoints-api':{getAcupoints:async()=>({items:[{id:1,name:'中府',code:'LU1'}],total:1})}
  };
  const invalid=pageContext('miniprogram/pages/meridians/detail/detail.js',modules).page;
  invalid.onLoad({id:'meridian-lung'});assert.equal(invalid.data.error,'经络 ID 无效');
  const {page,navigation}=pageContext('miniprogram/pages/meridians/detail/detail.js',modules);
  page.onLoad({id:'1'});await flush();
  assert.equal(page.data.item.title,'手太阴肺经');assert.equal(page.data.sections.length,2);assert.equal(page.data.pointTotal,1);
  page.openAcupoint({currentTarget:{dataset:{id:1}}});assert.equal(navigation[0],'/pages/acupoints/detail/detail?id=1');
});

test('acupoint detail validates IDs and hides empty sections and pictures', async () => {
  const item={id:1,title:'中府（LU1）',pinyin:'Zhōng Fǔ',meridian:'手太阴肺经',pulse:'',position:'胸腹部穴位',fivepoint:'',specificpoint:'募穴',five:'',abbreviation:'zf',alias:'府中俞',adscription:'归属',indications:'主治',locate:'定位',acupoints:'取穴',acupuncture:'针三分',precautions:'',points:'',notes:''};
  const modules={'acupoints-api':{getAcupointDetail:async()=>item}};
  const invalid=pageContext('miniprogram/pages/acupoints/detail/detail.js',modules).page;
  invalid.onLoad({id:'bad'});assert.equal(invalid.data.error,'穴位 ID 无效');
  const {page}=pageContext('miniprogram/pages/acupoints/detail/detail.js',modules);
  page.onLoad({id:'1'});await flush();
  assert.equal(page.data.item.title,'中府（LU1）');assert.equal(page.data.sections.length,6);
  const markup=fs.readFileSync(path.join(root,'miniprogram/pages/acupoints/detail/detail.wxml'),'utf8');
  assert.equal(markup.includes('pictures'),false);
});

test('homepage search returns database acupoints and opens their detail page', async () => {
  const modules={
    'books-api':{getBooks:async()=>({items:[]})},'cases-api':{getCases:async()=>({items:[]})},
    'prescriptions-api':{getPrescriptions:async()=>({items:[]})},
    'meridians-api':{getMeridians:async()=>({items:[]})},
    'acupoints-api':{getAcupoints:async()=>({items:[{id:1,title:'中府（LU1）',summary:'手太阴肺经'}]})},
    'search':{typeTextMap:{acupoint:'穴位'},routeMap:{acupoint:'/pages/acupoints/detail/detail'}}
  };
  const {page,navigation}=pageContext('miniprogram/pages/home/home.js',modules);
  page.updateSearch('中府');const request=page.searchRequest;await page.searchLibrary('中府',request);
  assert.equal(page.data.searchResults.length,1);assert.equal(page.data.searchResults[0].typeText,'穴位');
  page.openSearchResult({currentTarget:{dataset:{id:1,route:'/pages/acupoints/detail/detail'}}});
  assert.equal(navigation[0],'/pages/acupoints/detail/detail?id=1');
});

test('catalog API helpers encode queries and IDs and translate transport failures', async () => {
  async function loadApi(file) {
    const calls=[];let failure='';const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'), {
      module,require:()=>({request:async({path:requestPath})=>{calls.push(requestPath);if(failure)throw Error(failure);return {items:[]};}})
    });
    return {api:module.exports,calls,setFailure:(value)=>{failure=value;}};
  }
  const meridianApi=await loadApi('miniprogram/utils/meridians-api.js');
  await meridianApi.api.getMeridians({keyword:'肺 经',page_size:50});
  await meridianApi.api.getMeridianDetail(0);
  assert.deepEqual(meridianApi.calls,['/api/meridians?keyword='+encodeURIComponent('肺 经')+'&page_size=50','/api/meridians/0']);

  const acupointApi=await loadApi('miniprogram/utils/acupoints-api.js');
  await acupointApi.api.getAcupoints({channel:'手太阴肺经',page_size:100});
  await acupointApi.api.getAcupointDetail(1);
  assert.deepEqual(acupointApi.calls,['/api/acupoints?channel='+encodeURIComponent('手太阴肺经')+'&page_size=100','/api/acupoints/1']);
  acupointApi.setFailure('request:fail timeout');
  await assert.rejects(acupointApi.api.getAcupoints(),/网络连接失败/);
});

test('both static atlas images are bundled and search routes include acupoints', () => {
  for(const name of ['regular-chart.jpg','extraordinary-chart.jpg']) {
    const bytes=fs.readFileSync(path.join(root,'miniprogram/assets/meridians',name));
    assert.ok(bytes.length>30000&&bytes.length<200000);assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
  }
  const {searchLocal,routeMap,typeTextMap}=require('../../miniprogram/utils/search');
  assert.equal(routeMap.acupoint,'/pages/acupoints/detail/detail');assert.equal(typeTextMap.acupoint,'穴位');
  assert.equal(searchLocal('少商').some((item)=>item.type==='meridian'),false);
});

test('bundled image and audio assets total at most 200KB', () => {
  const assetRoot=path.join(root,'miniprogram');
  const mediaExtensions=new Set([
    '.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.avif',
    '.mp3','.wav','.ogg','.m4a','.aac','.flac','.amr','.aiff','.wma'
  ]);
  const pending=[assetRoot];
  let totalBytes=0;
  while (pending.length) {
    const current=pending.pop();
    for (const entry of fs.readdirSync(current,{withFileTypes:true})) {
      const target=path.join(current,entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (mediaExtensions.has(path.extname(entry.name).toLowerCase())) {
        totalBytes+=fs.statSync(target).size;
      }
    }
  }
  // Use the stricter decimal limit so both KB and KiB interpretations pass.
  assert.ok(totalBytes<=200000,`Bundled images and audio total ${totalBytes} bytes; limit is 200000`);
});
