/**
 * プロジェクト一覧のボード表示 (v4 GPM)
 *
 * 案件一覧（`sales/pages/projectList/ProjectBoard.tsx`）の**同じ考え方をそのまま持ち込んだ**もの
 * — 一覧と同じ問い合わせの結果を並べ替えているだけで、絞り込みは効いたまま・件数も金額も一覧と食い違わない。
 *
 * ── 列に出す金額について ────────────────────────────────────
 *
 * 一覧の「見積」列と同じ値（`estimate_amount`。1本も無ければ null）を積む。
 * 確定売上には触れない — GPM の見積は `revenues` に変換されない
 * （`gpm/queries.ts` の `GpmEstimateSummary` の注記どおり）。
 */
import { ListChecks } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { ProjectStageLabels, type ProjectStage } from '@/types';
// 健全性バッジは案件一覧と同じ部品（理由は `ProjectRows.tsx` の import に）。
// リスト・カード・ボードの3か所が同じ1部品を使う — 見え方で状態が変わらないように
import { HealthBadge } from '@/contexts/sales/pages/projectList/health';
import { dueLabel, dueTone, KIND_LABEL, ymd, type GpmProjectRow } from '../../types';

/** 左から「まだ何も無い」→「進行中」。完了・見送りは並べない（案件一覧の `ProjectBoard` と同じ） */
const BOARD_STAGES: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won'];

const DOT: Record<string, string> = {
  neta: 'bg-border-disabled',
  d_hold: 'bg-primary-border-strong',
  c_proposal: 'bg-primary/60',
  b_verbal: 'bg-primary',
  a_won: 'bg-success',
};

export function GpmProjectBoard({
  rows,
  today,
  onOpen,
}: {
  rows: GpmProjectRow[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const columns = BOARD_STAGES.map((stage) => {
    const items = rows.filter((p) => p.stage === stage);
    return { stage, items, total: items.reduce((s, p) => s + (p.estimate_amount ?? 0), 0) };
  });

  if (columns.every((c) => c.items.length === 0)) {
    return (
      <EmptyState
        title="ボードに並べるプロジェクトがありません"
        description="完了・見送りのプロジェクトはボードに出しません。絞り込みを「すべて」に戻すか、リスト表示に切り替えてください。"
      />
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.stage} className="flex w-60 shrink-0 flex-col gap-2">
          <div className="flex items-center gap-2 rounded-card border border-border bg-card px-3 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-chip ${DOT[col.stage]}`} aria-hidden="true" />
            <span className="text-list">{ProjectStageLabels[col.stage]}</span>
            <span className="text-sub-sm font-number text-muted-foreground">{col.items.length}</span>
            <Money value={col.total || null} className="text-sub-sm ml-auto w-24 text-muted-foreground" />
          </div>

          {col.items.length === 0 ? (
            <p className="text-sub rounded-card border border-dashed border-border px-3 py-4 text-center text-muted-foreground">
              なし
            </p>
          ) : (
            col.items.map((p) => {
              const due = ymd(p.next_due);
              const overdue = due !== null && due < today;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full rounded-card border border-border-subtle bg-card px-3 py-2.5 text-left hover:border-primary-border-strong hover:bg-primary-surface-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-list line-clamp-2 min-w-0 flex-1" title={p.name}>{p.name}</p>
                    <span className="text-badge shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {p.gpm_kind ? KIND_LABEL[p.gpm_kind] : '区分なし'}
                    </span>
                  </div>
                  <p className="text-sub-sm mt-0.5 flex items-center justify-between gap-1.5 text-muted-foreground">
                    <span className="min-w-0 truncate">{p.customer_name || '依頼元 未設定'}</span>
                    <HealthBadge p={p} />
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 border-t border-border-faint pt-2">
                    <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sub-sm min-w-0 flex-1 truncate">
                      {p.next_task || 'タスクがありません'}
                    </span>
                  </div>
                  {overdue && (
                    <p className={`text-sub-sm mt-1.5 font-bold ${dueTone(due, today)}`}>
                      期限を過ぎたタスクがあります（{dueLabel(due, today)}）
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
}
