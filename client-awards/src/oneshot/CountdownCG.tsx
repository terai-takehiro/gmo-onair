import { useEffect, useState, useMemo, useRef } from 'react';
import { getServerNow } from '@/lib/serverClock';
import type { Lang } from './types';

interface Props {
  targetIso: string | null;
  prefix: string;
  /** 中央アンカーの位置 (%) */
  x: number;
  y: number;
  /** 倍率 (1.0 が基準) */
  scale: number;
  lang: Lang;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function diffParts(targetMs: number, nowMs: number): Parts {
  const diff = Math.max(0, targetMs - nowMs);
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds, done: diff === 0 };
}

export default function CountdownCG({ targetIso, prefix, x, y, scale, lang }: Props) {
  const targetMs = useMemo(() => {
    if (!targetIso) return null;
    const t = new Date(targetIso).getTime();
    return isNaN(t) ? null : t;
  }, [targetIso]);

  // v2.9.43: サーバー時刻基準で動かす (operator PC ⇄ vMix の時計ずれを吸収)。
  // serverClock.ts が socket sync の timestamp から offset を更新するため、
  // 全クライアントで同期した残時間が表示される。
  const [now, setNow] = useState(() => getServerNow());
  useEffect(() => {
    const id = setInterval(() => setNow(getServerNow()), 250);
    return () => clearInterval(id);
  }, []);

  const parts = useMemo<Parts | null>(
    () => (targetMs == null ? null : diffParts(targetMs, now)),
    [targetMs, now]
  );

  // v2.8.125: 00:00 到達後 600ms (= "00:00" を見せる時間) 経過したらカットアウト (フェードなし)。
  const done = !!parts?.done;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!done) {
      setHidden(false);
      return;
    }
    const id = window.setTimeout(() => setHidden(true), 600);
    return () => window.clearTimeout(id);
  }, [done]);

  if (hidden) return null;

  const showDays = !!parts && parts.days > 0;
  const showHours = !!parts && (parts.hours > 0 || showDays);
  const dayLabel = lang === 'en' ? 'd' : '日';
  const sep = ':';

  return (
    <div
      className="oscg-countdown"
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      <div className="oscg-countdown-prefix">{prefix}</div>
      <div className="oscg-countdown-time">
        {showDays && parts && (
          <>
            <DigitGroup value={parts.days} digits={parts.days >= 100 ? 3 : 2} />
            <span className="oscg-countdown-unit">{dayLabel}</span>
          </>
        )}
        {showHours && parts && (
          <>
            <DigitGroup value={parts.hours} digits={2} />
            <span className="oscg-countdown-sep">{sep}</span>
          </>
        )}
        <DigitGroup value={parts ? parts.minutes : 0} digits={2} />
        <span className="oscg-countdown-sep">{sep}</span>
        <DigitGroup value={parts ? parts.seconds : 0} digits={2} />
      </div>
    </div>
  );
}

function DigitGroup({ value, digits }: { value: number; digits: number }) {
  const str = String(Math.max(0, Math.floor(value))).padStart(digits, '0');
  return (
    <span className="oscg-countdown-group">
      {str.split('').map((d, i) => (
        <Digit key={i} value={parseInt(d, 10)} />
      ))}
    </span>
  );
}

interface Slide {
  /** 安定したアニメーションキー (React の key にも使用) */
  id: number;
  digit: number;
}

// v2.8.125: スロットマシン式の縦スライド。
//  - 旧桁: 現在位置 → 上 (-100%) へ抜ける + opacity フェード
//  - 新桁: 下 (+100%) → 現在位置へ滑り込む
// 3D シリンダー方式 (~v2.8.124) は静止時/動作時とも違和感があったため撤回。
function Digit({ value }: { value: number }) {
  const n = ((value % 10) + 10) % 10;
  const idRef = useRef(0);
  const [slides, setSlides] = useState<Slide[]>(() => [{ id: 0, digit: n }]);

  useEffect(() => {
    setSlides((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.digit === n) return prev;
      idRef.current += 1;
      return [...prev, { id: idRef.current, digit: n }];
    });
  }, [n]);

  // 旧スライドはアニメ完走後に unmount
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setTimeout(() => {
      setSlides((prev) => prev.slice(-1));
    }, 520);
    return () => window.clearTimeout(id);
  }, [slides]);

  return (
    <span className="oscg-digit">
      {slides.map((s, i) => {
        const isLeaving = i < slides.length - 1;
        return (
          <span
            key={s.id}
            className={'oscg-digit-face' + (isLeaving ? ' is-leaving' : ' is-entering')}
          >
            {s.digit}
          </span>
        );
      })}
    </span>
  );
}
