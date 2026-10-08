// Adapter availability is separate from acceptance testing on a real desktop.
export function assessDesktop(platform, env) {
  const session = (env.XDG_SESSION_TYPE || '').toLowerCase();
  const displayServer = platform !== 'linux' ? 'native'
    : session === 'wayland' || env.WAYLAND_DISPLAY ? 'wayland'
    : session === 'x11' || env.DISPLAY ? 'x11' : 'unknown';
  const overlaySupported = ['darwin', 'win32'].includes(platform) || (platform === 'linux' && displayServer === 'x11');
  const reason = overlaySupported ? 'Bundled native tracking adapter available; real desktop acceptance testing is still required.'
    : displayServer === 'wayland' ? 'Native Wayland tracking is unsupported; only X11/XWayland VS Code windows can be tracked.'
    : 'No supported desktop display server was detected.';
  return { platform, displayServer, desktop: env.XDG_CURRENT_DESKTOP || 'unknown',
    overlaySupported, gate: overlaySupported ? 'available' : 'blocked', reason };
}
