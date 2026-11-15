const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const validation = require('../../miniprogram/cloudfunctions/personal/validation');
const owner = 'a'.repeat(32);
const other = 'b'.repeat(32);

function harness() {
  const storage = new Map(),
    routes = [],
    calls = [];
  let failWrite = false,
    cloudHandler = async () => ({ code: 0, data: {} });
  const wx = {
    getStorageSync(key) {
      return storage.has(key) ? structuredClone(storage.get(key)) : '';
    },
    setStorageSync(key, value) {
      if (failWrite) throw Error('full');
      storage.set(key, structuredClone(value));
    },
    removeStorageSync(key) {
      storage.delete(key);
    },
    navigateTo({ url }) {
      routes.push(url);
    },
    navigateBack() {
      routes.push('back');
    },
    redirectTo({ url }) {
      routes.push(url);
    },
    showToast() {},
    cloud: {
      async callFunction({ data }) {
        calls.push(data);
        return { result: await cloudHandler(data) };
      },
      async uploadFile({ cloudPath }) {
        return { fileID: 'cloud://environment/' + cloudPath };
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/learning-store.js'), 'utf8'), {
    module,
    wx,
    Date,
    Set,
    Promise,
    console
  });
  return {
    store: module.exports,
    wx,
    storage,
    routes,
    calls,
    failWrites(value) {
      failWrite = value;
    },
    cloud(fn) {
      cloudHandler = fn;
    }
  };
}
function page(file, context) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    Page(value) {
      definition = value;
    },
    require() {
      return context.store;
    },
    wx: context.wx,
    getCurrentPages: () => [{}],
    Date,
    Set,
    console
  });
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(value) {
      Object.assign(this.data, value);
    }
  };
}
const ref = { type: 'prescription', id: '0', title: '桂枝汤', source: '伤寒论' };

test('favorites retain zero IDs, distinguish chapters and filter all content categories', () => {
  const { store } = harness();
  store.toggleFavorite(ref);
  store.toggleFavorite({ type: 'chapter', id: '7', chapterId: '1', title: '上古天真论', source: '黄帝内经' });
  store.toggleFavorite({
    type: 'chapter',
    id: '7',
    chapterId: '2',
    title: '四气调神大论',
    source: '黄帝内经'
  });
  store.toggleFavorite({ type: 'acupoint', id: '1', title: '百会', source: '督脉' });
  assert.equal(store.records('favorite').length, 4);
  assert.equal(store.records('favorite').filter((item) => store.matches(item, '黄帝内经', 'book')).length, 2);
  assert.equal(store.records('favorite').filter((item) => store.matches(item, '百会', 'meridian')).length, 1);
  assert.equal(store.toggleFavorite(ref), false);
  assert.equal(store.records('favorite').length, 3);
  assert.match(store.route(ref), /id=0$/);
});

test('notes edit the same record, preserve links, validate and retain drafts on storage failure', () => {
  const h = harness();
  assert.throws(() => h.store.saveNote({ title: ' ', content: '正文' }), /标题/);
  assert.throws(() => h.store.saveNote({ title: '题目', content: ' ' }), /正文/);
  const note = h.store.saveNote({ title: '桂枝汤读书札记', content: '调和营卫', ref });
  h.store.setDraft(note.key, { ...note, content: '第二稿' });
  h.failWrites(true);
  assert.throws(() => h.store.saveNote({ ...note, content: '新正文' }), /存储/);
  assert.equal(h.store.records('note')[0].content, '调和营卫');
  assert.equal(h.store.getDraft(note.key).content, '第二稿');
  h.failWrites(false);
  h.store.saveNote({ ...note, content: '新正文' });
  assert.equal(h.store.records('note').length, 1);
  assert.equal(h.store.records('note')[0].content, '新正文');
  assert.equal(h.store.records('note')[0].ref.id, '0');
});

test('legacy draft is restored, references have separate drafts, and saved drafts clear', () => {
  const { store, wx } = harness();
  wx.setStorageSync('noteDraft', '旧笔记草稿');
  assert.equal(store.getDraft('new').content, '旧笔记草稿');
  store.setDraft('ref:book:1', { content: '章节草稿' });
  assert.equal(store.getDraft('ref:book:1').content, '章节草稿');
  store.clearDraft('new');
  assert.equal(store.getDraft('new'), null);
  assert.equal(store.getDraft('ref:book:1').content, '章节草稿');
});

