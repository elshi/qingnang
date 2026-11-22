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
    action: {
      type: String,
      value: ''
    },
    actionBusy: {
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
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/home/home' });
    },

    search() {
      this.triggerEvent('search');
    },

    act() {
      if (!this.data.actionBusy) this.triggerEvent('action');
    }
  }
});
