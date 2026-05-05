import { useMemo } from 'react';
import type { Lang, TickerItem } from './types';

interface Props {
  category: string;
  items: TickerItem[];
  lang?: Lang;
}

// 下部ティッカー: 「[部門] 名前／会社名 名前／会社名 ...」連続スクロール
export default function Ticker({ category, items, lang = 'ja' }: Props) {
  const isJa = lang === 'ja';

  // 内容を3回繰り返してシームレスループ
  const stream = useMemo(() => {
    const ret: (TickerItem & { key: string })[] = [];
    for (let i = 0; i < 3; i++) {
      items.forEach((it, idx) => ret.push({ ...it, key: `${i}-${idx}` }));
    }
    return ret;
  }, [items]);

  // 1サイクルあたりの幅 (固定計算は難しいのでanimation-durationで調整)
  const duration = Math.max(20, items.length * (isJa ? 8 : 11));

  return (
    <div className="ticker">
      <div className="ticker-cat">
        <span className="ticker-cat-mark">◆</span>
        <span className="ticker-cat-label">{category}</span>
      </div>
      <div className="ticker-track-wrap">
        <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
          {stream.map((it) => (
            <span className="ticker-item" key={it.key}>
              <span className="ticker-name">{it.name}</span>
              <span className="ticker-sep">／</span>
              <span className="ticker-co">{it.company}</span>
              <span className="ticker-gap">●</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
