// 機材詳細ダイアログ（読み取り専用）。
//
// `client-techops/src/pages/rental/RentalItemDetailDialog.tsx` の見た目を踏襲しているが、
// このアプリの「レンタル機材検索」は借りる前段の下調べ専用（検索機能だけ、というタスク指示）
// のため、期間・数量の入力欄や「予約リストに追加」は持たない。予約が必要になったら
// 制作技術支援（番組のハブ→レンタル機材検索）へ、という案内だけ添える。
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import * as rentalCatalogApi from '@/lib/rentalCatalogApi';
import { companyBadgeClass } from './rentalFormat';

interface RentalItemDetailDialogProps {
  /** null = 閉じる。開くたびにここへ company/itemId を渡す */
  target: { company: string; itemId: string } | null;
  onOpenChange: (open: boolean) => void;
}

export default function RentalItemDetailDialog({ target, onOpenChange }: RentalItemDetailDialogProps) {
  // ダイアログを開いたまま「おすすめオプション」を辿れるよう、内部で現在見ている機材を持つ
  const [current, setCurrent] = useState(target);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (target) {
      setCurrent(target);
      setImageIndex(0);
    }
  }, [target]);

  const detailQuery = useQuery({
    queryKey: ['equipment-rental-item-detail', current?.company, current?.itemId],
    queryFn: () => rentalCatalogApi.getRentalItem(current!.company, current!.itemId),
    enabled: !!current,
  });

  const item = detailQuery.data;

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
                    <Money value={item.priceNet} inline className="text-base font-extrabold text-foreground" />
                    <span className="text-sub-sm text-muted-foreground">{item.priceTel != null ? '/日' : '（税込）/日'}</span>
                  </span>
                  {item.priceTel != null && (
                    <>
                      <span className="w-px bg-border-faint" />
                      <span className="text-sub-sm text-muted-foreground">
                        電話受付
                        <br />
                        <Money value={item.priceTel} inline className="text-base font-extrabold text-muted-foreground" />
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
                          <span className="text-sub-sm text-muted-foreground">
                            <Money value={r.priceNet} inline />/日
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border-faint bg-surface-subtle px-6 py-3.5">
              <span className="text-sub-sm text-muted-foreground">
                借りたい機材が決まったら、制作技術支援の番組ページの「レンタル機材検索」から予約リストに追加してください。
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
