/**
 * 切替状態（会社と切替 ⑧・Section B）
 *
 * ── 前進は1つだけ・任意の遷移には飛ばせない ──────────────────
 * サーバーの遷移表（`off→{off,preparing}` など）はもう少し広いが、画面では
 * **いまの状態から進める次の1つだけ**をボタンに出す（指示書のとおり）。
 * `cutover` のときだけ「元に戻す」（→`preparing`）を並べて出す。
 *
 * ── 却下はサーバーの文言をそのまま出す ──────────────────────
 * `preparing→cutover` は切替日が未来／未設定だと 400 `INVALID_TRANSITION` で
 * 拒否される。この画面では**日付の前検査をしない** — サーバーを唯一の正にして、
 * 却下されたらそのメッセージを `notifyApiError` でそのまま出す（自前の文言は作らない）。
 *
 * ── 状態を変える前に確認を挟む ────────────────────────────────
 * どの前進も「1つ前の状態に戻る」画面上の手段が無い（`cutover→preparing` の
 * 巻き戻し以外）。`docs/reorg-2026-10-plan.md`「計上会社の切替は人の操作だけ」を
 * 画面でも徹底するため、`confirmAction` で一度立ち止まらせる。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  ORG_TRANSITION_STATE_LABELS, ORG_TRANSITION_STATE_TONE,
  NEXT_ORG_TRANSITION_STATE, NEXT_ORG_TRANSITION_LABEL,
  type OrgTransition, type OrgTransitionState,
} from './types';

export function TransitionPanel({ transition, canEdit }: { transition: OrgTransition; canEdit: boolean }) {
  const qc = useQueryClient();
  const [draftDate, setDraftDate] = useState(transition.cutoverDate ?? '');

  useEffect(() => setDraftDate(transition.cutoverDate ?? ''), [transition.cutoverDate]);
  const dateDirty = draftDate !== (transition.cutoverDate ?? '');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-transition'] });

  const saveDate = useMutation({
    mutationFn: async () => (await api.put('/org-transition', {
      cutover_date: draftDate === '' ? null : draftDate,
    })).data.data as OrgTransition,
    onSuccess: () => { invalidate(); notifySuccess('切替日を保存しました'); },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const changeState = useMutation({
    mutationFn: async (state: OrgTransitionState) =>
      (await api.put('/org-transition', { state })).data.data as OrgTransition,
    onSuccess: (data) => {
      invalidate();
      notifySuccess(`切替状態を「${ORG_TRANSITION_STATE_LABELS[data.state]}」にしました`);
    },
    onError: (e) => notifyApiError('切り替えできませんでした', e),
  });

  const next = NEXT_ORG_TRANSITION_STATE[transition.state];

  const advance = async () => {
    if (!next) return;
    const ok = await confirmAction({
      title: `「${ORG_TRANSITION_STATE_LABELS[next]}」にしますか`,
      description: next === 'cutover'
        ? '切替日が過去の日付になっている必要があります（未設定・未来の日付だと保存できません）。'
        : next === 'done'
          ? 'この画面からは元に戻せません。'
          : 'この操作は人が明示的に行うものです。自動では変わりません。',
      confirmLabel: NEXT_ORG_TRANSITION_LABEL[transition.state],
    });
    if (ok) changeState.mutate(next);
  };

  const rollback = async () => {
    const ok = await confirmAction({
      title: '「準備中」に戻しますか',
      description: '切替を中止し、1つ前の状態に戻します。',
      confirmLabel: '元に戻す',
    });
    if (ok) changeState.mutate('preparing');
  };

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-info-surface">
          <ArrowRightLeft className="h-4 w-4 text-info" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">切替状態</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          10月の切替をどこまで進めたか
        </span>
      </div>

      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sub text-muted-foreground">いまの状態</span>
          <span
            title={transition.state}
            className={cn('rounded-note text-note px-2.5 py-1 font-bold', ORG_TRANSITION_STATE_TONE[transition.state])}
          >
            {ORG_TRANSITION_STATE_LABELS[transition.state]}
          </span>
        </div>

        <label className="text-note flex flex-col gap-1 sm:w-64">
          切替日
          <Input
            type="date"
            disabled={!canEdit}
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
          />
        </label>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!dateDirty}
              onClick={() => setDraftDate(transition.cutoverDate ?? '')}>
              取り消す
            </Button>
            <Button size="sm" disabled={!dateDirty || saveDate.isPending} onClick={() => saveDate.mutate()}>
              {saveDate.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              切替日を保存する
            </Button>
          </div>
        )}

        {canEdit && (next || transition.state === 'cutover') && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-faint pt-3.5">
            {next && (
              <Button disabled={changeState.isPending} onClick={advance}>
                {changeState.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                {NEXT_ORG_TRANSITION_LABEL[transition.state]}
              </Button>
            )}
            {transition.state === 'cutover' && (
              <Button variant="outline" disabled={changeState.isPending} onClick={rollback}>
                元に戻す
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
        状態は人が明示的に変えたときだけ動きます。自動では切り替わりません。
      </p>
    </div>
  );
}
