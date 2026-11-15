const store = require('../../../utils/learning-store');
Page({
  data: { keyword: '', activeTab: 'all', tabs: store.FILTERS, items: [], syncError: '' },
  onShow() {
    this.refresh();
    store
      .synchronize()
      .then(() => this.refresh())
      .catch(() => this.setData({ syncError: '云端暂未同步，当前显示本机收藏' }));
  },
  refresh() {
    this.setData({
      items: store
        .records('favorite')
        .filter((item) => store.matches(item, this.data.keyword, this.data.activeTab))
        .map((item) => ({ ...item, sourceLabel: store.sourceLabel(item.ref) }))
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
    const item = this.data.items.find((row) => row.key === event.currentTarget.dataset.key);
    if (item) store.open(item.ref);
  },
  more(event) {
    const item = this.data.items.find((row) => row.key === event.currentTarget.dataset.key);
    if (!item) return;
    wx.showActionSheet({
      itemList: ['写笔记', '取消收藏'],
      success: (result) => {
        if (result.tapIndex === 0) store.editNote(item.ref);
        else
          wx.showModal({
            title: '取消收藏',
            content: '取消收藏“' + item.title + '”？',
            confirmColor: '#a77936',
            success: (answer) => {
              if (!answer.confirm) return;
              try {
                store.remove('favorite', item.key);
                this.refresh();
                store.syncQuietly();
              } catch (error) {
                wx.showToast({ title: error.message, icon: 'none' });
              }
            }
          });
      }
    });
  },
  browse() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
