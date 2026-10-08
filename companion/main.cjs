const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { acquireWindow } = require('./instance.cjs');
const { LocalVoice } = require('./voice/provider.cjs');
const { toLogicalBounds } = require('./platform/geometry.cjs');
const { inspect, track } = require('./platform/native.cjs');
const { VERSION, MAX_BYTES, validMessage } = require('./protocol.cjs');
// The extension owns these inherited anonymous pipes. There is no public endpoint.
const token = process.env.MERLIN_SESSION_TOKEN;
const windowId = process.env.MERLIN_WINDOW_ID;
delete process.env.MERLIN_SESSION_TOKEN;
let releaseWindow;
app.on('will-quit', () => { if (releaseWindow) { releaseWindow(); releaseWindow = undefined; } });
let overlay, authenticated = false, loaded = false, focused = false, enabled = true;
let lastHeartbeat = Date.now(), generation = 0, lastSpeech = 0, buffer = '';
let voice, currentDiagnostic = false;
let settings, pause = { type: 'pause', paused: false }, identity, shuttingDown = false;
function report(data) { process.stdout.write(JSON.stringify({ version: VERSION, ...data }) + '\n'); }
function deliver(message) { if (loaded && !overlay.isDestroyed()) overlay.webContents.send('merlin', message); }
function hide() {
  voice?.cancel();
  if (!overlay || overlay.isDestroyed()) return;
  if (overlay.isVisible()) {
    deliver({ type: 'dismiss' });
    deliver({ type: 'visibility', visible: false });
    overlay.hide();
  }
}
function stop(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  report({ type: 'status', status: reason });
  hide(); voice?.dispose(); app.quit();
}
process.stdin.on('data', chunk => {
  buffer += chunk.toString();
  if (Buffer.byteLength(buffer) > MAX_BYTES) return stop('IPC frame too large');
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    let m; try { m = JSON.parse(line); } catch { return stop('Invalid IPC JSON'); }
    if (!authenticated) {
      if (!token || m.version !== VERSION || m.type !== 'hello' || m.token !== token)
        return stop('IPC authentication failed');
      authenticated = true; lastHeartbeat = Date.now(); continue;
    }
    if (m.version !== VERSION || !validMessage(m)) return stop('Invalid IPC message');
    if (m.type === 'voices') { if (settings?.settings.voice?.provider !== 'chromium' && voice?.available) report({ type: 'voices', value: voice.voices }); else deliver(m); continue; }
    if (m.type === 'heartbeat') { lastHeartbeat = Date.now(); continue; }
    if (m.type === 'focus') { focused = m.focused; if (!focused) hide(); continue; }
    if (m.type === 'overlay') { enabled = m.visible; if (!enabled) hide(); continue; }
    if (m.type === 'clearDiagnostics') {
      if (m.generation < generation) continue;
      generation = m.generation;
    }
    if (m.type === 'speech') {
      if (m.generation !== generation || m.id <= lastSpeech) continue;
      lastSpeech = m.id;
      if (!overlay?.isVisible()) continue;
    }
    if (m.type === 'settings') { settings = m; if (!m.settings.voice?.enabled) voice?.cancel(); }
    if (['dismiss', 'magic'].includes(m.type) || (m.type === 'clearDiagnostics' && currentDiagnostic)) voice?.cancel();
    if (m.type === 'speech') {
      currentDiagnostic = m.diagnostic;
      const options = settings?.settings.voice;
      if (options?.enabled && options.provider !== 'chromium' && voice?.speak(m, options)) m.externalVoice = true;
      else { voice?.cancel(); if (options?.provider === 'bundled') m.voiceUnavailable = true; }
    }
    if (m.type === 'pause') pause = m;
    deliver(m);
  }
});
process.stdin.on('end', () => stop('Extension disconnected'));
process.stdin.on('error', () => stop('Extension pipe failed'));
process.stdout.on('error', () => { hide(); voice?.dispose(); app.quit(); });
process.on('SIGTERM', () => { hide(); voice?.dispose(); app.quit(); });
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();
  try { identity = await inspect(windowId); releaseWindow = acquireWindow(windowId); } catch (e) { return stop(e.message); }
  overlay = new BrowserWindow({ show: false, frame: false, transparent: true,
    focusable: false, skipTaskbar: true, resizable: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false } });
  if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, 'normal');
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', event => event.preventDefault());
  overlay.webContents.on('render-process-gone', () => stop('Overlay renderer stopped'));
  ipcMain.on('renderer', (event, m) => {
    if (event.sender !== overlay.webContents) return;
    if (m.type === 'ready') {
      loaded = true; if (settings) deliver(settings); deliver(pause);
      report({ type: 'ready', status: process.platform + ' overlay connected', nativeId: '0x' + (process.platform === 'win32' ? overlay.getNativeWindowHandle().readBigUInt64LE(0) : BigInt(overlay.getNativeWindowHandle().readUInt32LE(0))).toString(16) });
    }
  });
  for (const type of ['voiceStatus', 'voices']) ipcMain.on(type, (event, value) => {
    if (event.sender === overlay.webContents && !(type === 'voices' && settings?.settings.voice?.provider !== 'chromium' && voice?.available)) report({ type, value });
  });
  ipcMain.on('voiceEnded', (event, m) => { if (event.sender === overlay.webContents && Number.isSafeInteger(m?.id)) { voice?.finished(m.id); report({ type: 'voicePlayback', id: m.id, played: m.played === true }); } });
  voice = new LocalVoice(event => {
    if (event.type === 'audio') deliver({ type: 'voiceAudio', id: event.id, audio: event.audio, volume: event.volume });
    if (event.type === 'end') deliver({ type: 'voiceEnd', id: event.id });
    if (event.type === 'voices') report({ type: 'voices', value: event.voices });
    if (event.type === 'status' || event.type === 'error') report({ type: 'voiceStatus', value: event.status });
  });
  await overlay.loadFile(path.join(__dirname, 'renderer/index.html'));
  async function poll() {
    if (shuttingDown) return;
    try {
      if (!authenticated || Date.now() - lastHeartbeat > 6000) return stop('Extension heartbeat expired');
      if (!focused || !enabled || !loaded) hide();
      else {
        const state = await track(windowId, identity.pid);
        if (!state.visible) hide();
        else {
          if (!focused || !enabled || shuttingDown) { hide(); if (!shuttingDown) setTimeout(poll, 100); return; }
          const bounds = toLogicalBounds(state.bounds, screen, process.platform);
          overlay.setBounds(bounds);
          if (!overlay.isVisible()) {
            deliver({ type: 'visibility', visible: true });
            overlay.showInactive();
          }
        }
      }
    } catch (e) { hide(); report({ type: 'status', status: e.message }); }
    setTimeout(poll, 100);
  }
  poll();
}).catch(e => stop(e.message));
