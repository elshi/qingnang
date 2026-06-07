const { searchLocal } = require('../../utils/search');

Page({
  data: {
    keyword: '',
    isSearching: false,
    searchResults: [],
    daily: {
      title: '每日一学',
      quote: '肺为娇脏，寒气所伤，最易咳嗽。',
      source: '《景岳全书》',
      bookId: 'book-002',
      chapterId: 'chapter-001'
    },
    entries: [
      { title: '经典医案', url: '/pages/cases/index/index', theme: 'case' },
      { title: '经典医书', url: '/pages/books/index/index', theme: 'book' },
      { title: '经典处方', url: '/pages/prescriptions/index/index', theme: 'prescription' },
      { title: '经络穴位', url: '/pages/meridians/index/index', theme: 'meridian' }
    ]
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0 });
  },

  onKeywordInput(event) {
    const keyword = event.detail.value;
    this.setData({
      keyword,
      isSearching: Boolean(keyword.trim()),
      searchResults: searchLocal(keyword)
    });
  },

  clearSearch() {
    this.setData({ keyword: '', isSearching: false, searchResults: [] });
  },

  openEntry(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },

  openDailyLearning() {
    const { bookId, chapterId } = this.data.daily;
    wx.navigateTo({ url: `/pages/books/reader/reader?id=${bookId}&chapterId=${chapterId}` });
  },

  openSearchResult(event) {
    const { id, type, route } = event.currentTarget.dataset;
    wx.navigateTo({ url: `${route}?id=${id}&type=${type}` });
  }
});
