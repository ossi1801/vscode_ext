import { HostMessage, Settings } from '../src/messages';
import { Animation } from './animation';
import { BrowserVoice } from './voice';
import { LocalAudio } from './localAudio';
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};
declare global { interface Window { merlinDesktop?: { postMessage(message: unknown): void; subscribe(callback: (message: any) => void): void } } }
const desktop = window.merlinDesktop;
const api = desktop || acquireVsCodeApi();
const localAudio = new LocalAudio();
const voice = new BrowserVoice(status => api.postMessage({ type: 'voiceStatus', status }));
let surfaceVisible = !desktop, voiceBusy = false, utteranceId = 0;
const stage = document.querySelector<HTMLElement>('#stage')!;
if (desktop) stage.style.visibility = 'hidden';
const wizard = document.querySelector<HTMLElement>('#wizard')!;
const bubble = document.querySelector<HTMLElement>('#bubble')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const tail = document.querySelector<HTMLElement>('#tail')!;
const assets = (document.currentScript as HTMLScriptElement).dataset.assets!;
const animation = new Animation();
const media = matchMedia('(prefers-reduced-motion: reduce)');
let settings: Settings = { diagnosticReactions: true, warningReactions: false, reactionCooldown: 15, speechDuration: 5, movementSpeed: 24, reducedMotion: false, characterScale: 3 };
let x = 30, y = 80, direction = 1, verticalDirection = 1, paused = false, diagnostic = false, until = 0, nextAction = 2000, elapsed = 0, last = 0, raf = 0;
const reduced = () => settings.reducedMotion || media.matches;
function dismiss() { localAudio.cancel(); voice.cancel(); voiceBusy = false; bubble.hidden = true; tail.hidden = true; until = 0; animation.set('idle'); }
function layout() { const width = stage.clientWidth, height = stage.clientHeight; const scale = Math.max(.1, Math.min(settings.characterScale, width / 32, height / 32)); const size = 32 * scale; wizard.style.width = `${size}px`; wizard.style.height = `${size}px`; x = Math.max(0, Math.min(x, width - size)); y = Math.max(0, Math.min(y, height - size)); wizard.style.left = `${x}px`; wizard.style.top = `${y}px`; wizard.style.backgroundSize = `${size * ({ idle: 4, moving: 4, magic: 6, disappear: 6, appear: 6, speaking: 4 }[animation.state])}px ${size}px`; wizard.style.backgroundPosition = `${-animation.frame * size}px 0`; wizard.style.backgroundImage = `url("${assets}/${animation.state}.png")`; wizard.style.transform = `scaleX(${direction})`; if (!bubble.hidden) {
    bubble.style.maxWidth = `${Math.max(1, Math.min(280, width - 12))}px`;
    bubble.style.maxHeight = `${Math.max(1, height - 12)}px`;
    const b = bubble.getBoundingClientRect();
    const left = Math.max(6, Math.min(x + size / 2 - b.width / 2, width - b.width - 6));
    let top = y - b.height - 12;
    if (top < 6)
        top = Math.min(height - b.height - 6, y + size + 12);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(6, top)}px`;
    bubble.style.setProperty('--tail-x', `${Math.max(8, Math.min(b.width - 8, x + size / 2 - left))}px`);
    tail.hidden = false;
    tail.style.left = `${left + Math.max(8, Math.min(b.width - 8, x + size / 2 - left)) - 4}px`;
    tail.style.top = `${top > y ? Math.max(6, top) - 4 : Math.max(6, top) + b.height - 4}px`;
} }
function frame(time: number) { raf = 0; if (!surfaceVisible) return; const dt = Math.min(50, last ? time - last : 0); last = time; if (until && !voiceBusy && Date.now() >= until)
    dismiss(); if (!paused && !reduced()) {
    elapsed += dt;
    if (animation.tick(dt)) {
        if (animation.state === 'disappear') {
            x = Math.random() * stage.clientWidth;
            y = Math.random() * stage.clientHeight;
            animation.set('appear');
        }
        else
            animation.set('idle');
    }
    if (animation.state === 'moving') {
        x += direction * settings.movementSpeed * dt / 1000;
        y += verticalDirection * settings.movementSpeed * .35 * dt / 1000;
        if (y < 0 || y + wizard.clientHeight > stage.clientHeight) verticalDirection *= -1;
        if (x < 0 || x + wizard.clientWidth > stage.clientWidth)
            direction *= -1;
    }
    if (bubble.hidden && elapsed > nextAction && ['idle', 'moving'].includes(animation.state)) {
        elapsed = 0;
        nextAction = 2000 + Math.random() * 4500;
        const n = Math.random();
        animation.set(n < .5 ? 'moving' : n < .8 ? 'idle' : n < .93 ? 'magic' : 'disappear');
        if (Math.random() < .3)
            direction *= -1;
    }
} layout(); raf = requestAnimationFrame(frame); }
function start() { if (surfaceVisible && !document.hidden && !raf) {
    last = 0;
    raf = requestAnimationFrame(frame);
} }
function receive(m: any) {
if (m.type === 'surface' || m.type === 'visibility') {
    surfaceVisible = m.visible;
    stage.style.visibility = surfaceVisible ? 'visible' : 'hidden';
    if (!surfaceVisible) { dismiss(); cancelAnimationFrame(raf); raf = 0; last = 0; }
    else start();
    return;
}
if (m.type === 'voiceEnd' && m.id === utteranceId) { localAudio.cancel(); voiceBusy = false; }
if (m.type === 'voiceAudio' && m.id === utteranceId && voiceBusy && surfaceVisible && !bubble.hidden) {
    void localAudio.play(m.audio, m.volume, played => { voiceBusy = false; api.postMessage({ type: 'voiceEnded', id: m.id, played }); });
}
if (m.type === 'voices') api.postMessage({ type: 'voices', voices: voice.voices() }); if (m.type === 'settings') {
    settings = m.settings;
    if (!settings.voice?.enabled) { localAudio.cancel(); voice.cancel(); voiceBusy = false; }
    const light = settings.theme === 1 || settings.theme === 4;
    if (desktop) {
        document.documentElement.style.setProperty('--vscode-editorHoverWidget-background', light ? '#ffffff' : '#252526');
        document.documentElement.style.setProperty('--vscode-editorHoverWidget-foreground', light ? '#111111' : '#ffffff');
        document.documentElement.style.setProperty('--vscode-editorHoverWidget-border', settings.theme === 3 ? '#ffff00' : '#888888');
    }
    layout();
} if (m.type === 'pause') {
    paused = m.paused;
    pause.textContent = paused ? 'Resume' : 'Pause';
} if (m.type === 'speech') {
    dismiss();
    utteranceId = m.id ?? utteranceId + 1;
    const thisId = utteranceId;
    voiceBusy = !!settings.voice?.enabled;
    bubble.setAttribute('aria-live', voiceBusy ? 'off' : 'polite');
    if (m.voiceUnavailable) voiceBusy = false;
    else if (!m.externalVoice) voice.speak(m.text, settings.voice || { enabled: false, id: '', provider: 'auto', rate: 1, pitch: 1, volume: .6 }, () => { if (thisId === utteranceId) voiceBusy = false; });
    if (!voiceBusy) bubble.setAttribute('aria-live', 'polite');
    bubble.textContent = m.text;
    bubble.hidden = false;
    diagnostic = m.diagnostic;
    until = Date.now() + Math.max(settings.speechDuration * 1000, Math.min(300000, m.text.length * 65));
    animation.set('speaking');
} if (m.type === 'dismiss' || (m.type === 'clearDiagnostics' && diagnostic))
    dismiss(); if (m.type === 'magic') {
    dismiss();
    animation.set('magic');
} layout(); start(); }
if (desktop) desktop.subscribe(receive);
else window.addEventListener('message', event => receive(event.data));
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener('voiceschanged', () => api.postMessage({ type: 'voices', voices: voice.voices() }));
pause.addEventListener('click', () => api.postMessage({ type: 'pause' }));
function requestDismiss() { dismiss(); api.postMessage({ type: 'dismiss' }); }
document.querySelector('#dismiss')!.addEventListener('click', requestDismiss);
bubble.addEventListener('click', requestDismiss);
document.addEventListener('keydown', e => { if (e.key === 'Escape')
    requestDismiss(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) {
    dismiss();
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
}
else
    start(); });
new ResizeObserver(layout).observe(stage);
media.addEventListener('change', () => { animation.set(bubble.hidden ? 'idle' : 'speaking'); layout(); });
api.postMessage({ type: 'ready' });
start();
