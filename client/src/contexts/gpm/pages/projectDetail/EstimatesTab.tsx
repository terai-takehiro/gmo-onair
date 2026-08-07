/**
 * ⑥ 見積・請求（GPM プロジェクト詳細・v4 大⑤・migration 173）
 *
 * ── 提出先ごとに1本ずつ ─────────────────────────────────────
 *
 * モックの GPM 見積は **自社／依頼元／PM会社** の3つの提出先ごとに出します。
 * 同じ工事でも、自社への社内見積と PM 会社へ出す見積は**中身も金額も別物**です。
 * だから提出先は作るときに必ず選んでもらいます（あとから「どっちの見積だっけ」に
 * ならないように）。
 *
 * ── 案件（GLS）の見積と同じ表を使う ────────────────────────
 *
 * `estimates` を共用しています。別表にすると版・明細・合計の作りが2つになり、
 * 片方だけ直る形が生まれるためです。**混ざらないこと**は、
 * `estimates` を読む3か所を実測して塞いであります（migration 173 の冒頭）。
 *
 * ── 明細はここでは編集しない ────────────────────────────────
 *
 * 版・提出先・状態までをここで扱い、**明細（品目と金額）は案件の見積画面と
 * 同じ部品**を使う予定です。ここに写しの明細編集を作ると、合計の計算が
 * 2か所になります（案件側と食い違ったときにどちらが正か分からない）。
 * いまは**まだ作っていない**とはっきり書いてあります。
 */
import { useState } from 'react';
import { FileText, Plus, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useGpmEstimates, useInvalidateGpm, type GpmEstimate } from '../../queries';

export const SUBMIT_TO_LABEL: Record<string, string> = {
  self: '自社', client: '依頼元', pm: 'PM会社',
};

/** 状態の色。**意味で決める**（画面ごとに変えない） */
const STATUS_TONE: Record<GpmEstimate['status'], string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  sent: 'border-transparent bg-warning-surface text-warning',
  accepted: 'border-transparent bg-success-surface text-success',
  rejected: 'border-transparent bg-destructive-surface text-destructive',
  superseded: 'border-transparent bg-muted text-muted-foreground',
};
const STATUS_LABEL: Record<GpmEstimate['status'], string> = {
  draft: '作成中', sent: '送付済', accepted: '受注', rejected: '失注', superseded: '旧版',
};

export function EstimatesTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const query = useGpmEstimates(projectId);
  const [adding, setAdding] = useState(false);
  const rows = query.data ?? [];

  // **旧版も出す。** 「いくらで出して、いくらで決まったか」を追うための表なので、
  // 差し替え済みの版を隠すと version が飛んで読めなくなる（案件側の一覧とは目的が違う）
  const live = rows.filter((e) => e.status !== 'superseded');
  const total = live.reduce((n, e) => n + (e.subtotal - e.discount), 0);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-cardtitle">個別見積</h2>
          <p className="text-note mt-0.5 text-muted-foreground">
            提出先ごとに出します。最新の版の合計は{' '}
            <Money value={total} className="font-bold" />（値引きを引いたあと）
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />見積をつくる
          </Button>
        )}
      </div>

      {query.isError ? (
        <ErrorPanel title="見積を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden="true" />}
          title="見積はまだありません"
          description="提出先（自社／依頼元／PM会社）ごとに1本ずつ作ります。"
          action={canEdit ? <Button onClick={() => setAdding(true)}>見積をつくる</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={72}>提出先</RowSlot>
            <RowMain>件名</RowMain>
            <RowSlot w={72}>状態</RowSlot>
            <RowSlot w={128}>金額</RowSlot>
          </RowHeader>
          {rows.map((e) => (
            <Row key={e.id} className={e.status === 'superseded' ? 'opacity-60' : undefined}>
              <RowSlot w={72}>
                <TableBadge
                  label={e.submit_to ? SUBMIT_TO_LABEL[e.submit_to] : '—'}
                  w={null}
                  className="w-full border-transparent bg-surface-subtle text-secondary-foreground"
                />
              </RowSlot>
              <RowMain>
                <RowTitle>{e.title || '（件名なし）'}</RowTitle>
                <RowSub>
                  v{e.version}
                  {e.valid_until && ` ・ 有効期限 ${e.valid_until}`}
                  {e.status === 'superseded' && ' ・ 次の版に差し替え済み'}
                </RowSub>
              </RowMain>
              <RowSlot w={72}>
                <TableBadge label={STATUS_LABEL[e.status]} w={null} className={cn('w-full', STATUS_TONE[e.status])} />
              </RowSlot>
              <RowSlot w={128}>
                <Money value={e.subtotal - e.discount} className="w-full justify-end" />
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">明細（品目と金額）の入力はまだ作っていません。</strong>
        案件の見積と同じ部品を使う予定です — ここに写しを作ると合計の計算が2か所になり、
        食い違ったときにどちらが正しいか分からなくなります。
      </p>

      {adding && <NewEstimateDialog projectId={projectId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewEstimateDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const invalidate = useInvalidateGpm();
  const [title, setTitle] = useState('');
  const [submitTo, setSubmitTo] = useState<'self' | 'client' | 'pm'>('client');
  const [validUntil, setValidUntil] = useState('');

  const create = useMutation({
    mutationFn: () => api.post(`/gpm/projects/${projectId}/estimates`, {
      title: title.trim(), submit_to: submitTo, valid_until: validUntil || null,
    }),
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess('見積をつくりました', { description: '明細は今後この画面で入れられるようにします。' });
      onClose();
    },
    onError: (e) => notifyApiError('見積をつくれませんでした', e),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>見積をつくる</DialogTitle>
          <DialogDescription>
            <strong className="font-bold">提出先ごとに1本</strong>です。同じ工事でも、
            自社への社内見積と PM 会社へ出す見積は中身も金額も別物になります。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label>提出先 *</Label>
            <Select value={submitTo} onValueChange={(v) => setSubmitTo(v as 'self' | 'client' | 'pm')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['self', 'client', 'pm'] as const).map((k) => (
                  <SelectItem key={k} value={k}>{SUBMIT_TO_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>件名</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AV設備 一式" />
          </div>
          <div>
            <Label>有効期限</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            つくる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