test('history deduplicates, resumes the exact chapter and clearing leaves other records intact', () => {
  const { store } = harness();
  const chapter = { type: 'chapter', id: '9', chapterId: '4', title: '上古天真论', source: '黄帝内经' };
  store.toggleFavorite(ref);
  store.saveNote({ title: '笔记', content: '正文' });
  store.visit(chapter, { scrollTop: 350, contentMode: 'shiyi' });
  store.visit(chapter, { scrollTop: 490, contentMode: 'shiyi' });
  assert.equal(store.records('history').length, 1);
  assert.match(
    store.route(chapter, store.records('history')[0]),
    /chapterId=4&resume=1&scrollTop=490&contentMode=shiyi/
  );
  store.clearHistory();
  assert.equal(store.records('history').length, 0);
  assert.equal(store.records('favorite').length, 1);
  assert.equal(store.records('note').length, 1);
});

test('history bounds to 200 records and grouping follows local calendar boundaries', () => {
  const { store } = harness();
  for (let id = 0; id < 205; id++) store.visit({ ...ref, id: String(id) });
  assert.equal(store.records('history').length, 200);
  const now = new Date(2026, 10, 16, 12);
  const groups = store.historyGroups(
    [
      { updatedAt: new Date(2026, 10, 16, 0, 2).getTime(), ref },
      { updatedAt: new Date(2026, 10, 15, 23, 59).getTime(), ref },
      { updatedAt: new Date(2025, 10, 15).getTime(), ref }
    ],
    now
  );
  assert.deepEqual(
    Array.from(groups, (group) => group.label),
    ['今天', '昨天', '2025年11月15日']
  );
});

test('login fails honestly and verified accounts are isolated with a one-time guest merge', async () => {
  const h = harness();
  h.store.toggleFavorite(ref);
  h.cloud(async () => {
    throw Error('offline');
  });
  await assert.rejects(h.store.login(), /offline/);
  assert.equal(h.store.account(), null);
  assert.equal(h.store.records('favorite').length, 1);
  h.cloud(async () => ({ code: 0, data: { id: owner } }));
  await h.store.login();
  assert.equal(h.store.records('favorite').length, 1);
  h.store.logout();
  assert.equal(h.store.records('favorite').length, 0);
  h.cloud(async () => ({ code: 0, data: { id: other } }));
  await h.store.login();
  assert.equal(h.store.records('favorite').length, 0);
  h.store.logout();
  h.cloud(async () => ({ code: 0, data: { id: owner } }));
  await h.store.login();
  assert.equal(h.store.records('favorite').length, 1);
});

test('failed sync retains local writes and retries; deletion tombstones defeat stale remote data', async () => {
  const h = harness();
  h.wx.setStorageSync('qingnang.learning.v1:account', { id: owner });
  h.store.toggleFavorite(ref);
  const saved = h.store.records('favorite')[0];
  h.store.toggleFavorite(ref);
  h.cloud(async () => {
    throw Error('offline');
  });
  await assert.rejects(h.store.synchronize(), /offline/);
  assert.equal(h.storage.get('qingnang.learning.v1:' + owner).pending.length, 1);
  h.cloud(async (data) => ({
    code: 0,
    data: data.action === 'pull' ? { records: [saved], cursor: '' } : {}
  }));
  await h.store.synchronize();
  assert.equal(h.store.records('favorite').length, 0);
  assert.equal(h.storage.get('qingnang.learning.v1:' + owner).pending.length, 0);
  assert.equal(h.calls.at(-2).owner, owner);
  assert.equal(h.calls.at(-2).records[0].deleted, true);
});

test('edits made during synchronization remain queued and cannot be overwritten by the old response', async () => {
  const h = harness();
  h.wx.setStorageSync('qingnang.learning.v1:account', { id: owner });
  const old = h.store.saveNote({ title: '笔记', content: '第一稿' });
  let release;
  h.cloud((data) =>
    data.action === 'push'
      ? new Promise((resolve) => {
          release = () => resolve({ code: 0, data: {} });
        })
      : Promise.resolve({ code: 0, data: { records: [old], cursor: '' } })
  );
  const sync = h.store.synchronize();
  h.store.saveNote({ ...old, content: '第二稿' });
  release();
  await sync;
  assert.equal(h.store.records('note')[0].content, '第二稿');
  assert.equal(h.storage.get('qingnang.learning.v1:' + owner).pending.length, 1);
});

