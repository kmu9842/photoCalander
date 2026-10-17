import { useLayoutEffect, useRef, useState, type TransitionEvent } from 'react';

const DURATION = 240;
type Phase = 'closed' | 'preparing' | 'ready' | 'opening' | 'open' | 'closing' | 'collapsing';
interface Panel { date: string | null; phase: Phase; calendarWidth: number | null }

export function useEditorPanel(requestedDate: string | null) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>({ date: null, phase: 'closed', calendarWidth: null });
  const [error, setError] = useState('');
  const current = useRef(panel);
  current.current = panel;
  const expanded = useRef(false);
  const finish = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (!window.calendar) return;
    let active = true, frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelFrame: (() => void) | undefined;
    const nextFrame = () => new Promise<boolean>(resolve => {
      cancelFrame = () => resolve(false);
      frame = requestAnimationFrame(() => { frame = 0; cancelFrame = undefined; resolve(active); });
    });
    const resized = async (width: number) => {
      while (active && window.innerWidth !== width) if (!await nextFrame()) return false;
      // Allow the resized native surface to paint before exposing the new area.
      return active && await nextFrame() && await nextFrame();
    };
    const settle = (action: () => void) => {
      finish.current = () => {
        if (!active) return;
        clearTimeout(timer);
        finish.current = null;
        action();
      };
      timer = setTimeout(() => finish.current?.(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DURATION + 100);
    };
    const width = layoutRef.current?.getBoundingClientRect().width ?? Math.max(0, window.innerWidth - 20 - (expanded.current ? 312 : 0));
    const fail = (cause: unknown) => {
      if (active) { setError(String(cause)); setPanel({ date: null, phase: 'closed', calendarWidth: null }); }
    };
    const collapse = async () => {
      if (!active) return;
      setPanel({ date: null, phase: 'collapsing', calendarWidth: width });
      expanded.current = false;
      const target = await window.calendar.setEditorOpen(false);
      if (await resized(target)) setPanel({ date: null, phase: 'closed', calendarWidth: null });
    };

    setError('');
    if (requestedDate) {
      if (current.current.phase === 'open' && expanded.current) {
        setPanel(previous => ({ ...previous, date: requestedDate }));
      } else if (current.current.date && expanded.current) {
        // Reverse an unfinished close from its current position.
        setPanel({ date: requestedDate, phase: 'opening', calendarWidth: width });
        settle(() => setPanel({ date: requestedDate, phase: 'open', calendarWidth: null }));
      } else {
        setPanel({ date: null, phase: 'preparing', calendarWidth: width });
        expanded.current = true;
        void (async () => {
          const target = await window.calendar.setEditorOpen(true);
          if (!await resized(target)) return;
          setPanel({ date: requestedDate, phase: 'ready', calendarWidth: width });
          if (!await nextFrame() || !await nextFrame()) return;
          setPanel({ date: requestedDate, phase: 'opening', calendarWidth: width });
          settle(() => setPanel({ date: requestedDate, phase: 'open', calendarWidth: null }));
        })().catch(fail);
      }
    } else if (current.current.date) {
      setPanel(previous => ({ ...previous, phase: 'closing', calendarWidth: width }));
      settle(() => { void collapse().catch(fail); });
    } else if (expanded.current) {
      void collapse().catch(fail);
    } else {
      // A renderer reload must also restore the native calendar-only size.
      void window.calendar.setEditorOpen(false).catch(fail);
    }

    return () => {
      active = false;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      cancelFrame?.();
      finish.current = null;
    };
  }, [requestedDate]);

  const onTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && event.propertyName === 'width') finish.current?.();
  };
  return { ...panel, layoutRef, duration: DURATION, onTransitionEnd, error };
}
