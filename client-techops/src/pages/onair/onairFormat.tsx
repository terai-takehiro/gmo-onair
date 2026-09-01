// OnAir 画面の数字表示まわり (mm:ss / h:mm:ss 整形と Roboto Condensed の数字表示部品)。
// OnAirPage.tsx (400 行基準の超過ファイル) から役割で切り出した。中身は移動そのままで挙動は変えていない。
import { fmtAbs } from "@/lib/time";

// ============================================================
// Helpers
// ============================================================
const safe = (n: number) => (isNaN(n) || !isFinite(n)) ? 0 : Math.floor(n);

export const mm = (s: number): string => {
  const v = safe(s);
  const a = Math.abs(v);
  const m = Math.floor(a / 60);
  return `${v < 0 ? "-" : ""}${String(m).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

export const hms = (s: number): string => {
  const sign = s < 0 ? "-" : "";
  return `${sign}${fmtAbs(Math.abs(s))}`;
};

export const oaFmt = (s: number): string => fmtAbs(s);

// Number display component (Roboto Condensed)
export function F({
  children,
  size,
  weight = 700,
  color = "#fff",
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  size: number;
  weight?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`tabular-nums ${className}`}
      style={{
        fontFamily: "'Roboto Condensed','Arial Narrow',sans-serif",
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
