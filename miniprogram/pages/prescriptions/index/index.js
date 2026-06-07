const { prescriptions } = require('../../../utils/sample-data');

function searchItems(keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return prescriptions;
  return prescriptions.filter((item) => [
    item.title, item.source, item.summary, item.composition, item.efficacy, ...(item.tags || [])
  ].join(' ').toLowerCase().includes(query));
}

Page({
  data: { keyword: '', items: prescriptions },
  onKeywordInput(event) {
    const keyword = event.detail.value;
    this.setData({ keyword, items: searchItems(keyword) });
  },
  clearSearch() {
    this.setData({ keyword: '', items: prescriptions });
  },
  openDetail(event) {
    wx.navigateTo({ url: `/pages/prescriptions/detail/detail?id=${event.currentTarget.dataset.id}` });
  }
});
