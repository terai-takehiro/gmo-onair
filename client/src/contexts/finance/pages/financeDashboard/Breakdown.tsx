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
 * （既定は上位 {@link COLLAPSED} 件）→ 展開（読み込み済み全件をこのまま見せる）
 * → 必要なら「さらに読み込む」（サーバーの1ページぶんの上限を超える分を追加取得）
 * の3段に直しました。
 *
 * ── 展開はカード自体・ページごと伸ばす（内側スクロールをやめた）─────
 *
 * 以前は展開した明細を `max-h-[420px] overflow-y-auto` で囲み、カードの中だけを
 * スクロールさせていました。**カード自体は伸びず、ページの中に小さい
 * スクロール領域が入れ子になる**形で、全件を見るには2枚のスクロールバーを
 * 行き来する必要がありました（ご指摘）。展開時はこの制限を外し、
 * 明細の高さに応じてカード自体（＝ページ）が自然に伸びるようにしています。
 * 「さらに読み込む」の動作（`useInfiniteQuery.fetchNextPage`）はそのまま。
 *
 * ── 行を押すと明細一覧（台帳）へ ──────────────────────────────
 *
 * 明細の各行は `BreakdownItem.onClick` を渡すとその場で押せる行になります。
 * **いまは3列とも「押す＝その台帳の明細一覧へ飛ぶ」**（売上→③ 売上、
 * 仕入→④ 仕入、販管費→⑤ 販管費。按分グループの行だけは案件が1つに決まらないので
 * グループの詳細へ）。どこへ飛ぶかは呼び出し側 `BudgetDashboardPage` が決めます。
 * 渡さない行は今までどおりの表示だけの行のままです。
 *
 * ── 申請ステータスと精算ページへのリンクも出す ──────────────
 *
 * 仕入・販管費の行には、台帳とまったく同じ**3値の申請ステータス**
 * （仮／確定：未申請／確定：申請済）と、申請URLが入っている行だけに
 * **精算ページを開くリンク**を出します（ご指摘「一覧でもステータスが分かり、
 * 精算ページを開くリンクボタンも欲しい」）。判定は台帳と共通の
 * `ledger/settlementState.ts` を呼ぶだけで、ここには書き写しません
 * （2か所に書くと必ず片方が古くなる。実際そうなっていた）。
 *
 * カード下の「台帳を開く」も残します。行クリックとの違いは**案件を付けるかどうか
 * だけ**（行＝その行の案件で絞り込む／フッター＝いま画面で絞り込み中の案件のまま、
 * 絞っていなければ全件）。期間はどちらも同じ `period.ts` の `ledgerOpenQuery` が
 * 組み立てるので、押す場所によって期間が変わることはありません。
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { humanizeError } from '@gmo-onair/shared/src/client/states';
import { STATE_TONE, type LedgerState } from '../ledger/types';

/** 折りたたみ時に出す件数。**多くすると内訳ではなく一覧になる** */
const COLLAPSED = 6;

export interface BreakdownItem {
  id: string;
  /** 左の小さいコード（GLS番号・話数コードなど） */
  code?: string | null;
  title: string;
  sub?: string | null;
  amount: number;
  /**
   * 申請ステータス（仮／確定：未申請／確定：申請済）。**台帳とまったく同じ
   * `LedgerState` を受ける**ので、色（tone）も文言も台帳と自動でそろう。
   *
   * ⚠️ **旧 `tag?: string`（「仮」の2値だけの文字列）の置き換え。** 文字列1つでは
   * tone を持てず、「確定：未申請」と「確定：申請済」を出し分けられなかった
   * （ご指摘「一覧でもステータスが分かるようにしてほしい」）。
   */
  badge?: Pick<LedgerState, 'label' | 'tone' | 'title'> | null;
  /**
   * 精算（申請）ページ。**仕入・販管費だけが持つ**（売上には申請という概念が無い）。
   * 外部サイトなので新しいタブで開く。**入っている行にだけ出す**（台帳と同じ流儀）
   */
  settlementUrl?: string | null;
  /**
   * 行を押したときの動作（いまはどれも「その台帳の明細一覧へ移動」）。
   * **渡した行だけ押せる行になる。** 渡さなければ表示だけの行のまま
   * （押しても何も起きない、ではなく そもそも押せる見た目にしない）。
   */
  onClick?: () => void;
}

