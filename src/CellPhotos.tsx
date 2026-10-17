import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Photo, PhotoSize } from './types';

type Props = { photos: Photo[]; size: PhotoSize; blur?: boolean; show: (index: number) => void };

function SmallPhoto({ photos, blur, show }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [preview, setPreview] = useState<CSSProperties | null>(null);
  const id = useId();
  const cancelHide = () => clearTimeout(timer.current);
  const hide = () => { cancelHide(); timer.current = setTimeout(() => setPreview(null), 120); };
  const reveal = () => {
    cancelHide();
    const cell = ref.current?.closest('.day-cell')?.getBoundingClientRect();
    if (!cell) return;
    const width = Math.min(cell.width * 1.2, window.innerWidth - 24);
    const height = Math.min(cell.height * 1.2, window.innerHeight - 24);
    const left = cell.right + width + 20 <= window.innerWidth ? cell.right + 8 : cell.left - width - 8;
    setPreview({ width, height, left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(cell.y - cell.height * .1, window.innerHeight - height - 12)) });
  };
  useEffect(() => {
    const close = () => setPreview(null);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', key);
    return () => { clearTimeout(timer.current); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); window.removeEventListener('blur', close); window.removeEventListener('keydown', key); };
  }, []);
  const open = () => { cancelHide(); setPreview(null); show(0); };
  return <div ref={ref} className={`cell-photos photo-size-small ${blur ? 'photo-blurred' : ''}`} onPointerEnter={reveal} onPointerLeave={hide}>
    <button className="cell-photo" aria-label={`${photos[0].name} 보기`} aria-describedby={preview ? id : undefined} onFocus={reveal} onBlur={() => setPreview(null)} onClick={event => { event.stopPropagation(); open(); }} onDoubleClick={event => event.stopPropagation()}>
      <img src={`photo://local/${photos[0].file}?thumb=1`} alt={photos[0].name} loading="lazy" draggable={false} />
      {photos.length > 1 && <span className="small-photo-count">{photos.length}</span>}
    </button>
    {preview && createPortal(<div id={id} role="tooltip" className={`small-photo-preview ${blur ? 'photo-blurred' : ''}`} style={preview} onPointerEnter={cancelHide} onPointerLeave={hide}>
      <button aria-label={`${photos[0].name} 크게 보기`} onClick={event => { event.stopPropagation(); open(); }}><img src={`photo://local/${photos[0].file}?thumb=1`} alt={photos[0].name} draggable={false} /></button>
      {photos.length > 1 && <span className="small-photo-count">1 / {photos.length}</span>}
    </div>, document.body)}
  </div>;
}

export function CellPhotos({ photos, size, blur, show }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tone, setTone] = useState('light');
  const files = JSON.stringify(photos.slice(0, 3).map(photo => photo.file));
  useEffect(() => {
    if (size !== 'large' || !ref.current) return;
    let revision = 0;
    const filenames: string[] = JSON.parse(files);
    const update = async () => {
      const request = ++revision;
      const boxes = Array.from(ref.current!.children).map(element => element.getBoundingClientRect());
      if (boxes.some(box => !box.width || !box.height)) return;
      try {
        const luminances = await Promise.all(boxes.map((box, index) => window.calendar.photoLuminance(filenames[index], Math.max(.05, Math.min(20, Math.round(box.width / box.height * 20) / 20)))));
        if (request !== revision) return;
        const area = boxes.reduce((sum, box) => sum + box.width * box.height, 0);
        const luminance = luminances.reduce((sum, value, index) => sum + value * boxes[index].width * boxes[index].height, 0) / area;
        // This is the crossover where black offers more contrast than white.
        setTone(luminance > .179 ? 'dark' : 'light');
      } catch { if (request === revision) setTone('light'); }
    };
    const observer = new ResizeObserver(() => { void update(); });
    observer.observe(ref.current);
    return () => { revision++; observer.disconnect(); };
  }, [files, size]);

  if (size === 'small') return <SmallPhoto photos={photos} size={size} blur={blur} show={show} />;
  return <div ref={ref} data-text-tone={tone} className={`cell-photos photo-size-${size} count-${Math.min(photos.length, 3)} ${blur ? 'photo-blurred' : ''}`}>
    {photos.slice(0, 3).map((photo, index) => <button key={photo.id} className="cell-photo" onClick={event => { event.stopPropagation(); show(index); }} onDoubleClick={event => event.stopPropagation()} aria-label={`${photo.name} 보기`}>
      <img src={`photo://local/${photo.file}?thumb=1`} alt={photo.name} loading="lazy" draggable={false} />
      {index === 2 && photos.length > 3 && <span className="more-photos">+{photos.length - 3}</span>}
    </button>)}
  </div>;
}
