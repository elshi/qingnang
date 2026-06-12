const { getBooks } = require('../../../utils/books-api');

const BOOK_COVER_BASE_URL = 'https://7072-prod-d4gz10erk8e8f6306-1440550656.tcb.qcloud.la/books';

function withCover(item) {
  const name = String(item.name || '').trim();
  return {
    ...item,
    cover: `${BOOK_COVER_BASE_URL}/${encodeURIComponent(name)}.webp`,
    coverFailed: false
  };
}

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
      const items = (data.items || []).map(withCover);
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

  onBookCoverError(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.items[index];
    if (!item || item.coverFailed) return;

    console.warn('书籍封面加载失败', {
      name: item.name,
      cover: item.cover,
      detail: event.detail
    });
    this.setData({ [`items[${index}].coverFailed`]: true });
  },

  retry() {
    this.loadBooks();
  }
});
