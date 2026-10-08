// Real packaged-extension playback verification. Run alongside flatpak-smoke.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.test-artifacts');
const profile = process.env.MERLIN_TEST_PROFILE || 'profile060';
function find(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? find(path.join(dir, entry.name)) : entry.name.includes('Merlin Desktop.log') ? [path.join(dir, entry.name)] : []);
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function action(id, command) {
  fs.writeFileSync(path.join(root, 'action.json'), JSON.stringify({ id, command }));
  for (let n = 0; n < 100; n++) {
    await wait(100);
    try { const result = JSON.parse(fs.readFileSync(path.join(root, 'action-result.json'))); if (result.id === id) return result; } catch {}
  }
  throw Error('Test window did not respond');
}
(async () => {
  const logs = find(path.join(root, profile, 'logs'));
  const completed = () => logs.reduce((sum, file) => sum + (fs.readFileSync(file, 'utf8').match(/Speech playback completed/g) || []).length, 0);
  const before = completed();
  await action('test-voice', 'merlin.testVoice');
  const deadline = Date.now() + 20000;
  while (completed() <= before && Date.now() < deadline) await wait(250);
  assert.ok(completed() > before, 'Test Voice must reach real playback completion');
  await action('long-speech', 'merlin.explainError');
  await wait(500);
  const playing = await action('playing');
  assert.ok(playing.speechProcesses?.length > 0, 'The packaged voice engine/player must actually run');
  await action('mute', 'merlin.toggleVoice'); await wait(250);
  const muted = await action('muted');
  assert.equal(muted.voiceEnabled, false); assert.equal(muted.speechProcesses.length, 0, 'Mute must stop all speech children');
  await action('unmute', 'merlin.toggleVoice');
  const proof = { testVoiceCompleted: true, muteStoppedChildren: true, completedPlaybacks: completed() };
  fs.writeFileSync(path.join(root, 'packaged-audio-verification.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
})().catch(error => { console.error(error); process.exitCode = 1; });
