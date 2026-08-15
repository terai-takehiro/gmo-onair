/**
 * 投入ログ — 後から遡ってレビューする画面（`TasksPage` の4つ目のタブ）
 *
 * **`TasksPage.tsx` から切り出したもの**（中身は移しただけ）。あの画面は
 * 1,000 行を超えていて、`scripts/check-file-size.mjs` が**足すことを止めます**
 * （「足すのではなく、分ける方向で直してください」）。ここは投入ログだけで
 * 完結しており、ほかのタブと共有しているのは `tasksApi` の型と `formatDue` だけです。
 */
import { useState } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTaskIntakes, useTaskIntake, formatDue, type TaskIntake } from '@/lib/tasksApi';

// ══════════════════════════════════════════════════
// 投入ログ — 後から遡ってレビューする画面
// ══════════════════════════════════════════════════

/**
 * ⚠️ **5つとも書くこと**（レビューでの指摘 #77）。前の版は録音の2つ
 * （`transcribing` / `failed`）が抜けており、`?? it.status` に落ちて
 * **投入ログに英語のまま**（`transcribing`）出ていました。
 * 応答は `as TaskIntake[]` で受けるので**型チェックには出ません**。
 */
const INTAKE_STATUS_LABELS: Record<string, string> = {
  pending: '確認待ち', committed: '登録済み', discarded: '破棄',
  transcribing: '文字起こし中', failed: '文字起こし失敗',
};
const INTAKE_KIND_LABELS: Record<string, string> = {
  freeform: 'ひとこと', minutes: '議事録', mail: 'メール', chat: 'チャット', other: 'その他',
};

export function IntakeLogTab() {
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useTaskIntakes({ all });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  const list = data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        投げたテキストは切り詰めずに全文残しています。タスクの元になった発言まで遡れます。
      </p>
      <div className="flex items-center gap-1.5 text-sm">
        <button onClick={() => setAll(false)} className={cn('rounded-md px-3 py-1.5', !all ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}>自分の投入</button>
        <button onClick={() => setAll(true)} className={cn('rounded-md px-3 py-1.5', all ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}>全員の投入</button>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          投入はまだありません。案件管理アプリのトップの投入欄から書き留められます。
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((it) => <IntakeRow key={it.id} it={it} onOpen={() => setOpenId(it.id)} />)}
        </div>
      )}

      {openId && <IntakeDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function IntakeRow({ it, onOpen }: { it: TaskIntake; onOpen: () => void }) {
  const pending = it.status === 'pending';
  return (
    <Card className={cn(pending && 'border-sky-200 bg-sky-50/40')}>
      <CardContent className="p-3">
        <button onClick={onOpen} className="w-full text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px]', pending && 'border-sky-300 text-sky-700')}>
              {INTAKE_STATUS_LABELS[it.status] ?? it.status}
            </Badge>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {INTAKE_KIND_LABELS[it.kind] ?? it.kind}
            </span>
            <span className="text-[11px] text-muted-foreground">タスク {it.task_count} 件</span>
            {it.created_by_name && <span className="text-[11px] text-muted-foreground">{it.created_by_name}</span>}
            <span className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground">
              {formatDue(it.created_at)}<ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm">{it.raw_text}</p>
        </button>
        {pending && (
          <p className="mt-1.5 text-[11px] text-sky-800">
            確認待ちです。登録しないと相手には届きません。案件管理アプリのトップから確認してください。
          </p>
        )}
        {/*
          **失敗した理由をここに出す。** 出さないと「録音したのに何も出てこない」で終わり、
          投げた本人は録り直すかどうかも決められない（サーバーは理由を返している）
        */}
        {it.status === 'failed' && (
          <p className="mt-1.5 text-[11px] text-destructive">
            {it.error_message ?? '文字起こしに失敗しました。もう一度投げ直してください'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IntakeDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useTaskIntake(id);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>投入の内容</DialogTitle></DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{INTAKE_STATUS_LABELS[data.status] ?? data.status}</Badge>
              <span>{INTAKE_KIND_LABELS[data.kind] ?? data.kind}</span>
              <span>{formatDue(data.created_at)}</span>
              {data.created_by_name && <span>{data.created_by_name}</span>}
            </div>
            <div>
              <Label className="text-xs">投げた原文（全文）</Label>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">{data.raw_text}</p>
            </div>
            <div>
              <Label className="text-xs">ここから生まれたタスク（{data.generated_tasks.length} 件）</Label>
              {data.generated_tasks.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">まだありません。</p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {data.generated_tasks.map((t) => (
                    <div key={t.id} className="rounded-lg border border-border p-2">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span>{t.assigned_to_name ?? '担当者未定'}</span>
                        <span>{formatDue(t.due_at)}</span>
                        {t.gls_number && <span>{t.gls_number}</span>}
                        {t.is_completed && <span className="text-emerald-700">完了</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>閉じる</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
