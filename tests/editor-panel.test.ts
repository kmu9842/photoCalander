import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const { EditorPanel } = createRequire(import.meta.url)('../electron/editor-panel.cjs');
const original = { x: 900, y: 150, width: 1000, height: 800 };

describe('temporary editor window geometry', () => {
  it('restores actual expansion, including platform adjustments to width and height, across repeated cycles', () => {
    let bounds = { ...original };
    const saved: typeof original[] = [];
    const window = { getBounds: () => ({ ...bounds }), setBounds: (next: typeof original) => { bounds = { ...next }; if (next.width > original.width) { bounds.width += 2; bounds.height += 3; } }, setMinimumSize: () => {} };
    const panel = new EditorPanel(window, () => ({ x: 0, y: 0, width: 1920, height: 1080 }), () => saved.push(panel.calendarBounds()));
    for (let i = 0; i < 20; i++) {
      panel.setOpen(true);
      expect(bounds.x + bounds.width).toBe(1922);
      expect(panel.calendarBounds()).toEqual(original);
      panel.setOpen(true);
      expect(panel.calendarBounds()).toEqual(original);
      panel.setOpen(false);
      panel.setOpen(false);
      expect(bounds).toEqual(original);
    }
    expect(saved).toHaveLength(40);
    expect(saved.every(value => JSON.stringify(value) === JSON.stringify(original))).toBe(true);
  });
  it('preserves intentional user resizing and movement while the editor is open', () => {
    let bounds = { ...original };
    const window = { getBounds: () => ({ ...bounds }), setBounds: (next: typeof original) => { bounds = { ...next }; }, setMinimumSize: () => {} };
    const panel = new EditorPanel(window, () => ({ x: 0, y: 0, width: 1920, height: 1080 }), () => {});
    panel.setOpen(true);
    bounds = { x: bounds.x - 20, y: bounds.y + 30, width: bounds.width + 80, height: bounds.height - 60 };
    const expected = { x: original.x - 20, y: original.y + 30, width: original.width + 80, height: original.height - 60 };
    expect(panel.calendarBounds()).toEqual(expected);
    panel.setOpen(false);
    expect(bounds).toEqual(expected);
  });
});
