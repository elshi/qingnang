Component({
  properties: { title: String, back: Boolean, action: String, busy: Boolean },
  data: { safeTop: 52 },
  lifetimes: {
    attached() {
      this.setData({ safeTop: wx.getMenuButtonBoundingClientRect().bottom + 6 });
    }
  },
  methods: {
    goBack() {
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/profile/index/index' });
    },
    act() {
      if (!this.data.busy) this.triggerEvent('action');
    }
  }
});
