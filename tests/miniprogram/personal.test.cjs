const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const owner = 'a'.repeat(32), other = 'b'.repeat(32);
const ref = { type: 'chapter', id: '7', chapterId: '1', title: '上古天真论', source: '黄帝内经' };
const clone = value => JSON.parse(JSON.stringify(value));
function problem(status, message, data) { return Object.assign(new Error(message), { status, data }); }
function server() {
  const users = new Map(), data = new Map(), calls = [];
  let nextUser = owner;
  async function request(options) {
    calls.push(clone(options));
    const endpoint = options.path.replace('/api/personal/', '').split('?')[0];
    if (endpoint === 'session' && options.method === 'POST') {
      const user = { id: nextUser, token: (nextUser === owner ? 'c' : 'd').repeat(64), expiresAt: Date.now() + 86400000 };
      users.set(user.token, user);
      return user;
    }
    const user = users.get(options.header?.Authorization?.replace('Bearer ', ''));
    if (!user) throw problem(401, '请先登录');
    if (!data.has(user.id)) data.set(user.id, new Map());
    const records = data.get(user.id);
    if (endpoint === 'session') { if (options.method === 'DELETE') users.delete(user.token); return { id: user.id }; }
    if (endpoint === 'import') {
      return { records: options.data.records.map(row => {
        if (!records.has(row.key)) records.set(row.key, { ...clone(row), version: 1, updatedAt: Date.now(), deleted: false });
        return clone(records.get(row.key));
      }) };
    }
    if (endpoint === 'history') {
      const removed = [];
      for (const row of records.values()) if (row.kind === 'history') {
        const next = { ...row, deleted: true, version: row.version + 1 }; records.set(row.key, next); removed.push(next);
      }
      return { records: removed };
    }
    if (endpoint === 'records' && options.method === 'GET') return { records: clone([...records.values()]), cursor: '' };
    if (endpoint === 'records') {
      const { record, expectedVersion, mutationId, draftKey } = options.data;
      const old = records.get(record.key);
      if (old?.mutationId === mutationId) return clone(old);
      if ((old?.version || 0) !== expectedVersion) throw problem(409, '内容已在其他设备更新', { current: clone(old) });
      const saved = { ...clone(record), version: expectedVersion + 1, mutationId, deleted: Boolean(record.deleted), updatedAt: Date.now() };
      records.set(saved.key, saved);
      if (record.kind === 'note') {
        const key = draftKey || 'draft:' + record.key;
        const draft = { key, kind: 'draft', deleted: true, version: (records.get(key)?.version || 0) + 1, updatedAt: Date.now() };
        records.set(key, draft);
        return { ...saved, clearedDraft: draft };
      }
      return clone(saved);
    }
    if (endpoint === 'feedback') return { id: options.data.id };
    throw Error('Unhandled endpoint: ' + endpoint);
  }
  return { request, calls, data, as(id) { nextUser = id; } };
}
function harness(backend = server()) {
  const storage = new Map(), routes = [], toasts = [];
  let interceptor = null, confirm = true;
  const wx = {
    getStorageSync: key => storage.has(key) ? clone(storage.get(key)) : '',
    setStorageSync: (key, value) => storage.set(key, clone(value)), removeStorageSync: key => storage.delete(key),
    showModal: options => options.success({ confirm }), login: options => options.success({ code: 'wechat-code' }),
    navigateTo: value => routes.push(value.url), navigateBack: () => routes.push('back'), redirectTo: value => routes.push(value.url),
    showToast: value => toasts.push(value.title)
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/learning-store.js'), 'utf8'), {
    module, wx, Date, Map, Set, Promise, console,
    require: () => ({ request: options => interceptor ? interceptor(options, backend.request) : backend.request(options) })
  });
  return { store: module.exports, wx, storage, routes, toasts, backend,
    intercept(fn) { interceptor = fn; }, confirm(value) { confirm = value; } };
}
function editor(h) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/notes/editor/editor.js'), 'utf8'), {
    Page: value => definition = value, require: () => h.store,
    wx: h.wx, getCurrentPages: () => [{}, {}], Date, Set, console, setTimeout, clearTimeout
  });
  return { ...definition, data: clone(definition.data), setData(value) { Object.assign(this.data, value); } };
}
const note = (content = '饮食有节，起居有常。') => ({ key: 'note:stable', title: '读书札记', content, version: 0, createdAt: 1000 });

