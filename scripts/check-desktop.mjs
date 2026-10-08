import { execFileSync } from 'node:child_process';
import { assessDesktop } from '../companion/platform/capabilities.mjs';

function probe(command, args) {
  try {
    return { available: true, output: execFileSync(command, args, {
      encoding: 'utf8', timeout: 3000, maxBuffer: 16384,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim() };
  } catch (error) {
    return { available: false, reason: error.code === 'ENOENT' ? 'not installed'
      : String(error.stderr || error.message).trim().slice(0, 1000) };
  }
}

const report = assessDesktop(process.platform, process.env);
// Read only. Do not request titles, document contents, or shell evaluation.
if (process.platform === 'linux') {
  report.x11 = probe('xprop', ['-root', '_NET_SUPPORTING_WM_CHECK', '_NET_CLIENT_LIST']);
  if (/gnome/i.test(report.desktop)) {
    report.compositor = probe('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell',
      '--object-path', '/org/gnome/Shell', '--method', 'org.freedesktop.DBus.Properties.Get',
      'org.gnome.Shell', 'ShellVersion']);
  }
}
console.log(JSON.stringify(report, null, 2));
// A successful probe must never imply a successful overlay acceptance test.
process.exitCode = report.overlaySupported ? 0 : 2;
