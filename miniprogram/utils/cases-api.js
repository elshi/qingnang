const { request } = require('./request');

function compactParams(params) {
  return Object.keys(params || {}).reduce((result, key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') result[key] = value;
    return result;
  }, {});
}

function queryString(params) {
  const values = compactParams(params);
  const query = Object.keys(values)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(values[key])}`)
    .join('&');
  return query ? `?${query}` : '';
}

function getCases(params) {
  return request({ path: `/api/cases${queryString(params)}` });
}

function getCaseFacets() {
  return request({ path: '/api/cases/facets' });
}

function getCaseDetail(id) {
  return request({ path: `/api/cases/${id}` });
}

module.exports = { getCases, getCaseFacets, getCaseDetail };
