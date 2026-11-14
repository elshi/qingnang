const { getBooks } = require('../../utils/books-api');
const { getCases } = require('../../utils/cases-api');
const { getPrescriptions } = require('../../utils/prescriptions-api');
const { searchLocal, typeTextMap, routeMap } = require('../../utils/search');

const bookListUrl = '/pages/books/index/index';
const caseListUrl = '/pages/cases/index/index';
const featuredCaseQueries = [
  { doctor: '张仲景', keyword: '霍乱' },
  { doctor: '吴鞠通', keyword: '暑温' },
  { doctor: '叶天士', keyword: '咳嗽', bookname: '临证指南医案' }
];

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
      { title: '处方', icon: 'formula', url: '/pages/prescriptions/index/index' },
      { title: '经络', icon: 'meridian', url: '/pages/meridians/index/index' }
    ],
    shelf: [
      { name: '黄帝内经', author: '佚名', subject: '中医理论', cover: '/assets/home/library/neijing.png' },
      { name: '伤寒论', author: '张仲景', subject: '辨证论治', cover: '/assets/home/library/shanghan.png' },
      { name: '金匮要略', author: '张仲景', subject: '杂病经典', cover: '/assets/home/library/jingui.png' },
      { name: '温病条辨', author: '吴鞠通', subject: '温病学说', cover: '/assets/home/library/wenbing.png' }
    ],
    featuredCases: [],
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
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0 });
  },

  onUnload() {
    clearTimeout(this.searchTimer);
    this.searchRequest = null;
    this.caseRequest = null;
  },

  async loadFeaturedCases() {
    const request = {};
    this.caseRequest = request;
    this.setData({ casesLoading: true, casesFailed: false });
    const results = await Promise.all(featuredCaseQueries.map(async (query) => {
      try {
        let data = await getCases({ ...query, page_size: 1 });
        if (!data.items.length) data = await getCases({ doctor: query.doctor, page_size: 1 });
        return { item: data.items[0], failed: false };
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
    }).map(({ item }, index) => ({
      id: item.id,
      number: String(index + 1).padStart(2, '0'),
      title: item.title,
      source: item.source || item.bookname || '',
      excerpt: item.content_preview || item.summary || ''
    }));
    this.setData({ featuredCases, casesLoading: false, casesFailed: results.some((result) => result.failed) });
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
    const localResults = searchLocal(query)
      .filter((item) => item.type === 'meridian')
      .map((item) => searchResult(item, item.type, item.title));

    this.setData({
      keyword,
      isSearching: Boolean(query),
      searchResults: localResults,
      searchLoading: Boolean(query),
      searchFailed: false,
      hasMoreCases: false,
      hasMorePrescriptions: false
    });

    if (query) {
      this.searchTimer = setTimeout(() => this.searchLibrary(query, localResults, request), 280);
    }
  },

  async searchLibrary(keyword, localResults, request) {
    const [books, cases, prescriptions] = await Promise.all([
      this.loadBookCatalog().catch(() => null),
      getCases({ keyword, page_size: 20 }).catch(() => null),
      getPrescriptions({ keyword, page_size: 20 }).catch(() => null)
    ]);
    if (request !== this.searchRequest) return;

    const query = keyword.toLowerCase();
    const bookResults = books ? books.items
      .filter((item) => [item.name, item.author, item.summary]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      .map((item) => searchResult(item, 'book', item.name)) : [];
    const caseResults = cases ? cases.items.map((item) => searchResult(item, 'case', item.title)) : [];
    const prescriptionResults = prescriptions ? prescriptions.items.map((item) => searchResult(item, 'prescription', item.title)) : [];
    this.setData({
      searchResults: [...bookResults, ...caseResults, ...prescriptionResults, ...localResults],
      searchLoading: false,
      searchFailed: !books || !cases || !prescriptions,
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
