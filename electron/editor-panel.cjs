const EDITOR_WIDTH = 312;
const MINIMUM_WIDTH = 760;

// Keep the editor's temporary width out of the saved calendar geometry.
class EditorPanel {
  constructor(window, workArea, saveBounds) {
    this.window = window;
    this.workArea = workArea;
    this.saveBounds = saveBounds;
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
      const area = this.workArea(bounds);
      const width = bounds.width + EDITOR_WIDTH;
      const x = Math.min(bounds.x, area.x + area.width - width);
      this.expansion = { x: x - bounds.x, y: 0, width: EDITOR_WIDTH, height: 0 };
      this.open = true;
      this.window.setBounds({ ...bounds, x, width });
      this.window.setMinimumSize(MINIMUM_WIDTH + EDITOR_WIDTH, 540);
      const expanded = this.window.getBounds();
      this.expansion = Object.fromEntries(Object.keys(this.expansion).map(key => [key, expanded[key] - bounds[key]]));
    } else {
      this.open = false;
      this.expansion = { x: 0, y: 0, width: 0, height: 0 };
      this.window.setMinimumSize(MINIMUM_WIDTH, 540);
      this.window.setBounds(bounds);
    }
    this.saveBounds();
  }
}

module.exports = { EditorPanel, EDITOR_WIDTH };
