// 機材詳細ダイアログ（Detail.dc.html 相当）。RentalSearchPage から呼ばれる。
// 画像・仕様・おすすめオプション（同じ会社の関連機材）・期間と数量を選んで予約リストに追加する。
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Video, Minus, Plus, ListPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@/lib/notify';
import * as rentalApi from '@/lib/rentalApi';
import { companyBadgeClass, daysBetween, formatYen, todayStr } from './rentalFormat';

interface RentalItemDetailDialogProps {
  ownerKey: string;
  /** null = 閉じる。開くたびにここへ company/itemId を渡す */
  target: { company: string; itemId: string } | null;
  onOpenChange: (open: boolean) => void;
  /**
   * 利用期間の既定値。**案件の本番実施日**を渡す（無ければ今日 = 従来どおり）。
   * 実施日が数日先の案件でも、開いた瞬間は今日の日付が選ばれていた不具合の対策
   */
  defaultDate?: string;
}

export default function RentalItemDetailDialog({ ownerKey, target, onOpenChange, defaultDate }: RentalItemDetailDialogProps) {
  const queryClient = useQueryClient();
  const initialDate = defaultDate || todayStr();
  // ダイアログを開いたまま「おすすめオプション」を辿れるよう、内部で現在見ている機材を持つ
  const [current, setCurrent] = useState(target);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);

  useEffect(() => {
    if (target) {
      setCurrent(target);
      setImageIndex(0);
      setQuantity(1);
      setStartDate(initialDate);
      setEndDate(initialDate);
    }
  }, [target, initialDate]);

  const detailQuery = useQuery({
    queryKey: ['rental-item-detail', current?.company, current?.itemId],
    queryFn: () => rentalApi.getRentalItem(current!.company, current!.itemId),
    enabled: !!current,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      rentalApi.addRentalReservation(ownerKey, {
        company: current!.company,
        itemId: current!.itemId,
        quantity,
        startDate,
        endDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-reservations', ownerKey] });
      notifySuccess('予約リストに追加しました');
      onOpenChange(false);
    },
    onError: () => notifyError('予約リストへの追加に失敗しました'),
  });

  const item = detailQuery.data;
  const days = daysBetween(startDate, endDate);
  const referenceTotal = useMemo(
    () => (item?.priceNet != null ? item.priceNet * quantity * days : null),
    [item, quantity, days],
  );

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        {detailQuery.isLoading || !item ? (
          <div className="px-6 py-16 text-center text-sub text-muted-foreground">読み込み中…</div>
        ) : (
          <>
            <DialogHeader className="flex-row items-start gap-3 border-b border-border-faint px-6 pb-3.5 pt-5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-badge px-1.5 py-0.5 text-badge font-bold ${companyBadgeClass(item.company)}`}>
                    {item.company}
                  </span>
                  <span className="text-sub-sm text-muted-foreground">
                    {[item.category, item.subcategory].filter(Boolean).join(' ／ ')}
                    {item.category || item.subcategory ? ' ・ ' : ''}ID {item.itemId}
                  </span>
                </div>
                <DialogTitle className="text-h2">{item.name}</DialogTitle>
              </div>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mr-6 mt-0.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-border bg-card px-2.5 text-sub-sm font-bold text-foreground hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  元のページを見る
                </a>
              )}
            </DialogHeader>

            <div className="flex flex-col gap-5 px-6 py-4 sm:flex-row">
              <div className="flex flex-col gap-2 sm:w-[280px] sm:shrink-0">
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-card border border-border-faint bg-muted/60">
                  {item.images[imageIndex] ? (
                    <img src={item.images[imageIndex]} alt={item.name} className="h-full w-full object-contain" />
                  ) : (
                    <Video className="h-11 w-11 text-fg-disabled" aria-hidden="true" />
                  )}
                </div>
                {item.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {item.images.map((src, i) => (
                      <button
                        key={src + i}
                        type="button"
                        onClick={() => setImageIndex(i)}
                        className={`h-12 w-16 shrink-0 overflow-hidden rounded-control border bg-muted/60 ${
                          i === imageIndex ? 'border-2 border-primary' : 'border-border-faint'
                        }`}
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-3.5 rounded-note border border-border-faint bg-surface-subtle px-3 py-2.5">
                  <span className="text-sub-sm text-muted-foreground">
                    {item.priceTel != null ? 'ネット受付' : '価格'}
                    <br />
                    <span className="font-number text-base font-extrabold text-foreground">{formatYen(item.priceNet)}</span>
                    <span className="text-sub-sm text-muted-foreground">{item.priceTel != null ? '/日' : '（税込）/日'}</span>
                  </span>
                  {item.priceTel != null && (
                    <>
                      <span className="w-px bg-border-faint" />
                      <span className="text-sub-sm text-muted-foreground">
                        電話受付
                        <br />
                        <span className="font-number text-base font-extrabold text-muted-foreground">{formatYen(item.priceTel)}</span>
                        <span className="text-sub-sm text-muted-foreground">/日</span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                {Object.keys(item.specs).length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-sub-sm font-extrabold tracking-wide text-muted-foreground">仕様</span>
                    <div className="overflow-hidden rounded-note border border-border-faint">
                      {Object.entries(item.specs).map(([k, v], i) => (
                        <div key={k} className={`flex ${i > 0 ? 'border-t border-border-faint' : ''}`}>
                          <span className="w-32 shrink-0 bg-surface-subtle px-3 py-2 text-sub-sm font-bold text-muted-foreground">{k}</span>
                          <span className="flex-1 px-3 py-2 text-sub">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.relatedItems.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-sub-sm font-extrabold tracking-wide text-muted-foreground">
                      おすすめオプション（同じ会社）
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {item.relatedItems.map((r) => (
                        <button
                          key={r.itemId}
                          type="button"
                          onClick={() => setCurrent({ company: r.company, itemId: r.itemId })}
                          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-card px-2.5 text-sub text-foreground hover:bg-muted"
                        >
                          {r.name}
                          <span className="font-number text-sub-sm text-muted-foreground">{formatYen(r.priceNet)}/日</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-border-faint bg-surface-subtle px-6 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex h-11 shrink-0 items-center gap-2 rounded-control border border-border bg-card px-3 text-sub font-bold">
                  期間
                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="min-w-0 border-0 bg-transparent text-sub focus:outline-none"
                  />
                  〜
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-w-0 border-0 bg-transparent text-sub focus:outline-none"
                  />
                  <span className="whitespace-nowrap text-sub-sm text-muted-foreground">・{days}日間</span>
                </label>

                <span className="inline-flex h-11 shrink-0 items-center overflow-hidden rounded-control border border-border bg-card">
                  <button
                    type="button"
                    aria-label="数量を減らす"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-11 w-9 items-center justify-center text-muted-foreground hover:bg-muted"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span className="font-number flex h-11 w-10 items-center justify-center border-x border-border-faint text-sub font-extrabold">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="数量を増やす"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-11 w-9 items-center justify-center text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>

                <div className="flex-1" />

                {referenceTotal != null && (
                  <span className="font-number shrink-0 whitespace-nowrap text-sub text-muted-foreground">
                    参考 <strong className="text-sub font-extrabold text-foreground">{formatYen(referenceTotal)}</strong>
                    （{item.priceTel != null ? 'ネット受付' : '税込'} × {quantity}台 × {days}日）
                  </span>
                )}

                <Button
                  className="min-h-[44px] shrink-0"
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending}
                >
                  <ListPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  予約リストに追加
                </Button>
              </div>

              <span className="text-sub-sm text-muted-foreground">追加は社内の予約メモです。各社の在庫は押さえません</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
