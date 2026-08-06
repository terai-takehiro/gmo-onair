/**
 * 工程を直す（名前・担当ロール・期間・状態）
 *
 * `PUT /gpm/phases/:id` は**日付とロールを素の代入で書きます**。
 * 状態だけを送ると期間が消えるので、この画面からは必ず4項目まとめて送ります
 * （一覧側の状態の選択も同じように全部送っています）。
 *
 * **工程を足す／消す口はサーバーにありません。** 直すだけです。
 * ひな形から写された並びを組み替えるのは、いまは新規作成でひな形を
 * 選び直すことになります — そのことを詳細画面に書いてあります。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import { PHASE_STATE_LABEL, ymd, type GpmPhase, type PhaseState } from '../../types';

const STATES: PhaseState[] = ['todo', 'doing', 'blocked', 'done'];

export function PhaseDialog({
  projectId, phase, onClose,
}: {
  projectId: string;
  phase: GpmPhase;
  onClose: () => void;
}) {
  const invalidate = useInvalidateGpm();
  const [label, setLabel] = useState(phase.label);
  const [role, setRole] = useState(phase.role ?? '');
  const [state, setState] = useState<PhaseState>(phase.state);
  const [startedOn, setStartedOn] = useState(ymd(phase.started_on) ?? '');
  const [endsOn, setEndsOn] = useState(ymd(phase.ends_on) ?? '');

  const save = useMutation({
    mutationFn: () =>
      api.put(`/gpm/phases/${phase.id}`, {
        label: label.trim(),
        state,
        role: role.trim() || null,
        started_on: startedOn || null,
        ends_on: endsOn || null,
      }),
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess('工程を直しました');
      onClose();
    },
    onError: (err) => notifyApiError('工程を直せませんでした', err),
  });

  const badRange = startedOn !== '' && endsOn !== '' && endsOn < startedOn;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>工程を直す</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="ph-label">工程の名前</Label>
            <Input id="ph-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ph-state">状態</Label>
              <Select value={state} onValueChange={(v) => setState(v as PhaseState)}>
                <SelectTrigger id="ph-state"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATES.map((s) => <SelectItem key={s} value={s}>{PHASE_STATE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ph-role">担当ロール</Label>
              <Input id="ph-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="PM / 技術 / 制作" />
            </div>
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
          <p className="text-sub-sm text-muted-foreground">
            この工程の日付を直しても、あとに続く工程は動きません（1つずつ直します）。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={!label.trim() || badRange || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            直す
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
