/**
 * ウィークリー活動報告 — 総括 (2026-09 の再設計)
 *
 * ── 「AI の要約」から「総括」へ ──────────────────────────────
 *
 * 見出しが「AI の要約」で、空のときは「AI の要約はまだありません」、
 * 作る操作は「AI下書きを作る」と、**画面の主語が AI になっていた**。
 * 読む人が必要とするのは中身であって生成元ではないので、見出しは内容の名前
 * （総括）にし、AI の関与は本文下の**署名**（AI下書き／確定者）へ集約した。
 *
 * ⚠️ **編集の入口は必ず残すこと。** 会社方針「AIを使い捨てにしない」の条件2
 * （人間の修正を差分として残す）は、確定時に AI 下書きと確定本文を突き合わせて
 * `ai_corrections` に記録する仕組みで満たしている。**画面から直せなくなると、
 * 記録される差分が常に「無修正」になり、条件2が形だけになる。**
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Pencil, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { OpsReport } from '@/lib/types';

/** AI が起票・下書きしたレポートか（印は `created_by` / `requested_by` の2つだけ） */
function isAiDrafted(report: OpsReport): boolean {
  return report.created_by === 'mcp-claude' || !!report.requested_by;
}

export function SummarySection({ report, editable, onSave, savePending, onDraftAi, draftAiPending }: {
  report: OpsReport;
  editable: boolean;
  onSave: (body: string) => void;
  savePending: boolean;
  onDraftAi: () => void;
  draftAiPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(report.body);

  const startEdit = () => { setDraft(report.body); setEditing(true); };

  if (editing) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} className="text-sub" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDraft(report.body); setEditing(false); }}>
              キャンセル
            </Button>
            <Button size="sm" disabled={savePending} onClick={() => { onSave(draft); setEditing(false); }}>保存</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report.body) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
          <p className="text-cardtitle">まだ総括がありません</p>
          {editable ? (
            <>
              {/* **AI未設定の環境ではボタンが出ない**ので、出ない操作を案内しない */}
              <p className="text-sub max-w-lg text-muted-foreground">
                {report.ai_available
                  ? '主要指標は集計済みです。AI下書きを作成して編集するか、最初から入力してください。'
                  : '主要指標は集計済みです。総括を入力してください。'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {report.ai_available && (
                  <Button onClick={onDraftAi} disabled={draftAiPending}>
                    {draftAiPending
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    AI下書きを作成
                  </Button>
                )}
                <Button variant="outline" onClick={startEdit}>
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />直接入力する
                </Button>
              </div>
              {report.ai_available && (
                <p className="text-sub-sm text-muted-foreground">
                  AI下書きは確定前に何度でも編集できます。編集内容は差分として記録されます。
                </p>
              )}
            </>
          ) : (
            <p className="text-sub text-muted-foreground">この週は確定済みのため、追記できません。</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="md-body text-sub leading-relaxed">
          <ReactMarkdown>{report.body}</ReactMarkdown>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-faint pt-3">
          {isAiDrafted(report) && (
            <span className="text-sub-sm inline-flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-ai" aria-hidden="true" />AI下書き
            </span>
          )}
          {report.published_at && (
            <span className="text-sub-sm text-muted-foreground">
              {report.reviewed_by_name ? `${report.reviewed_by_name}が確定` : '確定済み'}
              <span className="font-number">（{new Date(report.published_at).toLocaleString('ja-JP')}）</span>
            </span>
          )}
          <span className="flex-1" />
          {editable && (
            <span className="flex gap-2">
              {report.ai_available && (
                <Button variant="ghost" size="sm" onClick={onDraftAi} disabled={draftAiPending}>
                  {draftAiPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-ai" aria-hidden="true" />}
                  AI下書きで作り直す
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />編集
              </Button>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
