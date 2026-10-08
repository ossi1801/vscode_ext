import assert from 'node:assert/strict';
import { assessDesktop } from '../companion/platform/capabilities.mjs';

for (const env of [
  { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' },
  { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' },
  { XDG_SESSION_TYPE: 'x11', WAYLAND_DISPLAY: 'wayland-0' }
]) {
  const result = assessDesktop('linux', env);
  assert.equal(result.displayServer, 'wayland');
  assert.equal(result.overlaySupported, false);
}
assert.equal(assessDesktop('linux', { DISPLAY: ':0' }).displayServer, 'x11');
assert.equal(assessDesktop('linux', {}).displayServer, 'unknown');
assert.equal(assessDesktop('linux', {}).gate, 'blocked');
for (const platform of ['darwin', 'win32']) {
  assert.equal(assessDesktop(platform, {}).gate, 'available');
  assert.equal(assessDesktop(platform, {}).overlaySupported, true);
}
assert.equal(assessDesktop('linux', { DISPLAY: ':0' }).gate, 'available');
console.log('Desktop capability gate tests passed');
