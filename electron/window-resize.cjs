const EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
function resizedBounds(bounds, edge, dx, dy, minimum = { width: 760, height: 540 }) {
  let { x, y, width, height } = bounds;
  if (edge.includes('e')) width = Math.max(minimum.width, width + dx);
  if (edge.includes('s')) height = Math.max(minimum.height, height + dy);
  if (edge.includes('w')) { width = Math.max(minimum.width, width - dx); x = bounds.x + bounds.width - width; }
  if (edge.includes('n')) { height = Math.max(minimum.height, height - dy); y = bounds.y + bounds.height - height; }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
class WindowResizer {
  constructor(window, saveBounds) { this.window = window; this.saveBounds = saveBounds; this.active = null; }
  begin(edge, x, y) {
    if (!EDGES.has(edge) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.active = { edge, x, y, bounds: this.window.getBounds() };
  }
  move(x, y) {
    if (!this.active || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const state = this.active;
    const [width, height] = this.window.getMinimumSize();
    this.window.setBounds(resizedBounds(state.bounds, state.edge, x - state.x, y - state.y, { width, height }));
  }
  end() { if (this.active) { this.active = null; this.saveBounds(); } }
}
module.exports = { WindowResizer, resizedBounds };
