const store = require('../../utils/learning-store');
Component({
  properties: { type: String, item: Object, chapter: Object, track: { type: Boolean, value: true }, showNotes: Boolean },
  data: { ref: null, favorite: false, bookFavorite: false, busy: false, items: [], loggedIn: false, loading: false, error: '' },
  observers: {
    'type,item,chapter': function () {
      this.refresh(true);
    }
  },
  lifetimes: {
    attached() { if (this.data.showNotes) this.reloadNotes(); },
    detached() { this.disposed = true; }
  },
  pageLifetimes: {
    show() {
      if (this.data.showNotes) { this.reloadNotes(); return; }
      this.refresh(false);
      store.syncQuietly().then(() => this.refresh(false));
    }
  },
  methods: {
    noop() {},
    refresh(track) {
      if (this.disposed) return;
      const { type, item, chapter } = this.data;
      if (!item || (type === 'chapter' && !chapter)) {
        this.setData({ ref: null, items: [] });
        return;
      }
      const extra =
        type === 'chapter'
          ? { chapterId: String(chapter.id), title: chapter.title, source: item.name || item.title }
          : {};
      const ref = store.reference(type, item, extra);
      if (this.data.showNotes) {
        const loggedIn = Boolean(store.account());
        const items = loggedIn ? store.relatedNotes(ref).map(({ key, title, content, updatedAt }) => ({
          key, title, content, dateLabel: store.dateLabel(updatedAt)
        })) : [];
        this.setData({ ref, loggedIn, items });
        return;
      }
      this.setData({
        ref,
        favorite: store.isFavorite(ref),
        bookFavorite: type === 'chapter' && store.isFavorite(store.reference('book', item))
      });
      if (track && this.data.track) store.visit(ref);
    },
    async reloadNotes() {
      if (this.disposed) return;
      this.refresh(false);
      const owner = store.scope();
      const request = this.notesRequest = {};
      this.setData({ loading: Boolean(store.account()), error: '' });
      try {
        const pending = await store.synchronize();
        if (!this.disposed && request === this.notesRequest && owner === store.scope() && pending) {
          this.setData({ error: '有待处理的恢复副本，请打开对应笔记核对' });
        }
      } catch (error) {
        if (!this.disposed && request === this.notesRequest && owner === store.scope()) {
          this.setData({ error: `${error.message}；当前显示上次缓存` });
        }
      } finally {
        if (!this.disposed && request === this.notesRequest) {
          this.setData({ loading: false });
          this.refresh(false);
        }
      }
    },
    async loginForNotes() {
      try { await store.requireLogin(); await this.reloadNotes(); }
      catch (error) { if (!this.disposed) this.setData({ error: error.message }); }
    },
    editRelatedNote(event) {
      store.editNote(null, event.currentTarget.dataset.key);
    },
    async favorite() {
      if (this.data.busy) return;
      this.setData({ busy: true });
      try {
        const favorite = await store.toggleFavorite(this.data.ref);
        this.setData({ favorite });
        wx.showToast({ title: favorite ? '已收藏' : '已取消收藏', icon: 'none' });
      } catch (error) {
        this.refresh(false);
        wx.showToast({ title: error.message, icon: 'none' });
      } finally { this.setData({ busy: false }); }
    },
    async favoriteBook() {
      if (this.data.busy) return;
      this.setData({ busy: true });
      try {
        const bookFavorite = await store.toggleFavorite(store.reference('book', this.data.item));
        this.setData({ bookFavorite });
        wx.showToast({ title: bookFavorite ? '已收藏本书' : '已取消收藏', icon: 'none' });
      } catch (error) {
        this.refresh(false);
        wx.showToast({ title: error.message, icon: 'none' });
      } finally { this.setData({ busy: false }); }
    },
    note() {
      store.editNote(this.data.ref);
    }
  }
});