test('related notes match exact content and chapters, exclude drafts and deletions, and isolate accounts', async () => {
  const h = harness(); await h.store.login();
  const chapter = { type:'chapter', id:'7', chapterId:'1', title:'第一章' };
  const refs = [chapter, { ...chapter, chapterId:'2' }, {type:'case',id:'7',title:'医案'}, {type:'prescription',id:'7',title:'经方'}, null];
  for (let index=0; index<refs.length; index++) await h.store.saveNote({...note(),key:'note:'+index,ref:refs[index]});
  await h.store.saveDraft('draft', {...note(),ref:chapter});
  assert.deepEqual(Array.from(h.store.relatedNotes(chapter), row=>row.key), ['note:0']);
  assert.deepEqual(Array.from(h.store.relatedNotes({type:'case',id:7}), row=>row.key), ['note:2']);
  assert.deepEqual(Array.from(h.store.relatedNotes({type:'prescription',id:7}), row=>row.key), ['note:3']);
  assert.equal(h.store.relatedNotes(null).length, 0);
  await h.store.remove('note','note:0'); assert.equal(h.store.relatedNotes(chapter).length, 0);
  await h.store.logout(); h.backend.as(other); await h.store.login(); await h.store.synchronize();
  assert.equal(h.store.relatedNotes({type:'case',id:7}).length, 0);
});

test('original history retains its exact offset while legacy shiyi resumes at original top', () => {
  const h = harness();
  assert.match(h.store.route(ref,{scrollTop:320,contentMode:'original'}), /scrollTop=320&contentMode=original$/);
  assert.match(h.store.route(ref,{scrollTop:320,contentMode:'shiyi'}), /scrollTop=0&contentMode=original$/);
});

