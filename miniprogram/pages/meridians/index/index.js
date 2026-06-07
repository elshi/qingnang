const { meridians } = require('../../../utils/sample-data');

const tabs = [{ key: 'overview', label: '概述' }, { key: 'meridians', label: '经脉' }, { key: 'acupoints', label: '腧穴' }];

function getAcupoints(items) {
  return items.reduce((result, meridian) => result.concat(meridian.acupoints.map((name) => ({
    key: `${meridian.id}-${name}`, name, meridianId: meridian.id, meridianTitle: meridian.title
  }))), []);
}

function filterItems(keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return meridians;
  return meridians.filter((item) => [item.title, item.summary, item.route, ...(item.alias || []), ...(item.acupoints || [])].join(' ').toLowerCase().includes(query));
}

Page({
  data: { tabs, activeTab: 'overview', keyword: '', showSearch: false, searchFocused: false, items: meridians, acupoints: getAcupoints(meridians) },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.key }); },
  focusSearch() { this.setData({ showSearch: true, searchFocused: true }); },
  onKeywordInput(event) {
    const keyword = event.detail.value;
    const items = filterItems(keyword);
    this.setData({ keyword, items, acupoints: getAcupoints(items) });
  },
  clearSearch() { this.setData({ keyword: '', items: meridians, acupoints: getAcupoints(meridians) }); },
  openDetail(event) { wx.navigateTo({ url: `/pages/meridians/detail/detail?id=${event.currentTarget.dataset.id}` }); }
});
