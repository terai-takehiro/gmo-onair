/**
 * ページの状態のバッジ（下書き／公開／非表示 ＋ 要見直し ＋ AI作成）
 *
 * ⚠️ **Wiki のページは「期限切れ」にならない**（2026-09-22 のご指摘）。
 * 見直し予定日を過ぎても中身が無効になるわけではないので、赤（異常）ではなく
 * 情報の色で「要見直し」と出す。
 *
 * モック `Page.dc.html` のバッジは「淡い面 ＋ その色の濃い文字」で、`Badge` の
 * 既定（塗りつぶし ＋ 白文字）とは別。面は `*-surface`、文字は状態の色を当てる
 * （`text-*-foreground` は塗りの上に載せる白なので、淡い面に載せると読めない）。
 *
 * ⚠️ **`TableBadge` は一覧の列の中でだけ使う。** `w={null}` で渡すと包みが
 *    `min-w-0` になり、`RowSlot` のような幅の決まった親が無い所（見出しの行など）では
 *    **中身より縮んで文字が切れる**（実ブラウザで4字のバッジが「要…」になった）。
 *    列の外では自然な幅の `span` で出す。
 */
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import type { WikiPageStatus } from '@gmo-onair/shared/src/wiki/types';
import { isOverdue } from '@/lib/wikiFormat';
import { cn } from '@/lib/utils';

const TONE = {
  draft:    { label: '下書き',   cls: 'border-warning-border bg-warning-surface text-warning' },
  published:{ label: '公開',     cls: 'border-success-border bg-success-surface text-success' },
  archived: { label: '非表示',   cls: 'border-border bg-muted text-muted-foreground' },
  overdue:  { label: '要見直し', cls: 'border-info-border bg-info-surface text-info' },
  ai:       { label: 'AI作成',   cls: 'border-ai-border bg-ai-surface text-ai' },
} as const;

/** 列の外で使う自然な幅のバッジ。寸法はモックの実測（高さ 21px・最小 56px・角丸 6px） */
function Chip({ tone, className }: { tone: { label: string; cls: string }; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[21px] min-w-[56px] shrink-0 items-center justify-center',
        'whitespace-nowrap rounded-badge border px-2 text-badge',
        tone.cls,
        className,
      )}
    >
      {tone.label}
    </span>
  );
}

/**
 * 公開ページで見直し予定日を過ぎていれば「要見直し」を優先して出す。
 * 2つ並べると行が横に伸びるうえ、読み手が動くきっかけになるのは「要見直し」なので1つに絞る。
 *
 * `column` は **`<RowSlot>` の中に置くとき**だけ true にする（幅をそろえるため
 * `TableBadge` を使う）。
 */
export default function WikiStatusBadge({
  status,
  reviewBy,
  column,
  className,
}: {
  status: WikiPageStatus;
  reviewBy?: string | null;
  column?: boolean;
  className?: string;
}) {
  const tone = status === 'published' && isOverdue(reviewBy) ? TONE.overdue : TONE[status];
  if (column) {
    return <TableBadge label={tone.label} w={null} variant="outline" className={cn(tone.cls, className)} />;
  }
  return <Chip tone={tone} className={className} />;
}

/** AI が下書きしたページ・版に付ける（docs/wording.md ルール1） */
export function WikiAiBadge({ className }: { className?: string }) {
  return <Chip tone={TONE.ai} className={className} />;
}
