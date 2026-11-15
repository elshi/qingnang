const store = require('../../../utils/learning-store');
Page({
  data: { keyword: '', activeTab: 'all', tabs: store.FILTERS, groups: [], syncError: '' },
  onShow() {
    this.refresh();
    store
      .synchronize()
      .then(() => this.refresh())
      .catch(() => this.setData({ syncError: '云端暂未同步，当前显示本机记录' }));
  },
  refresh() {
    this.setData({
      groups: store.historyGroups(
        store.records('history').filter((item) => store.matches(item, this.data.keyword, this.data.activeTab))
      )
    });
  },
  onSearch(event) {
    this.setData({ keyword: event.detail.value });
    this.refresh();
  },
  clearSearch() {
    this.setData({ keyword: '' });
    this.refresh();
  },
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
    this.refresh();
  },
  openItem(event) {
    const item = store.records('history').find((row) => row.key === event.currentTarget.dataset.key);
    if (item) store.open(item.ref, item);
  },
  clear() {
    if (!store.records('history').length) return;
    wx.showModal({
      title: '清空历史记录',
      content: '将清空全部浏览记录，收藏与笔记不受影响。',
      confirmText: '清空',
      confirmColor: '#a77936',
      success: (result) => {
        if (!result.confirm) return;
        try {
          store.clearHistory();
          this.refresh();
          store.syncQuietly();
          wx.showToast({ title: '已清空', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      }
    });
  }
});