test('guest cancellation never writes personal records', async () => {
  const h = harness(); h.confirm(false);
  await assert.rejects(h.store.toggleFavorite(ref), /尚未登录/);
  assert.equal(h.backend.calls.length, 0);
  assert.equal(h.store.records('favorite').length, 0);
});
test('favorite success waits for cloud acknowledgement', async () => {
  const h = harness(); await h.store.login();
  let release, reached;
  const waiting = new Promise(resolve => reached = resolve);
  h.intercept(async (options, request) => {
    if (options.path.endsWith('/records') && options.method === 'POST') { reached(); await new Promise(resolve => release = resolve); }
    return request(options);
  });
  const pending = h.store.toggleFavorite(ref); await waiting;
  assert.equal(h.store.isFavorite(ref), false);
  release(); assert.equal(await pending, true);
  assert.equal(h.store.isFavorite(ref), true);
});
test('saved notes and drafts survive an empty device cache', async () => {
  const h = harness(); await h.store.login();
  await h.store.saveDraft('new', note());
  await h.store.saveNote(note(), 'new');
  assert.equal(h.store.getDraft(), null);
  const device = harness(h.backend); await device.store.login(); await device.store.synchronize();
  assert.equal(device.store.records('note')[0].content, note().content);
  assert.equal(device.store.records('draft').length, 0);
});
test('lost server response retries the same mutation without duplicate notes', async () => {
  const h = harness(); await h.store.login(); let fail = true;
  h.store.setDraft('new', note());
  h.intercept(async (options, request) => {
    const result = await request(options);
    if (options.method === 'POST' && options.path.endsWith('/records') && fail) { fail = false; throw Error('network lost'); }
    return result;
  });
  await assert.rejects(h.store.saveNote(note()), /network/);
  assert.equal(h.store.records('note').length, 0);
  assert.equal(h.store.getDraft().content, note().content);
  await h.store.saveNote(note());
  assert.equal(h.store.records('note').length, 1);
  const writes = h.backend.calls.filter(call => call.path.endsWith('/records') && call.method === 'POST');
  assert.equal(writes[0].data.mutationId, writes[1].data.mutationId);
});
test('conflicting edits preserve cloud content and the local recovery draft', async () => {
  const h = harness(); await h.store.login(); await h.store.saveNote(note());
  const existing = h.backend.data.get(owner).get('note:stable');
  h.backend.data.get(owner).set('note:stable', { ...existing, content: '另一台设备的新内容', version: 2, mutationId: 'other-edit' });
  h.store.setDraft('note:stable', { ...note('本机修改'), version: 1 });
  await assert.rejects(h.store.saveNote({ ...note('本机修改'), version: 1 }, 'note:stable'), error => error.status === 409);
  assert.equal(h.store.records('note')[0].content, '另一台设备的新内容');
  assert.equal(h.store.getDraft('note:stable').content, '本机修改');
  assert.equal(await h.store.synchronize(), 1);
});
test('account switches cannot expose another readers cache or guest import', async () => {
  const h = harness();
  h.storage.set('qingnang.learning.v1:guest', { records: [{ ...note(), kind: 'note', updatedAt: 1 }], pending: [] });
  await h.store.login(); await h.store.synchronize();
  assert.equal(h.store.records('note').length, 1);
  await h.store.logout(); h.backend.as(other); await h.store.login(); await h.store.synchronize();
  assert.equal(h.store.records('note').length, 0);
});
test('failed legacy import retains original records until acknowledgement', async () => {
  const h = harness();
  h.storage.set('qingnang.learning.v1:guest', { records: [{ ...note(), kind: 'note', updatedAt: 1 }] });
  await h.store.login();
  h.intercept((options, request) => { if (options.path.endsWith('/import')) throw Error('offline'); return request(options); });
  await assert.rejects(h.store.synchronize(), /offline/);
  assert.equal(h.storage.get('qingnang.learning.v1:guest').records.length, 1);
  h.intercept(null); await h.store.synchronize();
  assert.equal(h.storage.get('qingnang.learning.v1:guest').records.length, 0);
});
test('history clear leaves notes and favorites intact', async () => {
  const h = harness(); await h.store.login();
  await h.store.toggleFavorite(ref); await h.store.saveNote(note()); await h.store.visit(ref, { scrollTop: 320, contentMode: 'shiyi' });
  assert.match(h.store.route(ref, h.store.records('history')[0]), /chapterId=1&resume=1&scrollTop=0&contentMode=original/);
  await h.store.clearHistory();
  assert.equal(h.store.records('history').length, 0);
  assert.equal(h.store.records('note').length, 1);
  assert.equal(h.store.records('favorite').length, 1);
});
test('imported legacy drafts cannot reappear after saving or move to another account', async () => {
  const h = harness(); h.storage.set('noteDraft', '旧版阅读心得');
  await h.store.login(); await h.store.synchronize();
  assert.equal(h.store.getDraft().content, '旧版阅读心得');
  await h.store.saveNote(note('旧版阅读心得'));
  await h.store.synchronize(); assert.equal(h.store.getDraft(), null);
  await h.store.logout(); h.backend.as(other); await h.store.login(); await h.store.synchronize();
  assert.equal(h.store.getDraft(), null);
});
test('cold-device reading refreshes remote history before updating progress', async () => {
  const first = harness(); await first.store.login(); await first.store.visit(ref, { scrollTop: 100 });
  const device = harness(first.backend); await device.store.login();
  await device.store.visit(ref, { scrollTop: 450 });
  assert.equal(device.store.records('history')[0].scrollTop, 450);
});
test('mobile overscroll never sends a negative reading position', async () => {
  const h = harness(); await h.store.login();
  h.intercept((options, request) => {
    if (options.method === 'POST' && options.path.endsWith('/records') && options.data.record.scrollTop < 0)
      throw problem(422, 'The scroll top must be at least 0.');
    return request(options);
  });
  await h.store.visit(ref, { scrollTop: -12, contentMode: 'original' });
  const sent = h.backend.calls.find(call => call.path.endsWith('/records') && call.method === 'POST');
  assert.equal(sent.data.record.scrollTop, 0);
  assert.equal(h.store.records('history')[0].scrollTop, 0);
});

