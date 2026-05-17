import { useEffect, useState, useMemo } from 'react';
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

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const parts = useMemo<Parts | null>(
    () => (targetMs == null ? null : diffParts(targetMs, now)),
    [targetMs, now]
  );

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

// 10 面の縦シリンダーをくるくる回して数字を選ぶ立体ディスプレイ。
// 各面は rotateX(-i*36deg) translateZ(R) に配置、コンテナ全体を rotateX(value*-36deg) する。
function Digit({ value }: { value: number }) {
  const n = ((value % 10) + 10) % 10;
  return (
    <span className="oscg-digit">
      <span
        className="oscg-digit-reel"
        style={{ transform: `rotateX(${-n * 36}deg)` }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="oscg-digit-face"
            style={{ transform: `rotateX(${i * 36}deg) translateZ(var(--oscg-digit-r))` }}
          >
            {i}
          </span>
        ))}
      </span>
    </span>
  );
}
