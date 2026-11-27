const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const meridianUtils = require('../../miniprogram/utils/meridians');
const locationUtils = require('../../miniprogram/utils/acupoint-location');
const channels = require('../../database/atlas/channels.json');
const graphics = require('../../database/atlas/graphics.json');
function atlasTransport({ platform = 'devtools', version = 'develop', preference = '', local, cloud }) {
  const mod = { exports: {} };
  const wx = {
    getDeviceInfo: () => ({ platform }),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
    getStorageSync: () => preference,
    request: local || (() => assert.fail('Unexpected localhost request')),
    cloud: { callContainer: cloud || (() => assert.fail('Unexpected cloud request')) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/request.js'), 'utf8'),
    { module: mod, wx, require: () => ({ env: 'test', service: 'test' }) });
  return mod.exports.request;
}

test('a fresh development simulator loads the atlas and its linked records from the HTTPS atlas service', async () => {
  const paths = ['/api/meridian-atlas', '/api/meridians/1', '/api/acupoints/161', '/api/meridians?keyword=LU'];
  const urls = [];
  const request = atlasTransport({ local(options) {
    urls.push(options.url);
    options.success({ statusCode: 200, data: { code: 0, data: 'atlas' } });
  } });
  for (const path of paths) assert.equal(await request({ path }), 'atlas');
  assert.deepEqual(urls, paths.map(path => 'https://localhost:8843' + path));
});

test('an unavailable local connection tries cloud once and preserves a missing cloud directory error', async () => {
  const calls = [];
  const request = atlasTransport({
    local(options) { calls.push(options.url); options.fail({ errMsg: 'request:fail' }); },
    cloud(options) { calls.push(options.path); options.success({ statusCode: 404, data: {} }); }
  });
  await assert.rejects(request({ path: '/api/meridian-atlas' }), error => error.status === 404 && /云端/.test(error.message));
  assert.deepEqual(calls, ['https://localhost:8843/api/meridian-atlas', '/api/meridian-atlas']);
});

test('mobile, release and explicitly cloud-only atlas reads use cloud even with local development data', async () => {
  for (const env of [{ platform: 'ios', preference: true }, { version: 'release', preference: true }, { preference: false }]) {
    const request = atlasTransport({ ...env, cloud(options) {
      options.success({ statusCode: 200, data: { code: 0, data: 'cloud' } });
    } });
    assert.equal(await request({ path: '/api/meridian-atlas' }), 'cloud');
  }
});

const groups = ['regular', 'extraordinary'].map(key => ({
  key, image: {preview_url:'https://cdn.example/'+key}, items: channels.map((c,id)=>({...c,id})).filter(c=>c.group===key)
}));

function pageContext(file, modules = {}) {
  modules = { 'content-share': require('../../miniprogram/utils/content-share'), 'learning-store': {}, 'acupoint-location': locationUtils, ...modules };
  let definition; const navigation = []; const toasts = []; const previews = [];
  const assetModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/atlas-images.js'),'utf8'),{
    module:assetModule,wx:{ previewImage(value){previews.push(value.current);} }
  });
  modules['atlas-images'] = assetModule.exports;
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    Page(value) { definition = value; },
    require(name) {
      const key = Object.keys(modules).find((candidate) => name.endsWith(candidate));
      if (key === 'meridians-api') return { ...require('../../miniprogram/utils/meridians-api'), ...modules[key] };
      if (key) return modules[key];
      if (name.endsWith('utils/meridians') || name.endsWith('utils\\meridians')) return meridianUtils;
      throw Error(name);
    },
    wx: {
      navigateTo(value) { navigation.push(value.url); },
      previewImage(value) { previews.push(value.current); },
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
  return { page, navigation, toasts, previews };
}

const flush = async () => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
};
test('two directories open every real ID directly and retain the selected category on return', async () => {
  let loads=0;
  const {page,navigation}=pageContext('miniprogram/pages/meridians/index/index.js',{
    'meridians-api':{getMeridianAtlas:async()=>{loads++;return {groups};}}
  });
  page.onLoad({});await flush();
  for(const group of groups) {
    page.selectTab({currentTarget:{dataset:{key:group.key}}});
    for(const item of group.items) {
      page.selectMeridian({detail:{id:item.id}});
      assert.equal(navigation.at(-1), '/pages/meridians/detail/detail?id='+item.id);
      page.onShow(); assert.equal(page.data.group.key,group.key);
    }
  }
  assert.equal(navigation.length,20);assert.equal(loads,1);
});