test('audio uploads before metadata and retains a local playback path', async () => {
  const h = harness();
  h.wx.setStorageSync('qingnang.learning.v1:account', { id: owner });
  h.store.saveNote({ title: '语音', content: '', audio: { path: 'wxfile://local.mp3', seconds: 12 } });
  let sent;
  h.cloud(async (data) => {
    if (data.action === 'push') sent = data.records[0];
    return { code: 0, data: data.action === 'pull' ? { records: [sent], cursor: '' } : {} };
  });
  await h.store.synchronize();
  assert.match(sent.audio.path, /^cloud:\/\/environment\/personal\//);
  assert.equal(sent.audio.localPath, undefined);
  assert.equal(h.store.records('note')[0].audio.localPath, 'wxfile://local.mp3');
});

test('editor persists on input and failed save never discards the draft', async () => {
  const h = harness();
  const editor = page('miniprogram/pages/notes/editor/editor.js', h);
  editor.onLoad({});
  editor.input({ currentTarget: { dataset: { field: 'title' } }, detail: { value: '本周阅读计划' } });
  editor.input({ currentTarget: { dataset: { field: 'content' } }, detail: { value: '重读经典' } });
  h.failWrites(true);
  await editor.save();
  assert.equal(editor.data.busy, false);
  assert.match(editor.data.error, /存储/);
  assert.equal(h.store.getDraft('new').content, '重读经典');
  h.failWrites(false);
  await editor.save();
  assert.equal(h.store.records('note').length, 1);
  assert.equal(h.store.getDraft('new'), null);
});

test('feedback validates before networking, retains failures and only acknowledges confirmed receipt', async () => {
  const h = harness();
  const feedback = page('miniprogram/pages/feedback/index/index.js', h);
  feedback.onLoad();
  feedback.data.content = '短';
  await feedback.submit();
  assert.equal(h.calls.length, 0);
  feedback.data.content = '这是测试反馈内容';
  feedback.data.contact = 'not-email';
  await feedback.submit();
  assert.equal(h.calls.length, 0);
  feedback.data.contact = '';
  h.cloud(async () => {
    throw Error('offline');
  });
  await feedback.submit();
  assert.equal(feedback.data.submitted, false);
  assert.equal(feedback.data.content, '这是测试反馈内容');
  h.cloud(async (data) => ({ code: 0, data: data.action === 'login' ? { id: owner } : { id: 'receipt' } }));
  await feedback.submit();
  assert.equal(feedback.data.submitted, true);
  assert.equal(feedback.data.content, '');
  assert.equal(h.store.account(), null);
});

test('leaving during recording saves the completed audio draft and detaches the shared recorder listeners', async () => {
  const h = harness(), hooks = {};
  let stopped, saveFile;
  const recorder = {
    onStart(fn) { hooks.start = fn; }, onStop(fn) { hooks.stop = fn; }, onError(fn) { hooks.error = fn; },
    offStart() { delete hooks.start; }, offStop() { delete hooks.stop; }, offError() { delete hooks.error; },
    start() { hooks.start(); }, stop() { stopped = hooks.stop; }
  };
  h.wx.getRecorderManager = () => recorder;
  h.wx.getFileSystemManager = () => ({ saveFile(options) { saveFile = options.success; } });
  const editor = page('miniprogram/pages/notes/editor/editor.js', h);
  editor.onLoad({}); await editor.record();
  assert.equal(editor.data.recording, true);
  editor.onUnload();
  editor.setData = () => { throw Error('Cannot update an unloaded page'); };
  stopped({ tempFilePath: 'wxfile://temporary.mp3', duration: 1200 });
  saveFile({ savedFilePath: 'wxfile://saved.mp3' });
  assert.equal(h.store.getDraft('new').audio.path, 'wxfile://saved.mp3');
  assert.deepEqual(Object.keys(hooks), []);
});

test('reading actions create chapter history, distinguish book favorites and open a linked note', () => {
  const h = harness(); let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/components/learning-actions/index.js'), 'utf8'), {
    Component(value) { definition = value; }, require() { return h.store; }, wx: h.wx
  });
  const component = { ...definition.methods, data: { ...structuredClone(definition.data), type: 'chapter', item: { id: 7, name: '黄帝内经' }, chapter: { id: 8, title: '上古天真论' }, track: true }, setData(value) { Object.assign(this.data, value); } };
  component.refresh(true); component.favorite(); component.favoriteBook(); component.note();
  assert.equal(h.store.records('history')[0].ref.chapterId, '8');
  assert.equal(h.store.records('favorite').length, 2);
  assert.match(h.routes[0], /^\/pages\/notes\/editor\/editor\?ref=/);
  const linked = JSON.parse(decodeURIComponent(h.routes[0].split('?ref=')[1]));
  assert.equal(linked.id, '7'); assert.equal(linked.chapterId, '8');
});

