/**
 * 「AI で下書きを作成」（設計 §7-1 ②・§7-2）
 *
 * 会議のメモ・口頭で聞いたことを貼ると、AI がページの本文を書きます。
 *
 * ⚠️ **下書きのページでだけ使えます。** 公開中のページを AI で書き換えると、
 * いま現場が見ている手順が予告なく変わります（サーバーも断ります）。
 * 入口そのものを出さないので、ここには公開中の案内を置いていません。
 *
 * ⚠️ **いまの本文は置き換わります**（元の文は履歴に残ります）。押す前に画面に出します。
 *
 * ── 「決められなかったこと」を捨てない ──────────────────────
 *
 * AI は材料から分からないことを**推測で書かない**代わりに `open_questions` に
 * 出します。ここで見せて、書いた人がそのまま埋められるようにします
 * （捨てると、空欄のまま公開されたことに誰も気づけません）。
 */
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { draftIntoPage, type WikiDraftResult } from './aiApi';

export interface AiDraftSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pageId: string;
  /** いまの題（そのまま AI に渡す。空なら AI が材料から決める） */
  title: string;
  /** 本文が入っているか（置き換わることを先に伝える） */
  hasBody: boolean;
  /** 書き込みが終わった。画面の本文を入れ替えるのは呼ぶ側 */
  onDrafted: (result: WikiDraftResult) => void;
}

const NOTES_PLACEHOLDER = `例）
配信の立ち上げ手順を聞いたメモ
・電源は卓 → スイッチャー → カメラの順
・回線は有線を優先。無線は予備
・本番30分前に音声チェック（ハウリングに注意）`;

export default function AiDraftSheet({
  open, onOpenChange, pageId, title, hasBody, onDrafted,
}: AiDraftSheetProps) {
  const [notes, setNotes] = useState('');
  /** 書けたあとに出す「決められなかったこと」。null は「まだ書いていない」 */
  const [questions, setQuestions] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setNotes('');
    setQuestions(null);
  }, [open]);

  const draft = useMutation({
    meta: { action: 'AI の下書きを作成' },
    mutationFn: () => draftIntoPage(pageId, { title: title.trim() || undefined, notes: notes.trim() }),
    onSuccess: (res) => {
      onDrafted(res);
      if (res.open_questions.length > 0) {
        setQuestions(res.open_questions);
        return;
      }
      onOpenChange(false);
      notifySuccess('下書きを作成しました', {
        description: '中身が合っているか読んでから「公開する」を押してください。',
      });
    },
  });

  const done = questions !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="AI で下書きを作成"
      sub="貼ったメモを材料に、AI がこのページの本文を書きます"
      size="md"
      swipeDownHandle
      /* 下敷きを触っただけで、打ったメモを失わない */
      onInteractOutside={(e) => e.preventDefault()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.isPending && !done && notes.trim()) draft.mutate();
      }}
      footer={
        done ? (
          <div className="flex justify-end">
            <Button
              type="button"
              className="h-[52px] flex-1 lg:h-10 lg:flex-none"
              onClick={() => onOpenChange(false)}
            >
              本文を確認する
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 lg:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-[52px] flex-1 lg:h-10 lg:flex-none"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="h-[52px] flex-1 lg:h-10 lg:flex-none"
              disabled={draft.isPending || !notes.trim()}
            >
              {draft.isPending ? '書いています…' : '下書きを作成'}
            </Button>
          </div>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-list text-foreground">本文を書きました。</p>
          <div className="flex flex-col gap-2 rounded-control border border-warning-border bg-warning-surface p-3">
            <span className="text-sub font-bold text-warning">材料から決められなかったこと</span>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {questions.map((q, i) => (
                <li key={`${q}-${i}`} className="text-sub text-foreground">{q}</li>
              ))}
            </ul>
            <span className="text-sub-sm text-muted-foreground">
              分かる人に確かめて、本文に書き足してください。
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-control bg-ai-surface p-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden />
            <span className="text-sub text-foreground">
              {hasBody
                ? 'いまの本文は、AI が書いた本文に置き換わります（元の文は履歴に残ります）。'
                : 'このページの本文に書き込みます。公開はされません。'}
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sub-sm text-muted-foreground">メモ</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={NOTES_PLACEHOLDER}
              className="w-full resize-none rounded-control border border-border bg-background p-3 text-[14px] leading-[1.85] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-border-strong"
            />
          </label>

          <p className="text-sub-sm text-muted-foreground">
            書かれていないことは AI も書きません。分からないところは「決められなかったこと」として返ります。
          </p>
        </div>
      )}
    </Sheet>
  );
}
