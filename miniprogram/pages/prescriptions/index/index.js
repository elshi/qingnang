const { getPrescriptions } = require('../../../utils/prescriptions-api');
const PAGE_SIZE = 20;

Page({
  data: { keyword: '', isSearching: false, items: [], total: 0, page: 1, hasMore: true, loading: true, error: '', scrollTop: 0 },

  onLoad(options = {}) {
    this.requestId = 0;
    let keyword = options.keyword || '';
    try { keyword = decodeURIComponent(keyword); } catch (error) { /* Already decoded. */ }
    keyword = keyword.slice(0, 100);
    this.setData({ keyword, isSearching: Boolean(keyword.trim()) });
    this.loadList(true);
  },

  onUnload() {
    clearTimeout(this.searchTimer);
    this.requestId += 1;
    this.unloaded = true;
  },

  onKeywordInput(event) { this.updateKeyword(event.detail.value, 300); },
  clearSearch() { this.updateKeyword('', 0); },
  onSearchConfirm() { this.updateKeyword(this.data.keyword, 0); },

  updateKeyword(keyword, delay) {
    clearTimeout(this.searchTimer);
    this.requestId += 1; // Invalidate the old query immediately, including during debounce.
    this.setData({ keyword, isSearching: Boolean(keyword.trim()), items: [], total: 0, page: 1, hasMore: true, error: '', loading: true, scrollTop: 0 });
    if (delay) this.searchTimer = setTimeout(() => this.loadList(true), delay);
    else this.loadList(true);
  },

  async loadList(reset = false) {
    if (this.unloaded || (!reset && (this.data.loading || !this.data.hasMore || this.data.error))) return;
    const page = reset ? 1 : this.data.page;
    const requestId = ++this.requestId;
    this.setData({ loading: true, error: '' });
    try {
      const data = await getPrescriptions({ keyword: this.data.keyword.trim(), page, page_size: PAGE_SIZE });
      if (requestId !== this.requestId || this.unloaded) return;
      const seen = new Set();
      const items = (reset ? data.items : this.data.items.concat(data.items)).filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      this.setData({ items, total: data.total, page: page + 1, hasMore: Boolean(data.has_more), loading: false }, () => this.ensureListFilled());
    } catch (error) {
      if (requestId !== this.requestId || this.unloaded) return;
      this.setData({ loading: false, error: error.message || '处方加载失败，请稍后重试' });
    }
  },

  loadMore() { return this.loadList(); },
  retry() {
    this.setData({ error: '' });
    return this.loadList(this.data.items.length === 0);
  },
  onListScroll(event) { this.setData({ scrollTop: event.detail.scrollTop }); },
  openDetail(event) {
    wx.navigateTo({ url: `/pages/prescriptions/detail/detail?id=${encodeURIComponent(event.currentTarget.dataset.id)}` });
  },
  ensureListFilled() {
    if (this.unloaded || this.data.loading || this.data.error || !this.data.hasMore) return;
    const query = this.createSelectorQuery();
    query.select('.prescription-scroll').boundingClientRect();
    query.select('.prescription-scroll').scrollOffset();
    query.exec((results) => {
      const viewport = results && results[0];
      const scroll = results && results[1];
      if (viewport && scroll && scroll.scrollHeight <= viewport.height + 100) this.loadMore();
    });
  }
});
