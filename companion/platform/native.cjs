const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
const executable = path.join(__dirname, '../native/window' + (process.platform === 'win32' ? '.exe' : ''));
async function inspect(id) {
  if (id !== 'active' && !/^0x[0-9a-f]+$/i.test(id)) throw Error('Invalid native window ID');
  const state = JSON.parse((await run(executable, [id], { timeout: 1500, maxBuffer: 8192 })).stdout);
  if (!/^0x[0-9a-f]+$/i.test(state.id) || !/^(Code|Code - Insiders|VSCodium|code-oss)$/i.test(state.class) || !/^\d+$/.test(state.pid) || state.pid === '0')
    throw Error('The selected window is not a supported native VS Code window.');
  if (!state.bounds || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(state.bounds[k])) || state.bounds.width <= 0 || state.bounds.height <= 0)
    throw Error('Invalid native window bounds');
  return state;
}
async function track(id, expectedPid) {
  const state = await inspect(id);
  if (state.id !== id || state.pid !== expectedPid) throw Error('Window identity changed');
  return state;
}
module.exports = { inspect, track };
