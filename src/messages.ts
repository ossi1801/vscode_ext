export interface Settings {
    voice?: { enabled: boolean; id: string; provider: string; rate: number; pitch: number; volume: number };
    theme?: number;
    diagnosticReactions: boolean;
    warningReactions: boolean;
    reactionCooldown: number;
    speechDuration: number;
    movementSpeed: number;
    reducedMotion: boolean;
    characterScale: number;
}
export type HostMessage = {
    type: 'settings';
    settings: Settings;
} | {
    type: 'speech';
    text: string;
    diagnostic: boolean;
} | {
    type: 'clearDiagnostics';
} | {
    type: 'pause';
    paused: boolean;
} | {
    type: 'magic';
} | {
    type: 'dismiss';
};
export type ViewMessage = {
    type: 'ready';
} | {
    type: 'dismiss';
} | {
    type: 'pause';
};
