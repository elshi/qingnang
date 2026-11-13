const CLOUD_ENV = 'prod-d1gb975fz674ef15d';
const CLOUD_SERVICE = 'laravel-ld8m';
const LOCAL_API = 'http://127.0.0.1:8765';

function isDevelopmentSimulator() {
  return typeof wx.getDeviceInfo === 'function'
    && typeof wx.getAccountInfoSync === 'function'
    && wx.getDeviceInfo().platform === 'devtools'
    && wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
}

function request(options) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callContainer) {
      reject(new Error('当前微信版本不支持云托管请求'));
      return;
    }

    const requestOptions = {
      method: options.method || 'GET',
      data: options.data || {},
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300 && body.code === 0) {
          resolve(body.data);
          return;
        }
        const message = body.errorMsg
          || body.message
          || `请求失败（${response.statusCode || '未知状态'}）`;
        reject(new Error(message));
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络请求失败，请稍后重试'));
      }
    };

    wx.cloud.callContainer({
      ...requestOptions,
      config: { env: CLOUD_ENV },
      path: options.path,
      header: {
        'X-WX-SERVICE': CLOUD_SERVICE,
        ...(options.header || {})
      },
      success(response) {
        if (response.statusCode === 404 && !response.data?.errorMsg
          && requestOptions.method === 'GET' && options.path.startsWith('/api/')
          && isDevelopmentSimulator()) {
          wx.request({
            ...requestOptions,
            url: LOCAL_API + options.path,
            header: options.header
          });
          return;
        }
        requestOptions.success(response);
      }
    });
  });
}

module.exports = { request };
