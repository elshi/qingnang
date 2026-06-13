const { getCases, getCaseFacets } = require('../../../utils/cases-api');

const PAGE_SIZE = 20;
const DOCTOR_CLOUD_ROOT = 'cloud://prod-d4gz10erk8e8f6306.7072-prod-d4gz10erk8e8f6306-1440550656/doctors';
const DEFAULT_DOCTOR_AVATAR = '/assets/cases/doctors/yu-jiayan.webp';
const initialBoundaries = [
  ['A', '阿'], ['B', '八'], ['C', '嚓'], ['D', '咑'], ['E', '妸'], ['F', '发'],
  ['G', '旮'], ['H', '哈'], ['J', '讥'], ['K', '咔'], ['L', '垃'], ['M', '妈'],
  ['N', '拿'], ['O', '噢'], ['P', '啪'], ['Q', '期'], ['R', '然'], ['S', '撒'],
  ['T', '塌'], ['W', '挖'], ['X', '昔'], ['Y', '压'], ['Z', '匝']
];

function getInitial(value) {
  const first = String(value || '').trim().charAt(0);
  if (!first) return '#';
  if (/[A-Za-z]/.test(first)) return first.toUpperCase();

  for (let index = initialBoundaries.length - 1; index >= 0; index -= 1) {
    if (first.localeCompare(initialBoundaries[index][1], 'zh-CN') >= 0) {
      return initialBoundaries[index][0];
    }
  }

  return '#';
}

function groupByInitial(items) {
  const groups = {};
  items.forEach((item) => {
    const initial = getInitial(item.name);
    if (!groups[initial]) groups[initial] = [];
    groups[initial].push(item);
  });

  return Object.keys(groups).sort().map((initial) => ({
    initial,
    id: `initial-${initial === '#' ? 'other' : initial}`,
    items: groups[initial]
  }));
}

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'doctor', label: '医家' },
      { key: 'source', label: '出处' }
    ],
    activeTab: 'all',
    keyword: '',
    total: 0,
    items: [],
    doctors: [],
    sources: [],
    doctorGroups: [],
    sourceGroups: [],
    entityScrollIntoView: '',
    facetLoading: false,
    facetError: '',
    filterLabel: '',
    selectedDoctor: '',
    selectedBook: '',
    page: 1,
    hasMore: true,
    loading: false,
    error: ''
  },

  onLoad() {
    this.loadFacets();
    this.loadCases(true);
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  },

  async loadFacets() {
    this.setData({ facetLoading: true, facetError: '' });
    try {
      const data = await getCaseFacets();
      const doctors = (data.doctors || []).map((item) => ({
          ...item,
          avatar: `${DOCTOR_CLOUD_ROOT}/${item.name}.webp`
        }));
      const sources = data.books || [];
      this.setData({
        doctors,
        sources,
        doctorGroups: groupByInitial(doctors),
        sourceGroups: groupByInitial(sources),
        facetLoading: false
      });
    } catch (error) {
      this.setData({
        facetLoading: false,
        facetError: error.message || '医案分类加载失败'
      });
    }
  },

  async loadCases(reset = false) {
    if ((!reset && this.data.loading) || (!reset && !this.data.hasMore)) return;

    const page = reset ? 1 : this.data.page;
    if (reset) this.caseRequestId = (this.caseRequestId || 0) + 1;
    const requestId = this.caseRequestId || 0;
    this.setData({ loading: true, error: reset ? '' : this.data.error });

    try {
      const data = await getCases({
        page,
        page_size: PAGE_SIZE,
        keyword: this.data.keyword.trim(),
        doctor: this.data.selectedDoctor,
        bookname: this.data.selectedBook
      });
      if (requestId !== (this.caseRequestId || 0)) return;
      const incoming = data.items || [];
      const items = reset ? incoming : this.mergeUnique(this.data.items, incoming);
      this.setData({
        items,
        page: page + 1,
        total: data.total || 0,
        hasMore: Boolean(data.has_more),
        loading: false,
        error: ''
      }, () => this.ensureListFilled());
    } catch (error) {
      if (requestId !== (this.caseRequestId || 0)) return;
      this.setData({ loading: false, error: error.message || '医案加载失败' });
    }
  },

  mergeUnique(current, incoming) {
    const ids = {};
    return current.concat(incoming).filter((item) => {
      if (ids[item.id]) return false;
      ids[item.id] = true;
      return true;
    });
  },

  selectTab(event) {
    const activeTab = event.currentTarget.dataset.key;
    this.setData({
      activeTab,
      entityScrollIntoView: ''
    });
  },

  onKeywordInput(event) {
    const keyword = event.detail.value;
    this.setData({ keyword });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadCases(true), 300);
  },

  clearKeyword() {
    this.setData({ keyword: '' }, () => this.loadCases(true));
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/cases/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  filterByDoctor(event) {
    const name = event.currentTarget.dataset.name;
    this.setData({
      activeTab: 'all',
      selectedDoctor: name,
      selectedBook: '',
      filterLabel: `医家：${name}`
    }, () => this.loadCases(true));
  },

  filterBySource(event) {
    const name = event.currentTarget.dataset.name;
    this.setData({
      activeTab: 'all',
      selectedDoctor: '',
      selectedBook: name,
      filterLabel: `出处：${name}`
    }, () => this.loadCases(true));
  },

  clearFilter() {
    this.setData({
      selectedDoctor: '',
      selectedBook: '',
      filterLabel: ''
    }, () => this.loadCases(true));
  },

  retry() {
    this.loadCases(this.data.items.length === 0);
  },

  retryFacets() {
    this.loadFacets();
  },

  onDoctorAvatarError(event) {
    const groupIndex = event.currentTarget.dataset.groupIndex;
    const itemIndex = event.currentTarget.dataset.itemIndex;
    const path = `doctorGroups[${groupIndex}].items[${itemIndex}].avatar`;
    if (this.data.doctorGroups[groupIndex]
      && this.data.doctorGroups[groupIndex].items[itemIndex]
      && this.data.doctorGroups[groupIndex].items[itemIndex].avatar !== DEFAULT_DOCTOR_AVATAR) {
      this.setData({ [path]: DEFAULT_DOCTOR_AVATAR });
    }
  },

  jumpToInitial(event) {
    const initial = event.currentTarget.dataset.initial;
    this.setData({ entityScrollIntoView: `initial-${initial === '#' ? 'other' : initial}` });
  },

  loadMore() {
    this.loadCases(false);
  },

  ensureListFilled() {
    if (this.data.activeTab !== 'all' || this.data.loading || !this.data.hasMore) return;

    const query = this.createSelectorQuery();
    query.select('.case-scroll').boundingClientRect();
    query.select('.case-scroll').scrollOffset();
    query.exec((results) => {
      const viewport = results && results[0];
      const scroll = results && results[1];
      if (viewport && scroll && scroll.scrollHeight <= viewport.height + 100) {
        this.loadCases(false);
      }
    });
  }
});
