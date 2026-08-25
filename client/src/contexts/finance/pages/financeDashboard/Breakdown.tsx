/**
 * 内訳（① 財務ダッシュボード） (v4)
 *
 * 売上／仕入（変動原価＋固定原価）／販管費 の明細を横に3列で出します。
 * 数字がどこから来たのかを**同じ画面で確かめられる**ようにするためです。
 *
 * ── 台帳へ行かないと全件見えない、を無くした ────────────────
 *
 * 以前は金額の大きい順に上位 {@link COLLAPSED} 件だけを出し、残りは
 * 「ほか N件を台帳で見る」で台帳へ送っていました。**この絞り込み条件のまま
 * 全部を見る手段がダッシュボードに無い**というご指摘を受け、折りたたみ
 * （既定は上位 {@link COLLAPSED} 件）→ 展開（読み込み済み全件をスクロール
 * で見せる）→ 必要なら「さらに読み込む」（サーバーの1ページぶんの上限
 * を超える分を追加取得）の3段に直しました。**一度に全件を DOM へ出すと
 * 重くなるページもあるため、展開してもスクロール領域に収めます**
 * （`max-h` + `overflow-y-auto`）。
 *
 * 台帳への導線（「台帳をひらく」）はそのまま残します — 編集・CSV書き出し・
 * 保存済みの絞り込みなど、ダッシュボードでは持たない機能がまだ台帳側にしかありません。
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';

/** 折りたたみ時に出す件数。**多くすると内訳ではなく一覧になる** */
const COLLAPSED = 6;

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
  title, total, items, totalCount, hasMore, isLoadingMore, onLoadMore, to, empty,
}: {
  title: string;
  total: number;
  /** ここまでに読み込み済みの明細（サーバーの1ページ上限を超えると全件ではない） */
  items: BreakdownItem[];
  /**
   * この絞り込み条件に該当する**実際の件数**（サーバー集計）。
   * `items.length` は「読み込み済みの件数」でしかないため、まだ全部を
   * 読み込んでいないときは badge に出す数として使えない。
   */
  totalCount: number;
  /** サーバー側にまだ読み込んでいない分が残っているか */
  hasMore: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** 「台帳をひらく」の行き先 */
  to: string;
  empty: string;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);
  // 折りたたみボタンを出すかどうか。読み込み済みの中に隠れている分があるか、
  // まだサーバーに残りがあるかのどちらかで判定する（どちらかだけだと出し忘れる）
  const canToggle = sorted.length > COLLAPSED || hasMore;

  return (
    <section className="rounded-card flex h-full flex-col overflow-hidden border border-border bg-card">
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3 lg:px-5">
        <h3 className="text-cardtitle">{title}</h3>
        <span className="font-number text-note text-muted-foreground">{totalCount}件</span>
        <div className="flex-1" />
        <Money value={total} className="text-list font-bold" />
      </div>

      {shown.length === 0 ? (
        <p className="text-sub border-t border-border-subtle px-4 py-3 text-muted-foreground lg:px-5">{empty}</p>
      ) : (
        <div className={expanded ? 'max-h-[420px] overflow-y-auto' : undefined}>
          {shown.map((it) => (
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
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col border-t border-border-subtle">
        {canToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sub min-h-tap flex items-center justify-center gap-1 border-b border-border-subtle font-bold text-primary hover:bg-surface-subtle"
          >
            {expanded ? '折りたたむ' : `この条件の全 ${totalCount}件をここで見る`}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        )}
        {expanded && hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="text-sub min-h-tap flex items-center justify-center gap-1.5 border-b border-border-subtle text-muted-foreground hover:bg-surface-subtle disabled:opacity-60"
          >
            {isLoadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {isLoadingMore ? '読み込み中…' : `さらに読み込む（残り ${Math.max(totalCount - items.length, 0)}件）`}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(to)}
          className="text-sub min-h-tap flex items-center justify-center gap-1 font-bold text-primary hover:bg-surface-subtle"
        >
          台帳をひらく
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
