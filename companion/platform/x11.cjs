const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
const executable = path.join(__dirname, '../native/window');
async function native(id) {
  return JSON.parse((await run(executable, [id], { timeout: 800, maxBuffer: 65536 })).stdout);
}
function parseGeometry(text) {
  const number = key => Number(text.match(new RegExp(key + ':\\s*(-?\\d+)'))?.[1]);
  const result = { x: number('Absolute upper-left X'), y: number('Absolute upper-left Y'), width: number('Width'), height: number('Height') };
  if (!Object.values(result).every(Number.isFinite) || result.width < 1 || result.height < 1) throw Error('Invalid native window geometry');
  return result;
}
async function inspect(id) {
  if (!/^0x[0-9a-f]+$/i.test(id)) throw Error('Invalid native window ID');
  const state = await native(id);
  if (!/^(Code|Code - Insiders|VSCodium|code-oss)$/i.test(state.class) || state.pid === '0')
    throw Error('The focused window is not an X11 Code window. Native Wayland tracking is unsupported.');
  return state;
}
async function track(id, expectedPid) {
  const state = await inspect(id);
  if (state.pid !== expectedPid) throw Error('Window identity changed');
  return state;
}
module.exports = { inspect, track, parseGeometry };
