/**
 * ⑧ 取引先（財務） — スマホのカード
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行は5列（名前／担当・役割／電話／もう1項目／今年度の取引）で、
 * これまでのスマホは `RowSlot hideOnMobile` で名前だけ残す縮小表示でした。
 * つまり探している相手が合っているかは開いてみないと分からず、
 * 電話番号すら見えていませんでした（監査 2026-08-20・⑥取引先）。
 *
 * → カードとして組み直します。**1行目 名前 → 2行目 電話（掛けられる）→
 *   3行目 もう1項目 → 4行目 今年度の取引（仕入先だけ）** の順。
 *
 * ── 電話は「見せる」だけでなく「掛けられる」──────────────────
 *
 * 監査の指摘は「Excel取込出力・仕入先集計を隠した代わりの導線が無い」
 * （＝表を狭めただけ）でした。この画面をスマホで開く理由は
 * 「電話の前に相手を調べる」なので、**電話番号を `tel:` リンクにする**のが
 * いちばん短い代替導線です（`SearchPage.tsx` のお客様行と同じ形）。
 */
import { Pencil, Trash2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { Party, Kind } from '../CounterpartyPage';

export function CounterpartyCards({
  items, kind, extraLabel, canEdit, onEdit, onDelete, extraOf,
}: {
  items: Party[];
  kind: Kind;
  extraLabel: string;
  canEdit: boolean;
  onEdit: (p: Party) => void;
  onDelete: (p: Party) => void;
  extraOf: (p: Party, kind: Kind) => string;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {items.map((p) => {
        const extra = extraOf(p, kind);
        const ytd = kind === 'vendor' ? Number(p.ytd_amount ?? 0) : null;
        return (
          <li key={p.id}>
            <div
              className={cn(
                'rounded-card border border-border bg-card p-3.5',
                canEdit && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={canEdit ? () => onEdit(p) : undefined}
              onKeyDown={canEdit ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(p); }
              } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span className="text-list block font-bold [overflow-wrap:anywhere]">{p.name}</span>
                  {(p.contact_name || p.role_title) && (
                    <span className="text-note mt-0.5 block truncate text-muted-foreground">
                      {p.contact_name || p.role_title}
                    </span>
                  )}
                </span>
                {canEdit && (
                  <span className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost" size="icon" aria-label="直す"
                      onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label="消す" className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </span>
                )}
              </div>

              {/*
                **電話は掛けられる形で出す。**「道具を隠した代わりの導線が無い」という
                監査の指摘への回答。`e.stopPropagation()` はクリックだけでなく
                キー操作も止める（キーボードで来た人が編集シートへ飛ばされ、
                電話が掛からないままになるのを防ぐ）
              */}
              {p.phone ? (
                <a
                  href={`tel:${p.phone.replace(/[^0-9+]/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="v4-tap mt-1.5 inline-flex items-center gap-1 font-number font-bold text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {p.phone}
                </a>
              ) : (
                <span className="text-note mt-1.5 block text-muted-foreground">電話番号なし</span>
              )}

              {extra && (
                <p className="text-note mt-1.5 truncate text-muted-foreground">
                  {extraLabel}：{extra}
                </p>
              )}

              {kind === 'vendor' && (
                <p className="mt-2 flex items-baseline justify-between border-t border-border-faint pt-2">
                  <span className="text-note text-muted-foreground">今年度の取引</span>
                  {ytd && ytd > 0 ? (
                    <Money value={ytd} className="text-list" />
                  ) : (
                    // **0円と「今年は取引なし」は別物。** 0と書くと0円の取引があるように読める
                    // ⚠️ `text-fg-disabled` は白地で 2.61:1 しか無く読ませる文字には使わない
                    // 決めごと（`shared/CLAUDE.md`）。実際の値を伝える文字なので `text-muted-foreground` に直した
                    <span className="text-sub-sm text-muted-foreground">今年はなし</span>
                  )}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
