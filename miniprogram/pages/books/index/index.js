const { getBooks } = require('../../../utils/books-api');

const PROGRESS_KEY_PREFIX = 'bookReaderProgress:';

function readStorage(key, fallback) {
  try {
    return wx.getStorageSync(key) || fallback;
  } catch (error) {
    return fallback;
  }
}

function formatProgress(item) {
  const progress = readStorage(`${PROGRESS_KEY_PREFIX}${item.id}`, null);
  if (!progress || !progress.chapterId) {
    return {
      hasProgress: false,
      progressLabel: '未读',
      progressPercent: 0,
      showProgressBar: false
    };
  }

  const chapterIndex = Number(progress.chapterIndex);
  const chapterCount = Number(progress.chapterCount || item.chapter_count || 0);
  if (Number.isInteger(chapterIndex) && chapterIndex >= 0 && chapterCount > 0) {
    const chapterNumber = Math.min(chapterIndex + 1, chapterCount);
    return {
      hasProgress: true,
      progressLabel: `已读至 第 ${chapterNumber} / 共 ${chapterCount} 章`,
      progressPercent: Math.max(1, Math.min(100, Math.round((chapterNumber / chapterCount) * 100))),
      showProgressBar: true
    };
  }

  return {
    hasProgress: true,
    progressLabel: '已读',
    progressPercent: 0,
    showProgressBar: false
  };
}

function withProgress(item) {
  return {
    ...item,
    ...formatProgress(item)
  };
}

function filterBooks(items, keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return items;

  return items.filter((item) => String(item.name || '').toLowerCase().includes(query));
}

Page({
  data: {
    keyword: '',
    isSearching: false,
    allItems: [],
    items: [],
    bookScrollTop: 0,
    loading: true,
    error: ''
  },

  onLoad() {
    this.loadBooks();
  },

  onShow() {
    if (!this.data.allItems.length) return;
    this.refreshProgress();
  },

  async loadBooks() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await getBooks();
      const allItems = (data.items || []).map(withProgress);
      this.setData({
        allItems,
        items: filterBooks(allItems, this.data.keyword),
        loading: false
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error.message || '医书列表加载失败'
      });
    }
  },

  refreshProgress() {
    const allItems = this.data.allItems.map(withProgress);
    this.setData({
      allItems,
      items: filterBooks(allItems, this.data.keyword)
    });
  },

  onKeywordInput(event) {
    this.updateKeyword(event.detail.value);
  },

  clearKeyword() {
    this.updateKeyword('');
  },

  updateKeyword(keyword) {
    this.setData({
      keyword,
      isSearching: Boolean(keyword.trim()),
      items: filterBooks(this.data.allItems, keyword),
      bookScrollTop: 1
    }, () => this.setData({ bookScrollTop: 0 }));
  },

  openReader(event) {
    wx.navigateTo({ url: `/pages/books/reader/reader?id=${event.currentTarget.dataset.id}` });
  },

  retry() {
    this.loadBooks();
  }
});
