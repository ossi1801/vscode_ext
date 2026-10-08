const VERSION = 1;
const MAX_BYTES = 32768;
function validVoice(v) {
  return !!v && typeof v.enabled === 'boolean' && typeof v.id === 'string' && v.id.length <= 300 &&
    ['auto', 'bundled', 'chromium'].includes(v.provider) &&
    Number.isFinite(v.rate) && v.rate >= .5 && v.rate <= 2 &&
    Number.isFinite(v.pitch) && v.pitch >= 0 && v.pitch <= 2 &&
    Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1;
}
function validMessage(m) {
  if (!m || typeof m !== 'object') return false;
  switch (m.type) {
    case 'speech': return typeof m.text === 'string' && m.text.length <= 8000 &&
      typeof m.diagnostic === 'boolean' && Number.isSafeInteger(m.id) && Number.isSafeInteger(m.generation);
    case 'settings': return !!m.settings && ['speechDuration', 'movementSpeed', 'characterScale'].every(
      k => Number.isFinite(m.settings[k]) && m.settings[k] >= 0 && m.settings[k] <= 300) &&
      typeof m.settings.reducedMotion === 'boolean' && validVoice(m.settings.voice) &&
      [1, 2, 3, 4].includes(m.settings.theme);
    case 'pause': return typeof m.paused === 'boolean';
    case 'focus': return typeof m.focused === 'boolean';
    case 'overlay': return typeof m.visible === 'boolean';
    case 'clearDiagnostics': return Number.isSafeInteger(m.generation);
    case 'dismiss': case 'magic': case 'heartbeat': case 'voices': return true;
    default: return false;
  }
}
module.exports = { VERSION, MAX_BYTES, validMessage };
