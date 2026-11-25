const { getBooks } = require('../../utils/books-api');
const { getCases } = require('../../utils/cases-api');
const { getPrescriptions } = require('../../utils/prescriptions-api');
const { getMeridians } = require('../../utils/meridians-api');
const { getAcupoints } = require('../../utils/acupoints-api');
const { typeTextMap, routeMap } = require('../../utils/search');
const store = require('../../utils/learning-store');

const bookListUrl = '/pages/books/index/index';
const caseListUrl = '/pages/cases/index/index';
const featuredCaseQueries = [
  { doctor: '张仲景', keyword: '霍乱', portrait: 'zhang-zhongjing' },
  { doctor: '吴鞠通', keyword: '暑温', portrait: 'wu-jutong' },
  { doctor: '叶天士', keyword: '咳嗽', bookname: '临证指南医案', portrait: 'ye-tianshi' }
];
const prescriptionThumbnails = new Map([
  ['桂枝汤', 'gui-zhi-tang'],
  ['四君子汤', 'si-jun-zi-tang'],
  ['逍遥散', 'xiao-yao-san'],
  ['度瘴散', 'du-zhang-san'],
  ['发汗神丹丸', 'fa-han-shen-dan-wan'],
  ['葛根汤', 'ge-gen-tang'],
  ['桃核承气汤', 'tao-he-cheng-qi-tang'],
  ['旋覆代赭汤', 'xuan-fu-dai-zhe-tang'],
  ['竹叶石膏汤', 'zhu-ye-shi-gao-tang']
]);

function featuredThumbnail(name) {
  return `/assets/home/featured/${name}.webp`;
}

function searchResult(item, type, title) {
  return {
    id: item.id,
    key: `${type}-${item.id}`,
    typeText: typeTextMap[type],
    route: routeMap[type],
    title,
    summary: item.summary
  };
}

