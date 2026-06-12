const { getBookDetail, getBookChapter } = require('../../../utils/books-api');

const PREFERENCE_KEY = 'bookReaderPreferences';
const PROGRESS_KEY_PREFIX = 'bookReaderProgress:';
const DEFAULT_PREFERENCES = {
  theme: 'paper',
  fontSize: 32,
  lineHeight: 2
};
const LEGACY_FONT_SIZE_MAP = {
  26: 28,
  30: 32,
  34: 36,
  38: 40
};
const themes = [
  { key: 'paper', label: '纸张' },
  { key: 'eye', label: '护眼' },
  { key: 'night', label: '夜间' }
];
const fontSizes = [
  { value: 28, label: '小' },
  { value: 32, label: '标准' },
  { value: 36, label: '大' },
  { value: 40, label: '特大' }
];
const lineHeights = [
  { value: 1.7, label: '紧凑' },
  { value: 2, label: '标准' },
  { value: 2.3, label: '宽松' }
];

function formatContent(value) {
  return String(value || '')
    .trim()
    .split(/(?:\r\n|\r|\n)\s*(?:\r\n|\r|\n)+/)
    .map((paragraph) => paragraph
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .join('')
    )
    .filter(Boolean)
    .map((text, index) => ({
      key: `chapter-paragraph-${index}`,
      text
    }));
}

function readStorage(key, fallback) {
  try {
    return wx.getStorageSync(key) || fallback;
  } catch (error) {
    return fallback;
  }
}

