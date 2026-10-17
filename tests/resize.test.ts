import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const { resizedBounds } = createRequire(import.meta.url)('../electron/window-resize.cjs');
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
});