test('retry ignores an older directory response and historic links use the server ID',async()=>{
  const slow=deferred();let calls=0;
  const {page,navigation}=pageContext('miniprogram/pages/meridians/index/index.js',{
    'meridians-api':{getMeridianAtlas:async()=>++calls===1?slow.promise:{groups}}
  });
  page.onLoad({id:'meridian-001'});await page.loadAtlas();slow.resolve({groups:[]});await flush();
  assert.equal(page.data.error,'');assert.equal(page.data.group.key,'extraordinary');
  assert.equal(navigation[0],'/pages/meridians/detail/detail?id='+channels.findIndex(c=>c.key==='du'));
});

test('two banks of image labels cover the complete active catalog, retry retains the image',async()=>{
  let def;
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/components/meridian-viewer/index.js'),'utf8'),{
    Component(value){def=value;}, require(){return {imagePath: async url=>url};}
  });
  const events=[];
  const viewer={...def.methods,data:{},properties:{},setData(v){Object.assign(this.data,v);},triggerEvent(_,e){events.push(e.id);}};
  for(const group of groups) {
    viewer.properties.group=group;
    def.observers.group.call(viewer,group);await flush();
    assert.deepEqual(Array.from(viewer.data.labels,x=>x.key).sort(),group.items.map(x=>x.key).sort());
    for(const label of viewer.data.labels) def.methods.selectLabel.call(viewer,{currentTarget:{dataset:{id:label.id}}});
    def.methods.imageError.call(viewer,{currentTarget:{dataset:{url:viewer.data.src}}});
    assert.equal(viewer.data.failed,true);def.methods.retry.call(viewer);assert.equal(viewer.data.failed,false);
  }
  assert.equal(new Set(events).size,20);
});

test('gallery uses original URLs and a five-column meeting index opens the original point ID',async()=>{
  const points=[{id:0,name:'带脉',code:'GB26'},{id:52,name:'五枢',code:'GB27'},{id:84,name:'维道',code:'GB28'}];
  const plates=['全图','腰腹'].map((title,id)=>({title,full_url:'https://example/'+id,preview_url:'https://example/p'+id}));
  const {page,navigation,previews}=pageContext('miniprogram/pages/meridians/detail/detail.js',{
    'meridians-api':{getMeridianDetail:async()=>({id:20,title:'带脉',related_points:points,point_label:'交会穴',sections:[],plates})},
    'acupoints-api':{}
  });
  page.onLoad({id:20});await flush();assert.equal(page.data.rows[0].cells.length,5);
  page.choosePlate({currentTarget:{dataset:{index:1}}});await page.previewPlate();assert.deepEqual(previews,['https://example/1']);
  page.openAcupoint({currentTarget:{dataset:{id:0}}});assert.equal(navigation[0],'/pages/acupoints/detail/detail?id=0');
});

test('meridian detail validates IDs, loads clean sections and opens database acupoints', async () => {
  const modules={
    'meridians-api':{getMeridianDetail:async()=>({id:1,title:'手太阴肺经',english_name:'Lung Meridian',classification:'十二正经',section:'肺',abbreviation:'styfj',indications:'主治',measured:'分寸歌',acupoints:''})},
    'acupoints-api':{getAcupoints:async()=>({items:[{id:1,name:'中府',code:'LU1'}],total:1})}
  };
  const invalid=pageContext('miniprogram/pages/meridians/detail/detail.js',modules).page;
  invalid.onLoad({id:'invalid!'});assert.equal(invalid.data.error,'经络 ID 无效');
  const {page,navigation}=pageContext('miniprogram/pages/meridians/detail/detail.js',modules);
  page.onLoad({id:'1'});await flush();
  assert.equal(page.data.item.title,'手太阴肺经');assert.equal(page.data.sections.length,2);assert.equal(page.data.pointTotal,1);
  page.openAcupoint({currentTarget:{dataset:{id:1}}});assert.equal(navigation[0],'/pages/acupoints/detail/detail?id=1');
});

