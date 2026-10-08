export type State = 'idle' | 'moving' | 'magic' | 'disappear' | 'appear' | 'speaking';
export const animations: Record<State, {
    frames: number;
    ms: number;
    loop: boolean;
}> = { idle: { frames: 4, ms: 260, loop: true }, moving: { frames: 4, ms: 140, loop: true }, magic: { frames: 6, ms: 140, loop: false }, disappear: { frames: 6, ms: 110, loop: false }, appear: { frames: 6, ms: 110, loop: false }, speaking: { frames: 4, ms: 140, loop: true } };
export class Animation {
    state: State = 'idle';
    elapsed = 0;
    set(state: State) { if (this.state !== state) {
        this.state = state;
        this.elapsed = 0;
    } }
    tick(ms: number): boolean { this.elapsed += ms; const a = animations[this.state]; return !a.loop && this.elapsed >= a.frames * a.ms; }
    get frame() { const a = animations[this.state]; return a.loop ? Math.floor(this.elapsed / a.ms) % a.frames : Math.min(a.frames - 1, Math.floor(this.elapsed / a.ms)); }
}