test('sync repairs negative reading positions already saved on the phone', async () => {
  const h = harness(); await h.store.login();
  h.storage.set('qingnang.learning.v2:' + owner, { records: [], pending: [{
    record: { key: 'history:chapter:7:1', kind: 'history', ref, title: ref.title, scrollTop: -9 },
    expectedVersion: 0, mutationId: 'old-negative-progress'
  }] });
  h.intercept((options, request) => {
    if (options.method === 'POST' && options.path.endsWith('/records') && options.data.record.scrollTop < 0)
      throw problem(422, 'The scroll top must be at least 0.');
    return request(options);
  });
  assert.equal(await h.store.synchronize(), 0);
  assert.equal(h.store.records('history')[0].scrollTop, 0);
});

test('legacy import repairs negative reading positions', async () => {
  const h = harness();
  h.storage.set('qingnang.learning.v1:guest', { records: [{
    key: 'history:chapter:7:1', kind: 'history', ref, title: ref.title, scrollTop: -5, updatedAt: 1
  }] });
  await h.store.login(); await h.store.synchronize();
  const imported = h.backend.calls.find(call => call.path.endsWith('/import'));
  assert.equal(imported.data.records[0].scrollTop, 0);
});

test('editor save failures retain text and never announce success', async () => {
  const h = harness(); await h.store.login();
  const page = editor(h); await page.onLoad(); page.setData({ title: '札记', content: '需要保留的正文' });
  h.intercept((options, request) => { if (options.path.endsWith('/records') && options.method === 'POST') throw Error('服务器不可用'); return request(options); });
  await page.save();
  assert.equal(page.data.busy, false); assert.equal(page.data.content, '需要保留的正文');
  assert.deepEqual(h.toasts, []); assert.equal(h.store.getDraft().content, '需要保留的正文');
  page.onUnload();
});
test('personal requests cannot fall back to a local database on server 404', async () => {
  let localCalls = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/request.js'), 'utf8'), {
    module, require: () => ({ env: 'current-cloud', service: 'laravel' }),
    wx: { cloud: { callContainer: options => options.success({ statusCode: 404, data: {} }) },
      getDeviceInfo: () => ({ platform: 'devtools' }), getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
      request: options => { localCalls++; options.success({ statusCode: 200, data: { code: 0, data: {} } }); } }
  });
  await assert.rejects(module.exports.request({ path: '/api/personal/records' }), /404/);
  assert.equal(localCalls, 0);
  await module.exports.request({ path: '/api/books' }); assert.equal(localCalls, 1);
});
test('editor preserves input when both server and local recovery storage fail', async () => {
  const h = harness(); await h.store.login();
  const page = editor(h); await page.onLoad(); page.setData({ title: '札记', content: '不要丢失的正文' });
  const write = h.wx.setStorageSync;
  h.wx.setStorageSync = (key, value) => { if (key.includes(':draft:')) throw Error('disk full'); write(key, value); };
  h.intercept((options, request) => { if (options.method === 'POST') throw Error('网络中断'); return request(options); });
  await page.save();
  assert.equal(page.data.content, '不要丢失的正文');
  assert.match(page.data.error, /请勿关闭/);
  assert.deepEqual(h.toasts, []);
  page.onUnload();
});
