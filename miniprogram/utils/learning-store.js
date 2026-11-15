// Local-first learning records. Drafts never leave this device.
const PREFIX = 'qingnang.learning.v1:';
const ACCOUNT_KEY = `${PREFIX}account`;
const TYPES = {
  book: '医书',
  chapter: '医书章节',
  case: '医案',
  prescription: '处方',
  meridian: '经络',
  acupoint: '穴位'
};
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'book', label: '医书' },
  { key: 'case', label: '医案' },
  { key: 'prescription', label: '处方' },
  { key: 'meridian', label: '经络' }
];
let syncTask = null;

function read(key, fallback) {
  const value = wx.getStorageSync(key);
  return value === '' || value === undefined || value === null ? fallback : value;
}
function account() {
  return read(ACCOUNT_KEY, null);
}
function scope() {
  const user = account();
  return user ? user.id : 'guest';
}
function keyFor(owner = scope()) {
  return PREFIX + owner;
}
function state(owner = scope()) {
  const value = read(keyFor(owner), {});
  return {
    records: Array.isArray(value.records) ? value.records : [],
    pending: Array.isArray(value.pending) ? value.pending : []
  };
}
function write(value, owner = scope()) {
  try {
    wx.setStorageSync(keyFor(owner), value);
  } catch (error) {
    throw new Error('本机存储空间不足，请清理空间后重试');
  }
}
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
function mutate(record) {
  const value = state();
  const previous = value.records.find((item) => item.key === record.key);
  const next = { ...record, updatedAt: Math.max(Date.now(), previous ? previous.updatedAt + 1 : 0) };
  value.records = [next, ...value.records.filter((item) => item.key !== next.key)];
  value.pending = [next, ...value.pending.filter((item) => item.key !== next.key)];
  write(value);
  return next;
}
function remove(kind, key) {
  return mutate({ key, kind, deleted: true });
}
function isFavorite(ref) {
  return Boolean(ref && records('favorite').some((item) => item.key === `favorite:${refKey(ref)}`));
}
function toggleFavorite(ref) {
  if (!ref) throw new Error('内容尚未加载');
  const key = `favorite:${refKey(ref)}`;
  if (isFavorite(ref)) {
    remove('favorite', key);
    return false;
  }
  mutate({ key, kind: 'favorite', ref, title: ref.title });
  return true;
}
function visit(ref, progress = {}) {
  if (!ref) return;
  // A reading session is never interrupted by an unavailable storage device.
  try {
    mutate({ key: `history:${refKey(ref)}`, kind: 'history', ref, title: ref.title, ...progress });
    const extra = records('history').slice(200);
    extra.forEach((item) => remove('history', item.key));
  } catch (error) {
    /* Nonessential history must not block reading. */
  }
}
function clearHistory() {
  const value = state();
  const now = Date.now();
  const removed = value.records
    .filter((item) => item.kind === 'history' && !item.deleted)
    .map((item) => ({
      key: item.key,
      kind: 'history',
      deleted: true,
      updatedAt: Math.max(now, item.updatedAt + 1)
    }));
  const keys = new Set(removed.map((item) => item.key));
  write({
    records: [...removed, ...value.records.filter((item) => !keys.has(item.key))],
    pending: [...removed, ...value.pending.filter((item) => !keys.has(item.key))]
  });
}
function saveNote(note) {
  const title = String(note.title || '').trim();
  const content = String(note.content || '').trim();
  if (!title) throw new Error('请填写笔记标题');
  if (!content && !note.audio) throw new Error('请填写笔记正文或添加语音');
  if (title.length > 80 || content.length > 20000) throw new Error('笔记内容超过长度限制');
  return mutate({
    key: note.key || `note:${id()}`,
    kind: 'note',
    title,
    content,
    ref: note.ref || null,
    audio: note.audio || null,
    createdAt: note.createdAt || Date.now()
  });
}
function draftKey(key = 'new') {
  return `${PREFIX}draft:${scope()}:${key}`;
}
function getDraft(key) {
  const draft = read(draftKey(key), null);
  if (!draft && (!key || key === 'new') && scope() === 'guest') {
    const legacy = read('noteDraft', '');
    if (typeof legacy === 'string' && legacy.trim()) return { title: '', content: legacy, ref: null };
  }
  return draft;
}
function setDraft(key, draft) {
  try {
    wx.setStorageSync(draftKey(key), draft);
  } catch (error) {
    throw new Error('草稿保存失败，请检查本机存储空间');
  }
}
function clearDraft(key) {
  wx.removeStorageSync(draftKey(key));
  if (!key || key === 'new') wx.removeStorageSync('noteDraft');
}
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
    url += `&resume=1&scrollTop=${Math.max(0, Math.round(progress.scrollTop))}&contentMode=${progress.contentMode === 'shiyi' ? 'shiyi' : 'original'}`;
  return url;
}
function open(ref, progress) {
  wx.navigateTo({ url: route(ref, progress) });
}
function editNote(ref, noteKey) {
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
async function cloud(action, data = {}) {
  if (!wx.cloud || !wx.cloud.callFunction) throw new Error('当前微信版本不支持云服务，请升级后重试');
  try {
    const response = await wx.cloud.callFunction({ name: 'personal', data: { action, ...data } });
    if (!response.result || response.result.code !== 0)
      throw new Error((response.result && response.result.message) || '云端服务暂不可用');
    return response.result.data;
  } catch (error) {
    if (
      /FUNCTION_NOT_FOUND|FUNCTION_NOT_EXIST|FunctionName|函数不存在/.test(
        error.errMsg || error.message || ''
      )
    )
      throw new Error('登录服务尚未开通，请稍后重试');
    throw new Error(error.message || '连接失败，请检查网络后重试');
  }
}
async function login() {
  const user = await cloud('login');
  if (!user || !/^[a-f0-9]{32}$/.test(user.id)) throw new Error('登录信息无效');
  const guest = state('guest');
  const target = state(user.id);
  // Copy guest records only after the server verifies the WeChat identity.
  guest.records
    .filter((item) => !item.deleted)
    .forEach((item) => {
      if (!target.records.some((entry) => entry.key === item.key)) {
        target.records.push(item);
        target.pending.push(item);
      }
    });
  write(target, user.id);
  wx.setStorageSync(ACCOUNT_KEY, user);
  write({ records: [], pending: [] }, 'guest');
  return user;
}
function logout() {
  wx.removeStorageSync(ACCOUNT_KEY);
}
async function synchronize() {
  const owner = scope();
  if (owner === 'guest') return;
  if (syncTask) {
    if (syncTask.owner === owner) return syncTask.promise;
    try {
      await syncTask.promise;
    } catch (error) {
      /* A different account can retry separately. */
    }
    if (scope() !== owner) return;
  }
  const task = { owner };
  syncTask = task;
  task.promise = (async () => {
    const pending = state(owner).pending.slice();
    for (let index = 0; index < pending.length; index += 5) {
      const batch = pending.slice(index, index + 5);
      const outgoing = [];
      for (const item of batch) {
        let next = item;
        if (item.audio && !item.deleted && !item.audio.path.startsWith('cloud://')) {
          const uploaded = await wx.cloud.uploadFile({
            cloudPath: `personal/${owner}/voice/${encodeURIComponent(item.key)}-${item.updatedAt}.mp3`,
            filePath: item.audio.path
          });
          next = { ...item, audio: { ...item.audio, path: uploaded.fileID, localPath: item.audio.path } };
          const current = state(owner);
          current.records = current.records.map((row) =>
            row.key === item.key && row.updatedAt === item.updatedAt ? next : row
          );
          current.pending = current.pending.map((row) =>
            row.key === item.key && row.updatedAt === item.updatedAt ? next : row
          );
          write(current, owner);
        }
        outgoing.push(
          next.audio ? { ...next, audio: { path: next.audio.path, seconds: next.audio.seconds } } : next
        );
      }
      await cloud('push', { records: outgoing, owner });
      const current = state(owner);
      current.pending = current.pending.filter(
        (item) => !batch.some((sent) => sent.key === item.key && sent.updatedAt === item.updatedAt)
      );
      write(current, owner);
    }
    const remote = [];
    let cursor = '';
    do {
      const page = await cloud('pull', { cursor, owner });
      remote.push(...page.records);
      cursor = page.cursor;
    } while (cursor);
    const current = state(owner);
    remote.forEach((item) => {
      if (current.pending.some((entry) => entry.key === item.key)) return;
      const local = current.records.find((entry) => entry.key === item.key);
      if (!local || local.updatedAt <= item.updatedAt) {
        const next =
          local && local.audio && item.audio && local.audio.path === item.audio.path
            ? { ...item, audio: { ...item.audio, localPath: local.audio.localPath } }
            : item;
        current.records = current.records.filter((entry) => entry.key !== item.key);
        current.records.push(next);
      }
    });
    write(current, owner);
    return current.pending.length;
  })();
  try {
    return await task.promise;
  } finally {
    if (syncTask === task) syncTask = null;
  }
}
function syncQuietly() {
  return synchronize().catch(() => {});
}
module.exports = {
  TYPES,
  FILTERS,
  account,
  scope,
  id,
  reference,
  refKey,
  category,
  sourceLabel,
  matches,
  records,
  isFavorite,
  toggleFavorite,
  visit,
  clearHistory,
  saveNote,
  remove,
  getDraft,
  setDraft,
  clearDraft,
  route,
  open,
  editNote,
  dateLabel,
  historyGroups,
  cloud,
  login,
  logout,
  synchronize,
  syncQuietly
};
