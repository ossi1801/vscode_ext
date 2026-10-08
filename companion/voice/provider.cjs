const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const MAX_AUDIO = 24 * 1024 * 1024;
class LocalVoice {
  constructor(onEvent, spawnProcess = spawn, nativeRoot = path.join(__dirname, '../native'), executableOverride) {
    this.onEvent = onEvent; this.spawnProcess = spawnProcess; this.root = nativeRoot;
    this.executable = executableOverride || path.join(nativeRoot, 'espeak-ng' + (process.platform === 'win32' ? '.exe' : ''));
    try { fs.chmodSync(this.executable, 0o755); } catch { /* Missing or incompatible installation is reported below. */ }
    this.available = fs.existsSync(this.executable); this.voices = [];
    if (!this.available) { queueMicrotask(() => onEvent({ type: 'error', status: 'Bundled voice engine is missing from this installation.' })); return; }
    const list = spawnProcess(this.executable, ['--path=' + this.root, '--voices'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    list.stdout.on('data', b => { output += b; if (output.length > 65536) list.kill(); });
    list.stderr.on('data', () => {});
    list.on('error', e => onEvent({ type: 'error', status: e.message }));
    list.on('close', code => {
      if (code !== 0) return;
      this.voices = output.split('\n').slice(1).map(line => line.trim().split(/\s+/)).filter(v => v.length >= 5)
        .slice(0, 100).map(v => ({ id: v[4], name: v[3].replaceAll('_', ' ') + ' (' + v[1] + ')' }));
      onEvent({ type: 'voices', voices: this.voices });
      onEvent({ type: 'status', status: 'Bundled local voice ready' });
    });
  }
  speak(message, voice) {
    this.cancel();
    if (!this.available) return false;
    this.active = message.id;
    const args = ['--path=' + this.root, '--stdout', '--stdin', '-s', String(Math.round((voice.rate || 1) * 175)),
      '-p', String(Math.round((voice.pitch ?? 1) * 50)), '-a', '100'];
    const selected = this.voices.find(v => v.id === voice.id);
    if (voice.id && !selected) this.onEvent({ type: 'status', status: 'Selected voice unavailable; using bundled English voice.' });
    args.push('-v', selected?.id || 'en');
    const child = this.spawnProcess(this.executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let bytes = 0; const chunks = [];
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_AUDIO) { this.cancel(); this.onEvent({ type: 'error', status: 'Voice output exceeded its duration limit.' }); }
      else chunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    const fail = () => { if (this.active === message.id) { this.cancel(); this.onEvent({ type: 'error', status: 'Bundled synthesis failed; text remains available.' }); } };
    child.on('error', fail);
    child.on('close', code => {
      if (this.active !== message.id) return;
      if (code !== 0 || bytes < 44) { fail(); return; }
      const wav = Buffer.concat(chunks);
      // --stdout writes a streaming WAV header; close it before WebAudio decoding.
      wav.writeUInt32LE(wav.length - 8, 4);
      const data = wav.indexOf(Buffer.from('data'), 12);
      if (data < 0 || data + 8 > wav.length) { fail(); return; }
      wav.writeUInt32LE(wav.length - data - 8, data + 4);
      this.onEvent({ type: 'audio', id: message.id, audio: wav.toString('base64'), volume: voice.volume ?? .6 });
    });
    child.stdin.end(message.text);
    this.timeout = setTimeout(() => { this.cancel(); this.onEvent({ type: 'error', status: 'Voice playback timed out.' }); }, 300000);
    return true;
  }
  finished(id) { if (id === this.active) { clearTimeout(this.timeout); this.active = undefined; this.child = undefined; this.onEvent({ type: 'end', id }); } }
  cancel() {
    clearTimeout(this.timeout); this.child?.kill(); this.child = undefined;
    const id = this.active; this.active = undefined;
    if (id !== undefined) this.onEvent({ type: 'end', id });
  }
  dispose() { this.cancel(); this.available = false; }
}
module.exports = { LocalVoice };
