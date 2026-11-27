const { request } = require('./request');

function queryString(params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
  return query ? `?${query}` : '';
}

function catalogRequest(path) {
  return request({ path }).catch((error) => {
    if (/request:fail|callContainer:fail/i.test(error.message || '')) throw new Error('网络连接失败，请检查网络后重试');
    throw error;
  });
}

function getMeridians(params = {}) {
  return catalogRequest(`/api/meridians${queryString(params)}`);
}

function getMeridianDetail(id) {
  return catalogRequest(`/api/meridians/${encodeURIComponent(id)}`);
}

function getMeridianAtlas() { return catalogRequest('/api/meridian-atlas'); }

function resolveAtlasItem(groups, value) {
  const raw = String(value == null ? '' : value);
  const key = ({ 'meridian-001': 'du', 'meridian-002': 'ren' })[raw] || raw.replace(/^meridian-/, '');
  for (const group of groups) {
    const item = group.items.find((entry) => entry.key === key || String(entry.id) === key);
    if (item) return { group, item };
  }
  return null;
}

module.exports = { getMeridians, getMeridianDetail, getMeridianAtlas, resolveAtlasItem };
