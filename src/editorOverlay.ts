import * as vscode from 'vscode';
import { HostMessage } from './messages';
import { Roaming, RoamBounds } from './roaming';
import { Animation } from '../webview/animation';

/** Editor-local overlay: no native process or display-server connection.
 * Absolute positioning in decoration CSS is an undocumented VS Code behavior.
 * Keep this isolated so a future renderer change does not affect the native mode.
 */
export class EditorOverlay implements vscode.Disposable {
    private running = false;
    private visible = true;
    private paused = false;
    private animation = new Animation();
    private sprite?: vscode.TextEditorDecorationType;
    private bubble?: vscode.TextEditorDecorationType;
    private editor?: vscode.TextEditor;
    private timer?: ReturnType<typeof setInterval>;
    private listeners: vscode.Disposable[] = [];
    private voiceBusy = false;
    private speech = '';
    private diagnostic = false;
    private expires = 0;
    private roaming = new Roaming();
    private elapsed = 0;
    private nextAction = 2500 + Math.random() * 2500;
    private idleUntil = 0;
    private walkUntil = 0;
    private switching = false;
    private lastTick = 0;
    private lastFrame = '';
    constructor(private uri: vscode.Uri, private changed: () => void) {
        this.listeners.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.switchEditor()),
            vscode.window.onDidChangeTextEditorVisibleRanges(() => this.draw()),
            vscode.workspace.onDidChangeTextDocument(() => this.draw())
        );
    }
    private rest() {
        this.switching = false;
        this.animation.set('idle');
        this.idleUntil = Date.now() + 2500 + Math.random() * 3000;
    }
    private switchEditor() {
        this.clear(); this.speech = ''; this.diagnostic = false;
        this.roaming.target = undefined;
        this.elapsed = 0;
        this.switching = this.active;
        if (vscode.workspace.getConfiguration('merlin').get('reducedMotion', false)) {
            this.roaming.relocate(this.bounds()); this.switching = false; this.rest();
        } else {
            this.animation.set('disappear'); this.animation.elapsed = 0;
        }
        this.draw(); this.changed();
    }
    get active() { return this.running && this.visible && vscode.window.state.focused && !!vscode.window.activeTextEditor; }
    get connected() { return this.running; }
    start() {
        if (this.running) return;
        this.running = true;
        this.lastTick = Date.now();
        this.rest();
        this.timer = setInterval(() => this.tick(), 100);
        this.draw(); this.changed();
    }
    stop() { this.running = false; clearInterval(this.timer); this.clear(); this.changed(); }
    toggle() { this.visible = !this.visible; this.draw(); this.changed(); }
    focus() { if (!vscode.window.state.focused) { this.speech = ''; this.diagnostic = false; this.rest(); } this.draw(); }
    send(message: HostMessage) {
        if (message.type === 'speech' && this.active) {
            this.switching = false; this.speech = message.text; this.diagnostic = message.diagnostic;
            this.expires = Date.now() + Math.max(vscode.workspace.getConfiguration('merlin').get('speechDuration', 5) * 1000, Math.min(30000, message.text.length * 45));
            this.animation.set('speaking');
        }
        if (message.type === 'dismiss' || (message.type === 'clearDiagnostics' && this.diagnostic)) {
            this.speech = ''; this.diagnostic = false; this.rest();
        }
        if (message.type === 'magic') { this.speech = ''; this.animation.set('magic'); }
        if (message.type === 'pause') this.paused = message.paused;
        this.draw();
    }
    voicePlaying(playing: boolean) {
        this.voiceBusy = playing;
        if (!playing && this.speech) this.expires = Math.max(this.expires, Date.now() + 750);
    }
    private bounds(): RoamBounds {
        const editor = vscode.window.activeTextEditor;
        const visible = editor?.visibleRanges[0];
        if (!editor || !visible) return { width: 0, height: 0 };
        const config = vscode.workspace.getConfiguration('editor', editor.document.uri);
        const lineHeight = config.get('lineHeight', 20) || 20;
        const size = 32 * vscode.workspace.getConfiguration('merlin').get('characterScale', 3);
        // VS Code exposes visible lines but no editor pixel width. Keep a
        // configurable horizontal region independent of the length of each code line.
        return { width: vscode.workspace.getConfiguration('merlin').get('roamingWidth', 500), height: Math.max(0, (visible.end.line - visible.start.line - 6) * lineHeight - size) };
    }
    private tick() {
        const now = Date.now();
        const dt = Math.min(150, Math.max(1, now - this.lastTick)); this.lastTick = now;
        if (!this.active) { this.clear(); return; }
        if (this.speech && !this.voiceBusy && now >= this.expires) { this.speech = ''; this.diagnostic = false; this.rest(); }
        const config = vscode.workspace.getConfiguration('merlin');
        // Finish file-switch transitions even when roaming is paused.
        if (this.switching || (!this.paused && !config.get('reducedMotion', false))) {
            this.elapsed += dt;
            if (this.animation.tick(dt)) {
                if (this.animation.state === 'disappear') {
                    this.roaming.relocate(this.bounds()); this.animation.set('appear');
                } else {
                    this.switching = false; this.rest(); this.elapsed = 0;
                }
            }
            if (!this.switching && !this.speech) {
                if (this.animation.state === 'moving' && now >= this.walkUntil) this.rest();
                if (this.animation.state === 'idle' && now >= this.idleUntil && this.elapsed > this.nextAction) {
                    this.elapsed = 0; this.nextAction = 2500 + Math.random() * 2500;
                    // Most trips are teleports; walking is only a brief occasional stroll.
                    const roll = Math.random();
                    if (roll < .7) this.animation.set('disappear');
                    else if (roll < .85) this.animation.set('magic');
                    else {
                        this.animation.set('moving'); this.roaming.choose(this.bounds());
                        this.walkUntil = now + 1000 + Math.random() * 1500;
                    }
                }
                if (this.animation.state === 'moving') this.roaming.step(dt / 1000, config.get('movementSpeed', 48), this.bounds());
            }
        }
        this.draw();
    }
    private clear() {
        if (this.editor) {
            if (this.sprite) this.editor.setDecorations(this.sprite, []);
            if (this.bubble) this.editor.setDecorations(this.bubble, []);
        }
        this.sprite?.dispose(); this.bubble?.dispose();
        this.sprite = this.bubble = undefined; this.editor = undefined; this.lastFrame = '';
    }
    private draw() {
        if (!this.active) { this.clear(); return; }
        const editor = vscode.window.activeTextEditor!;
        const visible = editor.visibleRanges[0];
        if (!visible || editor.document.isClosed) { this.clear(); return; }
        this.roaming.constrain(this.bounds());
        // Anchor near the top of the viewport, leaving room for the speech bubble.
        const lineHeight = vscode.workspace.getConfiguration('editor', editor.document.uri).get('lineHeight', 20) || 20;
        const line = Math.min(editor.document.lineCount - 1, visible.end.line, visible.start.line + 5 + Math.floor(this.roaming.position.y / lineHeight));
        const top = Math.round(this.roaming.position.y % lineHeight);
        const config = vscode.workspace.getConfiguration('merlin');
        const scale = Math.max(1, Math.min(6, Math.round(config.get('characterScale', 3))));
        const size = 32 * scale;
        const state = config.get('reducedMotion', false) ? 'idle' : this.animation.state;
        const frame = config.get('reducedMotion', false) ? 0 : this.animation.frame;
        const key = JSON.stringify([line, size, state, frame, Math.round(this.roaming.position.x), top, this.roaming.direction, this.speech]);
        if (this.editor === editor && this.lastFrame === key) return;
        this.clear(); this.editor = editor; this.lastFrame = key;
        const asset = vscode.Uri.joinPath(this.uri, 'media', 'merlin', 'frames', `${state}-${frame}-${scale}.svg`);
        // Only bounded numbers enter positioning CSS; VS Code resolves the asset URI.
        // Speech is passed as contentText, which VS Code escapes itself.
        this.sprite = vscode.window.createTextEditorDecorationType({ before: {
            contentIconPath: asset, width: `${size}px`, height: `${size}px`,
            textDecoration: `none; position:absolute; z-index:10; pointer-events:none; left:${Math.round(this.roaming.position.x)}px; top:${top}px; image-rendering:pixelated; transform:scaleX(${this.roaming.direction})`
        } });
        const range = new vscode.Range(line, 0, line, 0);
        editor.setDecorations(this.sprite, [{ range }]);
        if (this.speech) {
            const estimatedHeight = Math.ceil(this.speech.length / 32) * 18 + 18;
            const below = (line - visible.start.line) * lineHeight + top < estimatedHeight + 12;
            this.bubble = vscode.window.createTextEditorDecorationType({ before: {
                contentText: this.speech, color: new vscode.ThemeColor('editorHoverWidget.foreground'),
                backgroundColor: new vscode.ThemeColor('editorHoverWidget.background'),
                border: '1px solid', borderColor: new vscode.ThemeColor('editorHoverWidget.border'),
                textDecoration: `none; position:absolute; z-index:11; pointer-events:none; left:${Math.round(this.roaming.position.x)}px; ${below ? `top:${size + 8}px` : 'bottom:8px'}; max-width:280px; white-space:normal; padding:8px; border-radius:8px; font-family:system-ui; font-size:13px; line-height:18px`
            } });
            editor.setDecorations(this.bubble, [{ range }]);
        }
    }
    dispose() { this.stop(); this.listeners.forEach(listener => listener.dispose()); }
}
