import type { CSSProperties } from 'react';
import type { PhotoFrame } from './types';

export const FRAME_NAMES: Record<PhotoFrame, string> = { none: '틀 없음', polaroid: '폴라로이드', stamp: '우표' };
export function PhotoFrameImage({ src, alt, frame, blur = false, position = '50% 50%', fit = 'cover' }: { src: string; alt: string; frame: PhotoFrame; blur?: boolean; position?: string; fit?: 'cover' | 'contain' }) {
  return <span className={`framed-image frame-${frame} ${blur ? 'image-blurred' : ''}`} style={{ '--image-position': position, '--image-fit': fit } as CSSProperties}>
    <img className="photo-image" src={src} alt={alt} loading="lazy" draggable={false} />
    {frame !== 'none' && <span className="frame-art" aria-hidden="true" />}
  </span>;
}
