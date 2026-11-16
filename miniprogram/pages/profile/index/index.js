const store = require('../../../utils/learning-store');
Page({
  data: { user: null, busy: false, syncMessage: '', error: '' },
  onShow() {
    const bar = this.getTabBar && this.getTabBar();
    if (bar) bar.setData({ selected: 1 });
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
    this.setData({ syncMessage: '正在同步学习记录…' });
    try {
      const pending = await store.synchronize();
      this.setData({ user: store.account(), syncMessage: pending ? '有待处理的恢复副本，请打开笔记核对' : '学习记录已保存到云端', error: '' });
    } catch (error) {
      this.setData({ user: store.account(), syncMessage: '连接云端失败，点击重试', error: error.message });
    }
  },
  async openPage(event) {
    try {
      await store.requireLogin();
      wx.navigateTo({ url: '/pages/' + event.currentTarget.dataset.page + '/index/index' });
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
            this.setData({ user: null, syncMessage: '', error: '' });
          } catch (error) { this.setData({ error: error.message }); }
        }
      }
    });
  }
});
