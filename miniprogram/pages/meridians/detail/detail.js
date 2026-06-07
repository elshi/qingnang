const { meridians } = require('../../../utils/sample-data');
Page({
  data: { item: meridians[0], acupointsText: meridians[0].acupoints.join('、'), disclaimer: '' },
  onLoad(options) {
    const item = meridians.find((entry) => entry.id === options.id) || meridians[0];
    this.setData({ item, acupointsText: item.acupoints.join('、'), disclaimer: getApp().getDisclaimer() });
  }
});
