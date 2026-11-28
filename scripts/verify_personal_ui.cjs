// Offline UI acceptance only. This creates an isolated temporary project with a fake API.
// No production data, login service, or feedback endpoint is used.
const automator = require('miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qingnang-personal-ui-'));
const source = path.resolve(__dirname, '../miniprogram');
const folder = path.resolve(__dirname, '../docs/screenshots/personal-cloud');
const cliPath = process.env.WECHAT_CLI || 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
const owner = 'a'.repeat(32);
const user = { id: owner, token: 'c'.repeat(64), expiresAt: Date.now() + 86400000 };
const reference = { type: 'chapter', id: '1', chapterId: '1', title: '上古天真论', source: '黄帝内经' };
const fixtures = [
  { key: 'favorite:chapter:1:1', kind: 'favorite', ref: reference, title: reference.title, version: 1 },
  { key: 'note:qa', kind: 'note', ref: reference, title: '读《上古天真论》', content: '把食饮有节、起居有常放回原文理解。', version: 1 },
  { key: 'history:chapter:1:1', kind: 'history', ref: reference, title: reference.title, scrollTop: 320, contentMode: 'original', version: 1 }
].map(row => ({ ...row, updatedAt: Date.now(), createdAt: Date.now() }));
fs.cpSync(source, project, { recursive: true });
const appConfig = JSON.parse(fs.readFileSync(path.join(project, 'app.json'), 'utf8'));
delete appConfig.plugins; // Visual tests must run independently of provider authorization.
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify(appConfig));
fs.writeFileSync(path.join(project, 'app.js'), 'App({ onLaunch(){}, getDisclaimer(){ return "仅供学习参考"; } });');
fs.writeFileSync(path.join(project, 'utils/request.js'), 'const records = ' + JSON.stringify(fixtures) + ';\n' +
  'const user = ' + JSON.stringify(user) + ';\n' +
  'module.exports.request = ' + (async function(options) {
    const endpoint = options.path.split('?')[0];
    if (endpoint === '/api/personal/session') return user;
    if (endpoint === '/api/personal/import') return { records: [] };
    if (endpoint === '/api/personal/records' && options.method === 'GET') return { records, cursor: '' };
    if (endpoint === '/api/personal/records') {
      const { record, expectedVersion, mutationId, draftKey } = options.data;
      const index = records.findIndex(row => row.key === record.key);
      const saved = { ...record, version: expectedVersion + 1, mutationId, updatedAt: Date.now(), deleted: !!record.deleted };
      if (index >= 0) records[index] = saved; else records.push(saved);
      if (draftKey) {
        const previous = records.findIndex(row => row.key === draftKey);
        const clearedDraft = { key: draftKey, kind: 'draft', version: 1, deleted: true, updatedAt: Date.now() };
        if (previous >= 0) records[previous] = clearedDraft; else records.push(clearedDraft);
        return { ...saved, clearedDraft };
      }
      return saved;
    }
    if (endpoint === '/api/cases/1') return { id: '1', title: '叶天士 · 咳嗽', source: '临证指南医案', tags: ['咳嗽'], content: '经典原文示例。\n用于界面布局验收。', analysis: '医案解析示例。用于验证原文与解析切换。', prescription: [] };
    if (endpoint === '/api/personal/feedback') throw Error('离线验收禁止提交反馈');
    return { items: [], list: [], total: 0, dynasties: [], categories: [] };
  }).toString() + ';');
