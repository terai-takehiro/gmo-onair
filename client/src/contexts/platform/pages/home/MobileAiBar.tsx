/**
 * スマホのトップの「AIに任せる」（モックの ① の青いバー）
 *
 * ── なぜバー1本にするか ────────────────────────────────────
 *
 * モックのスマホのトップは、挨拶のすぐ下が**高さ 60px の青いバー1本**
 * （`AIに任せる` ＋ `貼る・撮る`）です。実装は**白いフォーム型の投入欄**
 * （見出し ＋ ひとこと／議事録の切り替え ＋ テキスト欄 ＋「内容を確認する」）と
 * **点線のカード2枚**に分かれていて、**上から3画面ぶんが入口の説明**でした。
 * 外で開く人がまず見たいのは自分のタスクと予定なので、ここは1本に畳みます。
 *
 * ── 畳むだけで、消していない ────────────────────────────────
 *
 * バーを押すと下に開き、**中身は今までと同じもの**が出ます:
 *   ・依頼・タスクを書き留める（`TaskIntakeBox`。中身は1行も変えていない）
 *   ・電話・その他を貼る（⑦）／打合せを録音する（⑤）
 *
 * モックのバーは `chevron-right`（＝別の画面へ移る）ですが、**開く形にしました** —
 * 投入欄は「その場で書いて渡す」ためのもので、画面を移ると
 * **戻ってきたときにトップの続きが読めません**（モックの決めごと
 * 「終わらせるのはシートで／一覧の行から画面遷移させない」と同じ理由）。
 *
 * ── 開いたら閉じない（M7 の決めごとを引き継ぐ）────────────────
 *
 * この部品は M7 で入れた `MobileIntake`（1行の点線の箱）を**モックの形**に
 * 置き換えたものです。畳む考え方（**場所は最上部のまま・大きさだけ小さく**）と、
 * **開いたら閉じない**という決めごとはそのまま引き継いでいます —
 * 書いている途中で畳めると、入力が消えたように見えるためです。
 *
 * ── 「撮る」は出さない ──────────────────────────────────────
 *
 * モックの右肩は「貼る・撮る」ですが、**名刺を読む口がありません**。
 * 押しても何も起きない言葉を書くと、この枠ごと信用されなくなります。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, ClipboardPaste, Mic, Sparkles } from 'lucide-react';
import { TaskIntakeBox } from '@/contexts/tasks/components/TaskIntakeBox';

export function MobileAiBar({ canIntake, canPaste }: { canIntake: boolean; canPaste: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!canIntake && !canPaste) return null;
  // **開いたら閉じない**（M7）。畳むボタンにすると、書きかけを消したように見える

  // 右肩の言葉は**できることだけ**書く（できないことを書かない）
  const hint = canIntake && canPaste ? '書き留める・貼る' : canIntake ? '書き留める' : '貼る・録る';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="rounded-card flex min-h-[60px] w-full items-center gap-3 bg-primary px-4 py-3 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary-foreground" aria-hidden="true" />
        <span className="text-cardtitle min-w-0 flex-1 text-primary-foreground">AIに任せる</span>
        <span className="text-note shrink-0 text-primary-foreground">{hint}</span>
        {!open && <ChevronDown className="h-4 w-4 shrink-0 text-primary-foreground" aria-hidden="true" />}
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {canIntake && <TaskIntakeBox />}
          {canPaste &&
            ([
              { to: '/sales/inbox/new', icon: ClipboardPaste, label: '電話・その他を貼る', sub: '聞いた話をそのまま送る。整理は PC で' },
              { to: '/sales/record', icon: Mic, label: '打合せを録音する', sub: '文字起こしは裏で走ります' },
            ] as const).map((e) => (
              <button
                key={e.to}
                type="button"
                onClick={() => navigate(e.to)}
                className="rounded-card min-h-tap flex w-full items-center gap-3 border border-dashed border-primary-border bg-primary-surface-weak px-4 py-3 text-left"
              >
                <e.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="text-list block text-primary">{e.label}</span>
                  <span className="text-note block text-muted-foreground">{e.sub}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
