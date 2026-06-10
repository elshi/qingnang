const { getBookDetail, getBookChapter } = require('../../../utils/books-api');

function formatContent(value) {
  return String(value || '').split(/\r\n|\r|\n/).map((line, index) => ({
    key: `chapter-line-${index}`,
    text: line,
    empty: line.trim() === ''
  }));
}

Page({
  data: {
    book: null,
    chapters: [],
    chapter: null,
    contentLines: [],
    selectedChapterId: '',
    loading: true,
    chapterLoading: false,
    error: '',
    chapterError: '',
    disclaimer: ''
  },

  onLoad(options) {
    this.bookId = options.id;
    this.initialChapterId = options.chapterId;
    this.setData({ disclaimer: getApp().getDisclaimer() });
    this.loadBook();
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
      const selected = chapters.find((item) => String(item.id) === String(this.initialChapterId))
        || chapters[0];
      this.setData({ book, chapters, loading: false });
      if (selected) {
        this.loadChapter(selected.id);
      }
    } catch (error) {
      this.setData({ loading: false, error: error.message || '医书详情加载失败' });
    }
  },

  async loadChapter(chapterId) {
    this.setData({
      selectedChapterId: chapterId,
      chapterLoading: true,
      chapterError: ''
    });
    try {
      const chapter = await getBookChapter(this.bookId, chapterId);
      if (String(chapter.id) !== String(this.data.selectedChapterId)) return;
      this.setData({
        chapter,
        contentLines: formatContent(chapter.content),
        chapterLoading: false
      });
    } catch (error) {
      this.setData({
        chapterLoading: false,
        chapterError: error.message || '章节内容加载失败'
      });
    }
  },

  selectChapter(event) {
    this.loadChapter(event.currentTarget.dataset.id);
  },

  retry() {
    if (this.data.book && this.data.selectedChapterId) {
      this.loadChapter(this.data.selectedChapterId);
      return;
    }
    this.loadBook();
  }
});
