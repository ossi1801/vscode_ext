import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
await import('./bundle-speech.mjs');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
execFileSync(process.execPath, ['node_modules/@vscode/vsce/vsce', 'package', '--ignoreFile', '.vscodeignore-portable', '--no-dependencies', '--allow-missing-repository', '--out', `merlin-${version}.vsix`], { stdio: 'inherit' });
