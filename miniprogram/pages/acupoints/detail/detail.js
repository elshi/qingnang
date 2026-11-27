const { contentShare } = require('../../../utils/content-share');
const { getAcupointDetail } = require('../../../utils/acupoints-api');
const { createLocationDiagram } = require('../../../utils/acupoint-location');
const { imagePath, previewAtlas } = require('../../../utils/atlas-images');

const sectionDefinitions = [
  { key: 'alias', title: '别名' },
  { key: 'adscription', title: '归属' },
  { key: 'indications', title: '主治' },
  { key: 'locate', title: '定位' },
  { key: 'acupoints', title: '取穴' },
  { key: 'acupuncture', title: '刺灸法' },
  { key: 'precautions', title: '注意事项' },
  { key: 'points', title: '配穴' },
  { key: 'notes', title: '附注' }
];

Page({
  onShareAppMessage() { return contentShare('acupoint', this.data.item); },
  data: {
    item: null, sections: [], meta: [], locationDiagram: null, locationImage: '',
    loading: true, error: '', disclaimer: getApp().getDisclaimer()
  },
  onLoad(options = {}) {
    this.acupointId = String(options.id === undefined ? '' : options.id);
    this.requestId = 0;
    this.loadDetail();
  },
  onUnload() { this.unloaded = true; this.requestId += 1; },
  async loadDetail() {
    if (this.unloaded) return;
    if (!/^\d{1,10}$/.test(this.acupointId) || Number(this.acupointId) > 4294967295) {
      this.setData({ loading: false, error: '穴位 ID 无效' });
      return;
    }
    const requestId = ++this.requestId;
    this.setData({ loading: true, error: '', item: null, sections: [], meta: [], locationDiagram: null, locationImage: '' });
    try {
      const item = await getAcupointDetail(this.acupointId);
      if (requestId !== this.requestId || this.unloaded) return;
      const locationDiagram = createLocationDiagram(item);
      let locationImage = item.location_image || '';
      this.atlasImagePath = '';
      if (item.atlas_plate) {
        try { this.atlasImagePath = await imagePath(item.atlas_plate.preview_url); } catch (_) { /* Use the existing location illustration. */ }
        if (requestId !== this.requestId || this.unloaded) return;
        locationImage = this.atlasImagePath || locationImage;
      }
      const sections = sectionDefinitions
        .filter((section) => String(item[section.key] || '').trim() || (section.key === 'locate' && (locationDiagram || locationImage)))
        .map((section) => ({ ...section, content: item[section.key] }));
      const meta = [
        item.meridian || item.pulse,
        item.position,
        item.fivepoint,
        item.specificpoint,
        item.five ? `五行 ${item.five}` : '',
        item.abbreviation ? `简称 ${item.abbreviation}` : ''
      ].filter((value) => String(value || '').trim()).map((value, index) => ({ key: index, value }));
      this.setData({ item, sections, meta, locationDiagram, locationImage, loading: false });
    } catch (error) {
      if (requestId !== this.requestId || this.unloaded) return;
      this.setData({ loading: false, error: error.message || '穴位详情加载失败，请稍后重试' });
    }
  },
  previewLocationImage() {
    const plate = this.data.item && this.data.item.atlas_plate;
    if (plate && this.data.locationImage === this.atlasImagePath) return previewAtlas([plate], 0);
    const url = this.data.locationImage;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },
  onLocationImageError(event) {
    if (event.currentTarget.dataset.url === this.data.locationImage) {
      const legacy = this.data.item.location_image;
      this.setData({ locationImage: legacy && legacy !== this.data.locationImage ? legacy : '' });
    }
  },
  retry() { this.loadDetail(); }
});
