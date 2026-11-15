const { findMeridian, getGroup, pointRowsFromPoints } = require('../../../utils/meridians');
const { getMeridians } = require('../../../utils/meridians-api');
const { getAcupoints } = require('../../../utils/acupoints-api');
const first = getGroup('regular')[0];
Page({
  data: {
    tabs: [{ key: 'regular', label: '十二正经' }, { key: 'extraordinary', label: '奇经八脉' }],
    activeTab: 'regular', selected: first, rows: [], pointTotal: 0,
    pointsLoading: true, pointsError: '', meridianLoading: true, meridianError: '',
    detailReady: false, selectedDbId: null
  },
  onLoad(options) {
    this.unloaded = false;
    this.meridianIds = {};
    this.selectedByGroup = { regular: first.key, extraordinary: 'ren' };
    const item = findMeridian(options.id || options.key);
    if (item) { this.selectedByGroup[item.group] = item.key; this.showMeridian(item); }
    else if (options.group === 'extraordinary') this.showMeridian(findMeridian('ren'));
    else this.loadPoints(first);
    this.loadMeridianCatalog();
  },
  onUnload() { this.unloaded = true; this.catalogRequest = null; this.pointsRequest = null; },
  async loadMeridianCatalog() {
    const request = {};
    this.catalogRequest = request;
    this.setData({ meridianLoading: true, meridianError: '' });
    try {
      const data = await getMeridians({ page_size: 50 });
      if (request !== this.catalogRequest || this.unloaded) return;
      this.meridianIds = (data.items || []).reduce((map, item) => {
        map[item.title] = item.id;
        return map;
      }, {});
      this.catalogLoaded = true;
      const selectedDbId = Object.prototype.hasOwnProperty.call(this.meridianIds, this.data.selected.title)
        ? this.meridianIds[this.data.selected.title] : null;
      this.setData({
        meridianLoading: false,
        meridianError: selectedDbId === null ? '未找到该经络的数据库记录' : '',
        selectedDbId,
        detailReady: selectedDbId !== null
      });
    } catch (error) {
      if (request !== this.catalogRequest || this.unloaded) return;
      this.catalogLoaded = false;
      this.setData({ meridianLoading: false, meridianError: error.message || '经络目录加载失败', selectedDbId: null, detailReady: false });
    }
  },
  selectTab(event) {
    const group = event.currentTarget.dataset.key;
    if (!['regular', 'extraordinary'].includes(group) || group === this.data.activeTab) return;
    this.showMeridian(findMeridian(this.selectedByGroup[group]));
  },
  selectMeridian(event) {
    const key = (event.detail && event.detail.key) || (event.currentTarget && event.currentTarget.dataset.key);
    const item = findMeridian(key);
    if (!item || item.group !== this.data.activeTab) return;
    this.selectedByGroup[item.group] = item.key;
    this.showMeridian(item);
  },
  showMeridian(item) {
    const selectedDbId = Object.prototype.hasOwnProperty.call(this.meridianIds, item.title) ? this.meridianIds[item.title] : null;
    this.setData({
      activeTab: item.group,
      selected: item,
      selectedDbId,
      detailReady: selectedDbId !== null,
      meridianError: this.catalogLoaded && selectedDbId === null ? '未找到该经络的数据库记录' : (selectedDbId !== null ? '' : this.data.meridianError)
    });
    this.loadPoints(item);
  },
  async loadPoints(item = this.data.selected) {
    const request = {};
    this.pointsRequest = request;
    this.setData({ rows: [], pointTotal: 0, pointsLoading: true, pointsError: '' });
    try {
      const data = await getAcupoints({ channel: item.title, page_size: 100 });
      if (request !== this.pointsRequest || this.unloaded || item.key !== this.data.selected.key) return;
      this.setData({ rows: pointRowsFromPoints(data.items || []), pointTotal: data.total || 0, pointsLoading: false });
    } catch (error) {
      if (request !== this.pointsRequest || this.unloaded || item.key !== this.data.selected.key) return;
      this.setData({ pointsLoading: false, pointsError: error.message || '穴位加载失败，请稍后重试' });
    }
  },
  retryMeridians() { this.loadMeridianCatalog(); },
  retryPoints() { this.loadPoints(); },
  openDetail() {
    if (!this.data.detailReady) return;
    wx.navigateTo({ url: `/pages/meridians/detail/detail?id=${encodeURIComponent(this.data.selectedDbId)}` });
  },
  openAcupoint(event) {
    const id = event.currentTarget.dataset.id;
    if (id === undefined || id === null || id === '') return;
    wx.navigateTo({ url: `/pages/acupoints/detail/detail?id=${encodeURIComponent(id)}` });
  }
});
