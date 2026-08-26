/**
 * スヌーズ（docs/core-redesign-plan.md §3-1）— 再開日付きで意図して寝かせる
 *
 * 「待ち」を独立の状態にすると (a)誰待ちか (b)いつまでか (c)抜ける条件 の3点で
 * 必ず破綻します（旧「お待たせ中」の症状そのもの）。だからスヌーズは
 * **未来の日付1つだけ**です。期日が来たらサーバー側の判定が勝手に普通へ戻るので、
 * 「解除し忘れて永久に眠る」案件は作れません。
 *
 * ── 案件一覧（要整理）と案件詳細ヘッダーの両方がこの1本を使う ────
 *
 * mutation を画面ごとに書くと invalidate の対（一覧・詳細・台帳）が
 * 片方だけ欠けて「直したのに古いまま」になります（client/CLAUDE.md の実例）。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';

/**
 * `PATCH /projects/:id/snooze`。`until` に日付で設定・`null` で解除。
 * **invalidate は3点セット**: 一覧（`projects`）・詳細（`project`,id）・台帳（`project-ledger`）。
 */
export function useSnooze(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (until: string | null) => api.patch(`/projects/${projectId}/snooze`, { until }),
    onSuccess: (_res, until) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-ledger'] });
      notifySuccess(
        until
          ? `${until.replace(/-/g, '/')} まで寝かせます。期日が来たら自動で普通の判定に戻ります`
          : 'スヌーズを解除しました',
      );
    },
    onError: (err) => notifyApiError('スヌーズを変更できませんでした', err),
  });
}

/** 「明日」の YYYY-MM-DD。サーバーも「JST で明日以降」を検査する（二重に守る） */
function tomorrowStr(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return localDateStr(t);
}

/** n 日後の YYYY-MM-DD（近道ボタン用） */
function afterDays(n: number): string {
  const t = new Date();
  t.setDate(t.getDate() + n);
  return localDateStr(t);
}

export function SnoozeDialog({
  open, onOpenChange, projectId, current,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  /** いま掛かっているスヌーズの再開日（YYYY-MM-DD）。無ければ null */
  current?: string | null;
}) {
  const [until, setUntil] = useState('');
  const snooze = useSnooze(projectId);

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setUntil('');
  };
  const submit = (value: string | null) =>
    snooze.mutate(value, { onSuccess: () => close(false) });

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="スヌーズ"
      sub="再開日まで停滞にも自動整理にも出しません。期日が来たら自動で戻ります。"
      size="sm"
      footer={
        <FormDialogFooter>
          {/* 解除は左に分ける（設定と並べると「どっちを押すと眠るのか」を毎回読むことになる） */}
          {current && (
            <Button variant="outline" className="sm:mr-auto" disabled={snooze.isPending} onClick={() => submit(null)}>
              スヌーズを解除
            </Button>
          )}
          <Button variant="outline" onClick={() => close(false)} disabled={snooze.isPending}>やめる</Button>
          <Button disabled={!until || snooze.isPending} onClick={() => submit(until)}>
            {snooze.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <AlarmClock className="mr-2 h-4 w-4" aria-hidden="true" />}
            この日まで寝かせる
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        {current && (
          <p className="text-sub text-muted-foreground">
            いまは {current.replace(/-/g, '/')} まで寝かせています。日付を選ぶと掛け直します。
          </p>
        )}
        <div>
          <Label htmlFor="snooze-until">再開日（明日以降）</Label>
          <Input
            id="snooze-until"
            type="date"
            min={tomorrowStr()}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="mt-1.5"
          />
        </div>
        {/* よく使う3つ。**無期限の選択肢は置かない**（無期限の待ちを作れなくするのが要点） */}
        <div className="flex flex-wrap gap-2">
          {([['1週間後', 7], ['2週間後', 14], ['1か月後', 30]] as const).map(([label, days]) => (
            <Button key={days} type="button" variant="outline" size="sm" onClick={() => setUntil(afterDays(days))}>
              {label}
            </Button>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
