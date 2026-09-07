/**
 * ウィークリー活動報告 — AI の要約カード。**確定前だけ直せる**（編集トグル）。
 *
 * 直せる手段が無いと、AI下書きの確定時の差分記録
 * （会社方針「AIを使い捨てにしない」条件2）が常に「無修正」にしかならない —
 * この編集入口はその条件を実質的に満たすための必須の器（見た目の親切さだけではない）。
 *
 * `WeeklyDetailPage.tsx` から切り出し（1ファイル400行の上限のため）。
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Pencil, Sparkles } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { OpsReport } from '@/lib/types';

export function AiSummaryCard({ report, editable, onSave, savePending }: {
  report: OpsReport; editable: boolean; onSave: (body: string) => void; savePending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(report.body);

  if (editing) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="text-sub"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDraft(report.body); setEditing(false); }}>
              キャンセル
            </Button>
            <Button
              size="sm"
              disabled={savePending}
              onClick={() => { onSave(draft); setEditing(false); }}
            >
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        {report.body ? (
          <>
            <div className="md-body text-sub leading-relaxed">
              <ReactMarkdown>{report.body}</ReactMarkdown>
            </div>
            {editable && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setDraft(report.body); setEditing(true); }}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />直す
              </Button>
            )}
          </>
        ) : (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<Sparkles />}
            title="AI の要約はまだありません"
            description="上の「AI下書きを作る」を押すか、急ぐときは下のトピックに人の言葉で書いてください。"
          />
        )}
      </CardContent>
    </Card>
  );
}
