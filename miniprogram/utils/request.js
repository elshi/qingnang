const cloudConfig = require('./cloud-config');
const LOCAL_API = 'http://127.0.0.1:8765';

function isDevelopmentSimulator() {
  return typeof wx.getDeviceInfo === 'function'
    && typeof wx.getAccountInfoSync === 'function'
    && wx.getDeviceInfo().platform === 'devtools'
    && wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
}

function request(options) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: options.method || 'GET',
      data: options.data || {},
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300 && body.code === 0) {
          resolve(body.data);
          return;
        }
        const loginRouteMissing = response.statusCode === 404 && options.path === '/api/personal/session'
          && requestOptions.method === 'POST';
        const message = loginRouteMissing ? '微信登录服务尚未更新（404），请先部署个人中心接口'
          : (body.errors && Object.values(body.errors)[0] && Object.values(body.errors)[0][0]) || body.errorMsg
            || body.message
            || `请求失败（${response.statusCode || '未知状态'}）`;
        const error = new Error(message);
        error.status = response.statusCode;
        error.data = body.data;
        reject(error);
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络请求失败，请稍后重试'));
      }
    };

    const atlasRead = requestOptions.method === 'GET'
      && /^\/api\/(meridian-atlas|meridians|acupoints)(\/|\?|$)/.test(options.path);
    if (atlasRead && isDevelopmentSimulator() && typeof wx.getStorageSync === 'function'
      && wx.getStorageSync('qingnang.atlas.local') === true) {
      wx.request({ ...requestOptions, url: 'https://localhost:8843' + options.path });
      return;
    }
    if (!wx.cloud || !wx.cloud.callContainer) {
      reject(new Error('当前微信版本不支持云托管请求'));
      return;
    }
    wx.cloud.callContainer({
      ...requestOptions,
      config: { env: cloudConfig.env },
      path: options.path,
      header: {
        'X-WX-SERVICE': cloudConfig.service,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.header || {})
      },
      success(response) {
        if (response.statusCode === 404 && !response.data?.errorMsg
          && requestOptions.method === 'GET' && options.path.startsWith('/api/') && !options.path.startsWith('/api/personal/')
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
