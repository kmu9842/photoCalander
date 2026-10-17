import { useEffect, useState } from 'react';

export function FontSizeSpinner({ label, value, change }: { label: string; value: number | null; change(size: number): void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => { setDraft(value === null ? '' : String(value)); }, [value]);
  return <div className="font-size-spinner"><input type="number" aria-label={label} min={8} max={48} step={1} value={draft} placeholder="혼합" onChange={e => {
    setDraft(e.target.value);
    if (e.target.value !== '' && e.target.validity.valid) change(e.target.valueAsNumber);
  }} onBlur={() => setDraft(value === null ? '' : String(value))} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /><span>px</span></div>;
}
