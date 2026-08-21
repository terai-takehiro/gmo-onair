/**
 * 「探す」— PC の結果（`Row` の罫線区切りリスト）
 *
 * スマホ版（`SearchCards.tsx`）はカード積みだが、PC は一覧を眺めながら
 * 目的の1点まで視線を落としていく画面なので、このアプリの機材台帳
 * （`equipmentList/EquipmentTable.tsx`）と同じ**罫線区切りの表**を使う
 * （このアプリの `scan/ScanHistoryRows.tsx` と同じ考え方）。
 */
import { Cable, ChevronRight, Package, type LucideIcon } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import type { EquipmentRecord } from '../equipmentList/types';
import type { CatalogItem } from '../catalog/types';
import type { StandbyRow } from './standby';

/** 押せる行。**キーボードでも押せるようにする**（`onClick` だけの `<div>` は Tab で止まらない） */
function ClickRow({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <Row
      divider
      interactive
      align="start"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Row>
  );
}

function GroupPanel({ icon: Icon, label, n, children }: {
  icon: LucideIcon; label: string; n: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-faint bg-surface-subtle px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {label}
        <span className="text-sub font-number font-bold text-muted-foreground">{n}</span>
      </h2>
      {children}
    </section>
  );
}

export function StandbyRows({ rows, onGo }: { rows: StandbyRow[]; onGo: (to: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <GroupPanel icon={rows[0].icon} label="いまの様子" n={rows.length}>
      {rows.map((r) => (
        <ClickRow key={r.key} onOpen={() => onGo(r.to)}>
          <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <RowMain>
            <RowTitle>{r.title}</RowTitle>
            <RowSub>{r.sub}</RowSub>
          </RowMain>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </ClickRow>
      ))}
    </GroupPanel>
  );
}

export function EquipmentResultRows({
  items, onOpen,
}: {
  items: EquipmentRecord[];
  onOpen: (id: string) => void;
}) {
  return (
    <GroupPanel icon={Package} label="機材" n={items.length}>
      {items.map((it) => (
        <ClickRow key={it.id} onOpen={() => onOpen(it.id)}>
          <RowMain>
            <RowTitle>{it.name}</RowTitle>
            <RowSub>
              {[it.eq_code, it.model_number, it.unit_number != null ? `No.${it.unit_number}` : '']
                .filter(Boolean).join(' ／ ')}
            </RowSub>
            <RowSub>
              {[it.manufacturer_name, it.location_name || it.location_detail]
                .filter(Boolean).join(' ・ ') || '置き場所は登録されていません'}
            </RowSub>
          </RowMain>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </ClickRow>
      ))}
    </GroupPanel>
  );
}

export function SupplyResultRows({
  items, onOpen,
}: {
  items: CatalogItem[];
  onOpen: () => void;
}) {
  return (
    <GroupPanel icon={Cable} label="ケーブル・コネクタ" n={items.length}>
      {items.map((it) => (
        <ClickRow key={`${it.kind}-${it.id}`} onOpen={onOpen}>
          <RowMain>
            <RowTitle>{it.name}</RowTitle>
            <RowSub>
              {[it.model_number, it.length_m != null ? `${it.length_m}m` : '', it.color,
                it.location_name, `${it.quantity} 本`].filter(Boolean).join(' ・ ')}
            </RowSub>
          </RowMain>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </ClickRow>
      ))}
    </GroupPanel>
  );
}
