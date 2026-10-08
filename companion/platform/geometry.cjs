// Linux supports point conversion, not Electron's Windows-only screenToDipRect.
function toLogicalBounds(bounds, screen, platform = 'linux') {
  // CoreGraphics reports points already; Windows provides rectangle conversion
  // that accounts for monitor origins with different scaling factors.
  if (platform === 'darwin') return { ...bounds };
  if (platform === 'win32') return screen.screenToDipRect(null, bounds);
  const origin = screen.screenToDipPoint({ x: bounds.x, y: bounds.y });
  const scale = screen.getDisplayNearestPoint(origin).scaleFactor;
  if (!Number.isFinite(scale) || scale <= 0) throw Error('Invalid display scale');
  return { x: Math.round(origin.x), y: Math.round(origin.y),
    width: Math.max(1, Math.round(bounds.width / scale)),
    height: Math.max(1, Math.round(bounds.height / scale)) };
}
module.exports = { toLogicalBounds };
