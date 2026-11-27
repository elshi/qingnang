const { imagePath } = require('../../utils/atlas-images');
const columns = {
  regular: [['lung','heart','triple-energizer','spleen','liver','bladder'], ['large-intestine','small-intestine','pericardium','stomach','gallbladder','kidney']],
  extraordinary: [['ren','yin-wei','yang-wei','yang-qiao'], ['du','chong','yin-qiao','dai']]
};
const heights = { regular: [11,22,33,59,72,85], extraordinary: [17,35,61,82] };
Component({
  properties: { group: Object },
  data: { labels: [], src: '', failed: false },
  observers: {
    group(group) {
      if (!group || !columns[group.key]) return;
      const labels = [];
      columns[group.key].forEach((keys, side) => keys.forEach((key, index) => {
        const item = group.items.find((row) => row.key === key);
        if (item) labels.push({ ...item, side: side ? 'right' : 'left', top: heights[group.key][index] });
      }));
      this.setData({ labels });
      this.loadImage(group.image.preview_url);
    }
  },
  methods: {
    loadImage(url) {
      const token = {};
      this.imageRequest = token;
      this.setData({ src: '', failed: false });
      imagePath(url).then(src => {
        if (this.imageRequest === token) this.setData({ src });
      }, () => {
        if (this.imageRequest === token) this.setData({ failed: true });
      });
    },
    selectLabel(event) { this.triggerEvent('select', { id: event.currentTarget.dataset.id }); },
    imageError(event) { if (event.currentTarget.dataset.url === this.data.src) this.setData({ failed: true }); },
    retry() { this.loadImage(this.properties.group.image.preview_url); }
  }
});
