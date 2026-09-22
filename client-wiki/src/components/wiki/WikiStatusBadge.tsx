/**
 * ページの状態のバッジ（下書き／公開／非表示 ＋ 見直し期限切れ ＋ AI作成）
 *
 * モック `Page.dc.html` のバッジは「淡い面 ＋ その色の濃い文字」で、`Badge` の
 * 既定（塗りつぶし ＋ 白文字）とは別。面は `*-surface`、文字は状態の色を当てる
 * （`text-*-foreground` は塗りの上に載せる白なので、淡い面に載せると読めない）。
 */
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import type { WikiPageStatus } from '@gmo-onair/shared/src/wiki/types';
import { isOverdue } from '@/lib/wikiFormat';

const TONE = {
  draft:    { label: '下書き', cls: 'border-warning-border bg-warning-surface text-warning' },
  published:{ label: '公開',   cls: 'border-success-border bg-success-surface text-success' },
  archived: { label: '非表示', cls: 'border-border bg-muted text-muted-foreground' },
  overdue:  { label: '期限切れ', cls: 'border-destructive-border bg-destructive-surface text-destructive' },
  ai:       { label: 'AI作成', cls: 'border-ai-border bg-ai-surface text-ai' },
} as const;

/**
 * 公開なのに見直し期限が切れていれば「期限切れ」を優先して出す。
 * 2つ並べると行が横に伸びるうえ、読み手にとって重いのは期限切れのほうなので1つに絞る。
 */
export default function WikiStatusBadge({
  status,
  reviewBy,
  className,
}: {
  status: WikiPageStatus;
  reviewBy?: string | null;
  className?: string;
}) {
  const t = status === 'published' && isOverdue(reviewBy) ? TONE.overdue : TONE[status];
  return <TableBadge label={t.label} w={null} variant="outline" className={`${t.cls} ${className ?? ''}`} />;
}

/** AI が下書きしたページ・版に付ける（docs/wording.md ルール1） */
export function WikiAiBadge({ className }: { className?: string }) {
  return <TableBadge label={TONE.ai.label} w={null} variant="outline" className={`${TONE.ai.cls} ${className ?? ''}`} />;
}
