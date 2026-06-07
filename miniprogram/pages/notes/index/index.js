Page({
  data: {
    draft: '',
    disclaimer: getApp().getDisclaimer()
  },

  onLoad() {
    this.setData({
      draft: wx.getStorageSync('noteDraft') || ''
    });
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 2 });
  },

  onDraftInput(event) {
    this.setData({
      draft: event.detail.value
    });
  },

  saveDraft() {
    wx.setStorageSync('noteDraft', this.data.draft);
    wx.showToast({
      title: '已保存',
      icon: 'success'
    });
  }
});
