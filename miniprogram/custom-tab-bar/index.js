Component({
  data: {
    selected: 0,
    tabs: [
      { text: '经典', pagePath: '/pages/home/home', key: 'home' },
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
      const nextSelected = selected >= 0 ? selected : this.data.selected;
      if (nextSelected !== this.data.selected) {
        this.setData({ selected: nextSelected });
      }
    }
  }
});
