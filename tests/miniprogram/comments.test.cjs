const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../../miniprogram/components/content-comments/index.js'), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const empty = () => ({ items: [], total: 0, cursor: '' });
function harness(extra = {}) {
  let definition, owner = 'a', nextId = 0;
  const calls = [], toast = [];
  const store = {
    scope: () => owner, account: () => owner === 'guest' ? null : { id: owner },
    reference: (type, item, extra) => item.id == null ? null : { type, id: item.id, ...extra },
    refKey: ref => [ref.type, ref.id, ref.chapterId].join(':'), dateLabel: () => '11月28日', id: () => 'submit-' + ++nextId,
    listComments: async () => empty(), login: async () => { owner = 'a'; },
    saveComment: async (...args) => { calls.push(args); return { id: '1', mine: true, content: args[1], createdAt: 1 }; },
    deleteComment: async id => { calls.push(id); }, ...extra
  };
  vm.runInNewContext(code, { Component: value => { definition = value; }, require: () => store,
    wx: { showToast: value => toast.push(value), showModal: options => options.success({ confirm: true }) } });
  const component = { ...definition.methods, ready: true, drafts: {}, data: {
    ...structuredClone(definition.data), type: 'chapter', item: { id: 1, name: '书' }, chapter: { id: 1, title: '第1条' }
  }, setData(patch) { Object.assign(this.data, patch); } };
  return { component, definition, calls, toast, store, owner: value => { owner = value; } };
}

test('chapter switches ignore stale results and keep independent unsent drafts', async () => {
  const pending = deferred(); let calls = 0;
  const { component: c } = harness({ listComments: () => ++calls === 1 ? pending.promise : Promise.resolve(empty()) });
  const old = c.refresh(); c.input({ detail: { value: '第一章草稿' } });
  c.data.chapter = { id: 2 }; await c.refresh();
  assert.equal(c.data.content, '');
  pending.resolve({ items: [{ id: 'old', createdAt: 1 }], total: 1, cursor: '' }); await old;
  assert.equal(c.data.items.length, 0);
  c.data.chapter = { id: 1 }; await c.refresh();
  assert.equal(c.data.content, '第一章草稿');
});

test('failed publishing retains text and reuses its submission ID without double posting', async () => {
  const pending = deferred(), calls = [];
  const { component: c } = harness({ saveComment: (...args) => { calls.push(args); return calls.length === 1 ? pending.promise : Promise.resolve({ id: '1', createdAt: 1 }); } });
  await c.refresh(); c.input({ detail: { value: '  我的心得  ' } });
  const sending = c.submit(); await c.submit(); assert.equal(calls.length, 1);
  pending.reject(Error('网络断开')); await sending;
  assert.equal(c.data.content, '  我的心得  '); assert.equal(c.data.submitError, '网络断开');
  await c.submit(); assert.equal(calls[0][2], calls[1][2]); assert.equal(calls[1][1], '我的心得');
  assert.equal(c.data.content, ''); assert.equal(c.data.submitting, false);
});

test('editing after a failed publish gets a new submission ID and empty comments never submit', async () => {
  const ids = [];
  const { component: c } = harness({ saveComment: async (ref, content, id) => { ids.push(id); throw Error('offline'); } });
  await c.refresh(); c.input({ detail: { value: '　\n  ' } }); await c.submit(); assert.equal(ids.length, 0);
  c.input({ detail: { value: '甲' } }); await c.submit();
  c.input({ detail: { value: '乙' } }); await c.submit(); assert.notEqual(ids[0], ids[1]);
});

test('new chapters cannot receive late publish results or delete actions from the previous chapter', async () => {
  const pending = deferred();
  const { component: c, calls } = harness({ saveComment: () => pending.promise });
  await c.refresh(); c.input({ detail: { value: '旧章点评' } }); const task = c.submit();
  c.data.chapter = { id: 2 }; await c.refresh(); c.input({ detail: { value: '新章点评' } });
  pending.resolve({ id: 'old', createdAt: 1 }); await task;
  assert.equal(c.data.content, '新章点评'); assert.equal(c.data.items.length, 0);
  c.data.items = [{ id: 'other', mine: false }]; await c.remove({ currentTarget: { dataset: { id: 'other' } } });
  assert.equal(calls.length, 0);
});

test('account changes clear drafts and ownership, detached components ignore pending reads', async () => {
  const { component: c, owner, definition, store } = harness();
  await c.refresh(); c.input({ detail: { value: '账号甲的草稿' } }); owner('b'); await c.refresh();
  assert.equal(c.data.content, ''); assert.equal(Object.keys(c.drafts).length, 0);
  owner('guest'); await c.refresh(); assert.equal(c.data.loggedIn, false);
  await c.login(); assert.equal(c.data.loggedIn, true); assert.equal(c.data.submitting, false);
  const pending = deferred(); store.listComments = () => pending.promise;
  const loading = c.loadPage(); definition.lifetimes.detached.call(c);
  c.setData = () => { throw Error('detached update'); }; pending.resolve(empty()); await loading;
});

test('expired sessions fall back to public comments without retaining delete permissions', async () => {
  const h = harness(); await h.component.refresh();
  h.component.data.items = [{ id: 'mine', mine: true }];
  h.store.listComments = async () => {
    if (h.store.account()) { h.owner('guest'); throw Object.assign(Error('expired'), { status: 401 }); }
    return { items: [{ id: 'mine', mine: false, createdAt: 1 }], total: 1, cursor: '' };
  };
  await h.component.loadPage(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.component.data.loggedIn, false); assert.equal(h.component.data.items[0].mine, false);
  assert.equal(h.component.data.loading, false);
});

test('pagination retries preserve previous entries and do not duplicate rows', async () => {
  let calls = 0; const cursors = [];
  const { component: c } = harness({ listComments: async (_, cursor) => {
    cursors.push(cursor);
    if (++calls === 1) return { items: [{ id: '3', createdAt: 1 }], total: 3, cursor: '3' };
    if (calls === 2) throw Error('offline');
    return { items: [{ id: '3', createdAt: 1 }, { id: '2', createdAt: 1 }], total: 3, cursor: '' };
  } });
  await c.refresh(); await c.more(); assert.equal(c.data.items.length, 1); assert.equal(c.data.cursor, '3');
  await c.retry(); assert.deepEqual(Array.from(c.data.items, row => row.id), ['3', '2']); assert.deepEqual(cursors, ['', '3', '3']);
});

test('confirmed deletes update the list, and delete failures preserve it', async () => {
  const { component: c, store } = harness(); await c.refresh();
  c.data.items = [{ id: '1', mine: true }]; c.data.total = 1;
  store.deleteComment = async () => { throw Error('offline'); };
  await c.remove({ currentTarget: { dataset: { id: '1' } } });
  assert.equal(c.data.items.length, 1); assert.equal(c.data.deleting, '');
  store.deleteComment = async () => {};
  await c.remove({ currentTarget: { dataset: { id: '1' } } });
  assert.equal(c.data.items.length, 0); assert.equal(c.data.total, 0);
});
