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
 * ── 明細は案件の見積と**同じ部品** ──────────────────────────
 *
 * `EstimateItems`（`sales/pages/projectDetail/`）をそのまま呼びます。
 * ここに写しを作ると合計と粗利の計算が2か所になり、片方だけ直した日から
 * **同じ見積が画面によって違う金額**を出します。
 * 保存する口だけ GPM 側（`PUT /gpm/estimates/:id/items`）に向けていて、
 * サーバーは**プロジェクトの見積しか受け付けません** — 案件の見積を
 * `gpm` だけの人が書き換えられないようにするためです。
 */
import { useState } from 'react';
import { FileText, Plus, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  EstimateItems, type EstimateForItems, type EstimateItemRow,
} from '@/contexts/sales/pages/projectDetail/EstimateItems';

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
  /** 明細を開いている見積。**一覧には明細を積まない**ので、開いたときだけ引く */
  const [openId, setOpenId] = useState<string | null>(null);
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
            <Row
              key={e.id}
              interactive
              divider
              onClick={() => setOpenId(openId === e.id ? null : e.id)}
              className={e.status === 'superseded' ? 'opacity-60' : undefined}
            >
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

      {openId && <ItemsPanel estimateId={openId} canEdit={canEdit} />}

      <p className="text-note text-muted-foreground">
        行を押すと<strong className="font-bold">明細</strong>を開けます。
        中身は<strong className="font-bold">案件の見積と同じ部品</strong>で、
        合計と粗利の計算も1か所です（写しを作ると、片方だけ直した日から金額が食い違います）。
        <strong className="font-bold">出したあと（送付済・受注・旧版）は直せません</strong> —
        直すなら次の版をつくってください。
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

/**
 * 明細の枠。**一覧が明細まで抱えない**ようにここで1本だけ引きます
 * （一覧に積むと、見積が増えるほど開くのが遅くなる）。
 */
function ItemsPanel({ estimateId, canEdit }: { estimateId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const invalidate = useInvalidateGpm();

  const detail = useQuery<EstimateForItems>({
    queryKey: ['gpm-estimate', estimateId],
    queryFn: async () => (await api.get(`/gpm/estimates/${estimateId}`)).data.data,
  });

  const save = useMutation({
    mutationFn: (items: EstimateItemRow[]) => api.put(`/gpm/estimates/${estimateId}/items`, { items }),
    onSuccess: () => {
      // **一覧の金額も落とす。** 合計はサーバーが出し直すので、
      // ここを忘れると明細を直したのに一覧の金額が古いままになる
      qc.invalidateQueries({ queryKey: ['gpm-estimate', estimateId] });
      invalidate();
      notifySuccess('明細を保存しました');
    },
    onError: (e) => notifyApiError('明細を保存できませんでした', e),
  });

  if (detail.isError) {
    return <ErrorPanel title="明細を読み込めませんでした" error={detail.error} onRetry={() => detail.refetch()} />;
  }
  if (!detail.data) return <Delayed><SkeletonRows rows={4} /></Delayed>;

  return (
    <EstimateItems
      estimate={detail.data}
      onSave={(items) => canEdit && save.mutate(items)}
      saving={save.isPending}
    />
  );
}
