function hasCloud() {
  return Boolean(wx.cloud && wx.cloud.database);
}

async function queryCollection(collectionName, options = {}) {
  if (!hasCloud()) {
    return [];
  }

  const db = wx.cloud.database();
  const collection = db.collection(collectionName);
  let query = collection;

  if (options.where) {
    query = query.where(options.where);
  }

  if (options.orderBy) {
    query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'desc');
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const res = await query.get();
  return res.data || [];
}

async function searchCloud(keyword) {
  const value = String(keyword || '').trim();

  if (!value || !hasCloud()) {
    return [];
  }

  // 微信云数据库全文搜索需要后续按集合建立索引；这里先保留统一入口。
  return [];
}

module.exports = {
  queryCollection,
  searchCloud
};
