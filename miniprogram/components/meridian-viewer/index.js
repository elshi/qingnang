const columns = {
  regular: [['lung','heart','triple-energizer','spleen','liver','bladder'], ['large-intestine','small-intestine','pericardium','stomach','gallbladder','kidney']],
  extraordinary: [['ren','yin-wei','yang-wei','yang-qiao'], ['du','chong','yin-qiao','dai']]
};
const heights = { regular: [13,26,39,55,68,81], extraordinary: [18,38,59,79] };
// Home charts are transparent, bundled PNGs; detail plates keep their remote originals.
const images = {
  regular: '/assets/meridians/regular-transparent.png',
  extraordinary: '/assets/meridians/extraordinary-transparent.png'
};
Component({
  properties: { group: Object },
  data: { labels: [], src: '', failed: false },
  observers: {
    group(group) {
      if (!group || !columns[group.key]) return;
      const labels = [];
      columns[group.key].forEach((keys, side) => keys.forEach((key, index) => {
        const item = group.items.find((row) => row.key === key);
        if (item) labels.push({
          ...item,
          prefix: group.key === 'regular' ? item.title.slice(0, 3) : '奇经',
          name: group.key === 'regular' ? item.title.slice(3) : item.title,
          side: side ? 'right' : 'left', top: heights[group.key][index]
        });
      }));
      this.setData({ labels });
      this.loadImage(images[group.key]);
    }
  },
  methods: {
    loadImage(url) {
      this.setData({ src: url, failed: false });
    },
    selectLabel(event) { this.triggerEvent('select', { id: event.currentTarget.dataset.id }); },
    imageError(event) { if (event.currentTarget.dataset.url === this.data.src) this.setData({ failed: true }); },
    retry() { this.loadImage(images[this.properties.group.key]); }
  }
});
