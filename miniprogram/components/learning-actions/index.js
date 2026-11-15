const store = require('../../utils/learning-store');
Component({
  properties: { type: String, item: Object, chapter: Object, track: { type: Boolean, value: true } },
  data: { ref: null, favorite: false, bookFavorite: false },
  observers: {
    'type,item,chapter': function () {
      this.refresh(true);
    }
  },
  pageLifetimes: {
    show() {
      this.refresh(false);
    }
  },
  methods: {
    refresh(track) {
      const { type, item, chapter } = this.data;
      if (!item || (type === 'chapter' && !chapter)) {
        this.setData({ ref: null });
        return;
      }
      const extra =
        type === 'chapter'
          ? { chapterId: String(chapter.id), title: chapter.title, source: item.name || item.title }
          : {};
      const ref = store.reference(type, item, extra);
      this.setData({
        ref,
        favorite: store.isFavorite(ref),
        bookFavorite: type === 'chapter' && store.isFavorite(store.reference('book', item))
      });
      if (track && this.data.track) store.visit(ref);
    },
    favorite() {
      try {
        const favorite = store.toggleFavorite(this.data.ref);
        this.setData({ favorite });
        store.syncQuietly();
        wx.showToast({ title: favorite ? '已收藏' : '已取消收藏', icon: 'none' });
      } catch (error) {
        wx.showToast({ title: error.message, icon: 'none' });
      }
    },
    favoriteBook() {
      try {
        const bookFavorite = store.toggleFavorite(store.reference('book', this.data.item));
        this.setData({ bookFavorite });
        store.syncQuietly();
        wx.showToast({ title: bookFavorite ? '已收藏本书' : '已取消收藏', icon: 'none' });
      } catch (error) {
        wx.showToast({ title: error.message, icon: 'none' });
      }
    },
    note() {
      store.editNote(this.data.ref);
    }
  }
});
