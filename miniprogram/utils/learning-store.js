// MySQL is authoritative. Local data is a scoped cache and an explicit recovery outbox.
const { request } = require('./request');
const PREFIX = 'qingnang.learning.v2:';
const LEGACY = 'qingnang.learning.v1:';
const ACCOUNT_KEY = PREFIX + 'account';
let loginTask = null;
let syncTask = null;
const queues = new Map();
const memory = new Map();
function read(key, fallback) { const value = wx.getStorageSync(key); return value === '' || value == null ? fallback : value; }
function account() { const user = read(ACCOUNT_KEY, null); return user && user.token && user.expiresAt > Date.now() ? user : null; }
function scope() { return account()?.id || 'guest'; }
function state(owner = scope()) {
  if (memory.has(owner)) return memory.get(owner);
  const value = read(PREFIX + owner, {});
  return { records: value.records || [], pending: value.pending || [] };
}
function write(value, owner = scope(), required = false) {
  memory.set(owner, value);
  try { wx.setStorageSync(PREFIX + owner, value); }
  catch (error) { if (required) throw new Error('恢复副本保存失败，请清理本机空间后重试'); }
}
function enqueue(owner, action) {
  const next = (queues.get(owner) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(owner, next);
  return next.finally(() => { if (queues.get(owner) === next) queues.delete(owner); });
}
async function api(path, method = 'GET', data = {}, user = account()) {
  try {
    return await request({ path: '/api/personal/' + path, method, data,
      header: user ? { Authorization: 'Bearer ' + user.token } : {} });
  } catch (error) {
    if (error.status === 401 && account()?.token === user?.token) wx.removeStorageSync(ACCOUNT_KEY);
    throw error;
  }
}
async function transcribe(audio, duration) {
  if (!account()) throw new Error('请先微信登录后再使用语音转文字');
  return api('speech/recognize', 'POST', { audio, format: 'mp3', duration });
}
async function login() {
  if (loginTask) return loginTask;
  loginTask = (async () => {
    const result = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: () => reject(new Error('微信登录失败，请重试')) }));
    if (!result.code) throw new Error('未取得微信登录凭证，请重试');
    const user = await api('session', 'POST', { code: result.code }, null);
    if (!user || !/^[a-f0-9]{32}$/.test(user.id) || !/^[a-f0-9]{64}$/.test(user.token)) throw new Error('登录信息无效');
    wx.setStorageSync(ACCOUNT_KEY, user);
    return user;
  })();
  try { return await loginTask; } finally { loginTask = null; }
}
async function requireLogin() {
  if (account()) return account();
  const answer = await new Promise((resolve) => wx.showModal({ title: '登录后保存到云端', content: '使用微信登录后，可在不同设备查看收藏与笔记。', confirmText: '微信登录', confirmColor: '#a77936', success: resolve, fail: () => resolve({ confirm: false }) }));
  if (!answer.confirm) throw new Error('尚未登录，内容未提交');
  return login();
}
async function logout() {
  const user = account();
  if (user) await api('session', 'DELETE', {}, user);
  wx.removeStorageSync(ACCOUNT_KEY);
}
function remember(record, owner) {
  const value = state(owner);
  value.records = [record, ...value.records.filter(item => item.key !== record.key)];
  write(value, owner);
}
const TYPES = {
  book: '医书',
  chapter: '医书章节',
  case: '医案',
  prescription: '经方',
  meridian: '经络',
  acupoint: '穴位'
};
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'book', label: '医书' },
  { key: 'case', label: '医案' },
  { key: 'prescription', label: '经方' },
  { key: 'meridian', label: '经络' }
];
function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
function reference(type, item, extra = {}) {
  if (!TYPES[type] || !item || item.id === undefined || item.id === null) return null;
  return {
    type,
    id: String(item.id),
    title: String(item.title || item.name || '未命名内容'),
    source: String(item.source || item.classification || item.meridian || ''),
    ...extra
  };
}
function refKey(ref) {
  return `${ref.type}:${ref.id}${ref.chapterId !== undefined ? ':' + ref.chapterId : ''}`;
}
function category(ref) {
  return ref && (ref.type === 'chapter' ? 'book' : ref.type === 'acupoint' ? 'meridian' : ref.type);
}
function sourceLabel(ref) {
  return ref ? [TYPES[ref.type], ref.source].filter(Boolean).join(' · ') : '自由笔记';
}
function matches(item, keyword, filter = 'all') {
  const query = String(keyword || '')
    .trim()
    .toLowerCase();
  return (
    (filter === 'all' || category(item.ref) === filter) &&
    (!query ||
      [item.title, item.content, item.ref && item.ref.title, item.ref && item.ref.source]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query))
  );
}
function records(kind) {
  return state()
    .records.filter((item) => item.kind === kind && !item.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function relatedNotes(ref) {
  if (!ref) return [];
  const key = refKey(ref);
  return records('note').filter(item => item.ref && refKey(item.ref) === key);
}

function normalizeHistoryRecord(record) {
  if (record.kind !== 'history' || record.scrollTop === undefined) return record;
  const scrollTop = Number(record.scrollTop);
  if (!Number.isFinite(scrollTop)) {
    const { scrollTop: ignored, ...rest } = record;
    return rest;
  }
  return { ...record, scrollTop: Math.min(10000000, Math.max(0, Math.round(scrollTop))) };
}

async function sendPending(entry, user) {
  if (scope() !== user.id) throw new Error('账号已变更，请重新打开页面');
  try {
    const result = await api('records', 'POST', { ...entry, record: normalizeHistoryRecord(entry.record) }, user);
    if (result.clearedDraft) remember(result.clearedDraft, user.id);
    remember(result, user.id);
    const current = state(user.id);
    current.pending = current.pending.filter(row => row.mutationId !== entry.mutationId);
    write(current, user.id);
    return result;
  } catch (error) {
    if (error.status === 409) {
      if (error.data?.current) remember(error.data.current, user.id);
      const value = state(user.id);
      value.pending = ['note', 'draft'].includes(entry.record.kind)
        ? value.pending.map(row => row.mutationId === entry.mutationId ? { ...row, conflict: true } : row)
        : value.pending.filter(row => row.mutationId !== entry.mutationId);
      write(value, user.id);
    }
    throw error;
  }
}
function commit(record, user, expectedVersion, extra = {}) {
  return enqueue(user.id, async () => {
    if (scope() !== user.id) throw new Error('账号已变更，请重新打开页面');
    const current = state(user.id);
    const old = current.records.find(row => row.key === record.key);
    const version = expectedVersion === undefined ? (old?.version || 0) : expectedVersion;
    const previous = current.pending.find(row => row.record.key === record.key);
    const same = previous && previous.expectedVersion === version && JSON.stringify(previous.record) === JSON.stringify(record);
    const entry = same ? previous : { record, expectedVersion: version, mutationId: id(), ...extra };
    if (entry.conflict) throw new Error('云端有更新，当前输入已保留，请重新打开笔记后核对');
    current.pending = [entry, ...current.pending.filter(row => row.record.key !== record.key)];
    write(current, user.id, true);
    return sendPending(entry, user);
  });
}
async function remove(kind, key) {
  const user = await requireLogin();
  return commit({ kind, key, deleted: true }, user);
}
function isFavorite(ref) { return Boolean(ref && records('favorite').some(item => item.key === 'favorite:' + refKey(ref))); }
async function toggleFavorite(ref) {
  if (!ref) throw new Error('内容尚未加载');
  const user = await requireLogin();
  const pending = state(user.id).pending.find(row => row.record.key === 'favorite:' + refKey(ref) && !row.conflict);
  if (pending) {
    const result = await enqueue(user.id, () => sendPending(pending, user));
    return !result.deleted;
  }
  await synchronize();
  const key = 'favorite:' + refKey(ref), deleted = isFavorite(ref);
  await commit({ key, kind: 'favorite', ref, title: ref.title, deleted }, user);
  return !deleted;
}
function visit(ref, progress = {}) {
  const user = account();
  if (!user || !ref) return Promise.resolve();
  const ready = state(user.id).hydrated ? Promise.resolve() : synchronize();
  return ready.then(() => commit(normalizeHistoryRecord({ key: 'history:' + refKey(ref), kind: 'history', ref, title: ref.title, ...progress }), user)).catch(() => {});
}
async function clearHistory() {
  const user = await requireLogin();
  return enqueue(user.id, async () => {
    const result = await api('history', 'DELETE', {}, user);
    const value = state(user.id);
    value.records = value.records.filter(row => row.kind !== 'history').concat(result.records);
    value.pending = value.pending.filter(row => row.record.kind !== 'history');
    write(value, user.id);
  });
}
async function saveNote(note, draftId = 'new') {
  const title = String(note.title || '').trim(), content = String(note.content || '').trim();
  if (!title) throw new Error('请填写笔记标题');
  if (!content) throw new Error('请填写笔记正文');
  if (title.length > 80 || content.length > 20000) throw new Error('笔记内容超过长度限制');
  const user = await requireLogin();
  const saved = await commit({ key: note.key || 'note:' + id(), kind: 'note', title, content, ref: note.ref || null,
    createdAt: note.createdAt || Date.now() }, user, note.version || 0, { draftKey: 'draft:' + draftId });
  const value = state(user.id);
  value.pending = value.pending.filter(row => row.record.key !== 'draft:' + draftId);
  write(value, user.id);
  try { wx.removeStorageSync(draftKey(draftId, user.id)); } catch (error) { /* Cloud acknowledgement is authoritative. */ }
  return saved;
}
function draftKey(key = 'new', owner = scope()) { return PREFIX + 'draft:' + owner + ':' + key; }
function getDraft(key = 'new') {
  const local = read(draftKey(key), null);
  if (local) return local;
  const remote = records('draft').find(row => row.key === 'draft:' + key);
  if (remote) return { ...remote, key: remote.noteKey || (key.startsWith('note:') ? key : ''), version: remote.noteVersion || 0 };
  return null;
}
function setDraft(key, draft) {
  wx.setStorageSync(draftKey(key), draft);
}
async function saveDraft(key, draft) {
  setDraft(key, draft);
  const user = account();
  if (!user) throw new Error('尚未登录，草稿暂存本机');
  const saved = await commit({ key: 'draft:' + key, kind: 'draft', title: draft.title || '', content: draft.content || '',
    ref: draft.ref || null, noteVersion: draft.version || 0, noteKey: draft.key || '' }, user);
  return saved;
}
async function clearDraft(key = 'new') {
  const user = account();
  if (user && state().records.some(row => row.key === 'draft:' + key && !row.deleted)) await remove('draft', 'draft:' + key);
  wx.removeStorageSync(draftKey(key));
}
async function importLegacy(user) {
  if (scope() !== user.id) return;
  const guestOwnerKey = PREFIX + 'legacy-records-owner';
  let guestOwner = read(guestOwnerKey, null);
  if (!guestOwner && (read(LEGACY + 'guest', {}).records || []).length) {
    wx.setStorageSync(guestOwnerKey, user.id);
    guestOwner = user.id;
  }
  for (const owner of guestOwner === user.id ? [user.id, 'guest'] : [user.id]) {
    const value = read(LEGACY + owner, {});
    const items = (value.records || []).filter(row => !row.deleted && (!row.audio || row.content?.trim()));
    const doneKey = PREFIX + 'import:' + user.id + ':' + owner;
    const done = new Set(read(doneKey, []));
    const candidates = items.filter(row => !done.has(row.key));
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20).map(({ audio, ...row }) => normalizeHistoryRecord(row));
      const result = await api('import', 'POST', { records: batch }, user);
      result.records.forEach(row => { remember(row, user.id); done.add(row.key); });
      wx.setStorageSync(doneKey, [...done]);
      // Acknowledged guest rows must not be imported into a later account.
      if (owner === 'guest') {
        const fresh = read(LEGACY + owner, {});
        const remaining = (fresh.records || []).filter(row => !batch.some(sent => sent.key === row.key && sent.updatedAt === row.updatedAt));
        wx.setStorageSync(LEGACY + owner, { records: remaining, pending: [] });
      }
    }
  }
  if (scope() !== user.id) return;
  const claimedBy = read(PREFIX + 'legacy-draft-owner', null);
  const legacyDraft = read(LEGACY + 'draft:' + user.id + ':new', null)
    || (!claimedBy || claimedBy === user.id ? read(LEGACY + 'draft:guest:new', null) : null);
  const text = !claimedBy || claimedBy === user.id ? read('noteDraft', '') : '';
  if (!read(PREFIX + 'legacy-draft-imported:' + user.id, false) && !getDraft() && (legacyDraft || typeof text === 'string' && text.trim())) {
    wx.setStorageSync(PREFIX + 'legacy-draft-owner', user.id);
    setDraft('new', legacyDraft || { title: '', content: text, ref: null });
    wx.setStorageSync(PREFIX + 'legacy-draft-imported:' + user.id, true);
  }
}
async function synchronize() {
  const user = account();
  if (!user) return 0;
  if (syncTask && syncTask.owner === user.id) return syncTask.promise;
  const task = { owner: user.id };
  task.promise = enqueue(user.id, async () => {
    await api('session', 'GET', {}, user);
    await importLegacy(user);
    for (const entry of state(user.id).pending.slice()) {
      if (entry.conflict) continue;
      try { await sendPending(entry, user); }
      catch (error) { if (error.status !== 409) throw error; }
    }
    const remote = [];
    let cursor = '';
    do {
      const page = await api('records' + (cursor ? '?cursor=' + cursor : ''), 'GET', {}, user);
      remote.push(...page.records);
      cursor = page.cursor;
    } while (cursor);
    write({ records: remote, pending: state(user.id).pending, hydrated: true }, user.id);
    return state(user.id).pending.length;
  });
  syncTask = task;
  try { return await task.promise; } finally { if (syncTask === task) syncTask = null; }
}
function syncQuietly() { return synchronize().catch(() => {}); }
function dismissConflict(key) {
  const value = state();
  value.pending = value.pending.filter(row => row.record.key !== key && row.record.key !== 'draft:' + key);
  write(value);
}
async function uploadImage(path) {
  await requireLogin();
  const match = /\.(png|jpe?g|webp)$/i.exec(path);
  const ticket = await api('uploads', 'POST', { extension: match ? match[1].toLowerCase() : 'jpg' });
  await new Promise((resolve, reject) => wx.uploadFile({ url: ticket.url, filePath: path, name: 'file', formData: ticket.formData,
    success: response => response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(new Error('截图上传失败，请重试')),
    fail: () => reject(new Error('截图上传失败，请检查网络')) }));
  return ticket.fileID;
}
async function submitFeedback(feedback) { await requireLogin(); return api('feedback', 'POST', feedback); }
function commentTarget(ref) {
  if (!ref || !TYPES[ref.type]) throw new Error('内容尚未加载');
  return { type: ref.type, id: ref.id, ...(ref.type === 'chapter' ? { chapterId: ref.chapterId } : {}) };
}
function listComments(ref, cursor = '') {
  const target = commentTarget(ref);
  const query = Object.entries({ ...target, ...(cursor ? { cursor } : {}) })
    .map(([key, value]) => key + '=' + encodeURIComponent(value)).join('&');
  return account() ? api('comments?' + query) : request({ path: '/api/comments?' + query });
}
async function saveComment(ref, content, submissionId) {
  const user = account();
  if (!user) throw new Error('请先微信登录后再点评');
  return api('comments', 'POST', { ...commentTarget(ref), content, submissionId }, user);
}
async function deleteComment(id) {
  const user = account();
  if (!user) throw new Error('请先微信登录后再操作');
  return api('comments/' + encodeURIComponent(id), 'DELETE', {}, user);
}
module.exports = { TYPES, FILTERS, account, scope, id, reference, refKey, category, sourceLabel, matches, records, relatedNotes,
  isFavorite, toggleFavorite, visit, clearHistory, saveNote, remove, getDraft, setDraft, saveDraft, clearDraft,
  route, open, editNote, dateLabel, historyGroups, login, requireLogin, logout, synchronize, syncQuietly, uploadImage, submitFeedback, transcribe, dismissConflict,
  listComments, saveComment, deleteComment };
