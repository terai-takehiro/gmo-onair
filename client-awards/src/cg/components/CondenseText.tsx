import { useLayoutEffect, useRef, useState } from 'react';

/**
 * 親要素の幅にテキストを収めるため、はみ出した場合だけ
 * transform: scaleX で水平方向に圧縮 (長体) する。
 * 親の幅は CSS で固定する想定。最小スケールは min (デフォルト 0.5)。
 */
export function CondenseText({
  children,
  style,
  min = 0.5,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  min?: number;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const w = wrapperRef.current;
    const i = innerRef.current;
    if (!w || !i) return;
    const calc = () => {
      const containerW = w.clientWidth;
      // 一旦 scale を 1 に戻して実寸を測る
      i.style.transform = 'none';
      const textW = i.scrollWidth;
      const next = textW > containerW ? Math.max(min, containerW / textW) : 1;
      setScale(next);
      i.style.transform = next < 1 ? `scaleX(${next})` : 'none';
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(w);
    return () => ro.disconnect();
  }, [children, min]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ ...style, overflow: 'hidden', display: 'block' }}
    >
      <div
        ref={innerRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          transformOrigin: 'left center',
          transform: scale < 1 ? `scaleX(${scale})` : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
