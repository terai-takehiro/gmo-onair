/**
 * スマホのトップの「AIに任せる」（モックの ① の青いバー）
 *
 * ── なぜバー1本にするか ────────────────────────────────────
 *
 * モックのスマホのトップは、挨拶のすぐ下が**高さ 60px の青いバー1本**です。
 * 外で開く人がまず見たいのは自分のタスクと予定なので、ここは 1 本に畳みます。
 *
 * ── 開き方をボトムシートに変えた ────────────────────────────
 *
 * 以前は**その場で下に開く**形で、「開いたら閉じない」ことにしていました
 * （書いている途中で畳むと、入力が消えたように見えるため）。
 * **シートにするとその心配が要りません** — 画面を覆うので書きかけが
 * 隠れることがなく、閉じる操作も 1 つ（シートの外を押す）に決まります。
 *
 * ⚠️ **ただし「入力中の文字はシートを閉じても保持する」。**
 * 状態（`useIntake`）は**この部品が持ちます** — シートの中で持つと、
 * 閉じた瞬間に部品ごと消えて**書きかけが消えます**（実際に起きる事故）。
 *
 * ── 「受付に貼る」のボタンは置かない（ご判断）────────────────
 *
 * いちど、`sales` の人の入口として `/sales/inbox/new` へのボタンを置いていました。
 * **やめました** — 投入口を 1 本にして AI が行き先を決める形にした以上、
 * **同じ文をどちらの口に入れるかを押す人に選ばせる**ことになり、
 * 1 本化の意味が消えます。
 *
 * 代わりに、**AI が「案件（ネタ）」と判断して登録したら、その案件を開きます**
 * （`useIntake` の commit）。引き合いを入れた人が次にやるのは、
 * たいてい中身を足すことだからです。
 *
 * ── 中身は PC と同じ ──────────────────────────────────────
 *
 * 入力欄 1 つ ＋ `ファイル` `写真を撮る` `録音` ＋ `内容を確認する`。
 * 確認もシートの中で終わります（画面遷移させない）。
 */
import { useState } from 'react';
import { ChevronUp, Sparkles } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { IntakeComposer } from '@/contexts/tasks/components/intake/IntakeComposer';
import { IntakeReview } from '@/contexts/tasks/components/intake/IntakeReview';
import { Transcribing } from '@/contexts/tasks/components/intake/Transcribing';
import { useIntake } from '@/contexts/tasks/components/intake/useIntake';

export function MobileAiBar({
  canIntake, canOpenProject,
}: {
  /** `dailyops` の editor。投入できる人 */
  canIntake: boolean;
  /** `sales` の reader。**作った案件を開ける人**（無い人を送ると 403 になる） */
  canOpenProject: boolean;
}) {
  const [open, setOpen] = useState(false);
  // **フックは常に呼ぶ**（権限で早期 return すると、権限の読み込みが終わった
  // 瞬間にフックの数が変わって React が落ちる）
  const it = useIntake({ canOpenProject });
  if (!canIntake) return null;

  return (
    <>
      {/*
        モックの実測: 高さ 52px ／ 角丸 12px ／ 青から藍への横グラデーション。
        色は**トークンから組む**（`--primary` #005bac → `--info` #4338ca）。
        生の hex を書くと、色を決め直したときにここだけ取り残される
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          'rounded-note flex min-h-[52px] w-full items-center gap-2.5 px-3.5 py-2 text-left '
          + 'bg-[linear-gradient(100deg,rgb(var(--primary)),rgb(var(--info)))]'
        }
      >
        <Sparkles className="h-[18px] w-[18px] shrink-0 text-primary-foreground" aria-hidden="true" />
        <span className="text-cardtitle min-w-0 text-primary-foreground">AIに任せる</span>
        <span className="flex-1" />
        {/* 何ができる口なのかを右端に添える（モック）。ただし**書きかけがあるときは
            そちらを優先**する — 出さないと、閉じた人は消えたと思ってもう一度書き始める */}
        <span className="text-note shrink-0 text-primary-foreground opacity-85">
          {it.text.trim() ? '書きかけあり' : '書く・貼る・録音'}
        </span>
        <ChevronUp className="h-4 w-4 shrink-0 text-primary-foreground" aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        rise
        title="AIに任せる"
        sub="書いても貼っても録っても大丈夫です。行き先は AI が決めます"
      >
        <div className="flex flex-col gap-2.5">
          {!it.intake && (
            <IntakeComposer
              compact
              text={it.text}
              onTextChange={(v) => { it.setText(v); it.setDoneMsg(null); }}
              files={it.files}
              onAddFiles={it.addFiles}
              onRemoveFile={it.removeFile}
              onSubmit={() => it.submit.mutate()}
              onAudio={it.submitWithAudio}
              canSubmit={it.canSubmit}
              preparingFiles={it.preparingFiles}
              pending={it.submit.isPending}
              error={it.error}
              doneMsg={it.doneMsg}
              createdProjects={it.createdProjects}
            />
          )}

          {/* 解析中は骨組みを出す。**押したのに何も変わらない時間を作らない** */}
          {it.submit.isPending && (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <span key={i} className="v4-skeleton h-16 w-full rounded-card" />)}
            </div>
          )}

          {it.transcribing && <Transcribing />}

          {it.intake && !it.transcribing && (
            <IntakeReview
              embedded
              intake={it.intake}
              rows={it.rows}
              onChange={it.updateRow}
              onCommit={() => it.commit.mutate()}
              onDiscard={() => it.discard.mutate()}
              onClose={it.dismiss}
              committing={it.commit.isPending}
              discarding={it.discard.isPending}
              error={it.error}
            />
          )}
        </div>
      </Sheet>
    </>
  );
}
