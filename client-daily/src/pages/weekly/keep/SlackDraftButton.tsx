/**
 * 隔週キープの数字 — 「Slack の文面をコピー」
 *
 * サーバーがパックから組んだ定例投稿の文（`GET /dailyops/keep/slack-draft`・MCP の
 * `get_keep_slack_draft` と同じ）をクリップボードに入れる。Slack の bot 化（keep-report.md §6.2）
 * までのつなぎで、人が Slack に貼る。数字はこの画面と同じパック（凍結版があればそれ・`?live=1` ならいまの数字）。
 *
 * ── クリップボードは「押した勢い」で書く ──────────────────────
 * Safari は、通信を待ったあとの `writeText` を利用者の操作と見なさず拒む。`ClipboardItem` に
 * Promise を渡すと押した時点で権限を取り、文が届いてから書ける。それが無い・失敗したブラウザでは
 * 届いた文を `writeText` で書く（Chrome はこちらでも通る）。知らせるのは成功・失敗とも1回。
 */
import { MessageSquareText } from 'lucide-react';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { EntityScope } from '@gmo-onair/shared/src/keepReport/types';
import { Button } from '@/components/ui/button';
import { useKeepSlackDraft, type SegmentScope } from '@/lib/keepApi';

async function copyTextFrom(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function') {
    try {
      const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return;
    } catch {
      // 通信の失敗なら下の `await text` が同じ理由で投げる。クリップボードの都合なら writeText で書き直す
    }
  }
  await navigator.clipboard.writeText(await text);
}

export function SlackDraftButton({ meeting, entity, segment, live }: {
  meeting: string | null; entity: EntityScope; segment: SegmentScope; live: boolean;
}) {
  const draft = useKeepSlackDraft(meeting, entity, segment, live);

  const copy = async () => {
    try {
      await copyTextFrom(draft.mutateAsync().then((d) => d.text));
      notifySuccess('Slack の文面をコピーしました', {
        description: 'Slack の投稿欄に貼ってください。数字はこの画面と同じ定例報告パックから組んでいます',
      });
    } catch (e) {
      notifyApiError('Slack の文面をコピーできませんでした', e, '本文は「JSON を見る」からも取れます');
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!meeting || draft.isPending}>
      <MessageSquareText className="mr-1.5 h-4 w-4" aria-hidden="true" />Slack の文面をコピー
    </Button>
  );
}
