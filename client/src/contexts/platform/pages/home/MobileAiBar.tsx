/**
 * スマホのトップの「AIに任せる」（モックの ① の青いバー）
 *
 * ── なぜバー1本にするか ────────────────────────────────────
 *
 * モックのスマホのトップは、挨拶のすぐ下が**高さ 60px の青いバー1本**です。
 * 外で開く人がまず見たいのは自分のタスクと予定なので、ここは 1 本に畳みます。
 *
 * ── 開き方をボトムシートに変えた（この版）────────────────────
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
 * ── 中身は PC と同じ ──────────────────────────────────────
 *
 * 入力欄 1 つ ＋ `ファイル` `写真を撮る` `録音` ＋ `内容を確認する`。
 * 確認もシートの中で終わります（画面遷移させない）。
 */
import { useState } from 'react';
import { ArrowRight, ChevronRight, ClipboardPaste, Sparkles } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { IntakeComposer } from '@/contexts/tasks/components/intake/IntakeComposer';
import { IntakeReview } from '@/contexts/tasks/components/intake/IntakeReview';
import { useIntake } from '@/contexts/tasks/components/intake/useIntake';

export function MobileAiBar({ canIntake, canPaste }: { canIntake: boolean; canPaste: boolean }) {
  const [open, setOpen] = useState(false);
  // **フックは常に呼ぶ**（権限で早期 return すると、権限の読み込みが終わった
  // 瞬間にフックの数が変わって React が落ちる）
  const it = useIntake();
  if (!canIntake && !canPaste) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-card flex min-h-[60px] w-full items-center gap-3 bg-primary px-4 py-3 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary-foreground" aria-hidden="true" />
        <span className="text-cardtitle min-w-0 flex-1 text-primary-foreground">AIに任せる</span>
        {/* 書きかけが残っていることを**バーに出す**。出さないと、閉じた人は
            消えたと思ってもう一度書き始める */}
        {it.text.trim() && (
          <span className="text-note shrink-0 text-primary-foreground">書きかけあり</span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-primary-foreground" aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        rise
        title="AIに任せる"
        sub="書いても貼っても録っても大丈夫です。行き先は AI が決めます"
      >
        <div className="flex flex-col gap-2.5">
          {canIntake && !it.intake && (
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
              pending={it.submit.isPending}
              error={it.error}
              doneMsg={it.doneMsg}
            />
          )}

          {/* 解析中は骨組みを出す。**押したのに何も変わらない時間を作らない** */}
          {it.submit.isPending && (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <span key={i} className="v4-skeleton h-16 w-full rounded-card" />)}
            </div>
          )}

          {it.intake && (
            <IntakeReview
              embedded
              intake={it.intake}
              rows={it.rows}
              onChange={it.updateRow}
              onCommit={() => it.commit.mutate()}
              onDiscard={() => it.discard.mutate()}
              onClose={it.reset}
              committing={it.commit.isPending}
              discarding={it.discard.isPending}
              error={it.error}
            />
          )}

          {/*
            **受付への道を消さない。** `sales` はあるが `dailyops` が無い人には
            上の投入欄が出ないので、ここを消すと**スマホから引き合いを入れる道が
            1 つも無くなります**（M8 で入れた入口）。
          */}
          {canPaste && !it.intake && (
            <a
              href="/sales/inbox/new"
              className="rounded-card min-h-tap flex w-full items-center gap-3 border border-primary-border bg-primary-surface-weak px-4 py-3 text-left"
            >
              <ClipboardPaste className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="text-list block text-primary">受付に貼る</span>
                <span className="text-note block text-muted-foreground">引き合いとして整理したいとき</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            </a>
          )}
        </div>
      </Sheet>
    </>
  );
}
