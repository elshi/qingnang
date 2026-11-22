const store = require('../../../utils/learning-store');
const speech = require('../../../utils/speech-input');
Page({
  data: { key: '', title: '', content: '', ref: null, refLabel: '', recognizing: false, speechText: '',
    busy: true, draftStatus: '', error: '', conflict: false, pickerOpen: false, choices: [], choiceKeyword: '' },
  async onLoad(options = {}) {
    try { await store.requireLogin(); } catch (error) { this.setData({ error: error.message }); return; }
    this.owner = store.scope();
    try { await store.synchronize(); } catch (error) { this.setData({ error: error.message }); }
    if (this.disposed) return;
    let ref = null;
    try { ref = options.ref ? JSON.parse(decodeURIComponent(options.ref)) : null; } catch (error) {}
    if (ref && !store.TYPES[ref.type]) ref = null;
    const key = options.key ? decodeURIComponent(options.key) : '';
    const saved = key ? store.records('note').find(row => row.key === key) : null;
    if (key && !saved) { this.setData({ error: '这篇笔记已删除或暂不可用' }); this.missing = true; return; }
    this.draftId = key || (ref ? 'ref:' + store.refKey(ref) : 'new');
    const draft = store.getDraft(this.draftId);
    const value = draft || saved || { title: ref ? '读《' + ref.title + '》' : '', content: '', ref };
    this.noteKey = value.key?.startsWith('note:') ? value.key : (key || 'note:' + store.id());
    this.version = value.version || 0;
    this.createdAt = value.createdAt || Date.now();
    this.setData({ key, title: value.title || '', content: value.content || '', ref: value.ref || null,
      refLabel: this.label(value.ref), busy: false, draftStatus: draft ? '已恢复草稿' : '',
      conflict: Boolean(saved && this.version !== saved.version) });
    this.cursor = this.data.content.length;
    this.initial = JSON.stringify(this.note());
  },
  label(ref) { return ref ? [ref.source, ref.title].filter(Boolean).join(' · ') : '选择要关联的经典原文'; },
  note() { return { key: this.noteKey, version: this.version, title: this.data.title, content: this.data.content,
    ref: this.data.ref, createdAt: this.createdAt }; },
  input(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value, error: '' });
    if (event.currentTarget.dataset.field === 'content') this.cursor = event.detail.cursor ?? event.detail.value.length;
    this.persist();
  },
  rememberCursor(event) { this.cursor = event.detail.cursor ?? this.data.content.length; },
  persist() {
    if (this.missing || this.saved || !this.initial || this.owner !== store.scope()) return;
    if (JSON.stringify(this.note()) === this.initial) return;
    try {
      store.setDraft(this.draftId, this.note());
      this.update({ draftStatus: '草稿待上传' });
      clearTimeout(this.draftTimer);
      this.draftTimer = setTimeout(() => this.flushDraft(), 1500);
    } catch (error) { this.update({ error: '恢复副本保存失败，请检查本机存储空间' }); }
  },
  async flushDraft() {
    clearTimeout(this.draftTimer);
    if (this.saved || this.missing || !this.initial || this.owner !== store.scope() || JSON.stringify(this.note()) === this.initial) return;
    const draft = this.note();
    const task = store.saveDraft(this.draftId, draft);
    this.draftTask = task;
    try {
      await task;
      if (JSON.stringify(this.note()) === JSON.stringify(draft)) this.update({ draftStatus: '草稿已保存到云端' });
    } catch (error) { this.update({ draftStatus: '草稿未上传，恢复副本保留在本机', error: error.message }); }
    finally { if (this.draftTask === task) this.draftTask = null; }
  },
  async save() {
    if (this.data.busy || this.missing) return;
    if (this.data.recognizing) { this.setData({ error: '请先结束语音识别' }); return; }
    if (this.owner !== store.scope()) { this.setData({ error: '登录状态已变更，请重新打开笔记' }); return; }
    this.setData({ busy: true, error: '' });
    clearTimeout(this.draftTimer);
    try {
      if (this.draftTask) await this.draftTask.catch(() => {});
      const saved = await store.saveNote(this.note(), this.draftId);
      this.saved = true;
      this.version = saved.version;
      if (this.forkedFrom) store.dismissConflict(this.forkedFrom);
      wx.showToast({ title: '笔记已保存到云端', icon: 'success' });
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/notes/index/index' });
    } catch (error) {
      this.setData({ busy: false, error: error.message, conflict: error.status === 409 || this.data.conflict });
      try { store.setDraft(this.draftId, this.note()); }
      catch (storageError) { this.setData({ error: error.message + '；恢复副本也未保存，请勿关闭当前页面' }); }
    }
  },
  saveAsNew() {
    this.forkedFrom = this.noteKey;
    this.noteKey = 'note:' + store.id();
    this.version = 0;
    this.createdAt = Date.now();
    this.setData({ conflict: false });
    return this.save();
  },
  openSource() {
    if (this.data.ref) store.open(this.data.ref);
    else this.chooseSource();
  },
  chooseSource() {
    this.setData({ pickerOpen: true, choiceKeyword: '' });
    this.filterChoices();
  },
  searchChoices(event) {
    this.setData({ choiceKeyword: event.detail.value });
    this.filterChoices();
  },
  filterChoices() {
    const seen = new Set();
    const choices = [...store.records('favorite'), ...store.records('history')]
      .filter((item) => {
        if (!item.ref || seen.has(store.refKey(item.ref))) return false;
        seen.add(store.refKey(item.ref));
        return store.matches(item, this.data.choiceKeyword);
      })
      .slice(0, 50)
      .map((item) => ({ ...item, sourceLabel: store.sourceLabel(item.ref) }));
    this.setData({ choices });
  },
  selectSource(event) {
    const item = this.data.choices.find((row) => row.key === event.currentTarget.dataset.key);
    if (item) {
      this.setData({ ref: item.ref, refLabel: this.label(item.ref), pickerOpen: false });
      this.persist();
    }
  },
  unlink() {
    this.setData({ ref: null, refLabel: this.label(null), pickerOpen: false });
    this.persist();
  },
  closePicker() {
    this.setData({ pickerOpen: false });
  },
  record() {
    if (this.data.busy) return;
    if (this.data.recognizing) { this.speechSession?.stop(); return; }
    const original = this.data.content;
    const cursor = Math.max(0, Math.min(this.cursor ?? original.length, original.length));
    this.setData({ recognizing: true, speechText: '', error: '' });
    try {
      this.speechSession = speech.start({
        onPartial: text => this.update({ speechText: text }),
        onComplete: text => {
          if (this.disposed) return;
          if (!text) { this.update({ recognizing: false, speechText: '', error: '没有识别到文字，请再试一次' }); return; }
          const available = Math.max(0, 20000 - original.length);
          const inserted = text.slice(0, available);
          this.update({ content: original.slice(0, cursor) + inserted + original.slice(cursor), recognizing: false, speechText: '',
            error: text.length > available ? '正文已达长度上限，请整理后继续输入' : '' });
          this.cursor = cursor + inserted.length;
          this.persist();
        },
        onError: error => this.update({ recognizing: false, speechText: '', error: error.message })
      });
    } catch (error) { this.setData({ recognizing: false, error: error.message }); }
  },
  deleteNote() {
    if (!this.data.key || this.data.busy) return;
    wx.showModal({ title: '删除笔记', content: '删除后无法恢复，确定删除这篇笔记吗？', confirmColor: '#a77936',
      success: async result => {
        if (!result.confirm) return;
        this.setData({ busy: true });
        clearTimeout(this.draftTimer);
        try {
          if (this.draftTask) await this.draftTask.catch(() => {});
          await store.remove('note', this.data.key);
          this.saved = true;
          await store.clearDraft(this.draftId).catch(() => {});
          wx.navigateBack();
        } catch (error) { this.setData({ busy: false, error: error.message }); }
      }
    });
  },
  onHide() {
    this.speechSession?.cancel();
    this.update({ recognizing: false, speechText: '' });
    this.flushDraft();
  },
  onShow() {
    if (this.owner && this.owner !== store.scope()) {
      this.missing = true;
      this.setData({ title: '', content: '', busy: true, error: '登录状态已变更，请返回后重新打开笔记' });
    }
  },
  onUnload() { this.onHide(); this.disposed = true; clearTimeout(this.draftTimer); },
  update(value) { if (!this.disposed) this.setData(value); },
  noop() {}
});
