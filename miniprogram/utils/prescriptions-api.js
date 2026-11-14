const { request } = require('./request');

function prescriptionRequest(path) {
  return request({ path }).catch((error) => {
    if (/request:fail|callContainer:fail/i.test(error.message || '')) {
      throw new Error('网络连接失败，请检查网络后重试');
    }
    throw error;
  });
}

function getPrescriptions(params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
  return prescriptionRequest(`/api/prescriptions${query ? `?${query}` : ''}`);
}

function getPrescriptionDetail(id) {
  return prescriptionRequest(`/api/prescriptions/${encodeURIComponent(id)}`);
}

module.exports = { getPrescriptions, getPrescriptionDetail };
