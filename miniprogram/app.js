App({
  globalData: {
    cloudEnvId: 'prod-d4gz10erk8e8f6306',
    disclaimer: '本平台内容仅供学习参考，不构成医疗诊断建议或治疗方案。'
  },
  onLaunch() {
    if (!wx.cloud) return;
    const cloudConfig = { traceUser: true };
    if (this.globalData.cloudEnvId !== 'your-cloud-env-id') cloudConfig.env = this.globalData.cloudEnvId;
    wx.cloud.init(cloudConfig);
  },
  getDisclaimer() { return this.globalData.disclaimer; }
});
