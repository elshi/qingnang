Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    showBack: {
      type: Boolean,
      value: false
    },
    transparent: {
      type: Boolean,
      value: false
    },
    showSearch: {
      type: Boolean,
      value: false
    },
    searchEmphasis: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statusBarHeight: 0,
    navHeight: 88
  },

  lifetimes: {
    attached() {
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const capsule = wx.getMenuButtonBoundingClientRect();
      const ratio = 750 / system.windowWidth;
      const statusBarHeight = (system.statusBarHeight || 20) * ratio;
      const navHeight = ((capsule.top - (system.statusBarHeight || 20)) * 2 + capsule.height) * ratio;

      this.setData({
        statusBarHeight,
        navHeight
      });
    }
  },

  methods: {
    goBack() {
      wx.navigateBack();
    },

    search() {
      this.triggerEvent('search');
    }
  }
});
