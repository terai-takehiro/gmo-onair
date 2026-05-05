import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang, TickerDivision } from './types';
import { TICKER_DIV_SWAP_MS } from './animation/timings';

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
// v2.8.73+: 部門切替を**シームレス クロスフェード**に変更。
// 旧: 1ループ完走時点で key 変更 → 突然新部門が padding-left:100% から登場する
//     → 流れている文字列との間に「空白の数秒」が生まれてカクツキ感
// 新: 旧部門 (outgoing) + 新部門 (incoming) を 600ms 重ねて描画
//     旧 = フェードアウト、新 = フェードイン (CSS opacity)
//     → 両者がオーバーラップしてシームレスな印象
export default function Ticker({
  award,
  divisions,
  lang = 'ja',
  minRotateSeconds = DEFAULT_MIN_ROTATE,
}: Props) {
  const isJa = lang === 'ja';
  const [divIdx, setDivIdx] = useState(0);
  // クロスフェード中の旧部門 index。null なら通常表示。
  const [outgoingIdx, setOutgoingIdx] = useState<number | null>(null);
  const swapStartedAt = useRef<number>(0);

  // 賞 (props.award) や部門数が変わったら最初の部門に戻す
  useEffect(() => {
    setDivIdx(0);
    setOutgoingIdx(null);
  }, [award, divisions.length]);

  const safeIdx = divIdx % Math.max(divisions.length, 1);
  const current = divisions[safeIdx] ?? null;
  const outgoing = outgoingIdx != null ? divisions[outgoingIdx % divisions.length] ?? null : null;
  const items = current?.items ?? [];
  const outgoingItems = outgoing?.items ?? [];

  // 1ループの長さ (= ticker-track の animation-duration)
  const duration = Math.max(minRotateSeconds, items.length * (isJa ? 8 : 11));

  useEffect(() => {
    if (divisions.length <= 1) return;
    const t = setTimeout(() => {
      // 旧 → outgoing にコピー、index を進める
      setOutgoingIdx(divIdx);
      swapStartedAt.current = Date.now();
      setDivIdx((i) => (i + 1) % divisions.length);
      // クロスフェード完了後に outgoing を消去
      const t2 = setTimeout(() => setOutgoingIdx(null), TICKER_DIV_SWAP_MS);
      return () => clearTimeout(t2);
    }, duration * 1000);
    return () => clearTimeout(t);
  }, [divIdx, divisions.length, duration]);

  // 内容を3回繰り返してシームレスループ
  const buildStream = (its: { name: string; company: string }[]) => {
    const ret: ({ name: string; company: string } & { key: string })[] = [];
    for (let i = 0; i < 3; i++) {
      its.forEach((it, idx) => ret.push({ ...it, key: `${i}-${idx}` }));
    }
    return ret;
  };
  const stream = useMemo(() => buildStream(items), [items]);
  const outgoingStream = useMemo(() => buildStream(outgoingItems), [outgoingItems]);

  if (!current) return null;
  const swapKey = `${award}::${current.division}::${safeIdx}`;
  const outgoingKey = outgoing ? `${award}::${outgoing.division}::out${outgoingIdx}` : null;

  return (
    <div className="ticker">
      <div className="ticker-cat">
        <span className="ticker-cat-mark">◆</span>
        <span className="ticker-cat-award">{award}</span>
        {current.division && (
          <>
            <span className="ticker-cat-sep" />
            <span className="ticker-cat-division-wrap">
              {/* outgoing 部門名: クロスフェードアウト */}
              {outgoing?.division && (
                <span
                  key={outgoingKey + '-label'}
                  className="ticker-cat-division ticker-cat-division-out"
                >
                  {outgoing.division}
                </span>
              )}
              {/* current 部門名: フェードイン (もとからアニメ済) */}
              <span key={swapKey + '-label'} className="ticker-cat-division">
                {current.division}
              </span>
            </span>
          </>
        )}
      </div>
      <div className="ticker-track-wrap">
        {/* outgoing track: 既存のスクロール継続 + フェードアウト */}
        {outgoingKey && (
          <div
            key={outgoingKey}
            className="ticker-track ticker-track-out"
            style={{ ['--track-dur' as string]: `${duration}s` }}
          >
            {outgoingStream.map((it) => (
              <span className="ticker-item" key={it.key}>
                <span className="ticker-name">{it.name}</span>
                <span className="ticker-sep">／</span>
                <span className="ticker-co">{it.company}</span>
                <span className="ticker-gap">●</span>
              </span>
            ))}
          </div>
        )}
        {/* current track: 通常のスクロール (新部門) */}
        <div
          key={swapKey}
          className="ticker-track ticker-track-in"
          style={{ ['--track-dur' as string]: `${duration}s` }}
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