/**
 * 内訳の1行。
 *
 * ⚠️ **外枠は必ず `<div>`。** 以前は `onClick` を持つ行を丸ごと `<button>` に
 * していたが、精算ページへの `<a>` を足すと `<button>` の中に `<a>` が入り
 * **不正な DOM ネスト**になる（ブラウザが `<a>` を `<button>` の外へ吐き出すことが
 * ある）。押せるのは件名の部分だけにし、リンクと金額はその外に並べる。
 * 行全体の hover は `has-[button:hover]` で外枠に付け直しているので、
 * 見た目は今までどおり「行ごと反応する」ままにしてある。
 */
function BreakdownRow({ it }: { it: BreakdownItem }) {
  const body = (
    <>
      <span className="text-sub block truncate">
        {it.code && <span className="font-number mr-1.5 text-primary">{it.code}</span>}
        {it.title}
      </span>
      {(it.badge || it.sub) && (
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          {/*
            * ⚠️ **バッジは件名の「下」に置く。** 内訳は lg で3枚並ぶ（1枚 ~360px）ので、
            * 件名と同じ行の右へ置くと金額（約90px）と挟んで件名が数文字まで潰れる。
            * 台帳（`LedgerRows`）が狭い画面で状態を下の行へ落としているのと同じ考え方。
            */}
          {it.badge && (
            <span className="shrink-0">
              <TableBadge
                label={it.badge.label}
                w={null}
                className={STATE_TONE[it.badge.tone]}
                title={it.badge.title}
              />
            </span>
          )}
          {it.sub && <span className="text-note truncate text-muted-foreground">{it.sub}</span>}
        </span>
      )}
    </>
  );

  return (
    <div
      className={`flex w-full items-start gap-2 border-t border-border-subtle px-4 py-2 lg:px-5 ${
        it.onClick ? 'has-[button:hover]:bg-surface-subtle' : ''
      }`}
    >
      {/* ⚠️ **`onClick` が無い行は `<div>` のまま。** 押せない行を `<button>` にすると、
          押せる見た目（hover・タップ領域）だけが付いて「押しても何も起きない」になる */}
      {it.onClick ? (
        <button type="button" onClick={it.onClick} className="min-h-tap min-w-0 flex-1 text-left">
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {it.settlementUrl && (
        <a
          href={it.settlementUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="精算ページを開く"
          aria-label="精算ページを開く"
          className="v4-tap shrink-0 text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )}
      <Money value={it.amount} className="shrink-0 text-sub" />
    </div>
  );
}

export function BreakdownColumn({
  title, total, items, totalCount, hasMore, isLoadingMore, onLoadMore, to, empty,
  error, partialLabel, onRetry,
}: {
  title: string;
  total: number;
  /** ここまでに読み込み済みの明細（サーバーの1ページ上限を超えると全件ではない） */
  items: BreakdownItem[];
  /**
   * この絞り込み条件に該当する**実際の件数**（サーバー集計）。
   * `items.length` は「読み込み済みの件数」でしかないため、まだ全部を
   * 読み込んでいないときは badge に出す数として使えない。
   *
   * ⚠️ **数えられなかったときは `null`。** 読み込みに失敗したのに `0` を渡すと、
   * 画面が**「0件」と言い切ってしまう**（＝失敗を「無かった」と嘘をつく）。
   */
  totalCount: number | null;
  /** サーバー側にまだ読み込んでいない分が残っているか */
  hasMore: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** 「台帳を開く」の行き先 */
  to: string;
  empty: string;
  /**
   * この列の明細が読めなかったときの例外。
   * ⚠️ **渡さないと「0件」と見分けが付かない。** 内訳が 504 で落ちても
   * 「この期間の確定売上はありません。」としか出ず、**失敗が嘘の 0 件になる**。
   */
  error?: unknown;
  /** 一部だけ落ちたときに、欠けているものの名前（例: 「固定原価」）。行は出しつつ断る */
  partialLabel?: string;
  /** この列だけ読み直す */
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);
  // 折りたたみボタンを出すかどうか。読み込み済みの中に隠れている分があるか、
  // まだサーバーに残りがあるかのどちらかで判定する（どちらかだけだと出し忘れる）
  // ⚠️ **数が分かっていないときは出さない**（「全 N 件をここで見る」の N が書けない）
  const canToggle = totalCount !== null && !error && (sorted.length > COLLAPSED || hasMore);
  /** 明細が1件も無く、かつ失敗している＝「0件」ではなく「読めなかった」 */
  const failedEmpty = !!error && shown.length === 0;

  return (
    <section className="rounded-card flex h-full flex-col overflow-hidden border border-border bg-card">
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3 lg:px-5">
        <h3 className="text-cardtitle">{title}</h3>
        {/* ⚠️ 数えられていないときに「0件」と言わない */}
        <span className="font-number text-note text-muted-foreground">
          {totalCount === null ? '—件' : `${totalCount}件`}
        </span>
        <div className="flex-1" />
        <Money value={total} className="text-list font-bold" />
      </div>

      {failedEmpty ? (
        /*
         * ⚠️ **列ごと `ErrorPanel` に差し替えない。** 合計（見出しの金額）は
         * `monthly-summary` が出しており**成功している**ので、差し替えると
         * 正しい数字まで消える。文言の決めごとは `humanizeError()` を直接呼んで守る。
         * ⚠️ `role="status"`（`alert` ではない）— 3列同時に落ちると読み上げが3連発で
         * 割り込む。全面の `ErrorPanel` が既に `alert` を持っている。
         */
        <div role="status" className="border-t border-border-subtle bg-destructive-surface px-4 py-3 lg:px-5">
          <p className="text-sub flex items-start gap-2 text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              内訳を読み込めませんでした。
              <span className="text-note mt-0.5 block text-muted-foreground">
                {humanizeError(error).cause}
                {humanizeError(error).next}
              </span>
            </span>
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-control text-list min-h-tap mt-2 border border-border bg-card px-3 lg:h-9 lg:min-h-0"
            >
              この内訳をもう一度読み込む
            </button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sub border-t border-border-subtle px-4 py-3 text-muted-foreground lg:px-5">{empty}</p>
      ) : (
        <div>
          {/*
            * ⚠️ **一部だけ落ちたときに黙らない。** 仕入の列は変動原価と固定原価の
            * 2本を合成しているので、片方だけ落ちると**金額が小さいだけの一覧**に見える。
            */}
          {!!error && (
            <div role="status" className="text-note flex flex-wrap items-center gap-2 border-t border-border-subtle bg-destructive-surface px-4 py-2 text-foreground lg:px-5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
              <span>{partialLabel ? `${partialLabel}を読み込めませんでした。` : '一部を読み込めませんでした。'}下の一覧はそれを除いた分です。</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="font-bold text-primary underline">
                  もう一度読み込む
                </button>
              )}
            </div>
          )}
          {shown.map((it) => <BreakdownRow key={it.id} it={it} />)}
        </div>
      )}

      <div className="mt-auto flex flex-col border-t border-border-subtle">
        {canToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sub min-h-tap flex items-center justify-center gap-1 border-b border-border-subtle font-bold text-primary hover:bg-surface-subtle"
          >
            {expanded ? '折りたたむ' : `この条件の全 ${totalCount ?? 0}件をここで見る`}
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
            {isLoadingMore ? '読み込み中…' : `さらに読み込む（残り ${Math.max((totalCount ?? 0) - items.length, 0)}件）`}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(to)}
          className="text-sub min-h-tap flex items-center justify-center gap-1 font-bold text-primary hover:bg-surface-subtle"
        >
          台帳を開く
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
