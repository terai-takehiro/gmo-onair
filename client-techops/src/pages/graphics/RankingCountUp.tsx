// テロップCG — ランキング発表の得点カウントアップ表示。
//
// 旧 `client-awards/src/cg/components/CountUp.tsx` の**そのままの移植**
// （段6-5・完全再現の対象。requestAnimationFrame ベースの自前実装 — CSSトランジションや
// ライブラリは使わない）。ease-out-quint・`Math.round` で整数化（小数第1位は四捨五入で消える
// ＝旧実装と同じで、完全再現の対象はここまで）。
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
}

export function RankingCountUp({ value, duration = 1200 }: Props) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    cancelAnimationFrame(rafRef.current);

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 5); // ease-out-quint
      setDisplay(Math.round(fromRef.current + (value - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display.toLocaleString()}</>;
}
