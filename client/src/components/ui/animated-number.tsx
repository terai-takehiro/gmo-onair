/**
 * **案件管理に残している部品** (shared に上げていない)。
 *
 * framer-motion は案件管理にしか入っていない重いパッケージで、しかも v4 は
 * hover を色・罫線だけに絞り `transform` を使わない / 画面遷移は CSS の
 * `animation: screenIn` と決めている (`docs/design/v4/_tokens.md`)。
 * **v4 が離れていく方向の部品**なので、日常業務・機材管理に framer-motion を
 * 背負わせてまで共通化しない。Phase 2 の画面作り直しで整理する。
 */
import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  locale?: string;
}

export function AnimatedNumber({
  value,
  duration = 800,
  prefix = "",
  suffix = "",
  className,
  locale = "ja-JP",
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20px" });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!isInView) return;

    const start = 0;
    const end = value;
    if (end === 0) {
      setDisplay("0");
      return;
    }

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo for snappy feel
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(current.toLocaleString(locale));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration, isInView, locale]);

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}

export function AnimatedCurrency({
  value,
  duration = 800,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={value}
      duration={duration}
      prefix="¥ "
      className={className}
    />
  );
}
