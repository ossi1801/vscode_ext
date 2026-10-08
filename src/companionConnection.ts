import * as vscode from 'vscode';
import { spawn, execFile, ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { promisify } from 'node:util';
import { HostMessage } from './messages';
import { EditorSpeech } from './editorSpeech';
import { EditorOverlay } from './editorOverlay';

export class CompanionConnection implements vscode.Disposable {
    private starting = false;
    private desired = true;
    private child?: ChildProcessWithoutNullStreams;
    private heartbeat?: ReturnType<typeof setInterval>;
    private generation = 0;
    private utterance = 0;
    private visible = true;
    private ready = false;
    private status = 'Desktop companion is stopped';
    private voices: { id: string; name: string }[] = [];
    private output = vscode.window.createOutputChannel('Merlin Desktop');
    private changed = new vscode.EventEmitter<void>();
    readonly onDidChange = this.changed.event;
    private editorOverlay: EditorOverlay;
    private editorSpeech: EditorSpeech;
    private voiceStatus = 'Speech ready';
    private lastVoiceError = '';
    constructor(private uri: vscode.Uri) {
        this.editorSpeech = new EditorSpeech(path.join(uri.fsPath, 'companion/speech'), event => {
            if (event.type === 'start') this.editorOverlay?.voicePlaying(true);
            if (event.type === 'end') this.editorOverlay?.voicePlaying(false);
            if (event.type === 'error' && event.message !== this.lastVoiceError) {
                this.lastVoiceError = event.message || ''; void vscode.window.showWarningMessage('Merlin speech: ' + event.message);
            }
            if (event.message) { this.voiceStatus = event.message; this.output.appendLine('Voice: ' + event.message); }
        });
        this.editorOverlay = new EditorOverlay(uri, () => { this.editorSpeech.cancel(); this.changed.fire(); });
    }
    private get editorMode() { return vscode.workspace.getConfiguration('merlin').get<string>('displayMode', 'overlay') === 'overlay'; }
    get active() { if (this.editorMode) return this.editorOverlay.active; return this.ready && this.visible && vscode.window.state.focused &&
        vscode.workspace.getConfiguration('merlin').get<string>('displayMode', 'overlay') === 'desktop'; }
    get connected() { return this.editorMode ? this.editorOverlay.connected : this.ready; }
    private write(message: object) {
        if (!this.child?.stdin.writable) return;
        const frame = JSON.stringify({ version: 1, ...message }) + '\n';
        if (Buffer.byteLength(frame) <= 32768 && this.child.stdin.writableLength < 65536)
            this.child.stdin.write(frame);
        else this.stop();
    }
    private voiceSettings() {
        const config = vscode.workspace.getConfiguration('merlin');
        return { enabled: config.get('voice.enabled', true), id: config.get('voice.id', ''), provider: config.get('voice.provider', 'auto'),
            rate: config.get('voice.rate', 1), pitch: config.get('voice.pitch', 1), volume: config.get('voice.volume', .6) };
    }
    send(message: HostMessage) {
        if (this.editorMode) {
            if (this.child) { this.write({ type: 'overlay', visible: false }); }
            if (this.desired) this.editorOverlay.start();
            this.editorOverlay.send(message);
            if (message.type === 'speech' && this.editorOverlay.active) this.editorSpeech.speak(message, this.voiceSettings());
            if (message.type === 'dismiss' || message.type === 'magic' || (message.type === 'settings' && !message.settings.voice?.enabled)) this.editorSpeech.cancel();
            if (message.type === 'clearDiagnostics') this.editorSpeech.cancelDiagnostic();
            return;
        }
        this.editorSpeech.cancel();
        if (this.editorOverlay.connected) this.editorOverlay.stop();
        if (message.type === 'clearDiagnostics') this.generation++;
        if (message.type === 'settings') this.write({ type: 'overlay', visible: this.visible && vscode.workspace.getConfiguration('merlin').get<string>('displayMode', 'overlay') === 'desktop' });
        this.write({ ...message, generation: this.generation,
            ...(message.type === 'speech' ? { id: ++this.utterance } : {}) });
    }
    focus(focused: boolean) {
        if (this.editorMode) { if (!focused) this.editorSpeech.cancel(); this.editorOverlay.focus(); if (focused && this.desired) this.editorOverlay.start(); return; }
        this.write({ type: 'focus', focused });
        if (focused && this.desired && !this.child) void this.start(true);
    }
    async start(automatic = false) {
        if (this.editorMode) {
            if (!automatic) this.desired = true;
            if (this.desired) this.editorOverlay.start();
            return;
        }
        if (vscode.workspace.getConfiguration('merlin').get<string>('displayMode', 'overlay') === 'sidebar') return;
        if (this.child || this.starting || (automatic && !this.desired)) return;
        if (!automatic) this.desired = true;
        if (!vscode.window.state.focused) return;
        this.starting = true;
        let windowId: string;
        const executable = path.join(this.uri.fsPath, 'companion/runtime', process.platform === 'darwin'
            ? 'Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'electron.exe' : 'electron');
        const native = path.join(this.uri.fsPath, 'companion/native/window' + (process.platform === 'win32' ? '.exe' : ''));
        try {
            if (vscode.env.uiKind === vscode.UIKind.Web || !['linux', 'darwin', 'win32'].includes(process.platform))
                throw Error('The overlay requires desktop VS Code on Linux X11, macOS or Windows.');
            for (const file of [executable, native]) {
                if (!fs.existsSync(file)) throw Error('Bundled overlay component missing. Install the VSIX for your OS and architecture.');
                if (process.platform !== 'win32') fs.chmodSync(file, 0o755);
            }
            const result = JSON.parse((await promisify(execFile)(native, ['active'], { timeout: 1500, maxBuffer: 8192 })).stdout);
            if (!/^(Code|Code - Insiders|VSCodium|code-oss)$/i.test(result.class) || !result.visible)
                throw Error('The focused window could not be bound to VS Code. Linux requires an X11 VS Code window.');
            if (!vscode.window.state.focused) { this.starting = false; return; }
            windowId = result.id;
        } catch (error) {
            this.starting = false;
            this.status = error instanceof Error ? error.message : String(error);
            this.output.appendLine(this.status);
            if (!automatic) void vscode.window.showWarningMessage(this.status);
            return;
        }
        const token = randomBytes(32).toString('hex');
        const env: NodeJS.ProcessEnv = { ...process.env, MERLIN_SESSION_TOKEN: token, MERLIN_WINDOW_ID: windowId };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(executable, [...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []), path.join(this.uri.fsPath, 'companion')],
            { env, stdio: ['pipe', 'pipe', 'pipe'] });
        this.starting = false;
        this.child = child; this.status = 'Starting desktop overlay';
        let buffer = '';
        child.stdout.on('data', chunk => {
            buffer += chunk.toString();
            if (Buffer.byteLength(buffer) > 32768) { this.stop(); return; }
            let index: number;
            while ((index = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
                try {
                    const m = JSON.parse(line);
                    if (m.version !== 1) continue;
                    if (m.type === 'ready') { this.ready = true; this.status = m.status; this.changed.fire(); }
                    if (m.type === 'status' || m.type === 'voiceStatus') {
                        this.status = String(m.status || m.value).slice(0, 500);
                        this.output.appendLine(this.status);
                    }
                    if (m.type === 'voices' && Array.isArray(m.value))
                        this.voices = m.value.filter((v: any) => typeof v.id === 'string' && typeof v.name === 'string').slice(0, 100);
                } catch { this.output.appendLine('Ignored invalid companion response'); }
            }
        });
        child.stderr.on('data', data => this.output.append(data.toString().slice(0, 4000)));
        const closed = () => {
            if (this.child !== child) return;
            this.child = undefined; this.ready = false;
            if (this.heartbeat) clearInterval(this.heartbeat);
            this.status += ' (disconnected)'; this.changed.fire();
        };
        child.on('error', e => { this.status = e.message; closed(); });
        child.on('exit', closed);
        child.stdin.on('error', () => { child.kill(); closed(); });
        this.write({ type: 'hello', token });
        this.focus(vscode.window.state.focused);
        this.heartbeat = setInterval(() => this.write({ type: 'heartbeat' }), 1500);
    }
    stop() {
        this.desired = false;
        this.editorSpeech.cancel();
        this.editorOverlay.stop();
        const child = this.child;
        this.child = undefined; this.ready = false;
        if (this.heartbeat) clearInterval(this.heartbeat);
        child?.stdin.end(); child?.kill();
        this.status = 'Desktop companion stopped'; this.changed.fire();
    }
    toggle() { if (this.editorMode) { this.editorOverlay.toggle(); return; } this.visible = !this.visible; this.write({ type: 'overlay', visible: this.visible }); this.changed.fire(); }
    showStatus() { void vscode.window.showInformationMessage((this.editorMode ? 'Editor overlay — ' + this.voiceStatus : this.status) + ' — ' + (this.active ? 'Overlay active' : 'Overlay inactive'), 'Open Log').then(choice => { if (choice) this.output.show(); }); }
    async selectVoice() {
        if (this.editorMode) {
            const voices = await this.editorSpeech.listVoices();
            const choice = await vscode.window.showQuickPick([{ label: 'Default voice', id: '' }, ...voices.map(v => ({ label: v.name, id: v.id }))], { title: 'Merlin voice' });
            if (choice) await vscode.workspace.getConfiguration('merlin').update('voice.id', choice.id, vscode.ConfigurationTarget.Global);
            return;
        }
        if (!this.ready) { this.showStatus(); return; }
        this.write({ type: 'voices' });
        await new Promise(resolve => setTimeout(resolve, 300));
        const choice = await vscode.window.showQuickPick([{ label: 'System default', id: '' },
            ...this.voices.map(v => ({ label: v.name, id: v.id }))], { title: 'Merlin voice' });
        if (choice) await vscode.workspace.getConfiguration('merlin').update('voice.id', choice.id, vscode.ConfigurationTarget.Global);
    }
    dispose() { this.stop(); this.editorSpeech.dispose(); this.editorOverlay.dispose(); this.changed.dispose(); this.output.dispose(); }
}
