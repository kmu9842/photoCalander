const EDITOR_WIDTH = 312;
const MINIMUM_WIDTH = 760;

// Keep the editor's temporary width out of the saved calendar geometry.
class EditorPanel {
  constructor(window, workArea, saveBounds) {
    this.window = window;
    this.workArea = workArea;
    this.saveBounds = saveBounds;
    this.open = false;
    this.shiftX = 0;
  }
  calendarBounds() {
    const bounds = this.window.getBounds();
    return this.open ? { ...bounds, x: bounds.x + this.shiftX, width: bounds.width - EDITOR_WIDTH } : bounds;
  }
  setOpen(open) {
    if (typeof open !== 'boolean' || open === this.open) return;
    const bounds = this.calendarBounds();
    if (open) {
      const area = this.workArea(bounds);
      const width = bounds.width + EDITOR_WIDTH;
      const x = Math.min(bounds.x, area.x + area.width - width);
      this.shiftX = bounds.x - x;
      this.open = true;
      this.window.setBounds({ ...bounds, x, width });
      this.window.setMinimumSize(MINIMUM_WIDTH + EDITOR_WIDTH, 540);
    } else {
      this.open = false;
      this.shiftX = 0;
      this.window.setMinimumSize(MINIMUM_WIDTH, 540);
      this.window.setBounds(bounds);
    }
    this.saveBounds();
  }
}

module.exports = { EditorPanel, EDITOR_WIDTH };
