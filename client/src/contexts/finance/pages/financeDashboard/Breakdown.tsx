/**
 * 内訳（① 財務ダッシュボード） (v4)
 *
 * 売上／仕入（変動原価＋固定原価）／販管費 の明細を横に3列で出します。
 * 数字がどこから来たのかを**同じ画面で確かめられる**ようにするためです。
 *
 * ── 上位だけ出して、残りは件数で示す ────────────────────────
 *
 * 全部並べると1画面に収まらず、内訳を見るための画面ではなくなります。
 * **金額の大きい順に上位だけ**出し、残りは「ほか N件」で台帳へ送ります。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';

/** 1列に出す件数。**多くすると内訳ではなく一覧になる** */
const TOP = 6;

export interface BreakdownItem {
  id: string;
  /** 左の小さいコード（GLS番号・話数コードなど） */
  code?: string | null;
  title: string;
  sub?: string | null;
  amount: number;
  /** 「仮」など。無ければ出さない */
  tag?: string | null;
}

export function BreakdownColumn({
  title, total, items, to, empty,
}: {
  title: string;
  total: number;
  items: BreakdownItem[];
  /** 「ほか N件」と見出しの行き先 */
  to: string;
  empty: string;
}) {
  const navigate = useNavigate();
  const sorted = [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const shown = sorted.slice(0, TOP);
  const rest = sorted.length - shown.length;

  return (
    <section className="rounded-card flex h-full flex-col overflow-hidden border border-border bg-card">
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3 lg:px-5">
        <h3 className="text-cardtitle">{title}</h3>
        <span className="font-number text-note text-muted-foreground">{sorted.length}件</span>
        <div className="flex-1" />
        <Money value={total} className="text-list font-bold" />
      </div>

      {shown.length === 0 ? (
        <p className="text-sub border-t border-border-subtle px-4 py-3 text-muted-foreground lg:px-5">{empty}</p>
      ) : (
        shown.map((it) => (
          <div key={it.id} className="flex items-start gap-2 border-t border-border-subtle px-4 py-2 lg:px-5">
            <span className="min-w-0 flex-1">
              <span className="text-sub block truncate">
                {it.code && <span className="font-number mr-1.5 text-primary">{it.code}</span>}
                {it.title}
              </span>
              {it.sub && <span className="text-note block truncate text-muted-foreground">{it.sub}</span>}
            </span>
            {it.tag && (
              <span className="rounded-badge-xs inline-flex h-[18px] shrink-0 items-center bg-warning-surface px-1.5 text-note font-bold text-warning">
                {it.tag}
              </span>
            )}
            <Money value={it.amount} className="shrink-0 text-sub" />
          </div>
        ))
      )}

      <button
        type="button"
        onClick={() => navigate(to)}
        className="text-sub min-h-tap mt-auto flex items-center justify-center gap-1 border-t border-border-subtle font-bold text-primary hover:bg-surface-subtle"
      >
        {rest > 0 ? `ほか ${rest}件を台帳で見る` : '台帳をひらく'}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </section>
  );
}
