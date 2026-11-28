const { request } = require('./request');
const { loadOverview, withMeridianPlates } = require('./legacy-atlas');

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

async function getMeridianDetail(id) {
  return withMeridianPlates(await catalogRequest(`/api/meridians/${encodeURIComponent(id)}`));
}

async function getMeridianAtlas() {
  try {
    return await catalogRequest('/api/meridian-atlas');
  } catch (error) {
    // A partially deployed atlas must not hide the still-available base catalog.
    const unavailable = error.status >= 500 && error.status < 600;
    if (!error.missingAtlasRoute && !unavailable) throw error;
    return loadOverview(getMeridians);
  }
}

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
