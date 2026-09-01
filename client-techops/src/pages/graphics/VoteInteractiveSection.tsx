// テロップCG — 投票・クイズページ（`partKey === 'vote'`）フォームの、`question`/`choices`欄の
// 下に足す専用セクション（段6-6 締切連動・段6-7 外部インタラクティブ連携）。
// `PageFormDialog.tsx` から呼ぶ（400行規律のため切り出し・`ImageFieldEditor.tsx` と同じ立ち位置）。
//
// 3つ扱う:
//   ①「自動締切までの秒数」— `fields.countdownSeconds`（`voteInteractive.ts` の
//     `readCountdownSeconds`/`withCountdownSeconds`。未入力＝自動締切なし）
//   ② 外部連携の状態表示（`readInteractiveQuestionId`）
//   ③「外部インタラクティブと同期」／「外部連携を解除」ボタン
//     （`syncInteractiveVote`/`dismissInteractiveVote`・`graphicsInteractiveApi.ts`）
//
// **新規作成中（`pageId` が無い）は②③を案内表示のみにする**（`ImageFieldEditor.tsx` と
// 同じ理由 — サーバー側のエンドポイントがページIDに紐づくため、保存後の編集時だけ使える）。
//
// ⚠️ テンプレートから作った投票ページ（`templateLocked`）は、`countdownSeconds` が
// テンプレートの `publicFields`（`pageFields.ts` の def にしか無い）に含められないため、
// ここで入力してもフォーム保存では反映されない（`savePageForm.ts` の `pickPublicFields` が
// 送信直前に落とす——サーバーへは届かないだけで 400 にはならない）。誤解させないよう
// 欄自体を無効化し、理由を添える。
import { useState } from 'react';
import { Link2, Loader2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  readCountdownSeconds, withCountdownSeconds, readInteractiveQuestionId, readOpenedAt,
} from './voteInteractive';
import { syncInteractiveVote, dismissInteractiveVote } from '@/lib/graphicsInteractiveApi';

export function VoteInteractiveSection({
  fields, setFields, pageId, countdownLocked = false,
}: {
  fields: Record<string, unknown>;
  setFields: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  /** 保存済みページのID。null＝まだ保存されていない新規作成中（外部同期は不可） */
  pageId: string | null;
  /** テンプレート由来（作成中を含む）で、`countdownSeconds` の変更が保存されない状態 */
  countdownLocked?: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const countdown = readCountdownSeconds(fields);
  const questionId = readInteractiveQuestionId(fields);
  const openedAt = readOpenedAt(fields);

  const handleCountdownChange = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setFields((prev) => withCountdownSeconds(prev, null));
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return;
    setFields((prev) => withCountdownSeconds(prev, Math.floor(n)));
  };

  const handleSync = async () => {
    if (!pageId || syncing) return;
    setSyncing(true);
    try {
      const result = await syncInteractiveVote(pageId);
      setFields((prev) => ({ ...prev, interactiveQuestionId: result.interactiveQuestionId }));
      notifySuccess('外部インタラクティブと同期しました');
    } catch {
      notifyError('外部インタラクティブと同期できませんでした', {
        description: 'プロジェクトの連携設定（接続先URL・APIキー・イベントID）を確認してください',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDismiss = async () => {
    if (!pageId || dismissing) return;
    setDismissing(true);
    try {
      await dismissInteractiveVote(pageId);
      setFields((prev) => {
        const next = { ...prev };
        delete next.interactiveQuestionId;
        return next;
      });
      notifySuccess('外部連携を解除しました');
    } catch {
      notifyError('外部連携を解除できませんでした');
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface-subtle/40 p-3">
      <p className="text-list font-bold">締切連動・外部インタラクティブ連携（任意）</p>

      <div>
        <Label htmlFor="graphics-field-countdownSeconds">自動締切までの秒数（任意）</Label>
        <Input
          id="graphics-field-countdownSeconds"
          type="number"
          min={1}
          className="mt-1 min-h-[44px] w-40"
          value={countdown ?? ''}
          disabled={countdownLocked}
          onChange={(e) => handleCountdownChange(e.target.value)}
          placeholder="未入力＝自動締切なし"
        />
        {countdownLocked ? (
          <p className="mt-1 text-note text-muted-foreground">
            テンプレートから作るページでは、この欄はテンプレートの公開フィールドではないため保存できません。
          </p>
        ) : (
          <p className="mt-1 text-note text-muted-foreground">
            「続き」で投票を開始してからこの秒数後、自動で締切（開票）します。
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {questionId ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-control bg-info-surface px-2 text-note font-bold text-info">
            <Link2 className="h-3 w-3" aria-hidden="true" />外部連携済み
          </span>
        ) : (
          <span className="text-note text-muted-foreground">外部インタラクティブとは未連携</span>
        )}
        {openedAt && (
          <span className="text-note text-muted-foreground">
            開始時刻: {new Date(openedAt).toLocaleString('ja-JP')}
          </span>
        )}
      </div>

      {!pageId ? (
        <p className="rounded-note border border-dashed border-border bg-surface-subtle px-3 py-2 text-sub text-muted-foreground">
          ページを保存すると外部インタラクティブと同期できます。まずは他の項目を入力して保存してください。
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button" variant="outline" className="min-h-[44px] gap-1.5"
            onClick={() => void handleSync()} disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            外部インタラクティブと同期
          </Button>
          {questionId && (
            <Button
              type="button" variant="outline" className="min-h-[44px] gap-1.5 text-destructive"
              onClick={() => void handleDismiss()} disabled={dismissing}
            >
              {dismissing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlink className="h-4 w-4" aria-hidden="true" />}
              外部連携を解除
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
