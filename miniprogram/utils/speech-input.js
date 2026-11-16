// The plugin streams recognition results. No recording file is saved or uploaded by the app.
const config = require('./speech-config');
let manager = null;
let active = null;
function getManager() {
  if (!config.enabled) throw new Error('语音转文字尚未开通，请稍后再试');
  if (manager) return manager;
  try {
    manager = requirePlugin(config.plugin).getRecordRecognitionManager();
  } catch (error) {
    throw new Error('语音转文字暂不可用，请检查插件开通状态或使用微信真机重试');
  }
  manager.onStart = () => { if (active && !active.cancelled) active.onStart?.(); };
  manager.onRecognize = (result) => { if (active && !active.cancelled) active.onPartial?.(result.result || ''); };
  manager.onStop = (result) => {
    const session = active;
    active = null;
    if (session && !session.cancelled) session.onComplete?.(String(result.result || '').trim());
  };
  manager.onError = () => {
    const session = active;
    active = null;
    if (session && !session.cancelled) session.onError?.(new Error('未能识别语音，请检查麦克风权限和网络后重试'));
  };
  return manager;
}
function start(callbacks) {
  const engine = getManager();
  if (active) throw new Error('上次语音正在结束，请稍后再试');
  const session = { ...callbacks, cancelled: false };
  active = session;
  try { engine.start({ duration: 60000, lang: 'zh_CN' }); }
  catch (error) { active = null; throw new Error('无法开始语音转文字，请检查微信麦克风权限'); }
  return {
    stop() { if (active === session) engine.stop(); },
    cancel() { if (active === session) { session.cancelled = true; engine.stop(); } }
  };
}
module.exports = { start };
