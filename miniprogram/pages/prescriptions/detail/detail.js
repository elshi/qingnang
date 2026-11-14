const { getPrescriptionDetail } = require('../../../utils/prescriptions-api');
const sections = [
  { key: 'modern_dose', title: '现代剂量' },
  { key: 'decoction', title: '煎服法' },
  { key: 'indications', title: '主治' },
  { key: 'explanation', title: '方义方解' }
];

Page({
  data: { item: null, sections: [], loading: true, error: '', disclaimer: getApp().getDisclaimer() },
  onLoad(options = {}) {
    this.prescriptionId = String(options.id === undefined ? '' : options.id);
    this.requestId = 0;
    this.loadDetail();
  },
  onUnload() { this.requestId += 1; this.unloaded = true; },
  async loadDetail() {
    if (this.unloaded) return;
    if (!/^\d{1,10}$/.test(this.prescriptionId) || Number(this.prescriptionId) > 4294967295) {
      this.setData({ loading: false, error: '处方 ID 无效' });
      return;
    }
    const requestId = ++this.requestId;
    this.setData({ loading: true, error: '' });
    try {
      const item = await getPrescriptionDetail(this.prescriptionId);
      if (requestId !== this.requestId || this.unloaded) return;
      this.setData({ item, sections: sections.filter((section) => String(item[section.key] || '').trim()).map((section) => ({ ...section, content: item[section.key] })), loading: false });
    } catch (error) {
      if (requestId !== this.requestId || this.unloaded) return;
      this.setData({ loading: false, error: error.message || '处方详情加载失败，请稍后重试' });
    }
  },
  retry() { this.loadDetail(); }
});
