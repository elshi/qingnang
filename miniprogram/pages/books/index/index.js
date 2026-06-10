const { getBooks } = require('../../../utils/books-api');

Page({
  data: {
    dynasties: [{ key: 'all', label: '全部' }],
    activeDynasty: 'all',
    allItems: [],
    items: [],
    loading: true,
    error: ''
  },

  onLoad() {
    this.loadBooks();
  },

  async loadBooks() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await getBooks();
      const items = data.items || [];
      const dynasties = [{ key: 'all', label: '全部' }].concat(
        (data.dynasties || []).map((dynasty) => ({ key: dynasty, label: dynasty }))
      );
      this.setData({
        dynasties,
        allItems: items,
        items,
        activeDynasty: 'all',
        loading: false
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error.message || '医书列表加载失败'
      });
    }
  },

  selectDynasty(event) {
    const activeDynasty = event.currentTarget.dataset.key;
    const items = activeDynasty === 'all'
      ? this.data.allItems
      : this.data.allItems.filter((item) => item.dynasty === activeDynasty);
    this.setData({ activeDynasty, items });
  },

  openReader(event) {
    wx.navigateTo({ url: `/pages/books/reader/reader?id=${event.currentTarget.dataset.id}` });
  },

  retry() {
    this.loadBooks();
  }
});
