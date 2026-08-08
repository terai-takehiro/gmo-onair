/**
 * トップの「AI に書き留める」— **スマホでは畳む**（M7）
 *
 * ── なぜ畳むのか ────────────────────────────────────────────
 *
 * `TaskIntakeBox` は 390px で **約 500px**（切替タブ ＋ 複数行の入力欄 ＋
 * 書き方の説明 ＋ 送るボタン）。トップを開いた人の大半は
 * **自分のタスクと今日の予定を見に来ます**が、その前にこの箱を通り過ぎる
 * ことになっていました。
 *
 * かといって下に送ると、決めごとの「投げるのは1秒で終わる行為なので入口の
 * 最上部」に反します（奥に置くと「あとでいいか」になり、口頭のまま消える）。
 *
 * → **場所は最上部のまま、大きさだけ 1 行にします。** 押すと開き、
 *   そのまま書けます。**開いたら閉じません** — 書いている途中で畳むと
 *   入力が消えたように見えるためです。
 */
import { useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { TaskIntakeBox } from '@/contexts/tasks/components/TaskIntakeBox';

export function MobileIntake() {
  const [open, setOpen] = useState(false);

  if (open) return <TaskIntakeBox />;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      /*
        **破線をやめた**（M8）。この下に「電話・その他を貼る」「打合せを録音する」が
        続くので、**破線の箱が3つ縦に並んで**いた。破線は「まだ中身が無い」の印なので、
        動いている入口が未完成に見える。淡い青の面と青い文字だけで入口だと伝わる。
      */
      className="rounded-card min-h-tap flex w-full items-center gap-2.5 border border-primary-border bg-primary-surface-weak px-4 py-3 text-left"
    >
      <Sparkles className="h-5 w-5 shrink-0 text-ai" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-list block text-primary">依頼・タスクを書き留める</span>
        <span className="text-note block text-muted-foreground">AI が整えます。押すまで登録しません</span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
    </button>
  );
}
