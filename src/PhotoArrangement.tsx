import { useEffect, useRef, useState } from 'react';
import { FRAME_NAMES, PhotoFrameImage } from './PhotoFrame';
import { clamp, photoBox, placementFor } from './photo-layout';
import type { DayEntry, Photo, PhotoFrame, PhotoPlacement } from './types';

export function PhotoArrangement({ date, entry, defaultFrame, update }: { date: string; entry: DayEntry; defaultFrame: PhotoFrame; update: (updater: (day: DayEntry) => DayEntry) => void }) {
  const [selected, setSelected] = useState(entry.photos[0]?.id);
  const photo = entry.photos.find(p => p.id === selected) ?? entry.photos[0];
  const index = entry.photos.indexOf(photo);
  const size = entry.photoSize ?? 'medium';
  const [draft, setDraft] = useState<PhotoPlacement | null>(null);
  const draftRef = useRef<PhotoPlacement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 240, height: 180 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number; position: PhotoPlacement; travelX: number; travelY: number } | null>(null);
  useEffect(() => { setDraft(null); draftRef.current = null; }, [photo?.id, size]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setDimensions({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  if (!photo) return null;
  const frame = photo.frame ?? defaultFrame;
  const position = draft ?? placementFor(photo, size, index, frame);
  const setPosition = (value: PhotoPlacement) => { draftRef.current = value; setDraft(value); };
  const patch = (value: Partial<Photo>) => update(day => ({ ...day, photos: day.photos.map(p => p.id === photo.id ? { ...p, ...value } : p) }));
  const commit = () => { if (draftRef.current) { patch({ placement: draftRef.current }); draftRef.current = null; setDraft(null); } };
  const photos = entry.photos.map(p => p.id === photo.id && draft ? { ...p, placement: draft } : p);
  const visible = size === 'large' || size === 'small' ? [photos.find(p => p.id === photo.id)!] : photos;
  return <section className="photo-arrangement" aria-label="사진 프레임과 배치">
    <label className="photo-layout-field">편집할 사진<select aria-label="편집할 사진" value={photo.id} onChange={e => { commit(); setSelected(e.target.value); }}>{entry.photos.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.name}</option>)}</select></label>
    <div className="frame-choices" role="group" aria-label="사진 프레임">{Object.entries(FRAME_NAMES).map(([value, label]) => <button key={value} aria-pressed={frame === value} onClick={() => patch({ frame: value as PhotoFrame })}><PhotoFrameImage src={`photo://local/${photo.file}?thumb=1`} alt="" frame={value as PhotoFrame} /><span>{label}</span></button>)}</div>
    <button className="frame-follow-theme" onClick={() => patch({ frame: undefined })} disabled={photo.frame === undefined}>테마의 기본 틀 따르기</button>
    <div className="photo-placement-preview" ref={stage} aria-label="사진 위치 미리보기" style={{ aspectRatio: (() => { const cell = document.querySelector(`[data-date="${date}"]`); const box = cell?.getBoundingClientRect(); return box ? `${box.width} / ${box.height}` : '4 / 3'; })() }}>
      <span className="placement-date">{Number(date.slice(-2))}</span>
      {visible.map(p => {
        const pIndex = entry.photos.findIndex(item => item.id === p.id), box = photoBox(p, size, dimensions.width, dimensions.height, pIndex, defaultFrame);
        const isSelected = p.id === photo.id;
        const pos = placementFor(p, size, pIndex, p.frame ?? defaultFrame);
        return <button key={p.id} className={`placement-photo ${isSelected ? 'selected' : ''}`} aria-label={`${p.name} 위치 조절`} style={{ left: box.left, top: box.top, width: box.width, height: box.height, transform: `rotate(${box.rotation}deg)` }} onClick={() => setSelected(p.id)}
          onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); setSelected(p.id); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, position: pos, travelX: size === 'large' ? dimensions.width : box.travelX, travelY: size === 'large' ? dimensions.height : box.travelY }; }}
          onPointerMove={e => { const active = drag.current; if (!active || !e.currentTarget.hasPointerCapture(e.pointerId)) return; setPosition({ ...active.position, x: clamp(active.position.x + (e.clientX - active.startX) / Math.max(1, active.travelX) * 100), y: clamp(active.position.y + (e.clientY - active.startY) / Math.max(1, active.travelY) * 100) }); }}
          onPointerUp={e => { if (!drag.current) return; commit(); drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
          onPointerCancel={() => { drag.current = null; setDraft(null); draftRef.current = null; }} onLostPointerCapture={() => { if (drag.current) { commit(); drag.current = null; } }}>
          <PhotoFrameImage src={`photo://local/${p.file}?thumb=1`} alt={p.name} frame={p.frame ?? defaultFrame} position={size === 'large' ? `${pos.x}% ${pos.y}%` : undefined} fit={size !== 'large' && (p.frame ?? defaultFrame) === 'none' ? 'contain' : 'cover'} />
        </button>;
      })}
      <span className="placement-note">{entry.text.slice(0, 90) || '사진을 끌어 위치를 조절하세요'}</span>
    </div>
    <p className="placement-hint">{size === 'large' ? '대: 칸을 채운 상태에서 사진 중심을 옮깁니다.' : '미리보기의 사진을 끌거나 아래 값을 조절하세요.'}{size === 'small' && ' 달력에는 첫 번째 사진이 표시됩니다.'}</p>
    {([['x', '가로 위치', 0, 100], ['y', '세로 위치', 0, 100], ['rotation', '기울기', -30, 30]] as const).map(([key, label, min, max]) => <label className="photo-layout-field" key={key}>{label}<input aria-label={`사진 ${label}`} type="range" min={min} max={max} step={1} disabled={key === 'rotation' && size === 'large'} value={key === 'rotation' && size === 'large' ? 0 : position[key]} onChange={e => setPosition({ ...position, [key]: +e.target.value })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /><output>{Math.round(key === 'rotation' && size === 'large' ? 0 : position[key])}{key === 'rotation' ? '°' : '%'}</output></label>)}
    <div className="placement-actions"><button onClick={() => { draftRef.current = null; setDraft(null); patch({ placement: undefined }); }}>기본 위치</button>{index > 0 && <button onClick={() => update(day => ({ ...day, photos: [photo, ...day.photos.filter(p => p.id !== photo.id)] }))}>첫 번째 사진으로</button>}</div>
  </section>;
}
