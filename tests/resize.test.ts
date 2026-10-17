import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const { resizedBounds, WindowResizer } = createRequire(import.meta.url)('../electron/window-resize.cjs');
const initial = { x: 200, y: 100, width: 1100, height: 800 };
describe('widget resizing', () => {
  it('resizes southeast without moving the origin', () => {
    expect(resizedBounds(initial, 'se', 120, -60)).toEqual({ x: 200, y: 100, width: 1220, height: 740 });
  });
  it('anchors the opposite corner when resizing northwest', () => {
    expect(resizedBounds(initial, 'nw', -100, -40)).toEqual({ x: 100, y: 60, width: 1200, height: 840 });
  });
  it('clamps the minimum while keeping the opposite edges fixed', () => {
    expect(resizedBounds(initial, 'nw', 1000, 1000)).toEqual({ x: 540, y: 360, width: 760, height: 540 });
  });
  it('rebases a held drag when the editor collapses before pointer release', () => {
    let bounds = { ...initial, width: initial.width + 312 };
    const window = { getBounds: () => ({ ...bounds }), getMinimumSize: () => [760, 540], setBounds: (next: typeof initial) => { bounds = next; } };
    const resizer = new WindowResizer(window, () => {});
    resizer.begin('se', 1400, 900);
    bounds = { ...initial };
    resizer.move(1400, 900);
    expect(bounds).toEqual(initial);
    resizer.move(1405, 907);
    expect(bounds).toEqual({ ...initial, width: initial.width + 5, height: initial.height + 7 });
    resizer.move(1405, 907);
    expect(bounds).toEqual({ ...initial, width: initial.width + 5, height: initial.height + 7 });
  });
  it('rebases position and both dimensions without losing the opposite-edge anchor', () => {
    let bounds = { ...initial, x: 100, width: initial.width + 312, height: initial.height + 2 };
    const window = { getBounds: () => ({ ...bounds }), getMinimumSize: () => [760, 540], setBounds: (next: typeof initial) => { bounds = next; } };
    const resizer = new WindowResizer(window, () => {});
    resizer.begin('nw', 100, 100);
    bounds = { ...initial };
    resizer.move(95, 93);
    expect(bounds).toEqual({ x: initial.x - 5, y: initial.y - 7, width: initial.width + 5, height: initial.height + 7 });
  });
  it('keeps the original pointer anchor while the user drags beyond minimum size', () => {
    let bounds = { ...initial };
    const window = { getBounds: () => ({ ...bounds }), getMinimumSize: () => [760, 540], setBounds: (next: typeof initial) => { bounds = next; } };
    const resizer = new WindowResizer(window, () => {});
    resizer.begin('se', 0, 0);
    resizer.move(-700, -500);
    expect(bounds).toEqual({ ...initial, width: 760, height: 540 });
    resizer.move(-600, -400);
    expect(bounds).toEqual({ ...initial, width: 760, height: 540 });
    resizer.move(-100, -100);
    expect(bounds).toEqual({ ...initial, width: 1000, height: 700 });
  });
});
