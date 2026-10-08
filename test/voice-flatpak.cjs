// Run with Flatpak VS Code's bundled Node runtime, DISPLAY unset.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { EditorSpeech, pcm } = require('../dist/test/editorSpeech.js');
const root = path.resolve(__dirname, '..');
const events = [];
let speech;
const timeout = setTimeout(() => { speech?.dispose(); console.error('Audio playback timed out'); process.exitCode = 1; }, 20000);
speech = new EditorSpeech(path.join(root, 'companion/speech'), event => {
    events.push(event); console.log(JSON.stringify(event));
    if (event.type === 'played') {
        clearTimeout(timeout);
        assert.ok(events.some(e => e.type === 'start'));
        fs.mkdirSync(path.join(root, '.test-artifacts'), { recursive: true });
        fs.writeFileSync(path.join(root, '.test-artifacts/speech-verification.json'), JSON.stringify({ flatpak: process.env.FLATPAK_ID, display: process.env.DISPLAY || '', events }, null, 2));
        setTimeout(() => speech.dispose(), 50);
    }
    if (event.type === 'error') { clearTimeout(timeout); speech.dispose(); process.exitCode = 1; }
});
speech.speak({ text: 'Hello! I am Merlin. I can now read your suggested fixes aloud.', diagnostic: false },
    { enabled: true, provider: 'auto', id: '', rate: 1, pitch: 1, volume: .6 });
