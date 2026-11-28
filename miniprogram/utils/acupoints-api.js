const { request } = require('./request');
const { withPointPlate } = require('./legacy-atlas');

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

function getAcupoints(params = {}) {
  return catalogRequest(`/api/acupoints${queryString(params)}`);
}

async function getAcupointDetail(id) {
  return withPointPlate(await catalogRequest(`/api/acupoints/${encodeURIComponent(id)}`));
}

module.exports = { getAcupoints, getAcupointDetail };
