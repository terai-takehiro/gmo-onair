// 予約リスト（Reserve.dc.html 相当）。会社ごとのグループカードで、数量の増減・削除・
// 他番組との重なり警告・依頼メール作成への導線を持つ。
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, Mail, Minus, Plus, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyError, notifySuccess } from '@/lib/notify';
import * as rentalApi from '@/lib/rentalApi';
import type { RentalReservationGroup, RentalReservationLine } from '@/lib/rentalApi';
import { companyBadgeClass, formatDateJp, formatYen } from './rentalFormat';

export default function RentalReservationsPage() {
  const { ownerKey = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const reservationsQuery = useQuery({
    queryKey: ['rental-reservations', ownerKey],
    queryFn: () => rentalApi.getRentalReservations(ownerKey),
    enabled: !!ownerKey,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rental-reservations', ownerKey] });

  const updateMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      rentalApi.updateRentalReservation(ownerKey, id, { quantity }),
    onSuccess: invalidate,
    onError: () => notifyError('数量を変えられませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rentalApi.deleteRentalReservation(ownerKey, id),
    onSuccess: () => {
      invalidate();
      notifySuccess('削除しました');
    },
    onError: () => notifyError('削除できませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  const groups = reservationsQuery.data?.groups ?? [];
  const period = useMemo(() => {
    const lines = (reservationsQuery.data?.groups ?? []).flatMap((g) => g.lines);
    if (lines.length === 0) return null;
    const start = lines.reduce((min, l) => (l.startDate < min ? l.startDate : min), lines[0].startDate);
    const end = lines.reduce((max, l) => (l.endDate > max ? l.endDate : max), lines[0].endDate);
    return { start, end };
  }, [reservationsQuery.data]);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={() => navigate(`/techops/rental/${encodeURIComponent(ownerKey)}`)}
        className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        機材の検索に戻る
      </button>

      <PageHeader
        title="予約リスト"
        sub="この番組で借りたい機材のメモです。会社ごとにまとめて依頼メールを作れます"
        primaryAction={
          period && (
            <span className="inline-flex h-10 items-center gap-2 rounded-control border border-border bg-card px-3.5 text-sub-sm font-bold text-foreground">
              利用期間 <span className="font-number">{formatDateJp(period.start)} 〜 {formatDateJp(period.end)}</span>{/* ui-tokens-ok: 曜日つき表記のため DateRange (YYYY/MM/DD 専用) を使わない */}
            </span>
          )
        }
      />

      {reservationsQuery.isLoading ? (
        <Delayed>
          <SkeletonRows rows={4} />
        </Delayed>
      ) : groups.length === 0 ? (
        <EmptyState title="予約リストはまだ空です" description="機材の検索からカードの「予約リストへ」を押すと、ここに並びます。" />
      ) : (
        groups.map((group) => (
          <ReservationGroupCard
            key={group.company}
            group={group}
            ownerKey={ownerKey}
            onQuantityChange={(id, quantity) => updateMutation.mutate({ id, quantity })}
            onDelete={(id) => deleteMutation.mutate(id)}
            onOpenMail={() => navigate(`/techops/rental/${encodeURIComponent(ownerKey)}/mail/${encodeURIComponent(group.company)}`)}
          />
        ))
      )}

      <p className="flex items-center gap-1.5 text-sub-sm text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        予約リストは社内のメモです。各社の在庫を押さえるものではなく、確定は依頼メールへの各社の返信をもって行ってください
      </p>
    </div>
  );
}

function statusBadge(group: RentalReservationGroup) {
  if (group.status === 'requested') {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-badge bg-success-surface px-2 text-badge font-bold text-success">
        依頼済み{group.requestedAt ? ` ・ ${group.requestedAt.slice(5, 10).replace('-', '/')}` : ''}
      </span>
    );
  }
  if (group.status === 'mixed') {
    return (
      <span className="inline-flex h-5 items-center rounded-badge bg-warning-surface px-2 text-badge font-bold text-warning-border-strong">
        一部依頼済み
      </span>
    );
  }
  return <span className="inline-flex h-5 items-center rounded-badge bg-muted px-2 text-badge font-bold text-muted-foreground">未依頼</span>;
}

function ReservationGroupCard({
  group,
  onQuantityChange,
  onDelete,
  onOpenMail,
}: {
  group: RentalReservationGroup;
  ownerKey: string;
  onQuantityChange: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
  onOpenMail: () => void;
}) {
  const quantityTotal = group.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint bg-surface-subtle px-4 py-2.5">
        <span className={`rounded-badge px-1.5 py-0.5 text-badge font-bold ${companyBadgeClass(group.company)}`}>{group.company}</span>
        <span className="font-number text-sub text-muted-foreground">
          {group.lines.length}品目 ・ {quantityTotal}点
        </span>
        {statusBadge(group)}
        <div className="flex-1" />
        <span className="font-number text-sub text-muted-foreground">
          参考小計 <strong className="text-cardtitle font-extrabold text-foreground">{formatYen(group.subtotal)}</strong>
        </span>
        <Button size="sm" className="min-h-[44px]" onClick={onOpenMail}>
          <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {group.status === 'draft' ? '依頼メールを作成' : 'メールをもう一度作る'}
        </Button>
      </div>

      <div className="divide-y divide-border-faint">
        {group.lines.map((line) => (
          <ReservationLineRow key={line.id} line={line} onQuantityChange={onQuantityChange} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function ReservationLineRow({
  line,
  onQuantityChange,
  onDelete,
}: {
  line: RentalReservationLine;
  onQuantityChange: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:flex-nowrap">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-subtle">
        <Video className="h-4 w-4 text-fg-disabled" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 basis-full sm:basis-auto">
        <span className="block truncate text-sub font-bold">{line.itemName}</span>
        <span className="block text-sub-sm text-muted-foreground">
          ID {line.itemId}
          {line.category ? ` ・ ${line.category}` : ''}
        </span>
      </span>

      {line.conflict && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-badge bg-warning-surface px-2 py-1 text-badge font-bold text-warning-border-strong">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          {formatDateJp(line.conflict.date)} に「{line.conflict.ownerLabel}」も予約予定
        </span>
      )}

      <span className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-control border border-border bg-background">
        <button
          type="button"
          aria-label="数量を減らす"
          disabled={line.quantity <= 1}
          onClick={() => onQuantityChange(line.id, line.quantity - 1)}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="font-number flex h-8 w-9 items-center justify-center border-x border-border-faint text-sub font-extrabold">
          {line.quantity}
        </span>
        <button
          type="button"
          aria-label="数量を増やす"
          onClick={() => onQuantityChange(line.id, line.quantity + 1)}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>

      <span className="font-number w-24 shrink-0 text-right text-sub-sm text-muted-foreground">{formatYen(line.priceNet)}/日</span>
      <span className="font-number w-24 shrink-0 text-right text-sub font-extrabold">{formatYen(line.lineTotal)}</span>

      <button
        type="button"
        aria-label="削除"
        onClick={() => onDelete(line.id)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
