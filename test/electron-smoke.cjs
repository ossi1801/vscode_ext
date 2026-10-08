// Manual native smoke test. Run with Electron --class=Code on a real X11/XWayland desktop.
const { app, BrowserWindow } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-native-fixture-')));
app.commandLine.appendSwitch('ozone-platform', 'x11');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, fixture, root;
async function main() {
  await app.whenReady();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'merlin-native-smoke-'));
  fixture = new BrowserWindow({ width: 700, height: 500, x: 80, y: 80,
    title: 'Merlin test fixture (not VS Code)', webPreferences: { sandbox: true, nodeIntegration: false } });
  await fixture.loadURL('data:text/html,' + encodeURIComponent('<body style="background:white"><input autofocus value="click through"><p>Merlin native test fixture</p><script>window.clicks=0;document.addEventListener("click",()=>window.clicks++);</script>'));
  const id = '0x' + fixture.getNativeWindowHandle().readUInt32LE(0).toString(16);
  execFileSync('xprop', ['-id', id, '-f', 'WM_CLASS', '8s', '-set', 'WM_CLASS', 'Code']);
  console.log('Fixture native identity:', execFileSync('xprop', ['-id', id, 'WM_CLASS'], { encoding: 'utf8' }).trim());
  const env = { ...process.env, MERLIN_SESSION_TOKEN: 'smoke-token', MERLIN_WINDOW_ID: id, PATH: '/merlin-no-external-tools' };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(process.execPath, ['--ozone-platform=x11', '--user-data-dir=' + path.join(root, 'profile'), path.join(process.env.MERLIN_TEST_INSTALLATION || path.resolve('.'), 'companion')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const frames = []; let buffer = ''; let errors = '';
  child.stdout.on('data', data => {
    buffer += data;
    let i; while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i);buffer = buffer.slice(i + 1);
      try { frames.push(JSON.parse(line)); } catch { console.log('Non-protocol stdout:', line); }
    }
  });
  child.stderr.on('data', data => { errors += data; });
  const send = m => child.stdin.write(JSON.stringify({ version: 1, ...m }) + '\n');
  send({ type: 'hello', token: 'smoke-token' }); send({ type: 'focus', focused: true });
  const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 1000);
  try {
    const deadline = Date.now() + 10000;
    while (!frames.some(f => f.type === 'ready') && Date.now() < deadline) await wait(100);
    assert.ok(frames.some(f => f.type === 'ready'), JSON.stringify(frames) + '\n' + errors);
    send({ type: 'settings', settings: { theme: 2, reducedMotion: false, speechDuration: 1, movementSpeed: 0, characterScale: 3,
      voice: { enabled: false, provider: 'auto', id: '', rate: 1, pitch: 1, volume: .6 } } });
    send({ type: 'clearDiagnostics', generation: 1 });
    send({ type: 'speech', text: 'Click through this speech bubble.', diagnostic: true, id: 1, generation: 1 });
    fixture.focus();
    await wait(1000);
    const list = execFileSync('xprop', ['-root', '_NET_CLIENT_LIST'], { encoding: 'utf8' }).match(/0x[0-9a-f]+/gi) || [];
    let overlayId = frames.find(f => f.type === 'ready')?.nativeId;
    for (const window of list) {
      const properties = execFileSync('xprop', ['-id', window, '_NET_WM_PID'], { encoding: 'utf8' });
      if (properties.includes('= ' + child.pid)) overlayId = window;
    }
    assert.ok(overlayId, 'Overlay native window missing: ' + JSON.stringify(frames) + '\n' + execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8' }) + errors);
    const props = () => execFileSync('xwininfo', ['-id', overlayId], { encoding: 'utf8' });
    assert.match(props(), /Map State: IsViewable/);
    const { parseGeometry } = require('../companion/platform/x11.cjs');
    const before = parseGeometry(props());
    send({ type: 'speech', text: 'Click through this speech bubble.', diagnostic: true, id: 2, generation: 1 });
    await wait(200);
    // Send a real X11 pointer event through the stationary wizard, not webContents.sendInputEvent.
    const click = String.raw`import ctypes,sys
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype=ctypes.c_void_p
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
x.XQueryPointer.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint)]
x.XFlush.argtypes=[ctypes.c_void_p];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
d=x.XOpenDisplay(None)
if not d: raise RuntimeError('Display unavailable')
r=ctypes.c_ulong();c=ctypes.c_ulong();ox=ctypes.c_int();oy=ctypes.c_int();wx=ctypes.c_int();wy=ctypes.c_int();mask=ctypes.c_uint()
x.XQueryPointer(d,x.XDefaultRootWindow(d),ctypes.byref(r),ctypes.byref(c),ctypes.byref(ox),ctypes.byref(oy),ctypes.byref(wx),ctypes.byref(wy),ctypes.byref(mask))
t.XTestFakeMotionEvent(d,-1,int(sys.argv[1]),int(sys.argv[2]),0)
t.XTestFakeButtonEvent(d,1,1,0);t.XTestFakeButtonEvent(d,1,0,0)
t.XTestFakeMotionEvent(d,-1,ox.value,oy.value,0);x.XFlush(d);x.XCloseDisplay(d)`;
    execFileSync('/usr/bin/python3', ['-c', click, String(before.x + 70), String(before.y + 120)]);
    await wait(300);
    assert.equal(await fixture.webContents.executeJavaScript('window.clicks'), 1, 'Wizard must pass native clicks through');
    execFileSync('/usr/bin/python3', ['-c', click, String(before.x + 70), String(before.y + 40)]);
    await wait(250);
    assert.equal(await fixture.webContents.executeJavaScript('window.clicks'), 2, 'Bubble must pass native clicks through');
    send({ type: 'settings', settings: { theme: 2, reducedMotion: false, speechDuration: 1, movementSpeed: 0, characterScale: 3,
      voice: { enabled: true, provider: 'bundled', id: '', rate: 1, pitch: 1, volume: .6 } } });
    send({ type: 'speech', text: 'Hello. I am Merlin.', diagnostic: false, id: 3, generation: 1 });
    const voiceDeadline = Date.now() + 10000;
    while (!frames.some(f => f.type === 'voicePlayback' && f.id === 3) && Date.now() < voiceDeadline) await wait(100);
    assert.ok(frames.some(f => f.type === 'voicePlayback' && f.id === 3 && f.played), 'Bundled WebAudio playback must complete: ' + JSON.stringify(frames));
    const other = new BrowserWindow({ width: 250, height: 200, title: 'Merlin app switch fixture', webPreferences: { sandbox: true } });
    await other.loadURL('data:text/html,Other native window'); other.focus();
    await wait(350); assert.match(props(), /Map State: IsUnMapped/);
    other.destroy(); fixture.focus(); await wait(350); assert.match(props(), /Map State: IsViewable/);
    fixture.setPosition(180, 160); fixture.setSize(800, 550);
    await wait(500);
    const after = parseGeometry(props());
    assert.notEqual(after.x, before.x); assert.notEqual(after.width, before.width);
    send({ type: 'focus', focused: false });
    await wait(250); assert.match(props(), /Map State: IsUnMapped/);
    send({ type: 'focus', focused: true });
    await wait(350); assert.match(props(), /Map State: IsViewable/);
    fixture.minimize(); await wait(350); assert.match(props(), /Map State: IsUnMapped/);
    fixture.restore(); fixture.focus(); await wait(350);
    child.stdin.end(); await wait(400);
    assert.ok(child.exitCode !== null, 'Companion must exit on disconnect');
    console.log('PASS: bundled voice playback, ready handshake, wizard/bubble native click-through, foreground switch, move/resize, focus hide/show, minimize, disconnect');
  } finally { clearInterval(heartbeat); }
}
main().then(() => { app.quit(); }).catch(error => { console.error(error); app.exit(1); }).finally(() => {
  child?.kill(); if (fixture && !fixture.isDestroyed()) fixture.destroy();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});
