const store = require('../../../utils/learning-store');
Page({
  data: { user: null, busy: false, syncFailed: false, error: '' },
  onShow() {
    const bar = this.getTabBar && this.getTabBar();
    if (bar) bar.setData({ selected: 2 });
    this.setData({ user: store.account() });
    if (this.data.user) this.sync();
  },
  async login() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const user = await store.login();
      this.setData({ user });
      await this.sync();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async sync() {
    this.setData({ syncFailed: false });
    try {
      const pending = await store.synchronize();
      this.setData({ user: store.account(), error: pending ? '有待处理的恢复副本，请打开笔记核对' : '' });
    } catch (error) {
      this.setData({ user: store.account(), syncFailed: true, error: error.message });
    }
  },
  async openPage(event) {
    try {
      await store.requireLogin();
      const page = event.currentTarget.dataset.page;
      if (page === 'notes') wx.switchTab({ url: '/pages/notes/index/index' });
      else wx.navigateTo({ url: '/pages/' + page + '/index/index' });
    } catch (error) { this.setData({ error: error.message }); }
  },
  openPrivacy() {
    wx.navigateTo({ url: '/pages/profile/privacy/privacy' });
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '此账号的学习记录会保留，下次登录后可继续查看。',
      confirmText: '退出登录',
      confirmColor: '#a77936',
      success: async (result) => {
        if (result.confirm) {
          try {
            await store.logout();
            this.setData({ user: null, syncFailed: false, error: '' });
          } catch (error) { this.setData({ error: error.message }); }
        }
      }
    });
  }
});
