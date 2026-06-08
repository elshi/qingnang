const { getCaseDetail } = require('../../../utils/cases-api');

const tabs = [
  { key: 'original', label: '原文' },
  { key: 'analysis', label: '解析' }
];

const prescriptionKeys = ['items', 'prescription', 'drugs', 'medicines', 'content'];
const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function isMedicine(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ('name' in value || 'dose' in value || 'note' in value);
}

function getMedicineList(value) {
  if (Array.isArray(value) && value.every(isMedicine)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  if (isMedicine(value)) return [value];

  for (const key of prescriptionKeys) {
    if (Array.isArray(value[key]) && value[key].every(isMedicine)) return value[key];
  }

  return [];
}

function normalizePrescriptionGroups(value) {
  if (Array.isArray(value)) {
    if (value.every(isMedicine)) return [value];
    return value.map(getMedicineList).filter((group) => group.length);
  }

  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value.prescriptions)) {
    return normalizePrescriptionGroups(value.prescriptions);
  }

  const direct = getMedicineList(value);
  if (direct.length) return [direct];

  return Object.keys(value)
    .map((key) => getMedicineList(value[key]))
    .filter((group) => group.length);
}

function parsePrescriptions(value) {
  if (!value) return [];

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      return [{
        key: 'prescription-0',
        title: '',
        rows: [{ key: 'medicine-0-0', displayName: value, dose: '' }]
      }];
    }
  }

  const groups = normalizePrescriptionGroups(parsed);
  const showTitles = groups.length > 1;

  return groups.map((group, groupIndex) => ({
    key: `prescription-${groupIndex}`,
    title: showTitles ? `处方${chineseNumbers[groupIndex] || groupIndex + 1}` : '',
    rows: group.map((medicine, medicineIndex) => {
      const name = String(medicine.name || '').trim();
      const note = String(medicine.note || '').trim();
      return {
        key: `medicine-${groupIndex}-${medicineIndex}`,
        displayName: note ? `${name}（${note}）` : name,
        dose: String(medicine.dose || '').trim()
      };
    })
  }));
}

function formatOriginalContent(value) {
  return String(value || '').split(/\r\n|\r|\n/).map((line, index) => ({
    key: `original-line-${index}`,
    text: line,
    empty: line.trim() === ''
  }));
}

Page({
  data: {
    tabs,
    activeTab: 'original',
    item: null,
    originalContentLines: [],
    prescriptions: [],
    loading: true,
    error: '',
    disclaimer: getApp().getDisclaimer()
  },

  onLoad(options) {
    this.caseId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.caseId) {
      this.setData({ loading: false, error: '医案 ID 无效' });
      return;
    }

    this.setData({ loading: true, error: '' });
    try {
      const item = await getCaseDetail(this.caseId);
      this.setData({
        item,
        originalContentLines: formatOriginalContent(item.content),
        prescriptions: parsePrescriptions(item.modern_prescription),
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '医案详情加载失败' });
    }
  },

  retry() {
    this.loadDetail();
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
  }
});
