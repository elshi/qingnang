const { books } = require('../../../utils/sample-data');
const tabs = [{ key: 'original', label: '原文' }, { key: 'translation', label: '译文' }, { key: 'annotation', label: '注释' }];
Page({
  data: { book: books[0], chapter: books[0].chapters[0], tabs, activeTab: 'original', activeLabel: '原文', content: books[0].chapters[0].original, disclaimer: '' },
  onLoad(options) {
    const book = books.find((entry) => entry.id === options.id) || books[0];
    const chapter = book.chapters.find((entry) => entry.id === options.chapterId) || book.chapters[0];
    this.setData({ disclaimer: getApp().getDisclaimer() });
    this.setReaderData(book, chapter, 'original');
  },
  switchTab(event) { this.setReaderData(this.data.book, this.data.chapter, event.currentTarget.dataset.key); },
  setReaderData(book, chapter, activeTab) {
    const active = tabs.find((tab) => tab.key === activeTab) || tabs[0];
    this.setData({ book, chapter, activeTab: active.key, activeLabel: active.label, content: chapter[active.key] });
  }
});
