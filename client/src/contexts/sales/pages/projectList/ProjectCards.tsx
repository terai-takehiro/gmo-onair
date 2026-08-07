/**
 * ③ 案件一覧 — スマホのカード（モックの端末枠 3枚目）
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行は 6 列（案件／ステージ／実施日／金額／次のタスク／最後の動き）で、
 * 375px では `stackOnMobile` が縦積みにしたうえで**実施日・次のタスク・
 * 最後の動きを消して**いました。つまりスマホでは「名前・ステージ・金額」しか
 * 読めず、**次に何をするかが分からない**状態です。
 *
 * モックのカードはそこが逆で、**金額と次の一手を見せます**。
 * だから列を消すのではなく、**カードとして組み直します**:
 *
 *   1行目  案件名（折り返してよい）＋ ステージ
 *   2行目  お客様 ・ GLS番号
 *   3行目  実施日 ／ 金額（右）
 *   4行目  次のタスク（担当・期限つき）。無ければ出さない
 *
 * ── 「止まっている」は出す ──────────────────────────────────
 *
 * PC と同じ判定（`isStale`）を使います。**判定を書き写さない** —
 * 片方だけ日数を変えたときに、PC とスマホで違う案件が赤くなります。
 */
import { Sparkles, ChevronRight } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE, TERMINAL_STAGES, isStale } from './stages';
import type { ProjectListRow } from './types';

function dueTone(due: string | null, today: string): string {
  if (!due) return 'text-muted-foreground';
  if (due < today) return 'text-destructive';
  if (due === today) return 'text-warning';
  return 'text-muted-foreground';
}

function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const short = due.slice(5).replace('-', '/');
  if (due < today) return `${short} 超過`;
  if (due === today) return `${short} 今日`;
  return short;
}

export function ProjectCards({
  rows, today, onOpen,
}: {
  rows: ProjectListRow[];
  today: string;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((p) => {
        const revenue = Number(p.total_revenue) || 0;
        const expected = Number(p.expected_amount) || 0;
        // 確定売上が無ければ想定金額を**薄く**出す（PC と同じ扱い。
        // 色で区別できないと確定と想定を足し算してしまう）
        const amount = revenue > 0 ? revenue : expected > 0 ? expected : null;
        const isExpected = revenue === 0 && expected > 0;
        const terminal = TERMINAL_STAGES.includes(p.stage);
        const stale = isStale(p.stage, p.last_activity_at);
        const due = dueLabel(p.next_task_due, today);

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
                <span className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded-badge border px-1.5 py-0.5 text-badge', STAGE_BADGE_TONE[p.stage])}>
                    {STAGE_BADGE_LABEL[p.stage] ?? p.stage}
                  </span>
                  {stale && (
                    <span className="rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 text-badge text-destructive">
                      止まっている
                    </span>
                  )}
                  {p.is_ai_created && (
                    <span className="rounded-badge-xs inline-flex items-center gap-0.5 bg-ai-surface px-1.5 py-0.5 text-badge text-ai">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      AI{!p.ai_reviewed_at && '・未確認'}
                    </span>
                  )}
                </span>

                {/* **案件名は折り返す。** truncate すると、似た名前の案件を見分けられない */}
                <span className="text-list block [overflow-wrap:anywhere]">{p.name}</span>
                <span className="text-note mt-0.5 block truncate text-muted-foreground">
                  {p.customer_name || 'お客様 未設定'}
                  {(p.gls_number || p.code) && ` ・ ${p.gls_number || p.code}`}
                </span>

                <span className="mt-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-note min-w-0 truncate text-muted-foreground">
                    {p.event_start || p.event_end
                      ? <DateRange short start={p.event_start} end={p.event_end} className="text-note" />
                      : '実施日 未定'}
                  </span>
                  {amount !== null && (
                    <Money
                      value={amount}
                      className={cn('shrink-0 text-list', isExpected && 'text-muted-foreground')}
                    />
                  )}
                </span>

                {p.next_task_title && (
                  <span className="mt-2 block border-t border-border-faint pt-2">
                    <span className="text-note block truncate">
                      {p.next_task_assignee ? `${p.next_task_assignee}：` : ''}{p.next_task_title}
                    </span>
                    {due && (
                      <span className={cn('text-note font-number', dueTone(p.next_task_due, today))}>{due}</span>
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
