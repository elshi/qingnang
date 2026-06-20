const { getBooks } = require('../../../utils/books-api');

const BOOK_COVER_BASE_URL = 'https://7072-prod-d4gz10erk8e8f6306-1440550656.tcb.qcloud.la/books';
const PROGRESS_KEY_PREFIX = 'bookReaderProgress:';

function normalizeJp(value) {
  return String(value || '').trim().toUpperCase();
}

function getJpInitial(value) {
  const first = normalizeJp(value).charAt(0);
  return /[A-Z]/.test(first) ? first : '#';
}

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

function withCover(item) {
  const name = String(item.name || '').trim();
  const jp = normalizeJp(item.jp);
  return {
    ...item,
    jp,
    initial: getJpInitial(jp),
    cover: `${BOOK_COVER_BASE_URL}/${encodeURIComponent(name)}.webp`,
    coverFailed: false
  };
}

function withProgress(item) {
  return {
    ...item,
    ...formatProgress(item)
  };
}

function filterBooks(items, keyword) {
  const query = String(keyword || '').trim();
  if (!query) return items;

  const lowerQuery = query.toLowerCase();
  const upperQuery = query.toUpperCase();
  return items.filter((item) => {
    const name = String(item.name || '');
    const jp = normalizeJp(item.jp);
    return name.indexOf(query) !== -1
      || jp.indexOf(upperQuery) !== -1
      || String(item.initial || '').toLowerCase() === lowerQuery;
  });
}

function groupByInitial(items) {
  const groups = {};
  items.forEach((item) => {
    const initial = item.initial || getJpInitial(item.jp);
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
    keyword: '',
    allItems: [],
    items: [],
    bookGroups: [],
    alphabetNav: [],
    bookScrollIntoView: '',
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
      const items = (data.items || []).map(withCover).map(withProgress);
      this.setData({
        allItems: items,
        loading: false
      }, () => this.applyFilters());
    } catch (error) {
      this.setData({
        loading: false,
        error: error.message || '医书列表加载失败'
      });
    }
  },

  refreshProgress() {
    this.setData({
      allItems: this.data.allItems.map(withProgress)
    }, () => this.applyFilters());
  },

  applyFilters() {
    const items = filterBooks(this.data.allItems, this.data.keyword);
    const bookGroups = groupByInitial(items);
    this.setData({
      items,
      bookGroups,
      alphabetNav: bookGroups.map((group) => group.initial)
    });
  },

  onKeywordInput(event) {
    this.setData({
      keyword: event.detail.value,
      bookScrollIntoView: ''
    }, () => this.applyFilters());
  },

  clearKeyword() {
    this.setData({
      keyword: '',
      bookScrollIntoView: ''
    }, () => this.applyFilters());
  },

  jumpToInitial(event) {
    const initial = event.currentTarget.dataset.initial;
    const target = `initial-${initial === '#' ? 'other' : initial}`;
    this.setData({ bookScrollIntoView: '' }, () => {
      this.setData({ bookScrollIntoView: target });
    });
  },

  openReader(event) {
    wx.navigateTo({ url: `/pages/books/reader/reader?id=${event.currentTarget.dataset.id}` });
  },

  onBookCoverError(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.allItems.find((book) => String(book.id) === String(id));
    if (!item || item.coverFailed) return;

    console.warn('书籍封面加载失败', {
      name: item.name,
      cover: item.cover,
      detail: event.detail
    });
    this.setData({
      allItems: this.data.allItems.map((book) => (
        String(book.id) === String(id) ? { ...book, coverFailed: true } : book
      ))
    }, () => this.applyFilters());
  },

  retry() {
    this.loadBooks();
  }
});
