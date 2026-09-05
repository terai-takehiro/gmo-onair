// 「重要度 × 緊急度」ボード。**位置に意味がある**ので並びは固定。
//
// ── スマホは「分布のミニ地図 → 選んだマスをカードで縦積み」───────────
//
// 以前は PC の3列グリッドをそのままスマホにも出し、列を固定220pxにして
// 横スクロールさせていた（PCの表示をそのまま縮小しない、という v4 の決めごとに
// 反する。`docs/v4-native-ui-audit-2026-08-20.md` 指摘）。
//
// 「位置に意味がある」分布そのものは残しつつ、**タップしたマスの中身だけ**を
// 案件一覧・GPMタスク一覧と同じ「カードとして組み直す」方針で下に縦積みする。
// マスは点数と件数だけを出すので3列が375pxに収まり、横スクロールが要らなくなる
// （タスクの題名を横に並べていたのをやめたのが効いている）。
import { useMemo, useState } from 'react';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { cn } from '@/lib/utils';
import { CELL_ACTION, formatDue, LEVEL_LABELS, type MyTask } from '@/lib/tasksApi';
import { CellScoreBadge } from './CellScoreBadge';
import { TaskRow } from './TaskRow';

/** マスの並び。上が重要、左が緊急。位置に意味があるので固定 */
export const CELL_GRID: string[][] = [
  ['3x3', '3x2', '3x1'],
  ['2x3', '2x2', '2x1'],
  ['1x3', '1x2', '1x1'],
];

/** マスの並び (重要 高→低 × 緊急 高→低) を1本にしたもの。既定のマス選びに使う */
const CELL_ORDER = CELL_GRID.flat();

/** セルの座標 ('3x2' 等) からスコアを出す */
function cellScore(cell: string): number {
  return Number(cell[0]) * Number(cell[2]);
}

export function NineCellBoard({ tasks, canEdit, canOpenProject, onEdit, isMobile }: {
  tasks: MyTask[]; canEdit: boolean; canOpenProject: boolean; onEdit: (t: MyTask) => void; isMobile: boolean;
}) {
  const byCell = useMemo(() => {
    const m: Record<string, MyTask[]> = {};
    for (const t of tasks) (m[t.priority_cell] ??= []).push(t);
    return m;
  }, [tasks]);

  // 既定は「中身があるいちばんスコアの高いマス」。9マスすべて空なら「今すぐやる」にする
  const [selected, setSelected] = useState<string>(
    () => CELL_ORDER.find((c) => (byCell[c]?.length ?? 0) > 0) ?? '3x3',
  );
  const selectedList = byCell[selected] ?? [];

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div role="group" aria-label="重要度と緊急度のマスを選ぶ" className="space-y-1.5">
          <div className="grid grid-cols-[40px_repeat(3,1fr)] gap-1.5 text-center text-th text-muted-foreground">
            <div />
            <div>緊急高</div><div>緊急中</div><div>緊急低</div>
          </div>
          {CELL_GRID.map((row, ri) => (
            <div key={ri} className="grid grid-cols-[40px_repeat(3,1fr)] gap-1.5">
              <div className="flex items-center justify-center text-th text-muted-foreground">
                重要{LEVEL_LABELS[3 - ri]}
              </div>
              {row.map((cell) => {
                const list = byCell[cell] ?? [];
                const active = selected === cell;
                return (
                  <button
                    key={cell}
                    type="button"
                    onClick={() => setSelected(cell)}
                    aria-pressed={active}
                    className={cn(
                      'v4-tap flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-control border p-1.5',
                      active ? 'border-primary bg-primary-surface' : 'border-border bg-card',
                    )}
                  >
                    <CellScoreBadge score={cellScore(cell)} />
                    <span className="text-sub-sm text-muted-foreground">{list.length} 件</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="rounded-card border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <CellScoreBadge score={cellScore(selected)} />
            <span className="text-cardtitle">{CELL_ACTION[selected]}</span>
            <span className="ml-auto shrink-0 text-sub-sm text-muted-foreground">{selectedList.length} 件</span>
          </div>
          {selectedList.length === 0 ? (
            <EmptyState
              className="border-none bg-transparent py-4"
              title="このマスにタスクはありません"
              description="他のマスを選ぶか、上の「追加」からタスクを作ってください"
            />
          ) : (
            <div className="space-y-2">
              {selectedList.map((t) => (
                <TaskRow key={t.id} t={t} canEdit={canEdit} canOpenProject={canOpenProject} onEdit={() => onEdit(t)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-[52px_repeat(3,minmax(0,1fr))] gap-2 text-center text-th text-muted-foreground">
        <div />
        <div>緊急 高</div><div>緊急 中</div><div>緊急 低</div>
      </div>
      <div className="space-y-2">
        {CELL_GRID.map((row, ri) => (
          <div key={ri} className="grid grid-cols-[52px_repeat(3,minmax(0,1fr))] gap-2">
            <div className="flex items-center justify-center text-th text-muted-foreground">
              重要 {LEVEL_LABELS[3 - ri]}
            </div>
            {row.map((cell) => {
              const list = byCell[cell] ?? [];
              const score = cellScore(cell);
              return (
                // min-w-0 が無いと grid item の自動最小サイズが min-content になり、
                // nowrap な truncate テキストがトラックを押し広げてしまう
                <div key={cell} className="min-w-0 rounded-lg border border-border bg-card p-2">
                  <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                    <CellScoreBadge score={score} />
                    <span className="truncate text-sub-sm text-muted-foreground">{CELL_ACTION[cell]}</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="py-2 text-center text-sub-sm text-muted-foreground/60">—</p>
                  ) : (
                    <div className="space-y-1">
                      {list.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => canEdit && onEdit(t)}
                          className="block w-full min-w-0 rounded border border-border/60 bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent"
                        >
                          <p className="truncate text-sub">{t.title}</p>
                          <p className={cn('mt-0.5 truncate text-sub-sm', t.is_overdue ? 'font-bold text-red-700' : 'text-muted-foreground')}>
                            {formatDue(t.due_at)}
                            {t.gls_number && <span className="ml-1">{t.gls_number}</span>}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
