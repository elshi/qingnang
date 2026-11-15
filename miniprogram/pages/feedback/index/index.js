const store = require('../../../utils/learning-store');
const types = ['内容纠错', '功能异常', '产品建议', '其他'];
Page({
  data: {
    types,
    type: types[0],
    content: '',
    contact: '',
    images: [],
    busy: false,
    error: '',
    submitted: false
  },
  onLoad() {
    this.submissionId = store.id();
  },
  input(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value, error: '' });
    this.submissionId = store.id();
  },
  selectType(event) {
    if (this.data.busy) return;
    this.setData({ type: event.currentTarget.dataset.type });
    this.submissionId = store.id();
  },
  chooseImages() {
    if (this.data.busy || this.data.images.length >= 3) return;
    wx.chooseMedia({
      count: 3 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (result) => {
        const valid = result.tempFiles.filter((file) => file.size <= 5 * 1024 * 1024);
        this.setData({
          images: [...this.data.images, ...valid.map((file) => ({ path: file.tempFilePath, fileID: '' }))],
          error: valid.length < result.tempFiles.length ? '每张图片不能超过5MB' : ''
        });
        this.submissionId = store.id();
      },
      fail: (error) => {
        if (!/cancel/.test(error.errMsg || '')) this.setData({ error: '未能选取图片，请检查相册权限后重试' });
      }
    });
  },
  preview(event) {
    wx.previewImage({
      current: event.currentTarget.dataset.path,
      urls: this.data.images.map((image) => image.path)
    });
  },
  removeImage(event) {
    if (this.data.busy) return;
    this.setData({
      images: this.data.images.filter((_, index) => index !== Number(event.currentTarget.dataset.index))
    });
    this.submissionId = store.id();
  },
  async submit() {
    if (this.data.busy) return;
    const content = this.data.content.trim(),
      contact = this.data.contact.trim();
    if (content.length < 5) {
      this.setData({ error: '请填写至少5个字的问题描述' });
      return;
    }
    if (contact && !/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d ()-]{6,20})$/.test(contact)) {
      this.setData({ error: '请填写有效的手机号或邮箱' });
      return;
    }
    this.setData({ busy: true, error: '' });
    try {
      // Login here only obtains an upload namespace; it does not sign the reader in or sync their notes.
      const user = await store.cloud('login');
      const images = this.data.images.slice();
      for (let index = 0; index < images.length; index += 1) {
        if (!images[index].fileID) {
          const extension = /\.(png|jpe?g|webp)$/i.exec(images[index].path);
          const uploaded = await wx.cloud.uploadFile({
            cloudPath:
              'personal/' +
              user.id +
              '/feedback/' +
              this.submissionId +
              '-' +
              index +
              '.' +
              (extension ? extension[1].toLowerCase() : 'jpg'),
            filePath: images[index].path
          });
          images[index] = { ...images[index], fileID: uploaded.fileID };
          this.setData({ images });
        }
      }
      await store.cloud('feedback', {
        feedback: {
          id: this.submissionId,
          type: this.data.type,
          content,
          contact,
          images: images.map((image) => image.fileID)
        }
      });
      this.setData({ submitted: true, content: '', contact: '', images: [] });
    } catch (error) {
      this.setData({ error: error.message || '提交失败，内容已保留，请稍后重试' });
    } finally {
      this.setData({ busy: false });
    }
  },
  back() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/profile/index/index' });
  }
});
