/**
 * 案件一覧のボード表示 (v4) — 旧「ヨミ・パイプライン」(`PipelinePage`) を畳んだもの
 *
 * ── なぜ別画面をやめたか ────────────────────────────────────
 *
 * 旧実装は `/sales/pipeline` という別の画面で、**別のエンドポイント**
 * (`/dashboard/sales-board`) を叩いていました。そのため
 * 「一覧で絞り込んでからボードで見る」ができず、件数も金額も一覧と食い違いました
 * (一覧は確定売上、ボードは想定金額を合計していた)。
 *
 * v4 のモックは**リスト・ボード・ネタを同じ画面の見え方の切り替え**にし、
 * 「切り替えても絞り込みは効いたまま」と書いています。ここはそれに従い、
 * **一覧と同じ問い合わせの結果を並べ替えているだけ**にしました。
 *
 * ── 列に出す金額について ────────────────────────────────────
 *
 * 列の合計は**行に出しているのと同じ値**(確定売上、無ければ想定金額) を足します。
 * 別の値を合計すると、行を足し算した人と合わない数字が出ます。
 */
import { ListChecks } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL, isStale } from './stages';
import type { ProjectListRow } from './types';

/** 左から「まだ何も無い」→「受注済」。終わったもの (完了・失注) は並べない */
const BOARD_STAGES: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won'];

/** 列見出しの点の色。バッジと同じ「進み具合」の並び */
const DOT: Record<string, string> = {
  neta: 'bg-border-disabled',
  d_hold: 'bg-primary-border-strong',
  c_proposal: 'bg-primary/60',
  b_verbal: 'bg-primary',
  a_won: 'bg-success',
};

function amountOf(p: ProjectListRow): number {
  const revenue = Number(p.total_revenue) || 0;
  return revenue > 0 ? revenue : Number(p.expected_amount) || 0;
}

export function ProjectBoard({
  rows,
  today,
  onOpen,
}: {
  rows: ProjectListRow[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const columns = BOARD_STAGES.map((stage) => {
    const items = rows.filter((p) => p.stage === stage);
    return { stage, items, total: items.reduce((s, p) => s + amountOf(p), 0) };
  });

  if (columns.every((c) => c.items.length === 0)) {
    return (
      <EmptyState
        title="ボードに並べる案件がありません"
        description="終わった案件 (完了・失注) はボードに出しません。絞り込みを「すべて」に戻すか、リスト表示に切り替えてください。"
      />
    );
  }

  return (
    // 5列は 375px には入らない。**縦に潰さず横スクロール**にする
    // (潰すとカードの文字が2文字ずつ折り返して読めなくなる)
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.stage} className="flex w-60 shrink-0 flex-col gap-2">
          <div className="flex items-center gap-2 rounded-card border border-border bg-card px-3 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-chip ${DOT[col.stage]}`} aria-hidden="true" />
            <span className="text-list">{STAGE_BADGE_LABEL[col.stage]}</span>
            <span className="text-sub-sm font-number text-muted-foreground">{col.items.length}</span>
            <Money value={col.total || null} className="text-sub-sm ml-auto w-24 text-muted-foreground" />
          </div>

          {col.items.length === 0 ? (
            <p className="text-sub rounded-card border border-dashed border-border px-3 py-4 text-center text-muted-foreground">
              なし
            </p>
          ) : (
            col.items.map((p) => {
              const overdue = p.next_task_due !== null && p.next_task_due < today;
              const stale = isStale(p.stage, p.last_activity_at);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full rounded-card border border-border-subtle bg-card px-3 py-2.5 text-left hover:border-primary-border-strong hover:bg-primary-surface-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* 2行で切る。全文は `title` と開いた先で読める */}
                  <p className="text-list line-clamp-2" title={p.name}>{p.name}</p>
                  <p className="text-sub-sm mt-0.5 truncate text-muted-foreground">
                    {p.customer_name || 'お客様 未設定'}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 border-t border-border-faint pt-2">
                    <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sub-sm min-w-0 flex-1 truncate">
                      {p.next_task_title || 'タスクがありません'}
                    </span>
                  </div>
                  {(overdue || stale) && (
                    <p className="text-sub-sm mt-1.5 font-bold text-destructive">
                      {overdue ? '期限を過ぎたタスクがあります' : '1週間 動いていません'}
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
