const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { EditorSpeech, pcm } = require('../dist/test/editorSpeech.js');
const options = { enabled: true, id: '', provider: 'auto', rate: 1, pitch: 1, volume: .6 };
function fixture() {
  const children = [], launches = [], events = [];
  const spawn = (executable, args, config) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdin.end = input => { child.input = input; }; child.kill = () => { child.killed = true; };
    children.push(child); launches.push({ executable, args, config }); return child;
  };
  return { children, launches, events, spawn };
}
test('WAV decoding validates format and scales actual PCM volume', () => {
  const wav = Buffer.alloc(48); wav.write('RIFF'); wav.writeUInt32LE(40, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(4, 40);
  wav.writeInt16LE(10000, 44); wav.writeInt16LE(-10000, 46);
  const decoded = pcm(wav, .5);
  assert.equal(decoded.rate, 22050); assert.equal(decoded.channels, 1);
  assert.equal(decoded.audio.readInt16LE(0), 5000); assert.equal(decoded.audio.readInt16LE(2), -5000);
  assert.throws(() => pcm(Buffer.from('invalid'), .5));
  wav.writeUInt16LE(3, 20); assert.throws(() => pcm(wav, .5), /Unsupported/);
});
for (const platform of ['darwin', 'win32']) test(platform + ' speaks safely, replaces audio and rejects stale completions', () => {
  const f = fixture();
  const speech = new EditorSpeech('/unused', event => f.events.push(event), f.spawn, platform, 'x64');
  try {
    const text = "Don't execute $(anything); <tag> & `code` [[volm 0]]";
    speech.speak({ text, diagnostic: false }, options);
    assert.equal(f.children.length, 1); assert.equal(f.events[0].type, 'start');
    assert.equal(f.launches[0].args.some(arg => arg.includes(text)), false, 'User text must not enter command code');
    if (platform === 'win32') assert.equal(JSON.parse(f.children[0].input).text, text);
    else { assert.equal(f.launches[0].executable, '/usr/bin/say'); assert.ok(f.children[0].input.includes('[ [volm')); }
    speech.speak({ text: 'Latest explanation', diagnostic: true }, options);
    assert.equal(f.children[0].killed, true);
    f.children[0].emit('close', 0);
    assert.equal(f.events.filter(event => event.type === 'played').length, 0);
    f.children[1].emit('close', 0);
    assert.equal(f.events.filter(event => event.type === 'played').length, 1);
    speech.speak({ text: 'Diagnostic', diagnostic: true }, options);
    speech.cancelDiagnostic(); assert.equal(f.children[2].killed, true);
    speech.speak({ text: 'Muted', diagnostic: false }, { ...options, enabled: false });
    assert.equal(f.children.length, 3);
    speech.speak({ text: 'Silent volume', diagnostic: false }, { ...options, volume: 0 });
    assert.equal(f.children.length, 3);
    speech.speak({ text: 'Stop on dispose', diagnostic: false }, options);
  } finally { speech.dispose(); }
  assert.equal(f.children.at(-1).killed, true);
});
