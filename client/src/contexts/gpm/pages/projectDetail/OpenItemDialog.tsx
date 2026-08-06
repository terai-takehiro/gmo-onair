/**
 * 未確認事項を足す／直す
 *
 * ── 「何が止まっているか」を必須にしない ────────────────────
 *
 * 止まっているものが無い問い合わせ（念のための確認）もあるので、
 * 必須にすると適当な文字が入ります。ただし**書けば一覧で赤く出る**ことを
 * その場に書いておきます — 書く動機が無いと誰も書きません。
 *
 * ── 保存に失敗したときは必ず出す ────────────────────────────
 *
 * v3.2.2 で直した `StudioBookingDialog` と同じ形にしてあります
 * （`onError` が無いと、失敗しても何も出ずにもう一度押されます）。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import {
  OPEN_STATUS_LABEL, TO_KIND_LABEL, ymd,
  type GpmOpenItem, type GpmPhase, type OpenItemStatus, type OpenItemToKind,
} from '../../types';

export interface OpenItemDialogProps {
  /** どのプロジェクトに足すか（直すときも読み直しに要る） */
  projectId: string;
  /** 直すとき。足すときは `null` */
  item: GpmOpenItem | null;
  /** 工程に紐づけたいとき。無ければ選択欄を出さない */
  phases?: GpmPhase[];
  onClose: () => void;
}

const TO_KINDS: OpenItemToKind[] = ['client', 'pm', 'vendor', 'internal'];
const STATUSES: OpenItemStatus[] = ['waiting', 'checking', 'resolved'];

export function OpenItemDialog({ projectId, item, phases, onClose }: OpenItemDialogProps) {
  const invalidate = useInvalidateGpm();
  const [question, setQuestion] = useState(item?.question ?? '');
  const [toKind, setToKind] = useState<OpenItemToKind>(item?.to_kind ?? 'client');
  const [toName, setToName] = useState(item?.to_name ?? '');
  const [blocks, setBlocks] = useState(item?.blocks ?? '');
  const [dueDate, setDueDate] = useState(ymd(item?.due_date) ?? '');
  const [phaseId, setPhaseId] = useState(item?.phase_id ?? '');
  const [status, setStatus] = useState<OpenItemStatus>(item?.status ?? 'waiting');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        question: question.trim(),
        to_kind: toKind,
        to_name: toName.trim() || null,
        blocks: blocks.trim() || null,
        due_date: dueDate || null,
        phase_id: phaseId || null,
      };
      return item
        ? api.put(`/gpm/open-items/${item.id}`, { ...body, status })
        : api.post(`/gpm/projects/${projectId}/open-items`, body);
    },
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess(item ? '未確認事項を直しました' : '未確認事項を足しました');
      onClose();
    },
    onError: (err) =>
      notifyApiError(item ? '未確認事項を直せませんでした' : '未確認事項を足せませんでした', err),
  });

  const canSubmit = question.trim() !== '' && !save.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? '未確認事項を直す' : '未確認事項を足す'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="oi-q">
              何を訊いていますか <span className="text-destructive">必須</span>
            </Label>
            <Textarea
              id="oi-q"
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="副調のモニター壁は据置か可動か"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="oi-to">誰に</Label>
              <Select value={toKind} onValueChange={(v) => setToKind(v as OpenItemToKind)}>
                <SelectTrigger id="oi-to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TO_KINDS.map((k) => <SelectItem key={k} value={k}>{TO_KIND_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="oi-toname">相手の名前</Label>
              <Input
                id="oi-toname"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="グループ総務 佐野様"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="oi-due">いつまでに返事がほしいか</Label>
              <Input id="oi-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {phases && phases.length > 0 && (
              <div>
                <Label htmlFor="oi-phase">どの工程の話か</Label>
                <Select value={phaseId || '_none_'} onValueChange={(v) => setPhaseId(v === '_none_' ? '' : v)}>
                  <SelectTrigger id="oi-phase"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">紐づけない</SelectItem>
                    {phases.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="oi-blocks">これが止めているもの</Label>
            <Input
              id="oi-blocks"
              value={blocks}
              onChange={(e) => setBlocks(e.target.value)}
              placeholder="調達・工事手配"
            />
            <p className="text-sub-sm mt-1 text-muted-foreground">
              書くと一覧とダッシュボードで赤く出て、優先して片づける対象になります。空でもかまいません。
            </p>
          </div>

          {item && (
            <div>
              <Label htmlFor="oi-status">いまの状態</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as OpenItemStatus)}>
                <SelectTrigger id="oi-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{OPEN_STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={!canSubmit}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {item ? '直す' : '足す'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