Page({
  data: {
    statusBarHeight: 24,
    navHeight: 44,
    bookListUrl,
    caseListUrl,
    entries: [
      { title: '医书', icon: 'book', url: bookListUrl },
      { title: '医案', icon: 'case', url: caseListUrl },
      { title: '经方', icon: 'formula', url: '/pages/prescriptions/index/index' },
      { title: '经络', icon: 'meridian', url: '/pages/meridians/index/index' }
    ],
    shelf: [
      { name: '黄帝内经', author: '佚名', subject: '中医理论', cover: '/assets/home/library/neijing.png' },
      { name: '伤寒论', author: '张仲景', subject: '辨证论治', cover: '/assets/home/library/shanghan.png' },
      { name: '金匮要略', author: '张仲景', subject: '杂病经典', cover: '/assets/home/library/jingui.png' },
      { name: '温病条辨', author: '吴鞠通', subject: '温病学说', cover: '/assets/home/library/wenbing.png' }
    ],
    featuredCases: [],
    featuredPrescriptions: [],
    prescriptionsLoading: true,
    prescriptionsFailed: false,
    casesLoading: true,
    casesFailed: false,
    keyword: '',
    isSearching: false,
    searchResults: [],
    searchLoading: false,
    searchFailed: false,
    hasMoreCases: false,
    hasMorePrescriptions: false
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const capsule = wx.getMenuButtonBoundingClientRect();
    const navHeight = Math.max(44, (capsule.top - statusBarHeight) * 2 + capsule.height);
    this.setData({ statusBarHeight, navHeight });
    this.loadFeaturedCases();
    this.loadFeaturedPrescriptions();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0 });
    store.syncQuietly();
  },

  onUnload() {
    clearTimeout(this.searchTimer);
    this.searchRequest = null;
    this.caseRequest = null;
    this.prescriptionRequest = null;
  },

  async loadFeaturedCases() {
    const request = {};
    this.caseRequest = request;
    this.setData({ casesLoading: true, casesFailed: false });
    const results = await Promise.all(featuredCaseQueries.map(async ({ portrait, ...query }) => {
      try {
        let data = await getCases({ ...query, page_size: 1 });
        if (!data.items.length) data = await getCases({ doctor: query.doctor, page_size: 1 });
        return { item: data.items[0], portrait, failed: false };
      } catch (error) {
        return { failed: true };
      }
    }));
    if (request !== this.caseRequest) return;
    const seen = new Set();
    const featuredCases = results.filter(({ item }) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).map(({ item, portrait }) => ({
      id: item.id,
      thumbnail: featuredThumbnail(portrait),
      title: item.title,
      source: item.source || item.bookname || '',
      excerpt: item.content_preview || item.summary || ''
    }));
    this.setData({ featuredCases, casesLoading: false, casesFailed: results.some((result) => result.failed) });
  },

  async loadFeaturedPrescriptions() {
    const request = this.prescriptionRequest = {};
    this.setData({ prescriptionsLoading: true, prescriptionsFailed: false });
    try {
      const data = await getPrescriptions({ page_size: 3 });
      if (request !== this.prescriptionRequest) return;
      const featuredPrescriptions = data.items.slice(0, 3).map(item => {
        const image = prescriptionThumbnails.get(item.title);
        return { ...item, thumbnail: image ? featuredThumbnail(image) : '/assets/home/mortar.jpg' };
      });
      this.setData({ featuredPrescriptions, prescriptionsLoading: false });
    } catch (error) {
      if (request === this.prescriptionRequest) this.setData({ prescriptionsLoading: false, prescriptionsFailed: true });
    }
  },

  openPrescription(event) {
    wx.navigateTo({ url: `${routeMap.prescription}?id=${encodeURIComponent(event.currentTarget.dataset.id)}` });
  },

  openCase(event) {
    wx.navigateTo({ url: `${routeMap.case}?id=${encodeURIComponent(event.currentTarget.dataset.id)}` });
  },

  loadBookCatalog() {
    // Share the same complete catalog as the books page. The deployed keyword
    // endpoint still references a legacy initial-letter field absent in the DB.
    if (!this.bookCatalogRequest) {
      this.bookCatalogRequest = getBooks().catch((error) => {
        this.bookCatalogRequest = null;
        throw error;
      });
    }
    return this.bookCatalogRequest;
  },

  onKeywordInput(event) {
    this.updateSearch(event.detail.value);
  },

  clearSearch() {
    this.updateSearch('');
  },

  retrySearch() {
    this.updateSearch(this.data.keyword);
  },

  updateSearch(keyword) {
    clearTimeout(this.searchTimer);
    const query = keyword.trim();
    const request = {};
    this.searchRequest = request;

    this.setData({
      keyword,
      isSearching: Boolean(query),
      searchResults: [],
      searchLoading: Boolean(query),
      searchFailed: false,
      hasMoreCases: false,
      hasMorePrescriptions: false
    });

    if (query) {
      this.searchTimer = setTimeout(() => this.searchLibrary(query, request), 280);
    }
  },

  async searchLibrary(keyword, request) {
    const [books, cases, prescriptions, meridians, acupoints] = await Promise.all([
      this.loadBookCatalog().catch(() => null),
      getCases({ keyword, page_size: 20 }).catch(() => null),
      getPrescriptions({ keyword, page_size: 20 }).catch(() => null),
      getMeridians({ keyword, page_size: 50 }).catch(() => null),
      getAcupoints({ keyword, page_size: 20 }).catch(() => null)
    ]);
    if (request !== this.searchRequest) return;

    const query = keyword.toLowerCase();
    const bookResults = books ? books.items
      .filter((item) => [item.name, item.author, item.summary]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      .map((item) => searchResult(item, 'book', item.name)) : [];
    const caseResults = cases ? cases.items.map((item) => searchResult(item, 'case', item.title)) : [];
    const prescriptionResults = prescriptions ? prescriptions.items.map((item) => searchResult(item, 'prescription', item.title)) : [];
    const meridianResults = meridians ? meridians.items.map((item) => searchResult(item, 'meridian', item.title)) : [];
    const acupointResults = acupoints ? acupoints.items.map((item) => searchResult(item, 'acupoint', item.title)) : [];
    this.setData({
      searchResults: [...bookResults, ...caseResults, ...prescriptionResults, ...meridianResults, ...acupointResults],
      searchLoading: false,
      searchFailed: !books || !cases || !prescriptions || !meridians || !acupoints,
      hasMoreCases: Boolean(cases && cases.has_more),
      hasMorePrescriptions: Boolean(prescriptions && prescriptions.has_more)
    });
  },

  openSearchResult(event) {
    const { id, route } = event.currentTarget.dataset;
    wx.navigateTo({ url: `${route}?id=${encodeURIComponent(id)}` });
  },

  openMoreCases() {
    wx.navigateTo({ url: `${caseListUrl}?keyword=${encodeURIComponent(this.data.keyword.trim())}` });
  },

  openMorePrescriptions() {
    wx.navigateTo({ url: `/pages/prescriptions/index/index?keyword=${encodeURIComponent(this.data.keyword.trim())}` });
  },

  async openBook(event) {
    if (this.openingBook) return;
    const { name, chapterTitle } = event.currentTarget.dataset;
    this.openingBook = true;
    wx.showLoading({ title: '正在打开', mask: true });

    let book;
    let errorMessage = '暂未找到这本医书';
    try {
      const { items } = await this.loadBookCatalog();
      if (name === '黄帝内经') {
        book = items.find((item) => /^黄帝内经[·\s]*素问$/.test(item.name.trim()));
      }
      book = book || items.find((item) => item.name === name);
    } catch (error) {
      errorMessage = '医书加载失败，请重试';
    } finally {
      wx.hideLoading();
      this.openingBook = false;
    }

    if (!book) {
      wx.showToast({ title: errorMessage, icon: 'none' });
      return;
    }

    const chapter = chapterTitle ? `&chapterTitle=${encodeURIComponent(chapterTitle)}` : '';
    wx.navigateTo({ url: `${routeMap.book}?id=${encodeURIComponent(book.id)}${chapter}` });
  }
});
