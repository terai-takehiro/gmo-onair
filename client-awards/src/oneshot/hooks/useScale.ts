import { useEffect, useRef, useState } from 'react';

// Letterbox a fixed (designW × designH) frame inside its parent container.
// Returns ref to attach + computed scale + letterbox offset.
export function useScale(designW: number, designH: number, padding = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(
        (w - padding * 2) / designW,
        (h - padding * 2) / designH
      );
      const final = Math.max(s, 0.05);
      setScale(final);
      setOffset({
        x: Math.floor((w - designW * final) / 2),
        y: Math.floor((h - designH * final) / 2),
      });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designW, designH, padding]);

  return { ref, scale, offset };
}
