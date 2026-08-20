/**
 * ⑤ 全プロジェクトのタスク — スマホのカード（v4ネイティブUI監査 2026-08-20 で追加）
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行（`GpmTaskListPage.tsx`）は 完了(56px・canEdit時のみ) ／
 * タスク・プロジェクト（伸びる）／ 工程(128px) ／ 担当(96px) ／ 期限(96px) の
 * 5列で、これまでのスマホは `Row stackOnMobile` が工程・担当の2列を
 * `hideOnMobile` で消すだけの縮小表でした（`docs/v4-native-ui-audit-2026-08-20.md`
 * ⑤ 指摘）。**工程の状態や誰が持っているかは、外で確認するときこそ要る情報**なので、
 * 消すのではなくカードとして組み直します:
 *
 *   1行目  完了チェック（直せる人だけ）＋ タスク名 ＋ 工程バッジ
 *   2行目  プロジェクト名（押せる。押すとプロジェクト詳細へ）
 *   3行目  担当 ・ 期限（PC で hideOnMobile されていた2列）
 *
 * ── 期限・工程の色は書き写さない ────────────────────────────
 *
 * `dueTone` / `dueLabel` / `PHASE_STATE_TONE` は `../types.ts` から読む。
 * ここで判定を書き直すと、PC とスマホで違う日に赤くなる。
 */
import { Check } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { PHASE_STATE_TONE, dueLabel, dueTone, ymd, type GpmTask } from '../../types';

export function TaskCards({
  rows, today, canEdit, onToggleDone, onOpenProject,
}: {
  rows: GpmTask[];
  today: string;
  /** 完了チェックを出すか（サーバーは `sales:editor` を要求する。出しても押せば 403 になるだけ） */
  canEdit: boolean;
  onToggleDone: (t: GpmTask) => void;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {rows.map((t) => {
        const due = ymd(t.due_at);
        const dueText = dueLabel(due, today);

        return (
          <li
            key={t.id}
            className={cn(
              'rounded-card flex gap-2.5 border border-border bg-card p-3.5',
              t.is_completed && 'opacity-60',
            )}
          >
            {canEdit && (
              <button
                type="button"
                onClick={() => onToggleDone(t)}
                aria-label={t.is_completed ? `${t.title} を未完了に戻す` : `${t.title} を完了にする`}
                /*
                  **`v4-tap` で当たり判定だけ 44px にする**（PC の行と同じ考え方）。
                  18px の四角のまま指の当たる範囲だけ広げる。
                */
                className={cn(
                  'v4-tap rounded-badge-xs mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border-[1.5px]',
                  t.is_completed ? 'border-success bg-success' : 'border-border-disabled',
                )}
              >
                {t.is_completed && <Check className="h-3 w-3 text-success-foreground" aria-hidden="true" />}
              </button>
            )}

            <span className="min-w-0 flex-1">
              <span className="mb-1 flex flex-wrap items-start gap-1.5">
                <span
                  className={cn(
                    'text-list min-w-0 flex-1 [overflow-wrap:anywhere]',
                    t.is_completed && 'text-muted-foreground line-through',
                  )}
                >
                  {t.title}
                </span>
                {/* **工程に付いていないタスクもある**（migration 179）。無ければ出さない */}
                {t.phase_state && t.phase_label && (
                  <span
                    className={cn(
                      'text-badge rounded-badge shrink-0 truncate px-1.5 py-0.5',
                      PHASE_STATE_TONE[t.phase_state],
                    )}
                  >
                    {t.phase_label}
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => onOpenProject(t.project_id)}
                className="v4-tap -ml-0.5 inline-block max-w-full truncate px-0.5 text-note text-primary hover:underline"
              >
                {t.project_name}
              </button>

              <span className="mt-1.5 flex items-center justify-between gap-3 border-t border-border-faint pt-1.5">
                <span className="truncate text-sub-sm text-muted-foreground">{t.assigned_to_name ?? '担当なし'}</span>
                {dueText && (
                  <span
                    className={cn(
                      'shrink-0 font-number text-sub',
                      t.is_completed ? 'text-muted-foreground' : dueTone(due, today),
                    )}
                  >
                    {dueText}
                  </span>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
