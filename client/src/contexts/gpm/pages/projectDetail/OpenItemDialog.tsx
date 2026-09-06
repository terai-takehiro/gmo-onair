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
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
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
    // 直す(PUT)と足す(POST)で本文の形が違う（status の有無）。axios 1.18 から
    // レスポンス型が本文の型を持つため、2つを1つの return で返すと union が
    // 合わずに型エラーになる。レスポンスはどちらも使わないので await して捨てる
    mutationFn: async () => {
      const body = {
        question: question.trim(),
        to_kind: toKind,
        to_name: toName.trim() || null,
        blocks: blocks.trim() || null,
        due_date: dueDate || null,
        phase_id: phaseId || null,
      };
      if (item) await api.put(`/gpm/open-items/${item.id}`, { ...body, status });
      else await api.post(`/gpm/projects/${projectId}/open-items`, body);
    },
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess(item ? '未解決事項を更新しました' : '未解決事項を追加しました');
      onClose();
    },
    onError: (err) =>
      notifyApiError(item ? '未解決事項を更新できませんでした' : '未解決事項を追加できませんでした', err),
  });

  const canSubmit = question.trim() !== '' && !save.isPending;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={item ? '未解決事項を編集' : '未解決事項を追加'}
      size="lg"
      // Enter で保存する（繰り返し入力を持たないフォーム）。質問欄は Textarea なので、
      // その中の Enter は今までどおり改行になる。送信は `type="submit"` の1本だけ
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) save.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={!canSubmit}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {item ? '編集' : '追加'}
          </Button>
        </FormDialogFooter>
      }
    >
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

          {/*
            並びは「何を・どこの話か・誰に・何が止まる・いつまでに」。
            工程は**どこの話かという文脈**なので期限と同じ行には置かず、質問の直後に上げた
            （`docs/design/v4/_form-order.md`）。
          */}
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

          {/* 「これが止めているもの」は**一覧で赤く出て優先順位を決める最重要の欄**なのに、
              最後まで読まないと出てこなかった。誰に訊くかの直後へ上げる（説明文も一緒に移す） */}
          <div>
            <Label htmlFor="oi-blocks">停滞している工程・作業</Label>
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

          <div>
            <Label htmlFor="oi-due">いつまでに返事がほしいか</Label>
            <Input id="oi-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
    </FormDialog>
  );
}
