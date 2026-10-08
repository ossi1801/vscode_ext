// Build-time only. Users receive the engine, data and tiny player in the VSIX.
import { cpSync, existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
if (process.platform === 'linux') {
  const source = 'companion/native/espeak-ng';
  if (!existsSync(source)) throw Error('Build the bundled synthesizer with npm run build:native first');
  const elf = readFileSync(source);
  if (elf.readUInt16LE(18) !== ({ x64: 62, arm64: 183 }[process.arch])) throw Error('Speech engine architecture mismatch; run npm run build:native on this build host');
  const target = join('companion/speech', `linux-${process.arch}`);
  mkdirSync(target, { recursive: true });
  cpSync(source, join(target, 'espeak-ng'));
  execFileSync('gcc', ['-O2', '-Wall', '-Wextra', 'companion/speech/source/play-audio.c', '-o', join(target, 'play-audio'), '-ldl'], { stdio: 'inherit' });
  cpSync('companion/native/espeak-ng-data', 'companion/speech/espeak-ng-data', { recursive: true });
  for (const file of ['espeak-ng', 'play-audio']) chmodSync(join(target, file), 0o755);
  for (const file of ['espeak-ng_1.52.0+dfsg.orig.tar.gz', 'COPYING-espeak-ng', 'build-native.mjs'])
    cpSync(join('companion/native/source', file), join('companion/speech/source', file));
}
