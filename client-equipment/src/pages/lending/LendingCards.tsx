/**
 * ⑦ 貸出・返却 — スマホ版のカード積み（M12）
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md` equipment-lendings）の指摘:
 * 「PC表の列を hideOnMobile で間引いただけ（持出日がスマホで非表示）で
 * 専用モバイルレイアウトが無い」を受けて、PC の罫線区切りリスト
 * （`LendingListPage.tsx` の `Row`）とは別に、スマホだけ独立したカードを積む形にした。
 * **PC の行を縮めたものではない**（`production/pages/holds/HoldCards.tsx` /
 * `maintenance/MaintenanceCards.tsx` と同じ考え方）。
 *
 * **持出日は PC で `hideOnMobile` にしていた列。** ここでは畳まず、返却予定と並ぶ
 * 「事実」の並びに常に出す — 現場で「いつ持ち出したか」を確かめる画面なので、
 * 持出日が消えていると「あと何日借りているか」が分からない。
 *
 * ダイアログ（貸出・返却）は既に `FormDialog` へ移行済みなのでここでは触らない。
 * ボタンは変わらず `LendingListPage.tsx` が持つミューテーションを呼ぶだけ。
 */
import { PackageCheck, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { Lending } from './types';

const md = (d: string | null | undefined) => (d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—');

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-secondary-foreground">{value}</dd>
    </div>
  );
}

export function LendingCards({
  rows, isLate, checkoutPending, onCheckout, onReturn,
}: {
  rows: Lending[];
  isLate: (l: Lending) => boolean;
  /** いま「出した」を送っている最中か（送信中は全カードのボタンを止める） */
  checkoutPending: boolean;
  onCheckout: (id: string) => void;
  onReturn: (l: Lending) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((l) => {
        const late = isLate(l);
        return (
          <div key={l.id} className="rounded-card flex flex-col gap-2.5 border border-border bg-card p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="min-w-0 flex-1">
                <span className="text-list block font-bold [overflow-wrap:anywhere]">
                  {l.equipment_name}
                  {l.unit_number != null && <span className="ml-1 text-primary">No.{l.unit_number}</span>}
                </span>
                <span className="text-sub mt-0.5 block text-muted-foreground [overflow-wrap:anywhere]">
                  {[l.borrower_name, l.gls_number, l.project_name, l.purpose].filter(Boolean).join(' ／ ')}
                </span>
              </span>
              <TableBadge
                label={l.status === 'planned' ? '出庫予定'
                  : l.status === 'lent' ? (late ? '返却遅延' : '貸出中') : '返却済'}
                w={null}
                className={cn('shrink-0', late
                  ? 'bg-destructive-surface text-destructive border-transparent'
                  : l.status === 'planned'
                    ? 'bg-warning-surface text-warning border-transparent'
                    : l.status === 'lent'
                      ? 'bg-primary-surface-weak text-primary border-transparent'
                      : 'bg-muted text-muted-foreground border-transparent')}
              />
            </div>

            {/* **持出日・返却予定。** PC では持出日を hideOnMobile で畳んでいたが常に出す */}
            <dl className="text-sub flex flex-col gap-1 border-t border-border pt-2.5">
              <Fact
                label={l.status === 'planned' ? '出庫予定' : '持出日'}
                value={l.status === 'planned' ? md(l.planned_out_date) : md(l.lent_at)}
              />
              <Fact
                label={l.status === 'lent' ? '返却予定' : '返却日'}
                value={l.status === 'lent' ? md(l.due_date) : md(l.returned_at)}
              />
            </dl>

            {l.status === 'planned' && (
              <Button className="w-full" variant="outline" disabled={checkoutPending} onClick={() => onCheckout(l.id)}>
                <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />出した
              </Button>
            )}
            {l.status === 'lent' && (
              <Button className="w-full" variant="outline" onClick={() => onReturn(l)}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />返却
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
