const { contentShare } = require('../../../utils/content-share');
const { getMeridianDetail, getMeridianAtlas, resolveAtlasItem } = require('../../../utils/meridians-api');
const { getAcupoints } = require('../../../utils/acupoints-api');
const { pointRowsFromPoints } = require('../../../utils/meridians');
const { imagePath, previewAtlas } = require('../../../utils/atlas-images');

Page({
  onShareAppMessage() { return contentShare('meridian', this.data.item); },
  data: {
    item: null, sections: [], plates: [], activePlate: 0, rows: [], pointTotal: 0,
    loading: true, error: '', pointsLoading: false, pointsError: '',
    disclaimer: getApp().getDisclaimer()
  },
  onLoad(options = {}) {
    this.meridianId = String(options.id === undefined ? '' : options.id);
    this.loadDetail();
  },
  onUnload() { this.unloaded = true; this.detailRequest = null; this.pointsRequest = null; },
  async loadDetail() {
    const historic = /^meridian-[a-z0-9-]{1,32}$/.test(this.meridianId);
    if (!historic && (!/^\d{1,10}$/.test(this.meridianId) || Number(this.meridianId) > 4294967295)) {
      this.setData({ loading: false, error: '经络 ID 无效' });
      return;
    }
    const token = {};
    this.detailRequest = token;
    this.pointsRequest = null;
    this.setData({ loading: true, error: '', pointsError: '' });
    try {
      if (historic) {
        const { groups } = await getMeridianAtlas();
        if (this.detailRequest !== token) return;
        const linked = resolveAtlasItem(groups, this.meridianId);
        if (!linked) throw new Error('未找到该经络');
        this.meridianId = String(linked.item.id);
      }
      const item = await getMeridianDetail(this.meridianId);
      if (this.detailRequest !== token) return;
      const sections = (item.sections || []).map((s) => ({ title: s.title, source: s.source, content: s.text }));
      const legacy = [['indications','主治'], ['measured','分寸歌']];
      if (!item.related_points) legacy.push(['acupoints','腧穴']);
      legacy.forEach(([field,title]) => {
        if (item[field] && item[field].trim()) sections.push({ title, content: item[field] });
      });
      const plates = item.plates || [];
      const points = item.related_points || [];
      this.setData({ item, sections, plates, activePlate: plates.length > 1 ? 1 : 0, loading: false,
        rows: pointRowsFromPoints(points), pointTotal: points.length });
      if (!Array.isArray(item.related_points)) this.loadPoints();
      this.loadVisiblePlates();
    } catch (error) {
      if (this.detailRequest === token) this.setData({ loading: false, error: error.message || '经络详情加载失败' });
    }
  },
  async loadPoints() {
    const token = {};
    this.pointsRequest = token;
    this.setData({ pointsLoading: true, pointsError: '' });
    try {
      const data = await getAcupoints({ channel: this.data.item.title, page_size: 100 });
      if (this.pointsRequest !== token) return;
      this.setData({ rows: pointRowsFromPoints(data.items || []), pointTotal: data.total || 0, pointsLoading: false });
    } catch (error) {
      if (this.pointsRequest === token) this.setData({ pointsLoading: false, pointsError: error.message || '穴位加载失败' });
    }
  },
  choosePlate(event) {
    this.setData({ activePlate: Number(event.currentTarget.dataset.index) });
    this.loadVisiblePlates();
  },
  loadVisiblePlates() {
    const index = this.data.activePlate;
    this.loadPlate(index);
    if (index === 1 && this.data.item.atlas_key === 'lung') this.loadPlate(2);
  },
  async loadPlate(index) {
    const plate = this.data.plates[index];
    if (!plate || plate.src && !plate.failed) return;
    const token = this.detailRequest;
    try {
      const src = await imagePath(plate.preview_url);
      if (this.detailRequest === token) this.setData({ ['plates['+index+'].src']: src, ['plates['+index+'].failed']: false });
    } catch (_) {
      if (this.detailRequest === token) this.setData({ ['plates['+index+'].failed']: true });
    }
  },
  previewPlate(event) {
    const index = event ? event.currentTarget.dataset.index : undefined;
    return previewAtlas(this.data.plates, index === undefined ? this.data.activePlate : index);
  },
  imageError(event) {
    const index = this.data.plates.findIndex(p => p.preview_url === event.currentTarget.dataset.url);
    if (index < 0) return;
    if (this.data.plates[index].preview_url === event.currentTarget.dataset.url) this.setData({ ['plates[' + index + '].failed']: true });
  },
  retryImage() { this.loadVisiblePlates(); },
  openAcupoint(event) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined && id !== null && id !== '') wx.navigateTo({ url: '/pages/acupoints/detail/detail?id=' + encodeURIComponent(id) });
  }
});

