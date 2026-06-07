const { prescriptions } = require('../../../utils/sample-data');

Page({
  data: {
    item: prescriptions[0],
    disclaimer: getApp().getDisclaimer()
  },

  onLoad(options) {
    const item = prescriptions.find((entry) => entry.id === options.id) || prescriptions[0];
    this.setData({ item });
  }
});
