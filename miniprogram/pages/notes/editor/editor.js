const store = require('../../../utils/learning-store');
Page({
  data: {
    key: '',
    title: '',
    content: '',
    ref: null,
    refLabel: '',
    audio: null,
    recording: false,
    playing: false,
    busy: false,
    draftStatus: '',
    error: '',
    pickerOpen: false,
    choices: [],
    choiceKeyword: ''
  },
  onLoad(options = {}) {
    this.owner = store.scope();
    let ref = null;
    try {
      ref = options.ref ? JSON.parse(decodeURIComponent(options.ref)) : null;
    } catch (error) {
      /* Invalid links open a blank editor. */
    }
    if (ref && !store.TYPES[ref.type]) ref = null;
    const key = options.key ? decodeURIComponent(options.key) : '';
    const saved = key ? store.records('note').find((item) => item.key === key) : null;
    if (key && !saved) {
      this.setData({ error: '这篇笔记已删除或不可用', busy: true });
      this.missing = true;
      return;
    }
    this.draftId = key || (ref ? 'ref:' + store.refKey(ref) : 'new');
    const draft = store.getDraft(this.draftId);
    const value = draft || saved || { title: ref ? '读《' + ref.title + '》' : '', content: '', ref };
    this.setData({
      ...value,
      key,
      refLabel: this.label(value.ref),
      draftStatus: draft ? '已恢复本机草稿' : ''
    });
    this.initial = JSON.stringify(this.note());
  },
  label(ref) {
    return ref ? [ref.source, ref.title].filter(Boolean).join(' · ') : '选择要关联的经典原文';
  },
  note() {
    return {
      key: this.data.key,
      title: this.data.title,
      content: this.data.content,
      ref: this.data.ref,
      audio: this.data.audio,
      createdAt: this.data.createdAt
    };
  },
  input(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value, error: '' });
    this.persist();
  },
  persist() {
    if (this.missing || this.saved || this.owner !== store.scope()) return;
    if (JSON.stringify(this.note()) === this.initial) return;
    try {
      store.setDraft(this.draftId, this.note());
      this.recordData({ draftStatus: '草稿已保存到本机' });
    } catch (error) {
      this.recordData({ draftStatus: '', error: error.message });
    }
  },
  async save() {
    if (this.data.busy || this.missing) return;
    if (this.data.recording || this.startingRecording || this.audioSaving) {
      this.setData({ error: '请先结束录音，等待语音保存' });
      return;
    }
    this.setData({ busy: true, error: '' });
    try {
      store.saveNote(this.note());
      this.saved = true;
      try {
        store.clearDraft(this.draftId);
      } catch (error) {
        /* The note has already been saved. */
      }
      store.syncQuietly();
      wx.showToast({ title: '笔记已保存', icon: 'success' });
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.redirectTo({ url: '/pages/notes/index/index' });
    } catch (error) {
      this.setData({ busy: false, error: error.message });
    }
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
  async record() {
    if (this.data.recording) {
      this.recorder.stop();
      return;
    }
    if (this.audioSaving || this.startingRecording) return;
    if (!wx.getRecorderManager) {
      this.setData({ error: '当前微信版本暂不支持录音' });
      return;
    }
    if (!this.recorder) {
      this.recorder = wx.getRecorderManager();
      this.onRecordStart = () => {
        this.startingRecording = false;
        this.recordData({ recording: true, error: '' });
        if (this.disposed) this.recorder.stop();
      };
      this.onRecordError = () => {
        this.startingRecording = false;
        this.audioSaving = false;
        this.recordData({ recording: false, error: '录音未开启，请检查微信麦克风权限后重试' });
        if (this.disposed) this.detachRecorder();
      };
      this.onRecordStop = (result) => {
        this.startingRecording = false;
        this.recordData({ recording: false });
        this.audioSaving = true;
        if (!result.tempFilePath || result.duration < 500) {
          this.audioSaving = false;
          this.recordData({ error: '录音太短，请重新录制' });
          if (this.disposed) this.detachRecorder();
          return;
        }
        wx.getFileSystemManager().saveFile({
          tempFilePath: result.tempFilePath,
          success: (saved) => {
            this.audioSaving = false;
            this.recordData({
              audio: { path: saved.savedFilePath, seconds: Math.max(1, Math.round(result.duration / 1000)) }
            });
            this.persist();
            if (this.disposed) this.detachRecorder();
          },
          fail: () => {
            this.audioSaving = false;
            this.recordData({ error: '语音保存失败，请检查存储空间' });
            if (this.disposed) this.detachRecorder();
          }
        });
      };
      this.recorder.onStart(this.onRecordStart);
      this.recorder.onError(this.onRecordError);
      this.recorder.onStop(this.onRecordStop);
    }
    if (this.player) this.player.stop();
    this.startingRecording = true;
    this.recorder.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    });
  },
  async playAudio() {
    if (!this.data.audio) return;
    if (this.data.playing) {
      this.player.stop();
      this.setData({ playing: false });
      return;
    }
    try {
      if (!this.player) {
        this.player = wx.createInnerAudioContext();
        this.player.onEnded(() => this.setData({ playing: false }));
        this.player.onError(() =>
          this.setData({ playing: false, error: '语音暂时无法播放，请检查网络或文件是否存在' })
        );
      }
      let path = this.data.audio.localPath || this.data.audio.path;
      if (path.startsWith('cloud://')) {
        const result = await wx.cloud.getTempFileURL({ fileList: [path] });
        path = result.fileList[0].tempFileURL;
      }
      this.player.src = path;
      this.player.play();
      this.setData({ playing: true });
    } catch (error) {
      this.setData({ error: '语音加载失败，请稍后重试' });
    }
  },
  removeAudio() {
    if (this.player) this.player.stop();
    this.setData({ audio: null, playing: false });
    this.persist();
  },
  deleteNote() {
    if (!this.data.key) return;
    wx.showModal({
      title: '删除笔记',
      content: '删除后无法恢复，确定删除这篇笔记吗？',
      confirmColor: '#a77936',
      success: (result) => {
        if (!result.confirm) return;
        try {
          store.remove('note', this.data.key);
          this.saved = true;
          store.clearDraft(this.draftId);
          store.syncQuietly();
          wx.navigateBack();
        } catch (error) {
          this.setData({ error: error.message });
        }
      }
    });
  },
  onHide() {
    if (this.data.recording || this.startingRecording) this.recorder.stop();
    if (this.player) this.player.stop();
    this.persist();
  },
  onUnload() {
    this.onHide();
    this.disposed = true;
    if (this.player) this.player.destroy();
    if (this.recorder && !this.data.recording && !this.startingRecording && !this.audioSaving) this.detachRecorder();
  },
  recordData(value) { if (this.disposed) Object.assign(this.data, value); else this.setData(value); },
  detachRecorder() {
    if (this.recorder.offStart) this.recorder.offStart(this.onRecordStart);
    if (this.recorder.offError) this.recorder.offError(this.onRecordError);
    if (this.recorder.offStop) this.recorder.offStop(this.onRecordStop);
  },
  noop() {}
});
