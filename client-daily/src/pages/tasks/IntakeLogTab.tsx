/**
 * メモ履歴 — 書き留めた文の全文と、そこから生まれたタスク（要件 D8「投入ログ」）
 *
 * ここは**あとから遡って見直す**場所。会社方針「AIを使い捨てにしない」の
 * 条件1（AI 出力を記録・保存）と条件2（人の修正を差分として残す）の器で、
 * 投げたテキストの全文が残っているので「なぜこの出力になったか」まで辿れる。
 *
 * ── 作り直しで変えたこと ────────────────────────────────────
 *
 * ① **行を `Row` に載せた。** 状態バッジ・種別・件数の幅が中身なりだったので、
 *    縦に並べると端がそろわなかった（`docs/design/v4/_rules.md` 1）。
 * ② **文字の大きさをトークンに戻した。** `text-[10px]` / `text-[11px]` /
 *    `text-xs` / `text-sm` の直書きをやめ、`text-badge` / `text-note` /
 *    `text-sub` / `text-list` にそろえる。
 * ③ **空・読み込み中・絞り込みゼロを共通の部品にした**（`EmptyState` ほか）。
 */
import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Row, RowHeader, RowMain, RowSlot, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { cn } from '@/lib/utils';
import { useTaskIntakes, useTaskIntake, formatDue, type TaskIntake } from '@/lib/tasksApi';

/**
 * ⚠️ **5つとも書くこと**（レビューでの指摘 #77）。前の版は録音の2つ
 * （`transcribing` / `failed`）が抜けており、`?? it.status` に落ちて
 * **画面に英語のまま**（`transcribing`）出ていました。
 * 応答は `as TaskIntake[]` で受けるので**型チェックには出ません**。
 */
const INTAKE_STATUS_LABELS: Record<string, string> = {
  pending: '確認待ち', committed: '登録済み', discarded: '破棄',
  transcribing: '文字起こし中', failed: '読み取り不可',
};
const INTAKE_STATUS_TONE: Record<string, string> = {
  pending: 'bg-info-surface text-info',
  committed: 'bg-success-surface text-success',
  discarded: 'bg-muted text-muted-foreground',
  transcribing: 'bg-warning-surface text-warning',
  failed: 'bg-destructive-surface text-destructive',
};
const INTAKE_KIND_LABELS: Record<string, string> = {
  freeform: 'ひとこと', minutes: '議事録', mail: 'メール', chat: 'チャット', other: 'その他',
};

export function IntakeLogTab() {
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useTaskIntakes({ all });

  if (isLoading) return <Delayed><SkeletonRows rows={5} /></Delayed>;
  const list = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-note text-muted-foreground">
        メモ本文は切り詰めずに全文残しています。タスクの元になった発言まで遡れます。
      </p>

      <div className="inline-flex w-fit shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="誰のメモを見るか">
        {([[false, '自分の分'], [true, '全員のぶん']] as const).map(([v, label], i) => (
          <button
            key={label}
            type="button"
            onClick={() => setAll(v)}
            aria-pressed={all === v}
            className={cn(
              'min-h-tap text-sub inline-flex items-center px-3.5 lg:min-h-[36px]',
              i > 0 && 'border-l border-border',
              all === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="まだメモがありません"
          description="案件管理アプリのトップの入力欄から書き留めると、ここに全文が残ります。"
        />
      ) : (
        <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
          <RowHeader>
            <RowSlot w={96}>状態</RowSlot>
            <RowMain>メモ本文</RowMain>
            <RowSlot w={72} hideOnMobile>種別</RowSlot>
            <RowSlot w={72} align="right" hideOnMobile>タスク</RowSlot>
            <RowSlot w={128} align="right">書き留めた日時</RowSlot>
            <RowSlot w={56} placeholder="" />
          </RowHeader>
          {list.map((it) => <IntakeRow key={it.id} it={it} onOpen={() => setOpenId(it.id)} />)}
        </div>
      )}

      {openId && <IntakeDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function IntakeRow({ it, onOpen }: { it: TaskIntake; onOpen: () => void }) {
  return (
    <Row divider interactive align="start" stackOnMobile className="p-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-[11px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RowSlot w={96}>
          <TableBadge
            label={INTAKE_STATUS_LABELS[it.status] ?? it.status}
            w={null}
            className={INTAKE_STATUS_TONE[it.status] ?? 'bg-muted text-muted-foreground'}
          />
        </RowSlot>
        <RowMain>
          <p className="text-list line-clamp-2 whitespace-pre-wrap">{it.raw_text}</p>
          <RowSub>
            {it.created_by_name && <span>{it.created_by_name}</span>}
            {it.status === 'pending' && (
              <span className="text-info"> ・ 確認待ちです。登録しないと相手には届きません</span>
            )}
            {/*
              **できなかった理由をここに出す。** 出さないと「録音したのに何も出てこない」で
              終わり、書き留めた本人は録り直すかどうかも決められない（サーバーは理由を返している）
            */}
            {it.status === 'failed' && (
              <span className="text-destructive">
                {it.error_message ?? '読み取れませんでした。もう一度書き留めてください'}
              </span>
            )}
          </RowSub>
        </RowMain>
        <RowSlot w={72} hideOnMobile>
          <span className="text-sub truncate text-muted-foreground">{INTAKE_KIND_LABELS[it.kind] ?? it.kind}</span>
        </RowSlot>
        <RowSlot w={72} align="right" hideOnMobile>
          <span className="font-number text-sub text-muted-foreground">{it.task_count}</span>
        </RowSlot>
        <RowSlot w={128} align="right">
          <span className="font-number text-sub text-muted-foreground">{formatDue(it.created_at)}</span>
        </RowSlot>
        <RowSlot w={56} align="right" placeholder="">
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </RowSlot>
      </button>
    </Row>
  );
}

function IntakeDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useTaskIntake(id);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>メモ本文</DialogTitle></DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /></div>
        ) : (
          <div className="space-y-3">
            <div className="text-note flex flex-wrap items-center gap-2 text-muted-foreground">
              <TableBadge
                label={INTAKE_STATUS_LABELS[data.status] ?? data.status}
                w={null}
                className={INTAKE_STATUS_TONE[data.status] ?? 'bg-muted text-muted-foreground'}
              />
              <span>{INTAKE_KIND_LABELS[data.kind] ?? data.kind}</span>
              <span className="font-number">{formatDue(data.created_at)}</span>
              {data.created_by_name && <span>{data.created_by_name}</span>}
            </div>
            <div>
              <Label className="text-th">メモ本文（全文）</Label>
              <p className="text-sub mt-1 whitespace-pre-wrap rounded-note border border-border bg-surface-subtle p-3">{data.raw_text}</p>
            </div>
            <div>
              <Label className="text-th">ここから生まれたタスク（{data.generated_tasks.length} 件）</Label>
              {data.generated_tasks.length === 0 ? (
                <p className="text-sub mt-1 text-muted-foreground">まだありません。</p>
              ) : (
                <div className="mt-1 flex flex-col gap-1.5">
                  {data.generated_tasks.map((t) => (
                    <div key={t.id} className="rounded-note border border-border p-2">
                      <p className="text-sub font-bold">{t.title}</p>
                      <p className="text-note mt-0.5 flex flex-wrap gap-x-3 text-muted-foreground">
                        <span>{t.assigned_to_name ?? '担当者未定'}</span>
                        <span className="font-number">{formatDue(t.due_at)}</span>
                        {t.gls_number && <span className="font-number">{t.gls_number}</span>}
                        {t.is_completed && <span className="text-success">対応済</span>}
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
