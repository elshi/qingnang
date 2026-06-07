const CLOUD_ENV = 'prod-d4gz10erk8e8f6306';
const CLOUD_SERVICE = 'laravel-v3db';

function request(options) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callContainer) {
      reject(new Error('当前微信版本不支持云托管请求'));
      return;
    }

    wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: options.path,
      header: {
        'X-WX-SERVICE': CLOUD_SERVICE,
        ...(options.header || {})
      },
      method: options.method || 'GET',
      data: options.data || {},
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300 && body.code === 0) {
          resolve(body.data);
          return;
        }
        reject(new Error(body.errorMsg || `请求失败（${response.statusCode || '未知状态'}）`));
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络请求失败，请稍后重试'));
      }
    });
  });
}

module.exports = { request };
