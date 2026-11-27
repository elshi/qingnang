const { getMeridianAtlas, resolveAtlasItem } = require('../../../utils/meridians-api');

Page({
  data: { groups: [], group: null, loading: true, error: '' },
  onLoad(options = {}) {
    this.initialGroup = options.group || 'regular';
    this.deepLink = options.key || options.id;
    this.loadAtlas();
  },
  onShow() { this.opening = false; },
  onUnload() { this.catalogRequest = null; },
  async loadAtlas() {
    const token = {};
    this.catalogRequest = token;
    this.setData({ loading: true, error: '' });
    try {
      const { groups } = await getMeridianAtlas();
      if (this.catalogRequest !== token) return;
      if (!groups || !groups.length) throw new Error('经络图谱暂不可用');
      const linked = resolveAtlasItem(groups, this.deepLink);
      const group = linked ? linked.group : groups.find((g) => g.key === this.initialGroup) || groups[0];
      this.setData({ groups, group, loading: false });
      this.deepLink = '';
      if (linked) this.openMeridian(linked.item.id);
    } catch (err) {
      if (this.catalogRequest === token) this.setData({ loading: false, error: err.message || '目录加载失败' });
    }
  },
  selectTab(event) {
    const group = this.data.groups.find((g) => g.key === event.currentTarget.dataset.key);
    if (group && group !== this.data.group) this.setData({ group });
  },
  selectMeridian(event) {
    const id = event.detail.id;
    if (this.data.group && this.data.group.items.some((m) => m.id === id)) this.openMeridian(id);
  },
  openMeridian(id) {
    if (this.opening) return;
    this.opening = true;
    wx.navigateTo({ url: '/pages/meridians/detail/detail?id=' + encodeURIComponent(id),
      fail: () => { this.opening = false; wx.showToast({ title: '详情打开失败，请重试', icon: 'none' }); } });
  }
});

