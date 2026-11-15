const crypto = require('crypto');
const TYPES = ['book', 'chapter', 'case', 'prescription', 'meridian', 'acupoint'];
class InputError extends Error {}
function requireValue(condition, message) {
  if (!condition) throw new InputError(message);
}
function text(value, max, required = false) {
  requireValue(
    typeof value === 'string' && value.length <= max && (!required || value.trim()),
    '输入内容不符合要求'
  );
  return value;
}
function identity(openid, appid) {
  return crypto
    .createHash('sha256')
    .update(appid + ':' + openid)
    .digest('hex')
    .slice(0, 32);
}
function documentId(owner, key) {
  return crypto
    .createHash('sha256')
    .update(owner + ':' + key)
    .digest('hex');
}
function ownedFile(file, owner, directory) {
  text(file, 500, true);
  requireValue(
    file.startsWith('cloud://') &&
      file.includes('/personal/' + owner + '/' + directory + '/') &&
      !file.includes('..'),
    '文件不属于当前账号'
  );
  return file;
}
function reference(value) {
  requireValue(value && TYPES.includes(value.type), '原文类型无效');
  const ref = {
    type: value.type,
    id: text(value.id, 100, true),
    title: text(value.title, 200, true),
    source: text(value.source || '', 200)
  };
  if (value.type === 'chapter') ref.chapterId = text(String(value.chapterId || ''), 100, true);
  return ref;
}
function record(value, owner, now = Date.now()) {
  requireValue(value && ['favorite', 'note', 'history'].includes(value.kind), '记录类型无效');
  const key = text(value.key, 300, true);
  requireValue(key.startsWith(value.kind + ':'), '记录编号无效');
  requireValue(
    Number.isSafeInteger(value.updatedAt) && value.updatedAt > 0 && value.updatedAt <= now + 300000,
    '记录时间无效，请检查设备时间'
  );
  const result = { key, kind: value.kind, updatedAt: value.updatedAt, deleted: Boolean(value.deleted) };
  if (result.deleted) return result;
  result.title = text(value.title, value.kind === 'note' ? 80 : 200, true);
  result.ref = value.ref ? reference(value.ref) : null;
  if (value.kind === 'note') {
    result.content = text(value.content || '', 20000);
    requireValue(result.content.trim() || value.audio, '笔记内容不能为空');
    result.createdAt = Number.isSafeInteger(value.createdAt) ? value.createdAt : value.updatedAt;
    if (value.audio) {
      requireValue(
        Number.isFinite(value.audio.seconds) && value.audio.seconds > 0 && value.audio.seconds <= 61,
        '语音时长无效'
      );
      result.audio = { path: ownedFile(value.audio.path, owner, 'voice'), seconds: value.audio.seconds };
    } else result.audio = null;
  } else {
    requireValue(result.ref, '缺少关联原文');
    const expectedKey =
      value.kind +
      ':' +
      result.ref.type +
      ':' +
      result.ref.id +
      (result.ref.chapterId !== undefined ? ':' + result.ref.chapterId : '');
    requireValue(key === expectedKey, '原文编号与记录不匹配');
    if (value.kind === 'history') {
      result.scrollTop = Math.max(0, Math.min(10000000, Number(value.scrollTop) || 0));
      result.contentMode = value.contentMode === 'shiyi' ? 'shiyi' : 'original';
      result.progressLabel = text(value.progressLabel || '', 100);
    }
  }
  return result;
}
function feedback(value, owner) {
  requireValue(value && /^[a-z0-9-]{8,80}$/.test(value.id), '反馈编号无效');
  requireValue(['内容纠错', '功能异常', '产品建议', '其他'].includes(value.type), '请选择反馈类型');
  const content = text(value.content, 2000, true).trim();
  requireValue(content.length >= 5, '请填写至少5个字的问题描述');
  const contact = text(value.contact || '', 100).trim();
  requireValue(
    !contact || /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d ()-]{6,20})$/.test(contact),
    '联系方式格式不正确'
  );
  requireValue(Array.isArray(value.images) && value.images.length <= 3, '最多添加3张截图');
  return {
    id: value.id,
    type: value.type,
    content,
    contact,
    images: value.images.map((file) => ownedFile(file, owner, 'feedback'))
  };
}
module.exports = { InputError, requireValue, identity, documentId, record, feedback };
