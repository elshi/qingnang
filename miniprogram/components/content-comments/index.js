const store = require('../../utils/learning-store');

Component({
  properties: { type: String, item: Object, chapter: Object },
  data: { ref: null, loggedIn: false, items: [], total: 0, cursor: '', content: '',
    loading: false, submitting: false, deleting: '', error: '', submitError: '' },
  observers: {
    'type,item,chapter': function () { if (this.ready) this.refresh(); }
  },
  lifetimes: {
    attached() { this.ready = true; this.drafts = {}; this.refresh(); },
    detached() { this.disposed = true; }
  },
  pageLifetimes: { show() { if (this.ready) this.refresh(true); } },
  methods: {
    noop() {},
    current(context) { return !this.disposed && this.context === context && context.owner === store.scope(); },
    refresh(force = false) {
      if (this.disposed) return;
      const { type, item, chapter } = this.data;
      const ref = (!item || (type === 'chapter' && !chapter)) ? null : store.reference(type, item,
        type === 'chapter' ? { chapterId: String(chapter.id), title: chapter.title, source: item.name || item.title } : {});
      const owner = store.scope();
      const key = owner + '/' + (ref ? store.refKey(ref) : '');
      if (this.context && this.context.key === key) {
        if (force && ref) return this.loadPage();
        return;
      }
      if (this.context && this.context.owner !== owner) this.drafts = {};
      this.context = { key, owner, ref };
      const draft = this.drafts[key];
      this.setData({ ref, loggedIn: Boolean(store.account()), items: [], total: 0, cursor: '',
        content: draft ? draft.content : '', error: '', submitError: '', loading: false, submitting: false, deleting: '' });
      if (ref) return this.loadPage();
    },
    async loadPage(append = false) {
      const context = this.context;
      if (!context || !context.ref || !this.current(context)) return;
      const cursor = append ? this.data.cursor : '';
      if (append && (!cursor || this.data.loading)) return;
      const request = this.listRequest = {};
      this.failedAppend = append;
      this.setData({ loading: true, error: '' });
      try {
        const result = await store.listComments(context.ref, cursor);
        if (!this.current(context) || this.listRequest !== request) return;
        const items = result.items.map(item => ({ ...item, dateLabel: store.dateLabel(item.createdAt) }));
        const previous = append ? this.data.items : [];
        const seen = new Set(previous.map(item => item.id));
        this.setData({ items: previous.concat(items.filter(item => !seen.has(item.id))),
          total: result.total, cursor: result.cursor, error: '' });
      } catch (error) {
        if (this.current(context) && this.listRequest === request) this.setData({ error: error.message });
        if (error.status === 401 && !this.disposed && this.context === context) this.refresh(true);
      } finally {
        if (this.current(context) && this.listRequest === request) this.setData({ loading: false });
      }
    },
    retry() { return this.loadPage(this.failedAppend); },
    more() { if (!this.data.submitting && !this.data.deleting) return this.loadPage(true); },
    input(event) {
      if (this.data.submitting || !this.context) return;
      const content = event.detail.value;
      this.drafts[this.context.key] = { ...this.drafts[this.context.key], content };
      this.setData({ content, submitError: '' });
    },
    async login() {
      if (this.data.submitting) return;
      const context = this.context;
      this.setData({ submitting: true, submitError: '' });
      try { await store.login(); if (!this.disposed) await this.refresh(true); }
      catch (error) { if (this.current(context)) this.setData({ submitError: error.message }); }
      finally { if (this.current(context)) this.setData({ submitting: false }); }
    },
    async submit() {
      if (this.data.submitting || this.data.deleting) return;
      const context = this.context;
      if (!context || !context.ref) return;
      if (!this.current(context)) { this.refresh(); return; }
      if (!store.account()) return this.login();
      const content = this.data.content.trim();
      if (!content) { this.setData({ submitError: '请先填写点评内容' }); return; }
      if (content.length > 1000) { this.setData({ submitError: '点评最多1000字' }); return; }
      const draft = this.drafts[context.key] || { content: this.data.content };
      if (draft.submittedContent !== content) {
        draft.submissionId = store.id();
        draft.submittedContent = content;
      }
      this.drafts[context.key] = draft;
      this.setData({ submitting: true, submitError: '' });
      try {
        const saved = await store.saveComment(context.ref, content, draft.submissionId);
        // Clear only the submitted draft, even if the reader has moved to another chapter.
        if (this.drafts[context.key] === draft) delete this.drafts[context.key];
        if (!this.current(context)) return;
        this.listRequest = null;
        const exists = this.data.items.some(item => item.id === saved.id);
        this.setData({ content: '', loading: false, items: [{ ...saved, dateLabel: store.dateLabel(saved.createdAt) },
          ...this.data.items.filter(item => item.id !== saved.id)], total: this.data.total + (exists ? 0 : 1) });
        wx.showToast({ title: '点评已发表', icon: 'success' });
        await this.loadPage();
      } catch (error) {
        if (this.current(context)) this.setData({ submitError: error.message });
        if (error.status === 401 && !this.disposed && this.context === context) this.refresh(true);
      } finally { if (this.current(context)) this.setData({ submitting: false }); }
    },
    async remove(event) {
      if (this.data.submitting || this.data.deleting) return;
      const context = this.context;
      if (!context || !this.current(context)) { this.refresh(); return; }
      const id = event.currentTarget.dataset.id;
      const item = this.data.items.find(row => row.id === id && row.mine);
      if (!item) return;
      this.setData({ deleting: id, submitError: '' });
      try {
        const answer = await new Promise((resolve, reject) => wx.showModal({ title: '删除点评',
          content: '确定删除这条点评吗？', confirmText: '删除', confirmColor: '#a77936', success: resolve, fail: reject }));
        if (!answer.confirm || !this.current(context)) return;
        await store.deleteComment(id);
        if (!this.current(context)) return;
        this.listRequest = null;
        this.setData({ items: this.data.items.filter(row => row.id !== id), total: Math.max(0, this.data.total - 1), loading: false });
        wx.showToast({ title: '点评已删除', icon: 'success' });
        await this.loadPage();
      } catch (error) {
        if (this.current(context)) this.setData({ submitError: error.message || '删除失败，请重试' });
        if (error.status === 401 && !this.disposed && this.context === context) this.refresh(true);
      } finally { if (this.current(context)) this.setData({ deleting: '' }); }
    }
  }
});
