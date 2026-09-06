/**
 * 工程を足す／直す／消す（名前・担当ロール・期間・状態）
 *
 * `PUT /gpm/phases/:id` は**日付とロールを素の代入で書きます**。
 * 状態だけを送ると期間が消えるので、この画面からは必ず4項目まとめて送ります
 * （一覧側の状態の選択も同じように全部送っています）。
 *
 * ── 消しても配下のタスクは消えません ────────────────────────
 *
 * サーバーは工程を消すときに `gpm_phase_id` を NULL にするだけです
 * （`phaseService.remove`）。外れたタスクは同じ画面の「工程なし」の束に残るので、
 * 付け直せます。**何件外れるかを確認に出します** — 「名前を直したかっただけ」の人が
 * 何十件のタスクを工程から外して気づかないのを避けるため。
 */
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import { PHASE_STATE_LABEL, ymd, type GpmPhase, type PhaseState } from '../../types';

const STATES: PhaseState[] = ['todo', 'doing', 'blocked', 'done'];

export function PhaseDialog({
  projectId, phase, onClose,
}: {
  projectId: string;
  /** 直すとき。**足すときは `null`** */
  phase: GpmPhase | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateGpm();
  const [label, setLabel] = useState(phase?.label ?? '');
  const [role, setRole] = useState(phase?.role ?? '');
  const [state, setState] = useState<PhaseState>(phase?.state ?? 'todo');
  const [startedOn, setStartedOn] = useState(ymd(phase?.started_on) ?? '');
  const [endsOn, setEndsOn] = useState(ymd(phase?.ends_on) ?? '');

  // **phase は react-query 由来で、開いたまま裏で更新されうる**（同じ工程の状態変更
  // ボタンなど）。呼び出し元の key だけでは「同じ工程の中身が裏で変わった」場合まで
  // 拾えないので、ここでも再同期する（EditProjectDialog と同じ落とし穴を踏まないため）
  useEffect(() => {
    setLabel(phase?.label ?? '');
    setRole(phase?.role ?? '');
    setState(phase?.state ?? 'todo');
    setStartedOn(ymd(phase?.started_on) ?? '');
    setEndsOn(ymd(phase?.ends_on) ?? '');
  }, [phase]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        label: label.trim(),
        state,
        role: role.trim() || null,
        started_on: startedOn || null,
        ends_on: endsOn || null,
      };
      return phase
        ? api.put(`/gpm/phases/${phase.id}`, body)
        : api.post(`/gpm/projects/${projectId}/phases`, body);
    },
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess(phase ? '工程を更新しました' : '工程を追加しました');
      onClose();
    },
    onError: (err) => notifyApiError(phase ? '工程を更新できませんでした' : '工程を追加できませんでした', err),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/gpm/phases/${phase!.id}`),
    onSuccess: (res) => {
      invalidate(projectId);
      const detached = Number((res.data?.data as { detached?: number } | undefined)?.detached ?? 0);
      notifySuccess(detached > 0 ? `工程を削除しました（タスク ${detached}件は「工程なし」に残ります）` : '工程を削除しました');
      onClose();
    },
    onError: (err) => notifyApiError('工程を削除できませんでした', err),
  });

  const onDelete = async () => {
    if (!phase) return;
    const ok = await confirmAction({
      title: 'この工程を削除しますか？',
      description: [
        `「${phase.label}」`,
        phase.task_count > 0
          ? `配下のタスク ${phase.task_count}件は消えません。「工程なし」の束に残るので、あとから別の工程に付け編集できます。`
          : 'この工程にタスクはありません。',
      ].join('\n'),
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) remove.mutate();
  };

  const badRange = startedOn !== '' && endsOn !== '' && endsOn < startedOn;
  const busy = save.isPending || remove.isPending;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={phase ? '工程を編集' : '工程を追加'}
      // Enter で保存する（繰り返し入力を持たないフォーム）。**保存以外のボタンには
      // 必ず `type="button"` を付ける** — `<form>` の中では既定が submit になり、
      // 「削除」「キャンセル」を押しただけで保存も走ってしまう
      onSubmit={(e) => { e.preventDefault(); if (label.trim() && !badRange && !busy) save.mutate(); }}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {phase ? (
            <Button type="button" variant="outline" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />
              この工程を削除
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>キャンセル</Button>
            <Button type="submit" disabled={!label.trim() || badRange || busy}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {phase ? '編集' : '追加'}
            </Button>
          </div>
        </div>
      }
    >
        <div className="space-y-3">
          <div>
            <Label htmlFor="ph-label">
              工程の名前 <span className="text-destructive">必須</span>
            </Label>
            <Input
              id="ph-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="設計・機材選定"
            />
          </div>
          {/* 担当ロールは名前の次（誰の工程か）。もとはここに「状態」があったが、
              足すときの状態はつねに「これから」なので日付の下へ降ろした
              （`docs/design/v4/_form-order.md`） */}
          <div>
            <Label htmlFor="ph-role">担当ロール</Label>
            <Input id="ph-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="PM / 技術 / 制作" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ph-start">始まり</Label>
              <Input id="ph-start" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ph-end">終わり</Label>
              <Input id="ph-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          {badRange && (
            <p className="text-sub text-destructive">終わりが始まりより前になっています。</p>
          )}
          {/* 状態は名前・ロール・期間を決めたあと。**欄は残す** — `PUT /gpm/phases/:id` は
              4項目まとめて送る決めごと（冒頭の注記）なので、値そのものは今までどおり持つ。
              同じ GPM の持ち帰り（OpenItemDialog）も状態を最後に置いている */}
          <div>
            <Label htmlFor="ph-state">状態</Label>
            <Select value={state} onValueChange={(v) => setState(v as PhaseState)}>
              <SelectTrigger id="ph-state"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATES.map((s) => <SelectItem key={s} value={s}>{PHASE_STATE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sub-sm text-muted-foreground">
            {phase
              ? 'この工程の日付を直しても、あとに続く工程は動きません（1つずつ直します）。'
              : '足した工程はいちばん後ろに付きます。順番は一覧の ∧ ∨ で動かします。'}
          </p>
        </div>
    </FormDialog>
  );
}
