export class LocalAudio {
    private context?: AudioContext;
    private source?: AudioBufferSourceNode;
    private serial = 0;
    cancel() { this.serial++; this.source?.stop(); this.source = undefined; }
    async play(encoded: string, volume: number, ended: (played: boolean) => void) {
        this.cancel(); const serial = this.serial;
        try {
            this.context ??= new AudioContext();
            const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
            const buffer = await this.context.decodeAudioData(bytes.buffer);
            await this.context.resume();
            if (serial !== this.serial) return;
            const gain = this.context.createGain(); gain.gain.value = Math.max(0, Math.min(1, volume));
            gain.connect(this.context.destination);
            const source = this.context.createBufferSource(); source.buffer = buffer;
            source.connect(gain); this.source = source;
            source.onended = () => { gain.disconnect(); if (serial === this.serial) { this.source = undefined; ended(true); } };
            source.start();
        } catch { if (serial === this.serial) ended(false); }
    }
}
