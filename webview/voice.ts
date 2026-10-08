export interface VoiceOptions { enabled: boolean; id: string; provider: string; rate: number; pitch: number; volume: number }
export class BrowserVoice {
    private timer?: ReturnType<typeof setTimeout>;
    private serial = 0;
    constructor(private status: (status: string) => void) {}
    voices() { return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices().map(v => ({ id: v.voiceURI, name: v.name })); }
    cancel() {
        this.serial++; clearTimeout(this.timer);
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    }
    speak(text: string, options: VoiceOptions, ended: () => void) {
        this.cancel();
        if (!options.enabled) { ended(); return; }
        if (typeof speechSynthesis === 'undefined' || !speechSynthesis.getVoices().length) {
            this.status('No Chromium voices available. Use the desktop Speech Dispatcher backend.'); ended(); return;
        }
        const serial = this.serial;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = Math.max(.5, Math.min(2, options.rate));
        utterance.pitch = Math.max(0, Math.min(2, options.pitch));
        utterance.volume = Math.max(0, Math.min(1, options.volume));
        const selected = speechSynthesis.getVoices().find(v => v.voiceURI === options.id);
        if (selected) utterance.voice = selected;
        else if (options.id) this.status('Selected voice unavailable; using system default.');
        const finish = () => { if (serial === this.serial) { clearTimeout(this.timer); ended(); } };
        utterance.onend = finish;
        utterance.onerror = () => { this.status('Voice playback failed; the speech bubble remains available.'); finish(); };
        this.timer = setTimeout(() => { if (serial === this.serial) { this.cancel(); this.status('Voice playback timed out.'); ended(); } }, Math.min(300000, Math.max(15000, text.length * 200)));
        speechSynthesis.speak(utterance);
    }
}
