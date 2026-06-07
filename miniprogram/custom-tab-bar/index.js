Component({
  data: {
    selected: 0,
    tabs: [
      { text: '首页', pagePath: '/pages/home/home', key: 'home' },
      { text: '收藏', pagePath: '/pages/favorites/index/index', key: 'favorite' },
      { text: '笔记', pagePath: '/pages/notes/index/index', key: 'note' },
      { text: '我的', pagePath: '/pages/profile/index/index', key: 'profile' }
    ]
  },
  lifetimes: { attached() { this.syncSelected(); } },
  pageLifetimes: { show() { this.syncSelected(); } },
  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      const route = current ? `/${current.route}` : '';
      const selected = this.data.tabs.findIndex((item) => item.pagePath === route);
      if (selected >= 0 && selected !== this.data.selected) this.setData({ selected });
    }
  }
});
