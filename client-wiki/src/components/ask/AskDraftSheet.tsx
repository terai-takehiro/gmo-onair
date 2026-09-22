/**
 * 回答から「ページを作成」（docs/design/v4/wiki.md §6-⑤・§7-2）
 *
 * 質問をそのまま題にした**下書き**を作り、会話を材料に AI が本文を書きます。
 * ⚠️ **公開は人が押します**（メール取込の「AI は起票まで・確定は人」と同じ）。
 * ⚠️ **押した回答に「ページにした」印が付きます**（`spawned_page_id`）。
 * これが §7-3 条件3 の主指標なので、ページを別の入口で作らずここから作ります。
 *
 * ⚠️ 呼ぶ先は編集画面と**同じ口**（`components/ai/aiApi.ts` の `createAiDraftPage`）です。
 * 同じ URL を2つのファイルに持ちません（`client-wiki/CLAUDE.md`）。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { createAiDraftPage, type WikiDraftResult } from '@/components/ai/aiApi';
import { askKeys } from '@/components/search/askApi';
import BufferedInput from '@/components/editor/BufferedInput';
import { useWikiSpaces } from '@/lib/wikiApi';
import { useWikiRefresh } from '@/components/page/pageOpsApi';

export interface AskDraftSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 題の下書きに使う質問 */
  question: string;
  threadId: string | null;
  /** 「ページを作成」を押した回答。採用の印を付ける相手 */
  messageId: string | null;
  /** 会話に結びついているスペース（あれば最初から選んでおく） */
  defaultSpaceId?: string | null;
}

const FIELD_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';

export default function AskDraftSheet({
  open,
  onOpenChange,
  question,
  threadId,
  messageId,
  defaultSpaceId,
}: AskDraftSheetProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const refresh = useWikiRefresh();
  const spacesQ = useWikiSpaces({ enabled: open });
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? '');
  const [title, setTitle] = useState(question);
  const [done, setDone] = useState<WikiDraftResult | null>(null);

  // 開き直すたびに、押した回答に合わせて入れ直す（前回の入力を引きずらない）
  useEffect(() => {
    if (!open) return;
    setSpaceId(defaultSpaceId ?? '');
    setTitle(question);
    setDone(null);
  }, [open, question, defaultSpaceId]);

  const spaces = spacesQ.data ?? [];
  const effectiveSpaceId = spaceId || spaces[0]?.id || '';
  const space = spaces.find((s) => s.id === effectiveSpaceId);

  const create = useMutation({
    meta: { action: '下書きの作成' },
    mutationFn: () => createAiDraftPage({
      space_id: effectiveSpaceId,
      title: title.trim() || undefined,
      thread_id: threadId,
      message_id: messageId,
    }),
    onSuccess: (result) => {
      refresh.tree(space?.key);
      refresh.home();
      // 押した回答に「ページにした」印が付いたので、会話も取り直す（条件3 の印を画面に出す）
      if (threadId) void qc.invalidateQueries({ queryKey: askKeys.thread(threadId) });
      setDone(result);
      notifySuccess('下書きを作成しました', { description: `${result.page.title}（公開はまだです）` });
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="この回答からページを作成"
      sub="会話を材料に AI が下書きを書きます。公開は読んでから人が押します"
      size="md"
      onSubmit={(e) => {
        e.preventDefault();
        if (!create.isPending && !done && effectiveSpaceId) create.mutate();
      }}
      footer={
        done ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate(`/p/${done.page.id}/edit`);
              }}
            >
              下書きを開く
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={create.isPending || !effectiveSpaceId}>
              {create.isPending ? '書いています…' : '下書きを作る'}
            </Button>
          </div>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-list leading-relaxed text-foreground">
            「{done.page.title}」を下書きで作成しました。読んで直してから公開してください。
          </p>
          {done.open_questions.length > 0 && (
            <div className="rounded-card border border-warning-border bg-warning-surface px-3 py-2.5">
              <p className="mb-1 text-sub text-foreground">
                材料からは決められなかったことがあります（本文には書いていません）
              </p>
              <ul className="list-disc pl-4 text-sub leading-relaxed text-secondary-foreground">
                {done.open_questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-th text-muted-foreground">スペース</Label>
            <select
              value={effectiveSpaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              className={FIELD_CLASS}
            >
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-th text-muted-foreground">題</Label>
            <BufferedInput value={title} onCommit={setTitle} className={FIELD_CLASS} />
            <p className="text-sub-sm text-muted-foreground">
              空にすると、AI が会話から題を決めます。あとから直せます。
            </p>
          </div>

          <p className="text-sub leading-relaxed text-secondary-foreground">
            書き上がるまで少しかかります。できた下書きには「AI作成」が付き、
            人が直した分は次の下書きの改善に使われます。
          </p>
        </div>
      )}
    </Sheet>
  );
}
