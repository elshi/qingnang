// Resolve remote images through WeChat's native downloader, which shares the image cache.
function imagePath(url) {
  if (!wx.getImageInfo) return Promise.resolve(url);
  return new Promise((resolve,reject) => wx.getImageInfo({
    src: url, success: result => resolve(result.path), fail: reject
  }));
}

async function previewAtlas(plates, index) {
  if (!plates.length) return;
  const urls = [];
  let next = 0;
  async function worker() {
    while (next < plates.length) {
      const i = next++;
      urls[i] = await imagePath(plates[i].full_url);
    }
  }
  wx.showLoading && wx.showLoading({ title: '加载高清图', mask: true });
  try {
    await Promise.all(Array.from({length: Math.min(3, plates.length)}, worker));
    wx.previewImage({ current: urls[index], urls,
      fail: () => wx.showToast({ title: '原图打开失败，请重试', icon: 'none' }) });
  } catch (_) {
    wx.showToast({ title: '原图加载失败，请重试', icon: 'none' });
  } finally { wx.hideLoading && wx.hideLoading(); }
}

module.exports = { imagePath, previewAtlas };

