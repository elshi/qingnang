Page({
  data: {
    disclaimer: getApp().getDisclaimer()
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 1 });
  }
});
