import { useEffect, useMemo, useState } from 'react';
import type { Lang, TickerDivision } from './types';

interface Props {
  /** 賞名 (固定表示) */
  award: string;
  /** 賞内の部門配列。1ループ完走後に次の部門にローテーションする。 */
  divisions: TickerDivision[];
  lang?: Lang;
  /** 1部門の最低表示秒数 (人数が少ない場合のフロア) */
  minRotateSeconds?: number;
}

const DEFAULT_MIN_ROTATE = 18;

// 下部ティッカー: 「[◆ 賞 │ 部門] 名前／会社名 ...」連続スクロール。
// 1ループ完走後に部門を切替、その時点で部門ラベル + 流れる人を一斉に
// フェード/スライドアニメで切替 (key 変更で再マウント → CSS animation 再生)。
export default function Ticker({
  award,
  divisions,
  lang = 'ja',
  minRotateSeconds = DEFAULT_MIN_ROTATE,
}: Props) {
  const isJa = lang === 'ja';
  const [divIdx, setDivIdx] = useState(0);

  // 賞 (props.award) や部門数が変わったら最初の部門に戻す
  useEffect(() => {
    setDivIdx(0);
  }, [award, divisions.length]);

  const safeIdx = divIdx % Math.max(divisions.length, 1);
  const current = divisions[safeIdx] ?? null;
  const items = current?.items ?? [];

  // 1ループの長さ (= ticker-track の animation-duration)。
  // 部門が複数ある時、この秒数を経過したら次の部門へローテーション。
  const duration = Math.max(minRotateSeconds, items.length * (isJa ? 8 : 11));

  useEffect(() => {
    if (divisions.length <= 1) return;
    const t = setTimeout(
      () => setDivIdx((i) => (i + 1) % divisions.length),
      duration * 1000
    );
    return () => clearTimeout(t);
  }, [divIdx, divisions.length, duration]);

  // 内容を3回繰り返してシームレスループ
  const stream = useMemo(() => {
    const ret: ({ name: string; company: string } & { key: string })[] = [];
    for (let i = 0; i < 3; i++) {
      items.forEach((it, idx) => ret.push({ ...it, key: `${i}-${idx}` }));
    }
    return ret;
  }, [items]);

  if (!current) return null;
  // 部門切替時の再マウント用 key (animation 再生 + scroll 再起動)
  const swapKey = `${award}::${current.division}::${safeIdx}`;

  return (
    <div className="ticker">
      <div className="ticker-cat">
        <span className="ticker-cat-mark">◆</span>
        <span className="ticker-cat-award">{award}</span>
        {current.division && (
          <>
            <span className="ticker-cat-sep" />
            <span className="ticker-cat-division-wrap">
              <span key={swapKey} className="ticker-cat-division">
                {current.division}
              </span>
            </span>
          </>
        )}
      </div>
      <div className="ticker-track-wrap">
        <div
          key={swapKey}
          className="ticker-track"
          style={{ animationDuration: `${duration}s` }}
        >
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
