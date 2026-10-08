// Developer-only build: users receive the resulting binaries and data in the VSIX.
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
if (!['linux', 'darwin', 'win32'].includes(process.platform)) throw Error('Unsupported build OS');
const root = mkdtempSync(join(tmpdir(), 'merlin-native-build-'));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
try {
  const source = join(root, 'source'), build = join(root, 'build');
  mkdirSync(source, { recursive: true });
  run('tar', ['-xzf', 'companion/native/source/espeak-ng_1.52.0+dfsg.orig.tar.gz', '-C', source, '--strip-components=1']);
  // Upstream otherwise downloads Sonic even when its use is explicitly disabled.
  const deps = join(source, 'cmake/deps.cmake');
  writeFileSync(deps, readFileSync(deps, 'utf8').replace('else()\n  FetchContent_Declare', 'elseif(NOT DEFINED USE_LIBSONIC OR USE_LIBSONIC)\n  FetchContent_Declare'));
  run('cmake', ['-S', source, '-B', build, '-DUSE_LIBPCAUDIO=OFF', '-DUSE_LIBSONIC=OFF', '-DUSE_MBROLA=OFF', '-DUSE_ASYNC=OFF', '-DBUILD_TESTING=OFF', '-DBUILD_SHARED_LIBS=OFF', '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POLICY_VERSION_MINIMUM=3.10', ...(process.platform === 'win32' ? ['-G', 'MinGW Makefiles', '-DCMAKE_EXE_LINKER_FLAGS=-static'] : [])]);
  run('cmake', ['--build', build, '--target', 'espeak-ng-bin', 'data', '-j', '4']);
  const suffix = process.platform === 'win32' ? '.exe' : '';
  cpSync(join(build, 'src/espeak-ng' + suffix), 'companion/native/espeak-ng' + suffix);
  cpSync(join(build, 'espeak-ng-data'), 'companion/native/espeak-ng-data', { recursive: true });
  cpSync('scripts/build-native.mjs', 'companion/native/source/build-native.mjs');
  cpSync(join(source, 'COPYING'), 'companion/native/source/COPYING-espeak-ng');
  if (process.platform === 'linux') run('gcc', ['-O2', '-Wall', '-Wextra', 'companion/native/window.c', '-o', 'companion/native/window', '-lX11']);
  else if (process.platform === 'darwin') run('clang', ['-O2', '-Wall', '-Wextra', '-fobjc-arc', 'companion/native/window.m', '-o', 'companion/native/window', '-framework', 'Cocoa', '-framework', 'CoreGraphics']);
  else if (process.platform === 'win32') run('gcc', ['-O2', '-Wall', '-Wextra', '-static', 'companion/native/window-win.c', '-o', 'companion/native/window.exe', '-luser32', '-ldwmapi']);
  else throw Error('Unsupported build OS');
} finally { rmSync(root, { recursive: true, force: true }); }