test('cloud validation rejects forged file ownership, excessive content and invalid record identities', () => {
  const now = Date.now();
  const valid = { key: 'favorite:prescription:0', kind: 'favorite', title: ref.title, ref, updatedAt: now };
  assert.equal(validation.record(valid, owner).ref.id, '0');
  assert.throws(() => validation.record({ ...valid, key: 'favorite:prescription:1' }, owner), /不匹配/);
  assert.throws(() => validation.record({ ...valid, updatedAt: now + 600000 }, owner), /时间/);
  assert.throws(
    () =>
      validation.record(
        { key: 'note:1', kind: 'note', title: '笔记', content: 'x'.repeat(20001), updatedAt: now },
        owner
      ),
    /输入/
  );
  const feedback = {
    id: 'test-request-1',
    type: '内容纠错',
    content: '需要修正的内容',
    contact: '',
    images: ['cloud://env/personal/' + other + '/feedback/image.jpg']
  };
  assert.throws(() => validation.feedback(feedback, owner), /不属于/);
  assert.equal(validation.feedback({ ...feedback, images: [] }, owner).type, '内容纠错');
  assert.notEqual(validation.identity('openid-one', 'app'), validation.identity('openid-two', 'app'));
  assert.notEqual(validation.documentId(owner, 'note:1'), validation.documentId(other, 'note:1'));
});

test('cloud endpoint trusts only WeChat context, isolates owners and keeps feedback retries idempotent', async () => {
  const documents = new Map();
  let context = { OPENID: 'reader-one', APPID: 'qingnang' };
  const database = {
    command: { gt: (value) => ({ greaterThan: value }) },
    serverDate: () => new Date(),
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              return { data: documents.get(name + ':' + id) || null };
            },
            async set({ data }) {
              documents.set(name + ':' + id, { ...data, _id: id });
            }
          };
        },
        where(where) {
          let rows = Array.from(documents.entries())
            .filter(([key, value]) => key.startsWith(name + ':') && value.owner === where.owner)
            .map(([, value]) => value);
          if (where._id) rows = rows.filter((row) => row._id > where._id.greaterThan);
          const query = {
            orderBy() {
              rows.sort((a, b) => a._id.localeCompare(b._id));
              return query;
            },
            limit(count) {
              rows = rows.slice(0, count);
              return query;
            },
            async get() {
              return { data: rows };
            }
          };
          return query;
        }
      };
    },
    runTransaction: (fn) => fn(database)
  };
  const exports = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/personal/index.js'), 'utf8'),
    {
      exports,
      require: (name) =>
        name === './validation'
          ? validation
          : { init() {}, getWXContext: () => context, database: () => database },
      Date
    }
  );
  const user = (await exports.main({ action: 'login', openid: 'forged' })).data;
  assert.equal(user.id, validation.identity('reader-one', 'qingnang'));
  const note = {
    key: 'note:test',
    kind: 'note',
    title: '笔记',
    content: '只有我能看到',
    updatedAt: Date.now()
  };
  assert.equal((await exports.main({ action: 'push', owner: user.id, records: [note] })).code, 0);
  assert.equal((await exports.main({ action: 'pull', owner: user.id })).data.records.length, 1);
  context = { OPENID: 'reader-two', APPID: 'qingnang' };
  assert.equal((await exports.main({ action: 'pull', owner: user.id })).code, 422);
  const second = (await exports.main({ action: 'login' })).data;
  assert.equal((await exports.main({ action: 'pull', owner: second.id })).data.records.length, 0);
  const request = {
    action: 'feedback',
    feedback: {
      id: 'unique-request-1',
      type: '产品建议',
      content: '这是测试建议内容',
      contact: '',
      images: []
    }
  };
  const first = await exports.main(request),
    retry = await exports.main(request);
  assert.equal(first.data.id, retry.data.id);
  assert.equal(Array.from(documents.keys()).filter((key) => key.startsWith('personal_feedback:')).length, 1);
  context = {};
  assert.equal((await exports.main({ action: 'login', openid: 'forged' })).code, 401);
});
