/**
 * 「自分が担当のページで、見直し予定日を過ぎているもの」（§6-①）
 *
 * ⚠️ **「期限切れ」とは言わない**（2026-09-22 のご指摘）。Wiki のページは予定日を
 * 過ぎても中身が無効になるわけではないので、色も赤（異常）ではなく注意の色にする。
 *
 * **0件なら何も出さない。** 読み込み中・失敗のときも出さない — ホームを開くたびに
 * 場所だけ取る空の案内が出ると、下にある一覧の位置が毎回ずれる。
 * 見直しの画面（§6-⑦）は段F なので、ここからはページに直接移る。
 */
import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WikiReviewRow } from '@gmo-onair/shared/src/wiki/types';
import { reviewByLabel } from '@/lib/wikiFormat';

export default function OverdueNotice({ rows }: { rows: WikiReviewRow[] | undefined }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-note border border-warning-border bg-warning-surface px-3 py-2.5 sm:flex-row sm:items-center">
      <span className="flex items-center gap-2 text-list text-warning">
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        あなたが担当のページで、見直し予定日を過ぎているものが {rows.length}件あります
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {rows.slice(0, 3).map((p) => (
          <Link
            key={p.id}
            to={`/p/${p.id}`}
            className="max-w-full truncate text-sub text-warning underline underline-offset-2"
          >
            {p.title}（{reviewByLabel(p.review_by)}）
          </Link>
        ))}
        {rows.length > 3 && (
          <span className="text-sub text-muted-foreground">ほか {rows.length - 3}件</span>
        )}
      </span>
    </div>
  );
}
