/**
 * ④ メンテナンス — スマホ版のカード積み（M11）
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md` equipment-maintenance）の指摘:
 * 「PC表の列を hideOnMobile で間引いただけ（業者名・報告日がスマホで非表示）」
 * 「状態変更が Select のままで iOS アプリ的なアクションシートが無い」
 * を受けて、PC の罫線区切りリスト（`MaintenancePage.tsx` の `Row`）とは別に、
 * スマホだけ独立したカードを積む形にした。**PC の行を縮めたものではない**
 * （`production/pages/holds/HoldCards.tsx` / `search/SearchCards.tsx` と同じ考え方）。
 *
 * **業者名・報告日は PC で `hideOnMobile` にしていた2つ。** ここでは畳まず、
 * 費用と並ぶ「事実」の並びに常に出す — 現場で「これ、どこに直しに出したっけ」を
 * 確かめる画面なので、業者名が消えていると意味が無い。
 *
 * **状態は「報告済 → 対応中 → 完了」の途中だけ押せるチップにし、
 * 押すと下から出るシートで選ばせる**（`taskList/MobileTaskList.tsx` と同じ形）。
 * 素の `<select>` は iOS ではネイティブのホイールになるので手触り自体は悪くないが、
 * **選ぶ前に他の選択肢が見えない**（開くまで中身が分からない）。
 * シートなら4つの状態が最初から並んで見える。
 */
import { useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import type { MaintenanceRecord } from './types';

/** バッジ・チップの色。`MaintenancePage.tsx` と同じ表（写すと片方だけ直したとき食い違う） */
export const STATUS_TONE: Record<string, string> = {
  reported: 'bg-warning-surface text-warning border-transparent',
  in_progress: 'bg-info-surface text-info border-transparent',
  completed: 'bg-success-surface text-success border-transparent',
  cancelled: 'bg-muted text-muted-foreground border-transparent',
};

/** 選べる状態。`MaintenancePage.tsx` の旧 `<Select>` と同じ4つ・同じ表記 */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'reported', label: '報告済' },
  { value: 'in_progress', label: '対応中' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: '取りやめ' },
];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-secondary-foreground">{value}</dd>
    </div>
  );
}

export function MaintenanceCards({
  records, onChangeStatus, savingId,
}: {
  records: MaintenanceRecord[];
  onChangeStatus: (record: MaintenanceRecord, status: string) => void;
  /** いま状態変更を送っている記録の id。押した札だけ回す */
  savingId: string | null;
}) {
  const [target, setTarget] = useState<MaintenanceRecord | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {records.map((r) => {
        const fixed = r.status === 'completed' || r.status === 'cancelled';
        const saving = savingId === r.id;
        return (
          <div key={r.id} className="rounded-card flex flex-col gap-2.5 border border-border bg-card p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="min-w-0 flex-1">
                <span className="text-sub-sm block text-muted-foreground">
                  {statusOf(MAINTENANCE_TYPE, r.record_type).label}
                </span>
                <span className="text-list block font-bold [overflow-wrap:anywhere]">{r.title}</span>
                <span className="text-sub mt-0.5 block text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="font-number text-primary">{r.eq_code}</span> ・ {r.equipment_name}
                </span>
                {r.description && (
                  <span className="text-sub mt-0.5 block text-muted-foreground [overflow-wrap:anywhere]">
                    {r.description}
                  </span>
                )}
              </span>
              <Money value={r.repair_cost} inline className="shrink-0 text-list font-bold" />
            </div>

            {/* **業者名・報告日。** PC では hideOnMobile で畳んでいた2つを常に出す */}
            <dl className="text-sub flex flex-col gap-1 border-t border-border pt-2.5">
              <Fact label="業者" value={r.vendor_name || '未登録'} />
              <Fact
                label="報告日"
                value={r.reported_at ? r.reported_at.slice(5, 10).replace('-', '/') : '未登録'}
              />
            </dl>

            <div>
              {fixed ? (
                <TableBadge label={statusOf(MAINTENANCE_STATUS, r.status).label} w={null} className={STATUS_TONE[r.status]} />
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setTarget(r)}
                  aria-label={`${r.title} の状態を変える。いまは${statusOf(MAINTENANCE_STATUS, r.status).label}`}
                  className={cn(
                    'min-h-tap rounded-control inline-flex items-center gap-1.5 border px-3 text-sub font-bold disabled:opacity-60',
                    STATUS_TONE[r.status],
                  )}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {statusOf(MAINTENANCE_STATUS, r.status).label}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {target && (
        <Sheet
          open
          onOpenChange={(v) => !v && setTarget(null)}
          title="状態を変える"
          sub={target.title}
        >
          <div className="flex flex-col gap-1 pt-1">
            {STATUS_OPTIONS.map((opt) => {
              const active = target.status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingId === target.id}
                  onClick={() => {
                    onChangeStatus(target, opt.value);
                    setTarget(null);
                  }}
                  className={cn(
                    'min-h-tap rounded-control flex items-center justify-between px-3 text-list disabled:opacity-60',
                    active ? 'bg-primary-surface font-bold text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  {opt.label}
                  {active && <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}
