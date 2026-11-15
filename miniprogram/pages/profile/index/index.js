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
      this.setData({ syncMessage: pending ? '本机有新记录，点击继续同步' : '学习记录已同步' });
    } catch (error) {
      this.setData({ syncMessage: '已保存在本机，点击重试同步' });
    }
  },
  openPage(event) {
    wx.navigateTo({ url: '/pages/' + event.currentTarget.dataset.page + '/index/index' });
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
      success: (result) => {
        if (result.confirm) {
          store.logout();
          this.setData({ user: null, syncMessage: '', error: '' });
        }
      }
    });
  }
});
