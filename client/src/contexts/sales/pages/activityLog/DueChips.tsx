/**
 * 期限の区分のチップ（案件別の上段）— やること件数と案件数を**両方**、単位つきで出す
 * (v4・PR #727 の宿題①)
 *
 * ── なぜ共通の `FilterChips` をそのまま使わないか ────────────
 *
 * `FilterChips`（`shared/src/client/ui/filterChips.tsx`）は数字を**1つだけ**、
 * 単位なしで出す作りです。PR #727 ではそこに「案件の数」を入れていたため、
 * 「期限超過 8」の 8 が**案件数なのかやることの数なのか画面から分かりません**でした
 * （チップの名前はやることの区分なので、利用者はやることの数と読みます）。
 *
 * ここでは
 *   ・大きい数字 … 未完了の次のアクションの件数（`summary.actions`）＋「件」
 *   ・小さい数字 … その区分のやることを持つ案件の数（`summary.projects`）＋「案件」
 * と**単位を必ず付けて**並べ、読み上げ・`title` にも同じ文を入れます。
 *
 * 見た目（1つの枠にセグメントで並べる・選んだものは `--primary-surface`・
 * 高さ `min-h-tap`・入りきらないときは枠の中だけ横スクロール）は
 * `FilterChips` の決めごとをそのまま写しています。**`FilterChips` の見た目を
 * 変えるときはここも合わせる**こと（共通部品に「副の数字」を足せるようになったら
 * こちらは畳めます — 申し送り済み）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { DUE_FILTERS, DUE_LABEL, type DueFilter } from './dueState';
import type { ByProjectSummary } from './byProject';

/**
 * 1つのチップの読み上げ文。**画面に出す数字と同じ文を作る**（2か所で組み立てない）。
 * 数えられていないとき（`summary` が来ていない）は区分の名前だけ。
 */
export function dueChipLabel(key: DueFilter, summary: ByProjectSummary | undefined): string {
  const name = DUE_LABEL[key];
  if (!summary) return name;
  return `${name}：次のアクション${summary.actions[key] ?? 0}件（${summary.projects[key] ?? 0}案件）`;
}

export function DueChips({
  value, onChange, summary, className,
}: {
  value: DueFilter;
  onChange: (key: DueFilter) => void;
  /** `undefined` は「まだ数えていない／古いサーバー」＝数字を出さない（0 と嘘をつかない） */
  summary: ByProjectSummary | undefined;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="期限で絞り込む"
      className={cn(
        'inline-flex w-fit max-w-full shrink-0 overflow-x-auto rounded-control border border-border bg-card',
        className,
      )}
    >
      {DUE_FILTERS.map((k, i) => {
        const active = k === value;
        const text = dueChipLabel(k, summary);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={active}
            aria-label={text}
            title={text}
            onClick={() => onChange(k)}
            className={cn(
              'min-h-tap inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-3.5 py-2 text-sub lg:min-h-[36px]',
              i > 0 && 'border-l border-border',
              active ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {DUE_LABEL[k]}
            {summary && (
              <>
                {/* 主の数字＝やることの件数。単位「件」を必ず添える */}
                <span className="font-number">
                  {summary.actions[k] ?? 0}
                  <span className="text-sub-sm">件</span>
                </span>
                {/* 副の数字＝案件の数。押した先に並ぶまとまりの数なので、小さく残す */}
                <span className="font-number text-sub-sm font-normal text-muted-foreground">
                  {summary.projects[k] ?? 0}案件
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
