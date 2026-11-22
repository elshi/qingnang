const store = require('./learning-store');

let recorder = null;
let active = null;
const MAX_BASE64_LENGTH = 3 * 1024 * 1024;

function removeTempFile(filePath) {
  if (!filePath) return;
  try { wx.getFileSystemManager().unlink({ filePath, fail() {} }); } catch (error) {}
}

function finish(session, error, text = '') {
  if (active === session) active = null;
  if (session.cancelled) return;
  if (error) session.onError?.(error);
  else session.onComplete?.(text);
}

function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    try {
      wx.getFileSystemManager().readFile({
        filePath, encoding: 'base64',
        success: result => resolve(result.data),
        fail: () => reject(new Error('无法读取临时语音，请重试'))
      });
    } catch (error) { reject(new Error('无法读取临时语音，请重试')); }
  });
}

async function recognize(session, result) {
  const filePath = result?.tempFilePath;
  if (!filePath) { finish(session, new Error('没有录到语音，请重试')); return; }
  let removed = false;
  try {
    if (session.cancelled) return;
    session.onProcessing?.();
    const audio = await readBase64(filePath);
    removeTempFile(filePath);
    removed = true;
    if (session.cancelled) return;
    if (!audio || audio.length > MAX_BASE64_LENGTH) throw new Error('语音过长，请缩短后重试');
    const response = await store.transcribe(audio, Math.min(60000, Math.max(1, Date.now() - session.startedAt)));
    finish(session, null, String(response.text || '').trim());
  } catch (error) { finish(session, error); }
  finally {
    if (!removed) removeTempFile(filePath);
    if (session.cancelled && active === session) active = null;
  }
}

function getRecorder() {
  if (recorder) return recorder;
  if (!wx.getRecorderManager || !wx.getFileSystemManager) throw new Error('当前微信版本不支持语音转文字');
  recorder = wx.getRecorderManager();
  recorder.onStart(() => { if (active && !active.cancelled) active.onStart?.(); });
  recorder.onStop(result => {
    const session = active;
    if (session && !session.processing) {
      session.processing = true;
      recognize(session, result);
    }
    else removeTempFile(result?.tempFilePath);
  });
  recorder.onError(() => {
    const session = active;
    if (session) finish(session, new Error('录音失败，请检查麦克风权限后重试'));
  });
  return recorder;
}

function start(callbacks) {
  if (active) throw new Error('上次语音正在结束，请稍后再试');
  const engine = getRecorder();
  const session = { ...callbacks, cancelled: false, stopping: false, startedAt: Date.now() };
  active = session;
  try { engine.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 32000, format: 'mp3' }); }
  catch (error) { active = null; throw new Error('无法开始录音，请检查微信麦克风权限'); }
  return {
    stop() {
      if (active !== session || session.stopping) return;
      session.stopping = true;
      session.onProcessing?.();
      try { engine.stop(); }
      catch (error) { finish(session, new Error('无法结束录音，请重试')); }
    },
    cancel() {
      if (active !== session) return;
      session.cancelled = true;
      if (!session.stopping) {
        session.stopping = true;
        try { engine.stop(); } catch (error) { active = null; }
      }
    }
  };
}

module.exports = { start };