const backups = new Map(), errors = [];
let mini;
let backupComplete = false;
const watchdog = setTimeout(() => { console.error('UI acceptance timed out'); process.exit(1); }, 120000);
(async () => {
  fs.mkdirSync(folder, { recursive: true });
  const port = Number(process.env.PERSONAL_QA_PORT || 9423);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid automation port');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  execFileSync('powershell.exe', ['-NoProfile', '-Command', '& ' + quote(cliPath) + ' auto --project ' + quote(project) + ' --auto-port ' + port + ' --trust-project'], { timeout: 45000, windowsHide: true, encoding: 'utf8' });
  mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:' + port });
  mini.on('exception', error => errors.push(error));
  const info = await mini.callWxMethod('getStorageInfoSync');
  for (const key of info.keys.filter(key => key.startsWith('qingnang.learning.') || key === 'noteDraft')) {
    backups.set(key, await mini.callWxMethod('getStorageSync', key));
  }
  backupComplete = true;
  for (const key of backups.keys()) await mini.callWxMethod('removeStorageSync', key);
  const shot = name => mini.screenshot({ path: path.join(folder, name + '.png') });
  let page = await mini.switchTab('/pages/profile/index/index');
  assert.match(await (await page.$('personal-nav')).text(), /个人中心/);
  assert.equal(await (await page.$('.personal-primary')).text(), '微信登录');
  await shot('profile');
  await mini.callWxMethod('setStorageSync', 'qingnang.learning.v2:account', user);
  page = await mini.navigateTo('/pages/cases/detail/detail?id=1');
  await page.waitFor('.detail-title');
  const tabs = await page.$$('.detail-tab');
  const container = await (await page.$('.detail-tabs')).size();
  for (const tab of tabs) {
    assert.ok(Math.abs(Number((await tab.size()).width) - Number(container.width) / 2) < 1);
    assert.equal(await tab.style('text-align'), 'center');
  }
  const tabsPosition = await (await page.$('.detail-tabs')).offset();
  const tabsSize = await (await page.$('.detail-tabs')).size();
  const actions = await (await page.$('learning-actions')).$('.learning-actions');
  const actionsPosition = await actions.offset();
  assert.ok(Number(actionsPosition.top) >= Number(tabsPosition.top) + Number(tabsSize.height) - 1);
  await shot('case-original');
  await tabs[1].trigger('tap'); assert.equal(await page.data('activeTab'), 'analysis'); await shot('case-analysis');
  page = await mini.navigateTo('/pages/favorites/index/index');
  await page.waitFor('.personal-title');
  assert.equal((await page.data()).items.length, 1); await shot('favorites');
  page = await mini.navigateTo('/pages/notes/index/index'); await page.waitFor('.note-row'); await shot('notes');
  page = await mini.navigateTo('/pages/notes/editor/editor?key=note%3Aqa');
  await page.waitFor(async () => !(await page.data()).busy);
  await (await page.$('.editor-content')).input('今天读到食饮有节、起居有常，结合前后文再理解一遍。');
  await page.waitFor(async () => (await page.data()).draftStatus === '草稿已保存到云端');
  await shot('editor');
  await page.callMethod('save');
  page = await mini.currentPage();
  assert.equal(page.path, 'pages/notes/index/index');
  assert.match((await page.data()).items[0].content, /前后文/);
  page = await mini.navigateTo('/pages/history/index/index'); await page.waitFor('.personal-row'); await shot('history');
  page = await mini.navigateTo('/pages/feedback/index/index'); await shot('feedback');
  await page.callMethod('submit'); assert.match(await page.data('error'), /至少5个字/);
  const report = { mockedCloud: true, actualLoginVerified: false,
    checks: ['个人中心标题与登录布局', '医案Tab等宽居中且位于收藏行上方', '原文/解析切换', '收藏与笔记列表', '草稿状态、保存与返回', '历史记录与反馈校验'], exceptions: errors };
  fs.writeFileSync(path.join(folder, 'verification.json'), JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(watchdog);
  if (mini) {
    try {
      if (backupComplete) {
        const info = await mini.callWxMethod('getStorageInfoSync');
        for (const key of info.keys.filter(key => key.startsWith('qingnang.learning.') || key === 'noteDraft')) await mini.callWxMethod('removeStorageSync', key);
        for (const [key, value] of backups) await mini.callWxMethod('setStorageSync', key, value);
      }
    } finally { await mini.disconnect(); }
  }
});
