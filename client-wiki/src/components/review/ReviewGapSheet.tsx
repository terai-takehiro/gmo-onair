/**
 * 足りないページから「ページを作成」（段F・`docs/design/v4/wiki.md` §6-⑦・§7-2）
 *
 * 質問をそのまま題にした**下書き**を作ります。作り方は2つ:
 *
 *   ・**AI で下書きを作成** … 会話と ONAiR のデータを材料に AI が本文を書く
 *   ・**空のページを作成**   … 題だけ作って人が書く
 *
 * どちらも**下書き**です（公開は読んでから人が押す）。どちらで作っても
 * その質問は「ページにした」に変わり、一覧から消えます（行は残ります・§7-2）。
 *
 * ⚠️ 呼ぶ先は編集画面・「AI に聞く」と**同じ口**です
 * （`components/ai/aiApi.ts` の `createAiDraftPage`・
 *  `components/page/pageOpsApi.ts` の `createWikiPage`）。
 * 同じ URL を2つのファイルに持ちません（`client-wiki/CLAUDE.md`）。
 *
 * ⚠️ **AI が書いたことに人の名前を添えません**（`docs/wording.md` ルール1）。
 * 付く印は「AI作成」だけです。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { createAiDraftPage } from '@/components/ai/aiApi';
import { createWikiPage } from '@/components/page/pageOpsApi';
import BufferedInput from '@/components/editor/BufferedInput';
import { useWikiSpaces, wikiKeys } from '@/lib/wikiApi';
import { postGapResolve, reviewKeys, type ReviewGap } from './reviewApi';

const FIELD_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';

export interface ReviewGapSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gap: ReviewGap | null;
}

interface Made {
  pageId: string;
  title: string;
  /** 材料からは決められなかったこと（AI で作ったときだけ） */
  openQuestions: string[];
}

export default function ReviewGapSheet({ open, onOpenChange, gap }: ReviewGapSheetProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const spacesQ = useWikiSpaces({ enabled: open });
  const [spaceId, setSpaceId] = useState('');
  const [title, setTitle] = useState('');
  const [made, setMade] = useState<Made | null>(null);

  // 開き直すたびに、押した質問に合わせて入れ直す（前の質問の入力を引きずらない）
  useEffect(() => {
    if (!open || !gap) return;
    setSpaceId(gap.space_id ?? '');
    setTitle(gap.question);
    setMade(null);
  }, [open, gap]);

  const spaces = spacesQ.data ?? [];
  const effectiveSpaceId = spaceId || spaces[0]?.id || '';
  const space = spaces.find((s) => s.id === effectiveSpaceId);

  const done = (m: Made) => {
    setMade(m);
    void qc.invalidateQueries({ queryKey: reviewKeys.all });
    void qc.invalidateQueries({ queryKey: wikiKeys.home() });
    if (space?.key) void qc.invalidateQueries({ queryKey: wikiKeys.tree(space.key) });
    notifySuccess('下書きを作成しました', { description: `${m.title}（公開はまだです）` });
  };

  const withAi = useMutation({
    meta: { action: 'AI の下書きの作成' },
    mutationFn: () => createAiDraftPage({
      space_id: effectiveSpaceId,
      title: title.trim() || undefined,
      thread_id: gap?.thread_id ?? null,
      gap_id: gap?.id ?? null,
    }),
    onSuccess: (result) => done({
      pageId: result.page.id,
      title: result.page.title,
      openQuestions: result.open_questions ?? [],
    }),
  });

  const blank = useMutation({
    meta: { action: 'ページの作成' },
    mutationFn: async () => {
      const page = await createWikiPage({ space_id: effectiveSpaceId, title: title.trim() || '（題のないページ）' });
      // ページを作った側から質問に結びつける（§7-2。AI の口は `gap_id` で自動で結ぶ）
      if (gap) await postGapResolve(gap.id, 'written', page.id);
      return page;
    },
    onSuccess: (page) => done({ pageId: page.id, title: page.title, openQuestions: [] }),
  });

  const busy = withAi.isPending || blank.isPending;
  const ready = !!effectiveSpaceId && !busy;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="この質問からページを作成"
      sub="答えられなかった質問を題にした下書きを作ります。公開は読んでから人が押します"
      size="md"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !made) withAi.mutate();
      }}
      footer={made ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
          <Button
            type="button"
            onClick={() => { onOpenChange(false); navigate(`/p/${made.pageId}/edit`); }}
          >
            下書きを開く
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!ready}
            onClick={() => blank.mutate()}
          >
            空のページを作成
          </Button>
          <Button type="submit" disabled={!ready}>
            {withAi.isPending ? '書いています…' : 'AI で下書きを作成'}
          </Button>
        </div>
      )}
    >
      {made ? (
        <div className="flex flex-col gap-3">
          <p className="text-list leading-relaxed text-foreground">
            「{made.title}」を下書きで作成しました。読んで直してから公開してください。
            公開すると、次からこの質問には出典つきで答えられます。
          </p>
          {made.openQuestions.length > 0 && (
            <div className="rounded-card border border-warning-border bg-warning-surface px-3 py-2.5">
              <p className="mb-1 text-sub text-foreground">
                材料からは決められなかったことがあります（本文には書いていません）
              </p>
              <ul className="list-disc pl-4 text-sub leading-relaxed text-secondary-foreground">
                {made.openQuestions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-note border border-border bg-surface-subtle px-3 py-2.5">
            <p className="text-th text-muted-foreground">答えられなかった質問</p>
            <p className="mt-1 text-list leading-relaxed text-foreground">{gap?.question}</p>
            <p className="mt-1 text-sub-sm text-muted-foreground">
              これまで {gap?.count ?? 0}回 聞かれています
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-th text-muted-foreground" htmlFor="review-gap-space">スペース</Label>
            <select
              id="review-gap-space"
              value={effectiveSpaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              className={FIELD_CLASS}
            >
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-th text-muted-foreground" htmlFor="review-gap-title">題</Label>
            <BufferedInput id="review-gap-title" value={title} onCommit={setTitle} className={FIELD_CLASS} />
            <p className="text-sub-sm text-muted-foreground">
              質問をそのまま入れてあります。あとから直せます。
            </p>
          </div>

          <p className="text-sub leading-relaxed text-secondary-foreground">
            「AI で下書きを作成」は書き上がるまで少しかかります。できた下書きには「AI作成」が付き、
            人が直した分は次の下書きの改善に使われます。
          </p>
        </div>
      )}
    </Sheet>
  );
}
