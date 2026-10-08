const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validMessage } = require('../companion/protocol.cjs');
const { parseGeometry } = require('../companion/platform/x11.cjs');
const { toLogicalBounds } = require('../companion/platform/geometry.cjs');
const { acquireWindow } = require('../companion/instance.cjs');
const { LocalVoice } = require('../companion/voice/provider.cjs');
test('transport rejects oversized text and malformed voice settings', () => {
  const speech = { type: 'speech', text: 'Line 10 needs a spell.', diagnostic: true, id: 1, generation: 2 };
  assert.ok(validMessage(speech));
  assert.equal(validMessage({ ...speech, id: NaN }), false);
  assert.equal(validMessage({ ...speech, text: 'x'.repeat(8001) }), false);
  const settings = { type: 'settings', settings: { theme: 2, reducedMotion: false, speechDuration: 5, movementSpeed: 24,
    characterScale: 3, voice: { enabled: true, provider: 'auto', id: '', rate: 1, pitch: 1, volume: .6 } } };
  assert.ok(validMessage(settings));
  settings.settings.voice.volume = 2;
  assert.equal(validMessage(settings), false);
  assert.equal(validMessage({ type: 'execute', text: 'bad' }), false);
});
test('native geometry handles negative monitor origins and DPI', () => {
  const native = parseGeometry('Absolute upper-left X: -1920\nAbsolute upper-left Y: 20\nWidth: 1800\nHeight: 1000');
  assert.deepEqual(native, { x: -1920, y: 20, width: 1800, height: 1000 });
  assert.deepEqual(toLogicalBounds(native, {
    screenToDipPoint: p => ({ x: p.x / 2, y: p.y / 2 }),
    getDisplayNearestPoint: () => ({ scaleFactor: 2 })
  }), { x: -960, y: 10, width: 900, height: 500 });
  assert.throws(() => parseGeometry('Width: NaN'));
});
test('one companion owns each native window', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-lock-test-'));
  try {
    const release = acquireWindow('0x1234', root);
    assert.throws(() => acquireWindow('0x1234', root), /already owns/);
    const other = acquireWindow('0x5678', root);
    other(); release();
    acquireWindow('0x1234', root)();
  } finally { fs.rmSync(root, { recursive: true }); }
});
test('bundled voice replaces synthesis, rejects stale completion, and stops on dispose', () => {
  const children = [];
  const spawnFake = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdin.end = text => { child.text = text; }; child.kill = () => { child.killed = true; };
    children.push(child); return child;
  };
  const events = [];
  const nativeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-voice-test-'));
  fs.writeFileSync(path.join(nativeRoot, 'espeak-ng' + (process.platform === 'win32' ? '.exe' : '')), 'test executable');
  const provider = new LocalVoice(e => events.push(e), spawnFake, nativeRoot);
  try {
    assert.ok(provider.speak({ id: 1, text: 'First' }, {}));
    assert.ok(provider.speak({ id: 2, text: 'Latest' }, {}));
    assert.equal(children[1].killed, true);
    assert.equal(provider.active, 2);
    provider.finished(1); assert.equal(provider.active, 2);
    const wav = Buffer.alloc(52); wav.write('RIFF'); wav.write('WAVE',8); wav.write('data',36);
    children[2].stdout.emit('data', wav); children[2].emit('close', 0);
    assert.ok(events.some(e => e.type === 'audio' && e.id === 2));
    provider.finished(2); assert.equal(provider.active, undefined);
    provider.speak({ id: 3, text: 'Stopped' }, {});
    provider.dispose(); assert.equal(children[3].killed, true);
    assert.equal(provider.active, undefined);
  } finally { provider.dispose(); fs.rmSync(nativeRoot, { recursive: true, force: true }); }
});
test('overlay diagnostics route without a sidebar; editor switches and dismissal cancel', async () => {
  const Module = require('node:module');
  const load = Module._load;
  const callbacks = {};
  const event = name => cb => { callbacks[name] = cb; return { dispose() {} }; };
  const uri = { toString: () => 'file:///fixture.ts' };
  let diagnosticReactions = true;
  const vscode = {
    languages: { onDidChangeDiagnostics: event('diagnostics'), getDiagnostics: () => [{ severity: 0, message: 'error', range: { start: { line: 9, character: 0 } } }] },
    window: { activeTextEditor: { document: { uri, isClosed: false } }, state: { focused: true }, activeColorTheme: { kind: 2 },
      onDidChangeWindowState: event('focus'), onDidChangeActiveTextEditor: event('editor'), onDidChangeActiveColorTheme: event('theme') },
    workspace: { onDidCloseTextDocument: event('close'), onDidChangeConfiguration: event('config'),
      getConfiguration: () => ({ get: (key, fallback) => key === 'diagnosticReactions' ? diagnosticReactions : fallback }) }
  };
  Module._load = function(name, ...args) { return name === 'vscode' ? vscode : load.call(this, name, ...args); };
  let provider;
  try {
    const { MerlinViewProvider } = require('../dist/test/merlinViewProvider.js');
    const sent = [];
    const companion = { active: true, onDidChange: event('companion'), send: m => sent.push(m), focus() {} };
    provider = new MerlinViewProvider({}, companion);
    provider.switchDocument(); await provider.react();
    assert.ok(sent.some(m => m.type === 'speech' && /10/.test(m.text)));
    const sidebar = [];
    provider.view = { visible: true, webview: { postMessage: m => sidebar.push(m) } };
    provider.command('speak');
    assert.equal(sidebar.filter(m => m.type === 'speech').length, 0);
    callbacks.editor();
    assert.equal(sent.at(-1).type, 'clearDiagnostics');
    provider.command('dismiss'); assert.equal(sent.at(-1).type, 'dismiss');
    callbacks.focus({ focused: false });
    assert.equal(sidebar.at(-1).type, 'dismiss', 'Losing foreground must cancel sidebar audio too');
    diagnosticReactions = false; callbacks.config({ affectsConfiguration: () => true });
    const count = sent.filter(m => m.type === 'speech').length;
    provider.react(); assert.equal(sent.filter(m => m.type === 'speech').length, count);
  } finally { provider?.dispose(); Module._load = load; }
});
for (const platform of ['linux', 'darwin', 'win32']) test(platform + ' startup binds automatically and launches only bundled executables', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  const runtime = platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : platform === 'win32' ? 'electron.exe' : 'electron';
  const helper = 'companion/native/window' + (platform === 'win32' ? '.exe' : '');
  const Module = require('node:module'); const load = Module._load;
  const frames = []; const launches = [];
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.writable = true; child.stdin.writableLength = 0;
  child.stdin.write = frame => { frames.push(JSON.parse(frame)); }; child.stdin.end = () => {};
  child.kill = () => {};
  const fakeExec = () => {};
  fakeExec[require('node:util').promisify.custom] = async (exe, args) => {
    assert.equal(exe, path.join(process.cwd(), helper));
    assert.deepEqual(args, ['active']);
    return { stdout: JSON.stringify({ id: '0x1234', class: 'Code', visible: true, pid: '123' }) };
  };
  const vscode = {
    env: { uiKind: 1 }, UIKind: { Web: 2 },
    EventEmitter: class { event() { return { dispose() {} }; } fire() {} dispose() {} },
    window: { onDidChangeActiveTextEditor: () => ({ dispose() {} }), onDidChangeTextEditorVisibleRanges: () => ({ dispose() {} }), state: { focused: true }, createOutputChannel: () => ({ append() {}, appendLine() {}, dispose() {} }) },
    workspace: { onDidChangeTextDocument: () => ({ dispose() {} }), getConfiguration: () => ({ get: (key, fallback) => key === 'displayMode' ? 'desktop' : fallback }) }
  };
  Module._load = function(name, ...args) {
    if (name === 'vscode') return vscode;
    if (name === 'node:fs') return { ...fs, existsSync: () => true, chmodSync() {} };
    if (name === 'node:child_process') return { execFile: fakeExec, spawn: (exe, args, options) => { launches.push({ exe, args, options }); return child; } };
    return load.call(this, name, ...args);
  };
  let connection;
  try {
    delete require.cache[require.resolve('../dist/test/companionConnection.js')];
    const { CompanionConnection } = require('../dist/test/companionConnection.js');
    connection = new CompanionConnection({ fsPath: process.cwd() });
    await connection.start(true);
    assert.equal(launches.length, 1);
    assert.equal(launches[0].exe, path.join(process.cwd(), 'companion/runtime', runtime));
    assert.equal(launches[0].args.includes('--ozone-platform=x11'), platform === 'linux');
    assert.equal(launches[0].options.env.MERLIN_WINDOW_ID, '0x1234');
    assert.equal(frames[0].type, 'hello'); assert.equal(frames[0].token.length, 64);
    connection.stop(); connection.focus(true);
    assert.equal(launches.length, 1, 'Explicit Stop must prevent automatic relaunch');
  } finally { connection?.dispose(); Module._load = load; Object.defineProperty(process, 'platform', originalPlatform); }
});

