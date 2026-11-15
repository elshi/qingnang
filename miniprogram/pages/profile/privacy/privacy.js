Page({
  openContract() {
    if (wx.openPrivacyContract)
      wx.openPrivacyContract({
        fail: () => wx.showToast({ title: '暂未配置微信隐私指引，请稍后重试', icon: 'none' })
      });
  }
});
