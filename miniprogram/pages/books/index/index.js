const { books } = require('../../../utils/sample-data');

const dynasties = [
  { key: '周', label: '周' },
  { key: '秦汉', label: '秦汉' },
  { key: '晋', label: '晋' },
  { key: '南北', label: '南北' },
  { key: '五代', label: '五代' },
  { key: '宋', label: '宋' },
  { key: '金', label: '金' },
  { key: '元', label: '元' },
  { key: '明', label: '明' },
  { key: '清', label: '清' },
  { key: '民国', label: '民国' }
];

Page({
  data: { dynasties, activeDynasty: '周', items: books.filter((item) => item.dynastyGroup === '周') },
  selectDynasty(event) {
    const activeDynasty = event.currentTarget.dataset.key;
    this.setData({ activeDynasty, items: books.filter((item) => item.dynastyGroup === activeDynasty) });
  },
  openReader(event) {
    wx.navigateTo({ url: `/pages/books/reader/reader?id=${event.currentTarget.dataset.id}` });
  }
});
