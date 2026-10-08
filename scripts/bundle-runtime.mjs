import { cpSync, existsSync, chmodSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const platform = process.platform;
if (!['linux', 'darwin', 'win32'].includes(platform)) throw Error('Unsupported build OS');
const executable = platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : platform === 'win32' ? 'electron.exe' : 'electron';
const extension = platform === 'win32' ? '.exe' : '';
const source = 'companion/node_modules/electron/dist';
if (!existsSync(join(source, executable))) throw Error('Development Electron runtime missing; run npm ci in companion');
for (const file of ['companion/native/window' + extension, 'companion/native/espeak-ng' + extension, 'companion/native/espeak-ng-data']) {
  if (!existsSync(file)) throw Error('Bundled component missing: ' + file + '; run npm run build:native');
}
rmSync('companion/runtime', { recursive: true, force: true });
cpSync(source, 'companion/runtime', { recursive: true, dereference: true });
if (platform !== 'win32') for (const file of [join('companion/runtime', executable), 'companion/native/espeak-ng', 'companion/native/window']) chmodSync(file, 0o755);
writeFileSync('companion/runtime/merlin-platform.json', JSON.stringify({ platform, arch: process.arch }));
