const { contentShare } = require('../../../utils/content-share');
const { getMeridianDetail } = require('../../../utils/meridians-api');
const { getAcupoints } = require('../../../utils/acupoints-api');
const { pointRowsFromPoints } = require('../../../utils/meridians');

const sectionDefinitions = [
  { key: 'indications', title: '主治' },
  { key: 'measured', title: '分寸歌' },
  { key: 'acupoints', title: '腧穴' }
];

Page({
  onShareAppMessage() { return contentShare('meridian', this.data.item); },
  data: {
    item: null, sections: [], meta: [], rows: [], pointTotal: 0,
    loading: true, error: '', pointsLoading: false, pointsError: '',
    disclaimer: getApp().getDisclaimer()
  },
  onLoad(options = {}) {
    this.meridianId = String(options.id === undefined ? '' : options.id);
    this.requestId = 0;
    this.loadDetail();
  },
  onUnload() { this.unloaded = true; this.requestId += 1; this.pointsRequest = null; },
  async loadDetail() {
    if (this.unloaded) return;
    if (!/^\d{1,10}$/.test(this.meridianId) || Number(this.meridianId) > 4294967295) {
      this.setData({ loading: false, error: '经络 ID 无效' });
      return;
    }
    const requestId = ++this.requestId;
    this.setData({ loading: true, error: '', item: null, sections: [], meta: [], rows: [] });
    try {
      const item = await getMeridianDetail(this.meridianId);
      if (requestId !== this.requestId || this.unloaded) return;
      const sections = sectionDefinitions
        .filter((section) => String(item[section.key] || '').trim())
        .map((section) => ({ ...section, content: item[section.key] }));
      const meta = [
        { key: 'classification', value: item.classification },
        { key: 'section', value: item.section },
        { key: 'abbreviation', value: item.abbreviation ? `简称 ${item.abbreviation}` : '' }
      ].filter((entry) => String(entry.value || '').trim());
      this.setData({ item, sections, meta, loading: false });
      this.loadPoints(item.title);
    } catch (error) {
      if (requestId !== this.requestId || this.unloaded) return;
      this.setData({ loading: false, error: error.message || '经络详情加载失败，请稍后重试' });
    }
  },
  async loadPoints(channel = this.data.item && this.data.item.title) {
    if (!channel || this.unloaded) return;
    const request = {};
    this.pointsRequest = request;
    this.setData({ pointsLoading: true, pointsError: '', rows: [], pointTotal: 0 });
    try {
      const data = await getAcupoints({ channel, page_size: 100 });
      if (request !== this.pointsRequest || this.unloaded) return;
      this.setData({ rows: pointRowsFromPoints(data.items || []), pointTotal: data.total || 0, pointsLoading: false });
    } catch (error) {
      if (request !== this.pointsRequest || this.unloaded) return;
      this.setData({ pointsLoading: false, pointsError: error.message || '穴位加载失败，请稍后重试' });
    }
  },
  retry() { this.loadDetail(); },
  retryPoints() { this.loadPoints(); },
  openAcupoint(event) {
    const id = event.currentTarget.dataset.id;
    if (id === undefined || id === null || id === '') return;
    wx.navigateTo({ url: `/pages/acupoints/detail/detail?id=${encodeURIComponent(id)}` });
  }
});
