const EDITOR_WIDTH = 312;
const MINIMUM_WIDTH = 760;
const { setExactBounds } = require('./window-bounds.cjs');

// Keep the editor's temporary width out of the saved calendar geometry.
class EditorPanel {
  constructor(window, workArea, saveBounds, native = null) {
    this.window = window;
    this.workArea = workArea;
    this.saveBounds = saveBounds;
    this.native = native;
    this.open = false;
    this.expansion = { x: 0, y: 0, width: 0, height: 0 };
  }
  calendarBounds() {
    const bounds = this.window.getBounds();
    if (!this.open) return bounds;
    // Restore the actual platform expansion in both dimensions, including DPI
    // rounding, while preserving subsequent user moves and resize gestures.
    return Object.fromEntries(Object.keys(this.expansion).map(key => [key, bounds[key] - this.expansion[key]]));
  }
  setOpen(open) {
    if (typeof open !== 'boolean' || open === this.open) return;
    const bounds = this.calendarBounds();
    if (open) {
      const physical = this.native?.getBounds();
      this.nativeScale = this.native?.scale();
      const area = this.workArea(bounds);
      const width = bounds.width + EDITOR_WIDTH;
      const x = Math.min(bounds.x, area.x + area.width - width);
      this.expansion = { x: x - bounds.x, y: 0, width: EDITOR_WIDTH, height: 0 };
      this.open = true;
      this.window.setBounds({ ...bounds, x, width });
      this.window.setMinimumSize(MINIMUM_WIDTH + EDITOR_WIDTH, 540);
      const expanded = this.window.getBounds();
      this.expansion = Object.fromEntries(Object.keys(this.expansion).map(key => [key, expanded[key] - bounds[key]]));
      if (physical) {
        const expandedPhysical = this.native.getBounds();
        this.nativeExpansion = Object.fromEntries(Object.keys(this.expansion).map(key => [key, expandedPhysical[key] - physical[key]]));
      }
    } else {
      let physical;
      if (this.native) {
        const current = this.native.getBounds(), ratio = this.native.scale() / this.nativeScale;
        physical = Object.fromEntries(Object.keys(this.expansion).map(key => [key, current[key] - Math.round(this.nativeExpansion[key] * ratio)]));
      }
      this.open = false;
      this.expansion = { x: 0, y: 0, width: 0, height: 0 };
      this.window.setMinimumSize(MINIMUM_WIDTH, 540);
      // Restore the exact native pixels. DIP round trips also change the client
      // area at fractional DPI, even when Electron reports unchanged bounds.
      if (physical) this.native.setBounds(physical);
      else setExactBounds(this.window, bounds);
    }
    this.saveBounds();
  }
}

module.exports = { EditorPanel, EDITOR_WIDTH };
