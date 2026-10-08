import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Settings } from './messages';
const { LocalVoice } = require('../companion/voice/provider.cjs');
type VoiceOptions = NonNullable<Settings['voice']>;
export type SpeechEvent = { type: 'start' | 'end' | 'played' | 'error' | 'status'; message?: string };
// This code is constant; all text/options arrive separately as JSON on stdin.
const windowsScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($request.list) {
    @($synth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{id=$_.VoiceInfo.Name; name=$_.VoiceInfo.Name} }) | ConvertTo-Json -Compress
  } else {
    if ($request.id) { $synth.SelectVoice([string]$request.id) }
    $synth.SetOutputToDefaultAudioDevice()
    $synth.Volume = [int][Math]::Round(100 * $request.volume)
    $synth.Rate = [int][Math]::Round(5 * [Math]::Log($request.rate, 2))
    $text = [System.Security.SecurityElement]::Escape([string]$request.text)
    $pitch = [int][Math]::Round(($request.pitch - 1) * 50)
    $culture = $synth.Voice.Culture.Name
    $synth.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$culture'><prosody pitch='$pitch%'>$text</prosody></speak>")
  }
} finally { $synth.Dispose() }
`;
function pcm(wav: Buffer, volume: number) {
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid synthesized WAV');
    let rate = 0, channels = 0, format = 0, bits = 0;
    for (let offset = 12; offset + 8 <= wav.length;) {
        const size = wav.readUInt32LE(offset + 4), start = offset + 8;
        if (start + size > wav.length) throw Error('Truncated synthesized WAV');
        const kind = wav.toString('ascii', offset, offset + 4);
        if (kind === 'fmt ' && size >= 16) { format = wav.readUInt16LE(start); channels = wav.readUInt16LE(start + 2); rate = wav.readUInt32LE(start + 4); bits = wav.readUInt16LE(start + 14); }
        if (kind === 'data') {
            if (format !== 1 || bits !== 16 || !rate || !channels || size % 2) throw Error('Unsupported synthesized audio format');
            const audio = Buffer.from(wav.subarray(start, start + size));
            for (let i = 0; i < audio.length; i += 2) audio.writeInt16LE(Math.round(audio.readInt16LE(i) * volume), i);
            return { audio, rate, channels };
        }
        offset = start + size + (size % 2);
    }
    throw Error('Synthesized WAV has no audio');
}
export class EditorSpeech {
    private synthesizer: any;
    private child?: ChildProcessWithoutNullStreams;
    private timer?: ReturnType<typeof setTimeout>;
    private serial = 0;
    private busy = false;
    private diagnostic = false;
    private voices: { id: string; name: string }[] = [];
    private voiceRequest?: Promise<{ id: string; name: string }[]>;
    constructor(private root: string, private event: (event: SpeechEvent) => void,
        private spawnProcess: typeof spawn = spawn, private platform = process.platform, private arch = process.arch) {}
    private get windowsExecutable() { return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); }
    private ensureLinux() {
        if (this.synthesizer) return;
        const executable = path.join(this.root, `linux-${this.arch}`, 'espeak-ng');
        const player = path.join(this.root, `linux-${this.arch}`, 'play-audio');
        for (const file of [executable, player]) {
            if (!fs.existsSync(file)) throw Error(`Bundled speech component missing for Linux ${this.arch}. Install the voice-enabled VSIX for this architecture.`);
            fs.chmodSync(file, 0o755);
        }
        this.synthesizer = new LocalVoice((message: any) => {
            if (message.type === 'voices') this.voices = message.voices;
            if (message.type === 'audio' && this.busy && message.id === this.serial) {
                try {
                    const data = pcm(Buffer.from(message.audio, 'base64'), message.volume);
                    this.launch(player, [String(data.rate), String(data.channels)], data.audio, message.id);
                } catch (error) { this.fail(message.id, String(error)); }
            }
            if (message.type === 'error') this.fail(this.serial, message.status);
        }, this.spawnProcess, this.root, executable);
    }
    speak(message: { text: string; diagnostic: boolean }, options: VoiceOptions) {
        this.cancel();
        if (!options.enabled || options.volume <= 0) return;
        const serial = this.serial;
        this.busy = true; this.diagnostic = message.diagnostic; this.event({ type: 'start' });
        this.timer = setTimeout(() => this.fail(serial, 'Speech playback timed out'), 300000);
        const text = message.text.slice(0, 8000);
        const voice = { ...options, rate: Math.max(.5, Math.min(2, options.rate)), pitch: Math.max(0, Math.min(2, options.pitch)), volume: Math.max(0, Math.min(1, options.volume)) };
        try {
            if (this.platform === 'linux') {
                this.ensureLinux();
                if (!this.synthesizer.speak({ id: serial, text }, voice)) this.fail(serial, 'Bundled speech synthesis unavailable');
            } else if (this.platform === 'darwin') {
                const args = ['-r', String(Math.round(voice.rate * 175)), ...(voice.id ? ['-v', voice.id] : [])];
                const pitch = voice.pitch === 1 ? '' : `[[pbas ${Math.round(100 + voice.pitch * 50)}]]`;
                this.launch('/usr/bin/say', args, `[[volm ${voice.volume}]]${pitch}${text.replace(/\[\[/g, '[ [').replace(/\]\]/g, '] ]')}`, serial);
            } else if (this.platform === 'win32') {
                this.launch(this.windowsExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsScript], JSON.stringify({ ...voice, text }), serial);
            } else this.fail(serial, 'Speech is unavailable on this platform');
        } catch (error) { this.fail(serial, String(error)); }
    }
    private launch(executable: string, args: string[], input: Buffer | string, serial: number) {
        const child = this.spawnProcess(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        this.child = child;
        let error = '';
        child.stdout.on('data', () => {});
        child.stderr.on('data', chunk => { error = (error + chunk).slice(0, 1000); });
        child.stdin.on('error', () => {});
        child.on('error', e => this.fail(serial, e.message));
        child.on('close', code => {
            if (!this.busy || serial !== this.serial) return;
            if (code !== 0) { this.fail(serial, error || 'Speech output failed'); return; }
            this.child = undefined; clearTimeout(this.timer); this.busy = false;
            this.synthesizer?.finished(serial);
            this.event({ type: 'played', message: 'Speech playback completed' }); this.event({ type: 'end' });
        });
        child.stdin.end(input);
    }
    private fail(serial: number, message: string) {
        if (serial !== this.serial) return;
        this.cancel(); this.event({ type: 'error', message });
    }
    cancelDiagnostic() { if (this.diagnostic) this.cancel(); }
    cancel() {
        this.serial++; clearTimeout(this.timer);
        this.child?.kill(); this.child = undefined; this.synthesizer?.cancel();
        if (this.busy) this.event({ type: 'end' });
        this.busy = false; this.diagnostic = false;
    }
    async listVoices() {
        if (this.voices.length) return this.voices;
        if (this.platform === 'linux') {
            try { this.ensureLinux(); } catch (error) { this.event({ type: 'error', message: String(error) }); return []; }
            await new Promise(resolve => setTimeout(resolve, 250));
            return this.voices;
        }
        if (this.voiceRequest) return this.voiceRequest;
        this.voiceRequest = new Promise(resolve => {
            const mac = this.platform === 'darwin';
            const child = this.spawnProcess(mac ? '/usr/bin/say' : this.windowsExecutable,
                mac ? ['-v', '?'] : ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsScript], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
            let output = ''; const timeout = setTimeout(() => child.kill(), 5000);
            child.stdout.on('data', chunk => { output += chunk; if (output.length > 65536) child.kill(); }); child.stderr.on('data', () => {});
            child.stdin.on('error', () => {}); child.stdin.end(mac ? '' : JSON.stringify({ list: true }));
            child.on('error', () => { clearTimeout(timeout); resolve([]); });
            child.on('close', code => {
                clearTimeout(timeout);
                try {
                    this.voices = code !== 0 ? [] : mac ? output.split('\n').flatMap(line => {
                        const match = line.match(/^(.+?)\s+[a-z]{2,3}[_-][A-Z]{2}\s+#/); return match ? [{ id: match[1].trim(), name: match[1].trim() }] : [];
                    }) : [JSON.parse(output.trim())].flat().filter(v => typeof v.id === 'string' && typeof v.name === 'string');
                } catch { this.voices = []; }
                resolve(this.voices);
            });
        });
        return this.voiceRequest;
    }
    dispose() { this.cancel(); this.synthesizer?.dispose(); }
}
export { pcm };
