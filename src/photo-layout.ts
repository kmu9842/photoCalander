import type { Photo, PhotoFrame, PhotoPlacement, PhotoSize } from './types';
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function placementFor(photo: Photo, size: PhotoSize, index = 0, frame: PhotoFrame = 'none'): PhotoPlacement {
  if (size === 'large') return photo.placement ?? { x: 50, y: 50, rotation: 0 };
  return photo.placement ?? { x: size === 'small' ? 100 : clamp(50 + index * 12), y: size === 'small' ? 0 : 100, rotation: frame === 'none' ? 0 : index % 2 ? 6 : -5 };
}
export function photoBox(photo: Photo, size: PhotoSize, width: number, height: number, index = 0, defaultFrame: PhotoFrame = 'none') {
  const frame = photo.frame ?? defaultFrame;
  const placement = placementFor(photo, size, index, frame);
  if (size === 'large') return { left: 0, top: 0, width, height, rotation: 0, travelX: 0, travelY: 0 };
  const margin = 4, areaW = Math.max(1, width - margin * 2), areaH = Math.max(1, height - margin * 2);
  const ratio = frame === 'polaroid' ? .82 : frame === 'stamp' ? 1 : clamp(photo.width / photo.height, .6, 1.7);
  let h = size === 'small' ? 32 : Math.min(Math.max(1, height - 36) * .6, width * .86 / ratio);
  let w = size === 'small' ? 32 : h * ratio;
  const angle = placement.rotation * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const scale = Math.min(1, areaW / (w * cos + h * sin), areaH / (h * cos + w * sin));
  w *= scale; h *= scale;
  const boundW = w * cos + h * sin, boundH = h * cos + w * sin;
  const travelX = Math.max(0, areaW - boundW), travelY = Math.max(0, areaH - boundH);
  return { left: margin + travelX * placement.x / 100 + (boundW - w) / 2, top: margin + travelY * placement.y / 100 + (boundH - h) / 2, width: w, height: h, rotation: placement.rotation, travelX, travelY };
}
