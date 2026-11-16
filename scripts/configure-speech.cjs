// Enable after the plugin has been authorized in the WeChat mini-program console.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const enable = args.includes('--enable');
if (enable === args.includes('--disable')) throw Error('Specify exactly one of --enable or --disable');
const version = args.find(arg => arg.startsWith('--version='))?.slice(10) || '0.3.3';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid plugin version');
const root = path.resolve(__dirname, '../miniprogram');
const file = path.join(root, 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
if (enable) app.plugins = { ...app.plugins, WechatSI: { version, provider: 'wx069ba97219f66d99' } };
else if (app.plugins) {
  delete app.plugins.WechatSI;
  if (!Object.keys(app.plugins).length) delete app.plugins;
}
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'utils/speech-config.js'), '// Managed by scripts/configure-speech.cjs\nmodule.exports = { enabled: ' + enable + ", plugin: 'WechatSI' };\n");
console.log(enable ? 'WechatSI enabled at version ' + version : 'WechatSI disabled until provider authorization is available');
