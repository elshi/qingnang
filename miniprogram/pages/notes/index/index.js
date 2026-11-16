const store = require('../../../utils/learning-store');
Page({
  data: {
    keyword: '',
    activeTab: 'all',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'linked', label: '关联原文' },
      { key: 'free', label: '自由笔记' }
    ],
    items: [],
    hasDraft: false,
    syncError: ''
  },
  onShow() {
    this.refresh();
    store
      .synchronize()
      .then((pending) => { this.setData({ syncError: pending ? '有待处理的恢复副本，请打开对应笔记核对' : '' }); this.refresh(); })
      .catch((error) => this.setData({ syncError: error.message + '；当前显示上次缓存' }));
  },
  refresh() {
    this.setData({
      hasDraft: Boolean(store.getDraft()),
      items: store
        .records('note')
        .filter(
          (item) =>
            store.matches(item, this.data.keyword) &&
            (this.data.activeTab === 'all' ||
              (this.data.activeTab === 'linked' ? Boolean(item.ref) : !item.ref))
        )
        .map((item) => ({
          ...item,
          excerpt: item.content.replace(/\s+/g, ' ').slice(0, 100) || '语音笔记',
          sourceLabel: item.ref ? [item.ref.source, item.ref.title].filter(Boolean).join(' · ') : '自由笔记',
          dateLabel: store.dateLabel(item.updatedAt)
        }))
    });
  },
  onSearch(event) {
    this.setData({ keyword: event.detail.value });
    this.refresh();
  },
  clearSearch() {
    this.setData({ keyword: '' });
    this.refresh();
  },
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
    this.refresh();
  },
  create() {
    store.editNote();
  },
  edit(event) {
    store.editNote(null, event.currentTarget.dataset.key);
  },
  more(event) {
    const key = event.currentTarget.dataset.key;
    wx.showActionSheet({
      itemList: ['编辑笔记', '删除笔记'],
      success: (result) => {
        if (result.tapIndex === 0) store.editNote(null, key);
        else
          wx.showModal({
            title: '删除笔记',
            content: '删除后无法恢复，确定删除这篇笔记吗？',
            confirmColor: '#a77936',
            success: async (answer) => {
              if (!answer.confirm) return;
              try {
                await store.remove('note', key);
                await store.clearDraft(key);
                this.refresh();
              } catch (error) {
                wx.showToast({ title: error.message, icon: 'none' });
              }
            }
          });
      }
    });
  }
});