test('macOS points and Windows mixed-DPI rectangles use platform conversion', () => {
  const bounds = { x: -1440, y: 25, width: 1200, height: 800 };
  assert.deepEqual(toLogicalBounds(bounds, {}, 'darwin'), bounds);
  const expected = { x: -960, y: 17, width: 800, height: 533 };
  assert.deepEqual(toLogicalBounds(bounds, { screenToDipRect(window, rect) {
    assert.equal(window, null); assert.deepEqual(rect, bounds); return expected;
  } }, 'win32'), expected);
});
test('default overlay renders over editor without DISPLAY or native subprocesses', async () => {
  const Module = require('node:module'); const load = Module._load;
  const callbacks = {}; const calls = []; const decorations = [];
  const event = name => callback => { callbacks[name] = callback; return { dispose() {} }; };
  const editor = { visibleRanges: [{ start: { line: 0 }, end: { line: 20 } }],
    document: { lineCount: 50, isClosed: false }, setDecorations: (type, ranges) => calls.push({ type, ranges }) };
  const config = { get: (key, fallback) => key === 'voice.enabled' ? false : fallback };
  const vscode = {
    Uri: { joinPath: (_root, ...parts) => ({ path: parts.join('/') }) },
    Range: class { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } },
    ThemeColor: class { constructor(id) { this.id = id; } },
    EventEmitter: class { event() { return { dispose() {} }; } fire() {} dispose() {} },
    window: { activeTextEditor: editor, state: { focused: true },
      onDidChangeActiveTextEditor: event('editor'), onDidChangeTextEditorVisibleRanges: event('ranges'),
      createTextEditorDecorationType: options => { const type = { options, dispose() { this.disposed = true; } }; decorations.push(type); return type; },
      createOutputChannel: () => ({ append() {}, appendLine() {}, dispose() {} }) },
    workspace: { onDidChangeTextDocument: event('document'), getConfiguration: () => config }
  };
  Module._load = function(name, ...args) {
    if (name === 'vscode') return vscode;
    if (name === 'node:child_process') return { spawn() { throw Error('Default overlay must not launch a subprocess'); }, execFile() { throw Error('Default overlay must not inspect native windows'); } };
    return load.call(this, name, ...args);
  };
  let connection;
  let tick;
  const originalInterval = global.setInterval, originalClearInterval = global.clearInterval, originalNow = Date.now;
  const originalRandom = Math.random; Math.random = () => .5;
  let now = 10000; Date.now = () => now;
  global.setInterval = callback => { tick = () => { now += 100; callback(); }; return 123; };
  global.clearInterval = () => {};
  try {
    delete require.cache[require.resolve('../dist/test/companionConnection.js')];
    const { CompanionConnection } = require('../dist/test/companionConnection.js');
    connection = new CompanionConnection({ fsPath: process.cwd() });
    await connection.start(true);
    assert.equal(connection.active, true);
    assert.match(decorations.at(-1).options.before.textDecoration, /position:absolute/);
    assert.match(decorations.at(-1).options.before.textDecoration, /pointer-events:none/);
    const left = () => Number(decorations.at(-1).options.before.textDecoration.match(/left:(\d+)px/)[1]);
    const initialX = left();
    for (let i = 0; i < 15; i++) tick();
    assert.equal(left(), initialX, 'Merlin rests instead of walking continuously');
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /idle-/);
    connection.send({ type: 'pause', paused: true });
    const oldEditor = vscode.window.activeTextEditor;
    vscode.window.activeTextEditor = { ...editor };
    callbacks.editor();
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /disappear-/);
    for (let i = 0; i < 7; i++) tick();
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /appear-/);
    assert.notEqual(left(), initialX, 'File switches relocate even while roaming is paused');
    for (let i = 0; i < 7; i++) tick();
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /idle-/);
    const pausedX = left(); tick(); tick();
    assert.equal(left(), pausedX);
    // Switching again restarts the transition, including rapid repeated switches.
    vscode.window.activeTextEditor = oldEditor; callbacks.editor(); tick(); callbacks.editor();
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /disappear-0-/);
    for (let i = 0; i < 14; i++) tick();
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /idle-/);
    connection.send({ type: 'pause', paused: false });
    connection.send({ type: 'magic' });
    for (let i = 0; i < 10; i++) tick();
    assert.match(decorations.at(-1).options.before.contentIconPath.path, /idle-/, 'Magic returns to resting');
    connection.send({ type: 'speech', text: "Hello ' } ; code", diagnostic: true });
    assert.equal(decorations.at(-1).options.before.contentText, "Hello ' } ; code", 'Speech stays in escaped contentText, outside CSS');
    connection.send({ type: 'clearDiagnostics' });
    assert.ok(decorations.at(-1).options.before.contentIconPath);
    vscode.window.state.focused = false; connection.focus(false);
    assert.equal(connection.active, false);
    assert.equal(calls.at(-1).ranges.length, 0);
    vscode.window.state.focused = true; connection.focus(true);
    assert.equal(connection.active, true);
    connection.stop(); connection.focus(true);
    assert.equal(connection.active, false, 'Stop survives focus changes');
    assert.ok(decorations.every(type => type.disposed));
  } finally { connection?.dispose(); Module._load = load; global.setInterval = originalInterval; global.clearInterval = originalClearInterval; Date.now = originalNow; Math.random = originalRandom; }
});
test('late quick-fix results cannot replace dismissal or explanations for an edited document', async () => {
  const Module = require('node:module'), originalLoad = Module._load;
  const callbacks = {}, sent = [], requests = [];
  const event = name => callback => { callbacks[name] = callback; return { dispose() {} }; };
  const uri = { toString: () => 'file:///stale.ts' };
  const document = { uri, isClosed: false, version: 1 };
  const diagnostic = { severity: 0, message: 'Unknown name', range: { start: { line: 0 } } };
  const vscode = {
    commands: { executeCommand: () => new Promise(resolve => requests.push(resolve)) },
    languages: { getDiagnostics: () => [diagnostic], onDidChangeDiagnostics: event('diagnostics') },
    window: { activeTextEditor: { document }, state: { focused: true }, activeColorTheme: { kind: 2 },
      onDidChangeWindowState: event('focus'), onDidChangeActiveTextEditor: event('editor'), onDidChangeActiveColorTheme: event('theme') },
    workspace: { onDidCloseTextDocument: event('close'), onDidChangeConfiguration: event('config'),
      getConfiguration: () => ({ get: (key, fallback) => key === 'reactionCooldown' ? 0 : fallback }) }
  };
  Module._load = function(name, ...args) { return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args); };
  let provider;
  try {
    delete require.cache[require.resolve('../dist/test/merlinViewProvider.js')];
    const { MerlinViewProvider } = require('../dist/test/merlinViewProvider.js');
    provider = new MerlinViewProvider({}, { active: true, onDidChange: event('companion'), send: message => sent.push(message), focus() {} });
    let pending = provider.react();
    provider.command('dismiss'); requests.shift()([]); await pending;
    assert.equal(sent.filter(m => m.type === 'speech').length, 0);
    provider.switchDocument(); pending = provider.react();
    document.version++; requests.shift()([]); await pending;
    assert.equal(sent.filter(m => m.type === 'speech').length, 0);
    provider.switchDocument(); pending = provider.react();
    provider.dispose(); requests.shift()([]); await pending;
    assert.equal(sent.filter(m => m.type === 'speech').length, 0);
  } finally { provider?.dispose(); Module._load = originalLoad; }
});
