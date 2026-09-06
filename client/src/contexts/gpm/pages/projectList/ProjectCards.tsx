/**
 * ② プロジェクト一覧 — スマホのカード
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行は 7 列（プロジェクト／状態／いまの工程／進み具合／見積／次にやること／
 * 未確認）です。375px では `stackOnMobile` が縦積みにしたうえで、**いまの工程・
 * 進み具合・見積・次にやることを `hideOnMobile` で消して**いました。つまり
 * スマホでは「名前・状態・未確認件数」しか読めず、**どこまで進んでいて次に
 * 何をすればいいか**が分かりません（スマホ最適化の洗い出し 2026-08-20・②）。
 *
 * 案件一覧（`sales/pages/projectList/ProjectCards.tsx`）と同じ考え方で、
 * 列を消すのではなく**カードとして組み直します**:
 *
 *   1行目  状態バッジ ＋ 区分バッジ（右に未確認件数。0件は出さない）
 *   2行目  プロジェクト名（折り返してよい）
 *   3行目  依頼元・PM会社・担当
 *   4行目  いまの工程 ＋ 進み具合（帯。`ProjectRows.tsx` の `ProgressBar` と同じ部品）
 *   5行目  見積（束ごとに最新版・値引きを引いた税抜。まだ無ければ「見積なし」）
 *   6行目  次にやること（期限つき）。無ければ出さない
 *
 * ── 進み具合の帯は PC と同じ部品を使う ──────────────────────
 *
 * `ProgressBar` を書き写すと、工程が1つも無いときの表示（「工程なし」）や
 * `%` の出し方が PC とスマホで食い違う。**1つの部品を両方から呼ぶ**。
 */
import { AlertCircle, ChevronRight } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  ESTIMATE_STATUS_LABEL, KIND_LABEL, dueLabel, dueTone, ymd,
  type GpmProjectRow,
} from '../../types';
import {
  STAGE_BADGE_LABEL, STAGE_BADGE_TONE, TERMINAL_STAGES,
} from '@/contexts/sales/pages/projectList/stages';
// 健全性バッジは案件一覧と同じ部品（理由は `ProjectRows.tsx` の import に）
import { HealthBadge } from '@/contexts/sales/pages/projectList/health';
import { ProgressBar } from './ProjectRows';

export function GpmProjectCards({
  rows, today, onOpen,
}: {
  rows: GpmProjectRow[];
  today: string;
  onOpen: (id: string) => void;
}) {
  return (
    // 読み込みの枠から中身に入れ替わる瞬間（モックの `cardIn`。案件一覧のカードと同じ）
    <ul className="v4-card-in flex flex-col gap-2">
      {rows.map((p) => {
        const due = ymd(p.next_due);
        const dueText = dueLabel(due, today);
        const pmLine = [
          p.customer_name,
          p.pm_company ? `PM会社 ${p.pm_company}` : '自社PM',
          p.assigned_to_name ? `担当 ${p.assigned_to_name}` : null,
        ].filter(Boolean).join(' ・ ');
        const terminal = TERMINAL_STAGES.includes(p.stage);

        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className={cn(
                'rounded-card flex w-full items-start gap-2.5 border border-border bg-card p-3.5 text-left',
                terminal && 'opacity-70',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <TableBadge label={STAGE_BADGE_LABEL[p.stage]} w={null} className={STAGE_BADGE_TONE[p.stage]} />
                    <span className="text-badge shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {p.gpm_kind ? KIND_LABEL[p.gpm_kind] : '区分なし'}
                    </span>
                    <HealthBadge p={p} />
                  </span>
                  {p.open_items > 0 && (
                    <span className="text-badge inline-flex shrink-0 items-center gap-0.5 text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      持ち帰り {p.open_items}
                    </span>
                  )}
                </span>

                {/* **プロジェクト名は折り返す。** truncate すると似た名前を見分けられない */}
                <span className="text-list block [overflow-wrap:anywhere]">{p.name}</span>
                <span className="text-note mt-0.5 block truncate text-muted-foreground">
                  {pmLine || '依頼元 未設定'}
                </span>

                {/* いまの工程 ＋ 進み具合。PC の2列ぶんを1つの塊にまとめる */}
                <span className="mt-2 block border-t border-border-faint pt-2">
                  {p.current_phase && (
                    <span className="text-note mb-1 block truncate text-muted-foreground">{p.current_phase}</span>
                  )}
                  <ProgressBar done={p.phase_done} count={p.phase_count} />
                </span>

                <span className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-note text-muted-foreground">見積</span>
                  {p.estimate_amount === null || p.estimate_amount === undefined ? (
                    <span className="text-note text-muted-foreground">見積なし</span>
                  ) : (
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="text-note min-w-0 truncate text-muted-foreground">
                        {[
                          p.estimate_version ? `v${p.estimate_version}` : null,
                          p.estimate_status ? ESTIMATE_STATUS_LABEL[p.estimate_status] : null,
                        ].filter(Boolean).join(' ')}
                      </span>
                      <Money value={p.estimate_amount} className="shrink-0 text-list" />
                    </span>
                  )}
                </span>

                {p.next_task && (
                  <span className="mt-2 block border-t border-border-faint pt-2">
                    <span className="text-note block truncate font-bold">{p.next_task}</span>
                    {dueText && (
                      <span className={cn('text-note font-number', dueTone(due, today))}>{dueText}</span>
                    )}
                  </span>
                )}
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
