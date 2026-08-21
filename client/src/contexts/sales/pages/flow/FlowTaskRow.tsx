/**
 * 工程1本ぶんの行（⑦ 標準工程テンプレート）
 *
 * ── 直すときだけ入力欄を出す ────────────────────────────────
 *
 * 26 本すべてに入力欄を並べると、**読む画面としては使えなくなります**
 * （どれが今の値でどれが打ちかけか分からない）。ふだんは読む形で並べ、
 * 「直す」を押した行だけ入力欄に変わります。
 *
 * ── 職種は選ぶ形にする（自由入力にしない）──────────────────
 *
 * 「テクニカル」「技術」「Tech」と揺れると、あとで職種で絞り込めません。
 * `ROLES` の4つから選ぶ形にしてあります。**外す（担当を決めない）ことも
 * できる** — モックの 26 本のうち何本かは担当が書かれていません。
 *
 * ── 日数は符号つきの1つの数で持つ ──────────────────────────
 *
 * 「実施日の 60 日前」を「前／後」の選択と 60 という数の2つで持つと、
 * **前を選んだまま -60 と入れて 60 日後になる**という取り違えが起きます。
 * 入れるのは符号つきの数1つだけにして、読める文（「実施日 -60 日」）を
 * その場に出します。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { ROLES, ROLE_TONE, type FlowAnchor, type FlowTask } from './flowTypes';

/** 「実施日 -60 日」— サーバーの `describeOffset` と同じ言い回し */
function describeOffset(anchor: FlowAnchor, days: number): string {
  if (anchor === 'intake') return days === 0 ? '受付の当日' : `受付から ${days} 日`;
  if (days === 0) return '実施日 当日';
  return `実施日 ${days > 0 ? '+' : '-'}${Math.abs(days)} 日`;
}

export function FlowTaskRow({ task, canEdit }: { task: FlowTask; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [role, setRole] = useState<string | null>(task.role);
  const [anchor, setAnchor] = useState<FlowAnchor>(task.anchor);
  const [days, setDays] = useState(String(task.offset_days));
  const [required, setRequired] = useState(task.is_required);

  const done = () => { qc.invalidateQueries({ queryKey: ['flow-templates'] }); setEditing(false); };

  const save = useMutation({
    mutationFn: () => api.put(`/flow-templates/tasks/${task.id}`, {
      title: title.trim(),
      role,
      anchor,
      // 空欄・記号だけのときは 0 にする（NaN を送るとサーバーが無視して黙って変わらない）
      offset_days: Number.isFinite(Number(days)) ? Number(days) : 0,
      is_required: required,
    }),
    onSuccess: done,
    onError: (e) => notifyApiError('直せませんでした', e),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/flow-templates/tasks/${task.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow-templates'] }),
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const start = () => {
    setTitle(task.title);
    setRole(task.role);
    setAnchor(task.anchor);
    setDays(String(task.offset_days));
    setRequired(task.is_required);
    setEditing(true);
  };

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2.5 border-b border-border-faint bg-surface-subtle px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) save.mutate(); }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="工程の名前" />

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-th w-16 shrink-0 text-muted-foreground">担当の職種</span>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(role === r ? null : r)}
              className={cn(
                'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                role === r ? cn('border-transparent', ROLE_TONE[r]) : 'border-border bg-card text-muted-foreground',
              )}
            >
              {r}
            </button>
          ))}
          <span className="text-note text-muted-foreground">
            {role ? '（押すと外せます）' : '決めない'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-th w-16 shrink-0 text-muted-foreground">いつまで</span>
          {([['intake', '受付から'], ['event', '実施日から']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setAnchor(v)}
              className={cn(
                'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                anchor === v ? 'border-transparent bg-primary-surface text-primary' : 'border-border bg-card text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="font-number w-[96px]"
            aria-label="日数（実施日より前なら マイナス）"
          />
          <span className="text-note text-muted-foreground">
            日 → {describeOffset(anchor, Number.isFinite(Number(days)) ? Number(days) : 0)}
          </span>
        </div>

        <label className="text-note min-h-tap flex items-center gap-2 lg:min-h-0">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-[18px] w-[18px] rounded-badge-xs border-border"
          />
          <span>
            <strong className="font-bold">外せない工程にする</strong>
            <span className="text-muted-foreground">
              （案件に入れるときのチェックが外せなくなります）
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!title.trim() || save.isPending}>
            {save.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
            保存する
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />やめる
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Row divider stackOnMobile>
      <RowMain>
        <RowTitle>{task.title}</RowTitle>
        <RowSub>{describeOffset(task.anchor, task.offset_days)}</RowSub>
      </RowMain>
      <RowSlot w={128}>
        {task.role ? (
          <span className={cn('text-badge rounded-badge inline-block px-2 py-0.5 font-bold', ROLE_TONE[task.role] ?? 'bg-surface-subtle text-muted-foreground')}>
            {task.role}
          </span>
        ) : (
          <span className="text-sub-sm text-muted-foreground">決めていません</span>
        )}
      </RowSlot>
      <RowSlot w={72}>
        <span className={cn('text-sub-sm', task.is_required ? 'text-secondary-foreground' : 'text-muted-foreground')}>
          {task.is_required ? '外せない' : '外せる'}
        </span>
      </RowSlot>
      {/* 編集ボタンはPCだけ（呼び出し側が canEdit をデバイスで倒す）。
          スマホの読者には常に空になるので、枠ごと出さず幅を詰める */}
      {canEdit && (
        <RowSlot w={128} align="right">
          <span className="flex items-center justify-end gap-1">
            <Button variant="outline" size="sm" onClick={start}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />直す
            </Button>
            <Button
              variant="ghost" size="icon" aria-label={`${task.title} を消す`} disabled={del.isPending}
              onClick={() => confirmAction({
                title: `${task.title} を消しますか`,
                description: 'すでに案件へ入れたタスクは残ります。これから案件をつくるときに出てこなくなるだけです。',
                confirmLabel: '消す', tone: 'danger',
              }).then((ok) => ok && del.mutate())}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </span>
        </RowSlot>
      )}
    </Row>
  );
}
