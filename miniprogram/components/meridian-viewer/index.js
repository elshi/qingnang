const { getGroup, findMeridian } = require('../../utils/meridians');
// Overlay slots sit in the clear margins of the static chart, like callouts in
// the selected design. They identify the image's routes, not exact point sites.
const labelPositions = {
  regular: {
    lung: { side: 'left', top: 14 }, 'large-intestine': { side: 'right', top: 14 },
    heart: { side: 'left', top: 27 }, 'small-intestine': { side: 'right', top: 27 },
    'triple-energizer': { side: 'left', top: 40 }, pericardium: { side: 'right', top: 40 },
    spleen: { side: 'left', top: 53 }, stomach: { side: 'right', top: 53 },
    liver: { side: 'left', top: 66 }, gallbladder: { side: 'right', top: 66 },
    bladder: { side: 'left', top: 79 }, kidney: { side: 'right', top: 79 }
  },
  extraordinary: {
    ren: { side: 'left', top: 19 }, du: { side: 'right', top: 19 },
    'yin-wei': { side: 'left', top: 37 }, chong: { side: 'right', top: 37 },
    'yin-qiao': { side: 'left', top: 55 }, 'yang-wei': { side: 'right', top: 55 },
    'yang-qiao': { side: 'left', top: 73 }, dai: { side: 'right', top: 73 }
  }
};
Component({
  properties: {
    group: { type: String, value: 'regular' },
    selected: { type: String, value: 'lung' }
  },
  data: { labels: [], chart: '/assets/meridians/regular-chart.jpg' },
  observers: {
    'group, selected'(group, selected) {
      this.setData({
        labels: getGroup(group).map((item) => ({
          ...item,
          side: labelPositions[group][item.key].side,
          top: labelPositions[group][item.key].top
        })),
        chart: group === 'extraordinary' ? '/assets/meridians/extraordinary-chart.jpg' : '/assets/meridians/regular-chart.jpg'
      });
    }
  },
  methods: {
    selectLabel(event) {
      const key = event.currentTarget.dataset.key;
      const item = findMeridian(key);
      if (item && item.group === this.properties.group) this.triggerEvent('select', { key });
    }
  }
});
