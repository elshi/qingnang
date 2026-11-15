const cloud = require('wx-server-sdk');
const validate = require('./validation');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const RECORDS = 'personal_records';
const FEEDBACK = 'personal_feedback';
async function existing(document) {
  try {
    const response = await document.get();
    return response.data || null;
  } catch (error) {
    if (/document.*(not exist|not found)|document.*不存在/i.test(error.message || error.errMsg || ''))
      return null;
    throw error;
  }
}
exports.main = async (event = {}) => {
  const context = cloud.getWXContext();
  if (!context.OPENID || !context.APPID) return { code: 401, message: '请在微信小程序内登录' };
  const owner = validate.identity(context.OPENID, context.APPID);
  try {
    if (event.action === 'login') return { code: 0, data: { id: owner } };
    if (event.action === 'push' || event.action === 'pull') {
      validate.requireValue(event.owner === owner, '账号已变更，请重新登录');
    }
    if (event.action === 'push') {
      validate.requireValue(Array.isArray(event.records) && event.records.length <= 5, '每次最多同步5条记录');
      const records = event.records.map((item) => validate.record(item, owner));
      for (const record of records) {
        await db.runTransaction(async (transaction) => {
          const doc = transaction.collection(RECORDS).doc(validate.documentId(owner, record.key));
          const previous = await existing(doc);
          if (!previous || previous.record.updatedAt < record.updatedAt) {
            await doc.set({ data: { owner, record } });
          }
        });
      }
      return { code: 0, data: { count: records.length } };
    }
    if (event.action === 'pull') {
      const cursor = event.cursor || '';
      validate.requireValue(
        typeof cursor === 'string' && (!cursor || /^[a-f0-9]{64}$/.test(cursor)),
        '分页参数无效'
      );
      const where = cursor ? { owner, _id: db.command.gt(cursor) } : { owner };
      const result = await db.collection(RECORDS).where(where).orderBy('_id', 'asc').limit(100).get();
      return {
        code: 0,
        data: {
          records: result.data.map((row) => row.record),
          cursor: result.data.length === 100 ? result.data[99]._id : ''
        }
      };
    }
    if (event.action === 'feedback') {
      const feedback = validate.feedback(event.feedback, owner);
      const id = validate.documentId(owner, 'feedback:' + feedback.id);
      await db.runTransaction(async (transaction) => {
        const doc = transaction.collection(FEEDBACK).doc(id);
        if (!(await existing(doc)))
          await doc.set({ data: { owner, feedback, status: 'new', createdAt: db.serverDate() } });
      });
      return { code: 0, data: { id } };
    }
    return { code: 400, message: '不支持的操作' };
  } catch (error) {
    // Never return database details, credentials, or another reader's records.
    return {
      code: error instanceof validate.InputError ? 422 : 503,
      message: error instanceof validate.InputError ? error.message : '云端服务暂不可用，请稍后重试'
    };
  }
};