test('acupoint detail validates IDs and shows a location diagram in the locate section', async () => {
  const item={id:1,title:'中府（LU1）',pinyin:'Zhōng Fǔ',meridian:'手太阴肺经',pulse:'',position:'胸腹部穴位',fivepoint:'',specificpoint:'募穴',five:'',abbreviation:'zf',alias:'府中俞',adscription:'归属',indications:'主治',locate:'定位',acupoints:'取穴',acupuncture:'针三分',precautions:'',points:'',notes:''};
  const modules={'acupoints-api':{getAcupointDetail:async()=>item}};
  const invalid=pageContext('miniprogram/pages/acupoints/detail/detail.js',modules).page;
  invalid.onLoad({id:'bad'});assert.equal(invalid.data.error,'穴位 ID 无效');
  const {page}=pageContext('miniprogram/pages/acupoints/detail/detail.js',modules);
  page.onLoad({id:'1'});await flush();
  assert.equal(page.data.item.title,'中府（LU1）');assert.equal(page.data.sections.length,6);
  assert.equal(page.data.locationDiagram.label,'前胸部');
  const markup=fs.readFileSync(path.join(root,'miniprogram/pages/acupoints/detail/detail.wxml'),'utf8');
  assert.equal(markup.includes('pictures'),false);
});

test('acupoint locations cover the national standards and recognize legacy codes', () => {
  const { meridian_points, extra_points } = require('../../database/acupoints-standard-2021.json');
  for (const point of meridian_points) assert.ok(locationUtils.createLocationDiagram(point), point.code);
  for (const point of extra_points) {
    for (const code of point.codes.length ? point.codes : ['']) {
      assert.ok(locationUtils.createLocationDiagram({ name: point.name, code }), point.name);
    }
  }
  const fromTitle = (title) => locationUtils.createLocationDiagram({ title });
  assert.equal(fromTitle('和髎（SJ22）').label, '头部');
  assert.equal(fromTitle('印堂（EX-HN3）').label, '头部');
  assert.equal(fromTitle('风府（DU16）').view, '背面');
  assert.equal(fromTitle('外劳宫（EX-UE８）').label, '手背');
  assert.ok(fromTitle('合谷（LI4）').pointImage.endsWith('acupoint-hegu.png'));
  assert.equal(locationUtils.createLocationDiagram({ name: '示例', position: '腰背部穴位' }).view, '背面');
  assert.equal(locationUtils.createLocationDiagram({ name: '示例' }), null);
});

test('a location image opens in preview and falls back to the diagram if it fails', async () => {
  const url = 'https://images.example.org/upload/material/image/2015/10/14/1444794331858228.jpg';
  const { page, previews } = pageContext('miniprogram/pages/acupoints/detail/detail.js', {
    'acupoints-api': { getAcupointDetail: async () => ({ id: 1, title: '中府（LU1）', location_image: url }) }
  });
  page.onLoad({ id: 1 }); await flush();
  assert.equal(page.data.sections[0].key, 'locate');
  assert.equal(page.data.locationImage, url);
  page.previewLocationImage();
  assert.deepEqual(previews, [url]);
  page.onLocationImageError({ currentTarget: { dataset: { url } } });
  assert.equal(page.data.locationImage, '');
  assert.equal(page.data.locationDiagram.label, '前胸部');
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

test('all gallery images live on the server and all point codes match chart membership', () => {
  const extra = require('../../database/atlas/extra-graphics.json');
  assert.equal(Object.keys(extra).length,54);
  assert.deepEqual(groups.map(g=>g.items.length),[12,8]);
  const records=[...Object.values(graphics.groups),...Object.values(extra)];
  for(const ch of channels){
    const plates=graphics.channels[ch.key];
    assert.deepEqual(plates.flatMap(p=>p.codes).sort(),[...ch.points].sort());records.push(...plates);
  }
  for(const pl of records) for(const key of ['full','preview']) {
    const file=fs.readFileSync(path.join(root,'public/images/meridians',pl[key]));
    assert.ok(pl[key].includes(require('node:crypto').createHash('sha256').update(file).digest('hex').slice(0,12)));
  }
  assert.equal(channels.find(c=>c.key==='du').points.includes('GV24+'),true);
  assert.deepEqual(channels.find(c=>c.key==='dai').points,['GB26','GB27','GB28']);
  assert.equal(require('../../miniprogram/utils/search').routeMap.acupoint,'/pages/acupoints/detail/detail');
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
