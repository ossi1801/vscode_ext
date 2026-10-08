import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { HostMessage, Settings } from './messages';
import { diagnosticExplanation } from './suggestedFix';
import { ReactionGate } from './diagnostics';
import { Dialogue } from './dialogue';
import * as path from 'node:path';
const { LocalVoice } = require('../companion/voice/provider.cjs');
import { CompanionConnection } from './companionConnection';
export class MerlinViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private localVoiceEngine: any;
    private localUtterance = 0;
    private localDiagnostic = false;
    private localVoices: { id: string; name: string }[] = [];
    private view?: vscode.WebviewView;
    private listeners: vscode.Disposable[] = [];
    private timer?: ReturnType<typeof setTimeout>;
    private gate = new ReactionGate();
    private dialogue = new Dialogue();
    private paused = false;
    private lastReaction = -Infinity;
    private fixRequest = 0;
    private disposed = false;
    constructor(private uri: vscode.Uri, private companion: CompanionConnection) {
        this.listeners.push(
        companion.onDidChange(() => {
            void this.view?.webview.postMessage({ type: 'dismiss' });
            void this.view?.webview.postMessage({ type: 'surface', visible: !companion.active });
            companion.send({ type: 'settings', settings: this.settings() });
            companion.send({ type: 'pause', paused: this.paused });
            this.switchDocument();
        }),
        vscode.window.onDidChangeWindowState(e => { companion.focus(e.focused); if (e.focused) this.schedule(); else { this.localVoiceEngine?.cancel(); void this.view?.webview.postMessage({ type: 'dismiss' }); } }),
        vscode.window.onDidChangeActiveColorTheme(() => this.send({ type: 'settings', settings: this.settings() })),vscode.languages.onDidChangeDiagnostics(e => { const active = vscode.window.activeTextEditor?.document.uri.toString(); if (e.uris.some(u => u.toString() === active))
        { this.schedule(); } }), vscode.window.onDidChangeActiveTextEditor(() => this.switchDocument()), vscode.workspace.onDidCloseTextDocument(d => { if (d.uri.toString() === vscode.window.activeTextEditor?.document.uri.toString())
        this.switchDocument(); }), vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('merlin')) {
        this.send({ type: 'settings', settings: this.settings() });
        void this.view?.webview.postMessage({ type: 'surface', visible: !this.companion.active });
        if (e.affectsConfiguration('merlin.diagnosticReactions') || e.affectsConfiguration('merlin.warningReactions') || e.affectsConfiguration('merlin.displayMode')) this.switchDocument();
    } })); }
    private get localVoice(): any {
        return this.localVoiceEngine ||= new LocalVoice((event: any) => {
            if (event.type === 'audio') void this.view?.webview.postMessage({ type: 'voiceAudio', id: event.id, audio: event.audio, volume: event.volume });
            if (event.type === 'end') void this.view?.webview.postMessage({ type: 'voiceEnd', id: event.id });
            if (event.type === 'voices') this.localVoices = event.voices;
        }, undefined, path.join(this.uri.fsPath || '', 'companion/native'));
    }
    private settings(): Settings { const c = vscode.workspace.getConfiguration('merlin'); return { diagnosticReactions: c.get('diagnosticReactions', true), warningReactions: c.get('warningReactions', false), reactionCooldown: c.get('reactionCooldown', 15), speechDuration: c.get('speechDuration', 5), movementSpeed: c.get('movementSpeed', 48), reducedMotion: c.get('reducedMotion', false), characterScale: c.get('characterScale', 3), voice: {
        enabled: c.get('voice.enabled', true), id: c.get('voice.id', ''), provider: c.get('voice.provider', 'auto'),
        rate: c.get('voice.rate', 1), pitch: c.get('voice.pitch', 1), volume: c.get('voice.volume', .6)
    }, theme: vscode.window.activeColorTheme.kind }; }
    resolveWebviewView(view: vscode.WebviewView) { this.view = view; const w = view.webview; w.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.uri, 'dist'), vscode.Uri.joinPath(this.uri, 'media'), vscode.Uri.joinPath(this.uri, 'webview')] }; const nonce = randomBytes(18).toString('base64'); const local = (p: string) => w.asWebviewUri(vscode.Uri.joinPath(this.uri, p)); w.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource}; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${local('webview/styles.css')}"></head><body><div id="toolbar"><button id="pause" aria-label="Pause or resume movement">Pause</button><button id="dismiss">Dismiss speech</button></div><main id="stage" aria-label="Merlin wizard companion"><div id="wizard" role="img" aria-label="Merlin, a pixel wizard"></div><div id="bubble" role="status" aria-live="polite" hidden></div><div id="tail" aria-hidden="true" hidden></div></main><script nonce="${nonce}" src="${local('dist/webview.js')}" data-assets="${local('media/merlin')}"></script></body></html>`; const subs = [w.onDidReceiveMessage(m => { if (m?.type === 'ready') {
            this.send({ type: 'settings', settings: this.settings() });
            this.send({ type: 'pause', paused: this.paused });
            void this.view?.webview.postMessage({ type: 'surface', visible: !this.companion.active });
            this.switchDocument();
        }
        else if (m?.type === 'voiceEnded') this.localVoice.finished(m.id);
        else if (m?.type === 'dismiss') this.command('dismiss');
        else if (m?.type === 'pause')
            this.command('pause'); }), view.onDidChangeVisibility(() => { if (view.visible)
            this.schedule();
        else { this.localVoiceEngine?.cancel(); if (this.timer && !this.companion.active) clearTimeout(this.timer); } }), view.onDidDispose(() => { subs.forEach(s => s.dispose()); if (this.view === view)
            this.view = undefined; })]; }
    private send(message: HostMessage) {
        if (message.type === 'dismiss' || message.type === 'magic' || message.type === 'clearDiagnostics' || (message.type === 'speech' && !message.diagnostic)) this.fixRequest++;
        if (message.type === 'dismiss' || message.type === 'magic' ||
            (message.type === 'clearDiagnostics' && this.localDiagnostic) ||
            (message.type === 'settings' && !message.settings.voice?.enabled)) this.localVoiceEngine?.cancel();
        if (message.type === 'settings' || message.type === 'clearDiagnostics' || message.type === 'dismiss') {
            this.companion.send(message);
            void this.view?.webview.postMessage(message);
        } else if (this.companion.active) {
            this.localVoiceEngine?.cancel(); this.companion.send(message);
        } else if (message.type === 'speech') {
            if (!this.view?.visible || !vscode.window.state.focused) return;
            const id = ++this.localUtterance;
            this.localDiagnostic = message.diagnostic;
            const voice = this.settings().voice!;
            const externalVoice = voice.enabled && voice.provider !== 'chromium' && this.localVoice.speak({ ...message, id }, voice);
            void this.view?.webview.postMessage({ ...message, id, externalVoice });
        } else void this.view?.webview.postMessage(message);
    }
    async selectVoice() {
        if (this.companion.active) { await this.companion.selectVoice(); return; }
        const choice = await vscode.window.showQuickPick([{ label: 'Bundled English', id: '' },
            ...this.localVoices.map(v => ({ label: v.name, id: v.id }))], { title: 'Merlin voice' });
        if (choice) await vscode.workspace.getConfiguration('merlin').update('voice.id', choice.id, vscode.ConfigurationTarget.Global);
    }
    command(action: string) { if (action === 'explainError') return this.explainError(); if (action === 'show') {
        void vscode.commands.executeCommand('merlin.companion.focus');
        return;
    } if (action === 'testVoice' && !this.companion.active && !this.view?.visible) { void vscode.window.showWarningMessage('Start the Desktop Companion or open the Merlin sidebar to test voice.'); return; } if (action === 'testVoice') this.send({ type: 'speech', text: 'Hello! I am Merlin. Your wizard is ready to help.', diagnostic: false }); if (action === 'pause') {
        this.paused = !this.paused;
        this.send({ type: 'pause', paused: this.paused });
    } if (action === 'magic')
        this.send({ type: 'magic' }); if (action === 'speak')
        this.send({ type: 'speech', text: this.dialogue.next('manual'), diagnostic: false }); if (action === 'dismiss')
        this.send({ type: 'dismiss' }); }
    private switchDocument() { if (this.timer)
        clearTimeout(this.timer); this.gate.reset(vscode.window.activeTextEditor?.document.uri.toString() ?? ''); this.send({ type: 'clearDiagnostics' }); this.schedule(); }
    private schedule(delay = 400) { if (this.timer)
        clearTimeout(this.timer); this.timer = setTimeout(() => { void this.react(); }, Math.max(delay, this.lastReaction + this.settings().reactionCooldown * 1000 - Date.now())); }
    private async speakDiagnostic(editor: vscode.TextEditor, issue: vscode.Diagnostic) {
        const request = ++this.fixRequest, version = editor.document.version;
        const text = await diagnosticExplanation(editor.document, issue);
        if (this.disposed || request !== this.fixRequest || editor.document.version !== version ||
            vscode.window.activeTextEditor !== editor || !vscode.window.state.focused ||
            !vscode.languages.getDiagnostics(editor.document.uri).some(current => current.message === issue.message && current.range.start.line === issue.range.start.line)) return;
        this.send({ type: 'speech', diagnostic: true, text });
    }
    private async explainError() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const issues = vscode.languages.getDiagnostics(editor.document.uri);
        const cursor = editor.selection.active;
        const issue = [...issues].filter(d => d.severity <= vscode.DiagnosticSeverity.Warning).sort((a, b) =>
            Number(!a.range.contains(cursor)) - Number(!b.range.contains(cursor)) ||
            a.severity - b.severity || Math.abs(a.range.start.line - cursor.line) - Math.abs(b.range.start.line - cursor.line))[0];
        if (issue) await this.speakDiagnostic(editor, issue);
        else this.send({ type: 'speech', diagnostic: false, text: 'The language provider reports no errors or warnings in this document.' });
    }
    private async react() {
        const editor = vscode.window.activeTextEditor, settings = this.settings();
        if (!editor || editor.document.isClosed || !settings.diagnosticReactions ||
            (!this.companion.active && !this.view?.visible) || !vscode.window.state.focused) return;
        const issues = vscode.languages.getDiagnostics(editor.document.uri);
        const result = this.gate.evaluate(editor.document.uri.toString(), issues, settings.warningReactions, Date.now(), settings.reactionCooldown * 1000);
        if (!result) return;
        this.lastReaction = Date.now();
        if (result.kind === 'resolved') {
            this.send({ type: 'speech', diagnostic: true, text: 'The errors have vanished! Clearly, my magic worked.' });
        } else {
            const issue = issues.find(d => d.range.start.line + 1 === result.line && d.severity === (result.kind === 'error' ? 0 : 1));
            if (issue) await this.speakDiagnostic(editor, issue);
        }
    }
    dispose() { this.disposed = true; this.fixRequest++; this.localVoiceEngine?.dispose(); if (this.timer)
        clearTimeout(this.timer); this.listeners.forEach(d => d.dispose()); }
}
