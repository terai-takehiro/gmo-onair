// AIナレッジ1件のカード — 本文・由来（自動起草/人が作成）・状態に応じた操作ボタン。
//
// 操作ボタンは manager だけに出す（reader は読むだけ。ページ側で出し分ける）。
// 確認は素の confirm() — client-techops は ConfirmHost 未設置のアプリで、
// confirmAction() は器が無いと何も表示せず false を返すだけのため
// （`AudioShareDialog.tsx` と同じ判断）。
import { Bot, CheckCircle2, UserRound, Archive, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { kindLabel, STATUS_LABELS, type KnowledgeRow, type KnowledgeStatus } from './knowledgeApi';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** 自動起草の根拠（修正傾向の集計）を1行にまとめる。evidence が無ければ null */
function evidenceSummary(row: KnowledgeRow): string | null {
  const e = row.evidence;
  if (!e || !e.field_path) return null;
  const parts: string[] = [`対象フィールド: ${e.field_path}`];
  if (typeof e.corrections === 'number') parts.push(`修正 ${e.corrections} 件`);
  const breakdown = [
    typeof e.fix === 'number' ? `fix ${e.fix}` : null,
    typeof e.enrich === 'number' ? `enrich ${e.enrich}` : null,
    typeof e.reject === 'number' ? `reject ${e.reject}` : null,
  ].filter(Boolean);
  if (breakdown.length) parts.push(`内訳 ${breakdown.join(' / ')}`);
  if (typeof e.share === 'number') parts.push(`修正率 ${Math.round(e.share * 100)}%`);
  return parts.join('・');
}

const STATUS_BADGE_VARIANT: Record<KnowledgeStatus, 'warning' | 'success' | 'secondary'> = {
  draft: 'warning',
  active: 'success',
  retired: 'secondary',
};

interface Props {
  row: KnowledgeRow;
  /** qsheet manager 以上か（false なら操作ボタンを一切出さない） */
  canManage: boolean;
  /** 状態変更のAPI呼び出し中か。承認は rev を進める操作なので、全カード一律で二度押しを防ぐ */
  busy: boolean;
  onChangeStatus: (row: KnowledgeRow, status: KnowledgeStatus) => void;
}

export default function KnowledgeCard({ row, canManage, busy, onChangeStatus }: Props) {
  const summary = evidenceSummary(row);

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      {/* 見出し行: 対象機能・状態・由来 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{kindLabel(row.kind)}</Badge>
        {row.segment_key && <Badge variant="outline">型: {row.segment_key}</Badge>}
        <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
        {row.origin === 'auto' ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            自動起草（月次AIレビュー）
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            人が作成
          </span>
        )}
      </div>

      {/* ルール文そのもの（プロンプトに載る本文） */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.body}</p>

      {/* 由来: 自動起草は「なぜこの案が出たか」（rationale）と元になった修正傾向（evidence）を見せる。
          承認判断に必要な情報はこの2つで全部（04-ai.md §6-3 育て方1） */}
      {(row.rationale || summary) && (
        <div className="mt-2 space-y-0.5 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
          {row.rationale && <p>{row.rationale}</p>}
          {summary && <p>元になった修正傾向: {summary}</p>}
        </div>
      )}

      {/* 履歴情報 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>作成 {formatDateTime(row.created_at)}</span>
        {row.status === 'active' && row.approved_at && <span>承認 {formatDateTime(row.approved_at)}</span>}
        {row.rev > 0 && <span>rev {row.rev}</span>}
      </div>

      {canManage && row.status !== 'retired' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.status === 'draft' && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onChangeStatus(row, 'active')}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                承認して有効にする
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus(row, 'retired')}>
                <XCircle className="mr-1 h-4 w-4" />
                却下
              </Button>
            </>
          )}
          {row.status === 'active' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus(row, 'retired')}>
              <Archive className="mr-1 h-4 w-4" />
              引退させる
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
