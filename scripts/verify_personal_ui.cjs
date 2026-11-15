// Run against an isolated copy in WeChat DevTools, never against a production device.
// NODE_PATH may point to the directory containing miniprogram-automator.
const automator = require('miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const folder = path.resolve(__dirname, '../docs/screenshots/personal');
const endpoint = process.env.PERSONAL_QA_ENDPOINT || 'ws://127.0.0.1:9421';
const prefix = 'qingnang.learning.v1:';
const accountKey = prefix + 'account';
const stateKey = prefix + 'guest';
const now = Date.now();
const book = { type: 'book', id: '1', title: '黄帝内经', source: '佚名' };
const chapter = { type: 'chapter', id: '1', chapterId: '1', title: '上古天真论', source: '黄帝内经' };
const prescription = { type: 'prescription', id: '1', title: '桂枝汤', source: '伤寒论' };
const meridian = { type: 'meridian', id: '1', title: '督脉', source: '奇经八脉' };
const keyFor = (ref) => ref.type + ':' + ref.id + (ref.chapterId ? ':' + ref.chapterId : '');
const fixtures = [book, chapter, prescription, meridian].map((ref, index) => ({
  key: 'favorite:' + keyFor(ref),
  kind: 'favorite',
  title: ref.title,
  ref,
  updatedAt: now - index * 1000
}));
fixtures.push(
  {
    key: 'note:qa-linked',
    kind: 'note',
    title: '读《上古天真论》',
    content: '把食饮有节、起居有常放回原文理解。',
    ref: chapter,
    updatedAt: now - 86400000,
    createdAt: now - 86400000
  },
  {
    key: 'note:qa-formula',
    kind: 'note',
    title: '桂枝汤读书札记',
    content: '对照原文，整理本次学习中的疑问。',
    ref: prescription,
    updatedAt: now - 172800000,
    createdAt: now - 172800000
  },
  {
    key: 'note:qa-free',
    kind: 'note',
    title: '本周阅读计划',
    content: '重读经典，记录不熟悉的字词。',
    ref: null,
    updatedAt: now - 345600000,
    createdAt: now - 345600000
  },
  ...[chapter, prescription, meridian, { type: 'case', id: '1', title: '叶天士 · 咳嗽', source: '临证指南医案' }].map((ref, index) => ({
    key: 'history:' + keyFor(ref),
    kind: 'history',
    ref,
    title: ref.title,
    updatedAt: now - [0, 7200000, 86400000, 93600000][index],
    scrollTop: 490,
    contentMode: 'original',
    progressLabel: index === 0 ? '读至第 1 章' : ''
  }))
);

(async () => {
  fs.mkdirSync(folder, { recursive: true });
  const mini = await automator.connect({ wsEndpoint: endpoint });
  const errors = [],
    checkpoints = [];
  const backups = new Map();
  mini.on('exception', (error) => errors.push(error));
  try {
    const info = await mini.callWxMethod('getStorageInfoSync');
    for (const key of info.keys.filter((key) => key.startsWith(prefix) || key === 'noteDraft'))
      backups.set(key, await mini.callWxMethod('getStorageSync', key));
    await mini.callWxMethod('removeStorageSync', accountKey);
    await mini.callWxMethod('setStorageSync', stateKey, { records: fixtures, pending: [] });
    const shot = async (name) => {
      await mini.screenshot({ path: path.join(folder, name + '.png') });
    };
    if (process.env.PERSONAL_QA_CAPTURE_ONLY === '1') {
      const screens = [
        ['profile', '/pages/profile/index/index'],
        ['favorites', '/pages/favorites/index/index'],
        ['notes', '/pages/notes/index/index'],
        ['editor', '/pages/notes/editor/editor?key=note%3Aqa-linked'],
        ['history', '/pages/history/index/index'],
        ['feedback', '/pages/feedback/index/index']
      ];
      for (const [name, route] of screens) {
        const screen = await mini.reLaunch(route);
        await screen.waitFor(500);
        if (name === 'editor') await screen.callMethod('input', { currentTarget: { dataset: { field: 'content' } }, detail: { value: '今天读到“食饮有节，起居有常”，想结合前后文再理解一遍。' } });
        await shot(name);
        console.log('Captured', name);
      }
      return;
    }
    let current = await mini.switchTab('/pages/profile/index/index');
    await current.waitFor('.profile-menu-row');
    assert.equal((await current.$$('.profile-menu-row')).length, 4);
    await shot('profile');
    await current.callMethod('openPage', { currentTarget: { dataset: { page: 'favorites' } } });
    await current.waitFor(200);
    await current.waitFor(400);
    current = await mini.currentPage();
    assert.equal(current.path, 'pages/favorites/index/index');
    assert.equal((await current.data()).items.length, 4);
    await shot('favorites');
    await (await current.$('.personal-search input')).input('桂枝');
    await current.waitFor(200);
    assert.equal((await current.data()).items.length, 1);
    await (await current.$('.personal-search button')).trigger('tap');
    await current.waitFor(200);
    await (await current.$('[data-key="book"]')).trigger('tap');
    await current.waitFor(200);
    assert.equal((await current.data()).items.length, 2);
    checkpoints.push('收藏搜索、医书/章节分类和入口跳转');

    current = await mini.navigateTo('/pages/notes/index/index');
    await shot('notes');
    await (await current.$('[data-key="free"]')).trigger('tap');
    await current.waitFor(200);
    assert.equal((await current.data()).items.length, 1);
    await (await current.$('[data-key="all"]')).trigger('tap');
    await current.waitFor(200);
    await current.callMethod('edit', { currentTarget: { dataset: { key: 'note:qa-linked' } } });
    await current.waitFor(200);
    await current.waitFor(400);
    current = await mini.currentPage();
    await current.waitFor('.editor-content');
    await (
      await current.$('.editor-content')
    ).input('今天读到“食饮有节，起居有常”，想结合前后文再理解一遍。');
    await current.waitFor(200);
    assert.equal((await current.data()).draftStatus, '草稿已保存到本机');
    await shot('editor');
    await mini.navigateBack();
    await current.waitFor(400);
    current = await mini.currentPage();
    await current.callMethod('edit', { currentTarget: { dataset: { key: 'note:qa-linked' } } });
    await current.waitFor(200);
    await current.waitFor(400);
    current = await mini.currentPage();
    assert.match((await current.data()).content, /前后文/);
    const header = await current.$('personal-nav');
    await header.callMethod('act');
    await current.waitFor(200);
    await current.waitFor(400);
    current = await mini.currentPage();
    assert.equal(current.path, 'pages/notes/index/index');
    await (await current.$('.personal-search input')).input('前后文');
    await current.waitFor(200);
    assert.equal((await current.data()).items.length, 1);
    checkpoints.push('关联笔记编辑、返回自动存草稿、恢复、保存和正文检索');

    const notesHeader = await current.$('personal-nav');
    await notesHeader.callMethod('act');
    await current.waitFor(200);
    await current.waitFor(400);
    current = await mini.currentPage();
    await (await current.$('.editor-title')).input('验收：自由笔记');
    await current.waitFor(200);
    await (await current.$('.editor-content')).input('用于本机功能验收的临时内容');
    await current.waitFor(200);
    await (await current.$('personal-nav')).callMethod('act');
    await current.waitFor(200);
    const saved = await mini.callWxMethod('getStorageSync', stateKey);
    assert.ok(
      saved.records.some(
        (record) => record.kind === 'note' && record.title === '验收：自由笔记' && !record.ref
      )
    );
    checkpoints.push('自由笔记新建与持久化');

    current = await mini.navigateTo('/pages/history/index/index');
    await shot('history');
    await (await current.$('.personal-search input')).input('桂枝');
    await current.waitFor(200);
    assert.equal((await current.data()).groups.length, 1);
    assert.equal((await current.data()).groups[0].items[0].title, '桂枝汤');
    checkpoints.push('浏览记录分组和搜索');

    current = await mini.navigateTo('/pages/feedback/index/index');
    await shot('feedback');
    await (await current.$('[data-type="产品建议"]')).trigger('tap');
    await current.waitFor(200);
    await (await current.$('.personal-primary')).trigger('tap');
    await current.waitFor(200);
    assert.equal((await current.data()).error, '请填写至少5个字的问题描述');
    assert.equal((await current.data()).submitted, false);
    checkpoints.push('反馈分类与空内容校验，未提交外部反馈');

    current = await mini.navigateTo('/pages/profile/privacy/privacy');
    assert.match(await (await current.$('.privacy-body')).text(), /草稿仅保存在本机/);
    await shot('privacy');
    current = await mini.navigateTo('/pages/favorites/index/index');
    await (await current.$('.personal-search input')).input('不存在的条目');
    await current.waitFor(200);
    await shot('favorites-empty');
    assert.equal((await current.data()).items.length, 0);
    checkpoints.push('隐私说明与搜索无结果状态');
    fs.writeFileSync(
      path.join(folder, 'verification.json'),
      JSON.stringify({ viewport: await mini.systemInfo(), checkpoints, exceptions: errors }, null, 2)
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(JSON.stringify({ passed: checkpoints, exceptions: errors.length }, null, 2));
  } catch (error) {
    const failedPage = await mini.currentPage();
    console.error('UI failure:', failedPage && failedPage.path, failedPage && await failedPage.data(), errors);
    throw error;
  } finally {
    const info = await mini.callWxMethod('getStorageInfoSync');
    for (const key of info.keys.filter((key) => key.startsWith(prefix) || key === 'noteDraft'))
      if (!backups.has(key)) await mini.callWxMethod('removeStorageSync', key);
    for (const [key, value] of backups) await mini.callWxMethod('setStorageSync', key, value);
    try { await mini.switchTab('/pages/profile/index/index'); }
    finally { await mini.disconnect(); }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