Page({
  data: {
    book: null,
    chapters: [],
    chapter: null,
    contentParagraphs: [],
    selectedChapterId: '',
    currentChapterIndex: -1,
    canGoPrevious: false,
    canGoNext: false,
    scrollTop: 0,
    statusBarHeight: 40,
    navHeight: 88,
    toolbarVisible: false,
    directoryVisible: false,
    settingsVisible: false,
    themes,
    fontSizes,
    lineHeights,
    theme: DEFAULT_PREFERENCES.theme,
    fontSize: DEFAULT_PREFERENCES.fontSize,
    lineHeight: DEFAULT_PREFERENCES.lineHeight,
    loading: true,
    chapterLoading: false,
    error: '',
    chapterError: ''
  },

  onLoad(options) {
    this.bookId = options.id;
    this.initialChapterId = options.chapterId;
    this.currentScrollTop = 0;
    this.restoreScrollTop = 0;
    this.loadReaderPreferences();
    this.setNavigationMetrics();
    this.loadBook();
  },

  onHide() {
    this.persistProgress();
  },

  onUnload() {
    if (this.scrollSaveTimer) clearTimeout(this.scrollSaveTimer);
    this.persistProgress();
  },

  setNavigationMetrics() {
    const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect();
    const ratio = 750 / system.windowWidth;
    const statusBarHeight = (system.statusBarHeight || 20) * ratio;
    const navHeight = ((capsule.top - (system.statusBarHeight || 20)) * 2 + capsule.height) * ratio;
    this.setData({ statusBarHeight, navHeight });
  },

  loadReaderPreferences() {
    const storedPreferences = readStorage(PREFERENCE_KEY, {});
    const fontSize = LEGACY_FONT_SIZE_MAP[storedPreferences.fontSize]
      || storedPreferences.fontSize
      || DEFAULT_PREFERENCES.fontSize;
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...storedPreferences,
      fontSize
    };
    this.setData(preferences);
  },

  async loadBook() {
    if (!this.bookId) {
      this.setData({ loading: false, error: '医书 ID 无效' });
      return;
    }

    this.setData({ loading: true, error: '' });
    try {
      const book = await getBookDetail(this.bookId);
      const chapters = book.chapters || [];
      const progress = readStorage(`${PROGRESS_KEY_PREFIX}${this.bookId}`, {});
      const preferredChapterId = this.initialChapterId || progress.chapterId;
      const selected = chapters.find((item) => String(item.id) === String(preferredChapterId))
        || chapters[0];

      this.restoreScrollTop = this.initialChapterId ? 0 : Number(progress.scrollTop || 0);
      this.setData({ book, chapters, loading: false });
      if (selected) {
        this.loadChapter(selected.id, { restoreScroll: true });
      }
    } catch (error) {
      this.setData({ loading: false, error: error.message || '医书详情加载失败' });
    }
  },

  async loadChapter(chapterId, options = {}) {
    if (!chapterId || this.data.chapterLoading) return;

    if (this.data.chapter) this.persistProgress();
    this.pendingChapterId = chapterId;
    this.failedChapterId = '';
    this.setData({
      chapterLoading: true,
      chapterError: '',
      directoryVisible: false,
      settingsVisible: false
    });

    try {
      const chapter = await getBookChapter(this.bookId, chapterId);
      if (String(chapter.id) !== String(this.pendingChapterId)) return;
      const currentChapterIndex = this.data.chapters.findIndex(
        (item) => String(item.id) === String(chapter.id)
      );
      const targetScrollTop = options.restoreScroll ? this.restoreScrollTop : 0;
      this.currentScrollTop = targetScrollTop;
      this.restoreScrollTop = 0;
      this.pendingChapterId = '';
      this.setData({
        chapter,
        selectedChapterId: chapter.id,
        currentChapterIndex,
        canGoPrevious: currentChapterIndex > 0,
        canGoNext: currentChapterIndex >= 0 && currentChapterIndex < this.data.chapters.length - 1,
        contentParagraphs: formatContent(chapter.content),
        chapterLoading: false,
        scrollTop: targetScrollTop + 1
      }, () => {
        setTimeout(() => this.setData({ scrollTop: targetScrollTop }), 30);
        this.persistProgress();
      });
    } catch (error) {
      this.failedChapterId = chapterId;
      this.pendingChapterId = '';
      this.setData({
        chapterLoading: false,
        chapterError: error.message || '章节内容加载失败'
      });
    }
  },

  onReaderScroll(event) {
    this.currentScrollTop = event.detail.scrollTop || 0;
    if (this.scrollSaveTimer) clearTimeout(this.scrollSaveTimer);
    this.scrollSaveTimer = setTimeout(() => this.persistProgress(), 500);
  },

  persistProgress() {
    if (!this.bookId || !this.data.selectedChapterId) return;
    try {
      wx.setStorageSync(`${PROGRESS_KEY_PREFIX}${this.bookId}`, {
        chapterId: this.data.selectedChapterId,
        scrollTop: Math.round(this.currentScrollTop || 0)
      });
    } catch (error) {
      // Reading remains available when local storage is unavailable.
    }
  },

  persistPreferences() {
    try {
      wx.setStorageSync(PREFERENCE_KEY, {
        theme: this.data.theme,
        fontSize: this.data.fontSize,
        lineHeight: this.data.lineHeight
      });
    } catch (error) {
      // Preference persistence is optional.
    }
  },

  toggleToolbars() {
    if (this.data.directoryVisible || this.data.settingsVisible) return;
    this.setData({ toolbarVisible: !this.data.toolbarVisible });
  },

  goBack() {
    this.persistProgress();
    wx.navigateBack();
  },

  openDirectory() {
    this.setData({ directoryVisible: true, settingsVisible: false, toolbarVisible: true });
  },

  openSettings() {
    this.setData({ settingsVisible: true, directoryVisible: false, toolbarVisible: true });
  },

  closePanels() {
    this.setData({ directoryVisible: false, settingsVisible: false });
  },

  selectChapter(event) {
    const chapterId = event.currentTarget.dataset.id;
    if (String(chapterId) === String(this.data.selectedChapterId)) {
      this.closePanels();
      return;
    }
    this.loadChapter(chapterId);
  },

  goPreviousChapter() {
    if (!this.data.canGoPrevious) return;
    this.loadChapter(this.data.chapters[this.data.currentChapterIndex - 1].id);
  },

  goNextChapter() {
    if (!this.data.canGoNext) return;
    this.loadChapter(this.data.chapters[this.data.currentChapterIndex + 1].id);
  },

  selectTheme(event) {
    this.setData({ theme: event.currentTarget.dataset.value }, () => this.persistPreferences());
  },

  selectFontSize(event) {
    this.setData({ fontSize: Number(event.currentTarget.dataset.value) }, () => this.persistPreferences());
  },

  selectLineHeight(event) {
    this.setData({ lineHeight: Number(event.currentTarget.dataset.value) }, () => this.persistPreferences());
  },

  retry() {
    const chapterId = this.failedChapterId || this.data.selectedChapterId;
    if (this.data.book && chapterId) {
      this.loadChapter(chapterId, { restoreScroll: Boolean(this.data.chapter) });
      return;
    }
    this.loadBook();
  },

  noop() {}
});
