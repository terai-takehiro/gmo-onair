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
      // overflow:hidden は横長文の溢れ防止用。inline-block のベースライン配置で
      // 文字の下端 (CJK の下画線) が縦に切られないよう、上下に僅かな余白を設ける。
      style={{ ...style, overflow: 'hidden', display: 'block', paddingTop: '0.04em', paddingBottom: '0.14em' }}
    >
      <div
        ref={innerRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          verticalAlign: 'top',
          transformOrigin: 'left center',
          transform: scale < 1 ? `scaleX(${scale})` : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 複数行 (既定 2 行) に折り返したうえで、それでも収まらない長文は
 * transform: scaleX で水平圧縮 (長体) して指定行数に収める。
 * 「2 行 + 長体」用。単純な line-clamp だと「…」で切れてしまうのを避ける。
 *
 * 仕組み: 内側要素の width を W/scaleX に広げて行数を減らし (= 1 行あたりの文字数を増やす)、
 *         transform: scaleX(scaleX) で見た目を W に戻す。これで N 行に収まる最大の scaleX を採用。
 */
export function CondenseMultiline({
  children,
  style,
  min = 0.5,
  maxLines = 2,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  min?: number;
  maxLines?: number;
  align?: 'left' | 'center';
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const w = wrapperRef.current;
    const i = innerRef.current;
    if (!w || !i) return;
    const origin = align === 'center' ? 'center top' : 'left top';
    const calc = () => {
      const W = w.clientWidth;
      if (!W) return;
      // リセットして自然な行数を測る
      i.style.transform = 'none';
      i.style.width = W + 'px';
      const cs = getComputedStyle(i);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || 0;
      const maxH = lh > 0 ? lh * maxLines + 1 : 1e9;
      // 高さ上限を指定行数にクランプ (どうしても収まらない場合の保険)。
      // 下端の画線が切れないよう僅かに余裕を持たせる。
      w.style.maxHeight = lh > 0 ? `${lh * maxLines + Math.round(lh * 0.16)}px` : '';
      if (i.scrollHeight <= maxH) { i.style.transform = 'none'; return; }
      // 収まる最大 scaleX を線形探索 (幅を 1/scale に広げて行数を減らす)
      let s = min;
      for (let t = 0.95; t >= min; t -= 0.05) {
        i.style.width = `${W / t}px`;
        if (i.scrollHeight <= maxH) { s = t; break; }
        s = t;
      }
      i.style.width = `${W / s}px`;
      i.style.transformOrigin = origin;
      i.style.transform = `scaleX(${s})`;
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(w);
    return () => ro.disconnect();
  }, [children, min, maxLines, align]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ ...style, overflow: 'hidden', display: 'block', textAlign: align }}
    >
      <div
        ref={innerRef}
        style={{
          transformOrigin: align === 'center' ? 'center top' : 'left top',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </div>
    </div>
  );
}