function route(ref, progress = {}) {
  if (!ref || !TYPES[ref.type]) throw new Error('关联内容不可用');
  const paths = {
    book: 'books/reader/reader',
    chapter: 'books/reader/reader',
    case: 'cases/detail/detail',
    prescription: 'prescriptions/detail/detail',
    meridian: 'meridians/detail/detail',
    acupoint: 'acupoints/detail/detail'
  };
  let url = `/pages/${paths[ref.type]}?id=${encodeURIComponent(ref.id)}`;
  if (ref.chapterId !== undefined) url += `&chapterId=${encodeURIComponent(ref.chapterId)}`;
  if (Number.isFinite(progress.scrollTop))
    url += `&resume=1&scrollTop=${progress.contentMode === 'shiyi' ? 0 : Math.max(0, Math.round(progress.scrollTop))}&contentMode=original`;
  return url;
}
function open(ref, progress) {
  wx.navigateTo({ url: route(ref, progress) });
}
async function editNote(ref, noteKey) {
  try { await requireLogin(); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); return; }
  let url = '/pages/notes/editor/editor';
  if (noteKey) url += `?key=${encodeURIComponent(noteKey)}`;
  else if (ref) url += `?ref=${encodeURIComponent(JSON.stringify(ref))}`;
  wx.navigateTo({ url });
}
function dateLabel(time) {
  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
function historyGroups(items, now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const groups = [];
  items.forEach((item) => {
    const date = new Date(item.updatedAt);
    const label =
      item.updatedAt >= midnight
        ? '今天'
        : item.updatedAt >= yesterday
          ? '昨天'
          : `${date.getFullYear()}年${dateLabel(item.updatedAt)}`;
    let group = groups.find((entry) => entry.label === label);
    if (!group) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push({
      ...item,
      sourceLabel: sourceLabel(item.ref),
      timeLabel: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    });
  });
  return groups;
}
