/**
 * ToDo 系の「対応済にする」ボタン（v4 対象アプリ共通）
 *
 * ── なぜチェックボックスをやめたか ──────────────────────────
 *
 * タスクを片づける操作は、これまで**行の左に置いた小さな四角**（チェックボックス、
 * または同じ見た目の丸／四角ボタン）でした。押すと `is_completed` が反転します。
 * ただし四角には**文字が無い**ので、
 *
 *   - 初めて見る人には「押すと何が起きるか」が読み取れない
 *     （選択のためのチェックなのか、状態を変えるチェックなのか区別が付かない）
 *   - スマホでは**指が触れただけで状態が変わる**（取り消しの手がかりも出ない）
 *
 * という2つの問題がありました。**押すと何をするかを文字で書いたボタン**に
 * 置き換えます。取り消しも同じ場所で「未対応に戻す」と読めます。
 *
 * ── 使うときの決めごと ──────────────────────────────────────
 *
 * - **文言はこの部品が持つ**（画面ごとに書かない）。`対応済にする` / `未対応に戻す`
 * - 読み上げ用に `taskTitle` を渡す（`「◯◯」を対応済にする` になる）
 * - 権限が無い人には**呼ぶ側が出さない**（押した先が 403 になるだけなので）
 * - 行やカード全体が押せる場所（開く操作）の中に置くときは、
 *   このボタンが `stopPropagation` するので**入れ子のまま置ける**
 * - `size="sm"` はかんばんカード・サブタスクの行など、幅の狭いところ用
 */
import type { MouseEvent, PointerEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '../client/utils';

/** 未対応 → 対応済 にするときの文言 */
export const TASK_DONE_LABEL = '対応済にする';
/** 対応済 → 未対応 に戻すときの文言 */
export const TASK_UNDONE_LABEL = '未対応に戻す';

export function TaskDoneButton({
  done,
  onToggle,
  taskTitle,
  disabled,
  size = 'default',
  className,
}: {
  /** いま対応済かどうか */
  done: boolean;
  /** 押されたとき。反転は呼ぶ側が行う */
  onToggle: () => void;
  /** 読み上げ用のタスク名。省略すると文言だけを読む */
  taskTitle?: string;
  disabled?: boolean;
  /** `sm` は幅の狭いカード用（高さ 30px・当たり判定は 44px のまま） */
  size?: 'default' | 'sm';
  className?: string;
}) {
  const label = done ? TASK_UNDONE_LABEL : TASK_DONE_LABEL;
  const Icon = done ? RotateCcw : Check;

  return (
    <button
      type="button"
      // 行ごと押せる一覧の中に置くので、行の「開く」まで伝わらないように止める
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      // 掴んで運べるカード（かんばん）の中でも押せるように、掴む操作には渡さない
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => e.stopPropagation()}
      disabled={disabled}
      aria-pressed={done}
      aria-label={taskTitle ? `「${taskTitle}」を${label}` : label}
      className={cn(
        'v4-tap rounded-control-md inline-flex shrink-0 items-center justify-center gap-1 border font-bold transition-colors disabled:opacity-50',
        size === 'sm' ? 'text-sub-sm h-[30px] px-2' : 'text-sub h-9 px-3',
        done
          ? 'border-border bg-card text-muted-foreground hover:bg-muted'
          : 'border-success-border bg-success-surface text-success hover:bg-success hover:text-success-foreground',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
      {label}
    </button>
  );
}
