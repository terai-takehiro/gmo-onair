/**
 * デイリーニュース報告 — スマホ版カード（v4ネイティブUI監査 2026-08-20 で追加）
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の `NewsRow`（`./NewsRows.tsx`）は `RowSlot(hideOnMobile)` で
 * メモ・記入者列を落として `RowSub` に詰め込むだけの表縮小で、スマホ専用の
 * カード型レイアウトになっていなかった（`docs/v4-native-ui-audit-2026-08-20.md` 指摘）。
 * `production/pages/holds/HoldCards.tsx` と同じ考え方で、
 * **列を消すのではなくカードとして組み直す**:
 *
 *   1行目  注目度・AIの話題・分類のバッジを横に並べる（PC は3列に分けていたもの）
 *   2行目  要約（PC の `RowMain` と同じ全文）
 *   3行目  メモ・記入者（PC が `hideOnMobile` で落としていた2列。
 *          外で受付する人にも要る情報なのでスマホでも出す）
 *   4行目  ウィークリー活動報告へ送る・編集・削除（`canEdit` のときだけ）
 *
 * 注目度・ウィークリー活動報告へ送る・削除・編集の保存という業務ロジックは
 * `./NewsRows.tsx` の `useNewsRowActions` を共有する。**写すと PC と
 * スマホで挙動がずれる**（この画面のコメント冒頭に書いてある実際の前科）。
 *
 * ── 左スワイプでも削除できる（M11） ─────────────────────────
 *
 * 下端の削除ボタンはそのまま残し、`SwipeAction` でもう1つの入り口を足した。
 * 呼ぶのは同じ `remove`（`useNewsRowActions` 由来）— 新しい業務ロジックは無い
 */
import { Bot, CheckCheck, ExternalLink, Pencil, Send, Trash2 } from 'lucide-react';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { SwipeAction } from '@gmo-onair/shared/src/client-v4/swipeAction';
import { Button } from '@/components/ui/button';
import type { OpsReportItem } from '@/lib/types';
import { useNewsRowActions } from './NewsRows';
import { NewsForm } from './NewsForm';

export function NewsCards({ items, canEdit, weeklyLocked }: {
  items: OpsReportItem[];
  canEdit: boolean;
  /** 送り先の週報が確定済み。**押す前に止める**（サーバーも断る） */
  weeklyLocked: boolean;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <NewsCard item={item} canEdit={canEdit} weeklyLocked={weeklyLocked} />
        </li>
      ))}
    </ul>
  );
}

function NewsCard({ item, canEdit, weeklyLocked }: {
  item: OpsReportItem;
  canEdit: boolean;
  weeklyLocked: boolean;
}) {
  const {
    editing, setEditing, toWeekly, sendPending, setPick, remove, saveEdit, updatePending,
  } = useNewsRowActions(item);

  return (
    <>
      <SwipeAction actions={canEdit ? [
        { label: '削除', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'danger', onAction: remove },
      ] : []}>
        <div className="rounded-card flex flex-col gap-2 border border-border bg-card p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit ? (
              <select
                className="text-sub-sm min-h-tap rounded-badge border border-border bg-background px-2 text-center"
                value={item.pick ?? ''}
                onChange={(e) => setPick(e.target.value ? Number(e.target.value) : null)}
                aria-label="注目度（1〜5）"
              >
                <option value="">注目度 —</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>注目度 {n}</option>)}
              </select>
            ) : item.pick != null ? (
              <TableBadge label={`注目度 ${item.pick}`} w={null} className="bg-primary-surface text-primary" />
            ) : null}
            {item.ai_related && (
              <TableBadge label="AIの話題" w={null} className="border-ai-border bg-ai-surface text-ai" />
            )}
            {item.category && (
              <TableBadge label={item.category} w={null} className="bg-muted text-muted-foreground" />
            )}
          </div>

          <p className="text-list whitespace-pre-wrap">
            {item.content}
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex align-middle text-primary"
                title={item.url}
                aria-label="元の記事を開く"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </p>

          {(item.note || item.recorded_by) && (
            <p className="text-sub inline-flex flex-wrap items-center gap-1 text-muted-foreground">
              {[item.note, item.recorded_by].filter(Boolean).join(' ・ ')}
              {item.source === 'ai' && <Bot className="h-3 w-3 shrink-0 text-ai" aria-label="AI作成" />}
            </p>
          )}

          {canEdit && (
            <div className="mt-1 flex gap-2 border-t border-border-faint pt-2.5">
              <Button
                variant="outline" size="sm"
                className={`min-h-tap flex-1 ${item.sent_to_weekly ? 'text-success' : ''}`}
                disabled={item.sent_to_weekly || weeklyLocked || sendPending}
                onClick={toWeekly}
                title={item.sent_to_weekly
                  ? 'この行はウィークリー活動報告へ送り済みです'
                  : weeklyLocked
                    ? 'この週のウィークリー活動報告は確定済みです。その画面で「確定を取り消す」を押すと送れます'
                    : 'この日が入る週のウィークリー活動報告へ写します'}
              >
                {item.sent_to_weekly
                  ? <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
                  : <Send className="mr-1 h-4 w-4" aria-hidden="true" />}
                {item.sent_to_weekly ? '送り済み' : '報告へ送る'}
              </Button>
              <Button variant="outline" size="icon" className="min-h-tap" onClick={() => setEditing(true)} aria-label="編集">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="icon" className="min-h-tap text-destructive" onClick={remove} aria-label="削除">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </SwipeAction>

      {editing && (
        <NewsForm
          initial={{
            category: item.category,
            content: item.content,
            note: item.note,
            url: item.url,
            ai_related: !!item.ai_related,
          }}
          onCancel={() => setEditing(false)}
          onSubmit={saveEdit}
          submitting={updatePending}
        />
      )}
    </>
  );
}
