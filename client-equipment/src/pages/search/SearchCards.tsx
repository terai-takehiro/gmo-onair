/**
 * 「探す」— スマホのカード積み
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md` equipment-search）の指摘:
 * 「結果一覧が汎用 Row/RowMain の流用でカード積み等の専用表現になっていない」
 * を受けて、PC の罫線区切りリスト（`SearchResultRows.tsx`）とは別に、
 * スマホだけ独立したカードを積む形にした。**PC の行を縮めたものではない**
 * （`production/pages/holds/HoldCards.tsx` / このアプリの
 * `scan/ScanHistoryCards.tsx` と同じ考え方）。
 *
 * **アイコンの色で先に見分けられるようにした。** 「いまの様子」は 貸出中＝青・
 * 直していないもの＝橙・棚卸しの途中＝赤 と、意味の重さで色を分けている
 * （元の Row 版は全部同じ灰色のアイコンだった。データも判定も変えていない）。
 */
import type { ReactNode } from 'react';
import { Cable, ChevronRight, Package, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { EquipmentRecord } from '../equipmentList/types';
import type { CatalogItem } from '../catalog/types';
import { KIND_LABELS, KIND_TONE } from '../catalog/types';
import type { StandbyRow } from './standby';

/** 押せるカード。**押した手応え**（`active:`）を付ける（v4 の決めごと「押せるものには反応を」） */
function TapCard({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-card min-h-tap flex w-full items-start gap-3 border border-border bg-card p-3 text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function IconBadge({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tone)}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function SectionEyebrow({ icon: Icon, label, n, headingId }: {
  icon: LucideIcon; label: string; n: number; headingId: string;
}) {
  return (
    <div className="v4-eyebrow flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <h2 id={headingId}>{label}</h2>
      <span className="font-number text-muted-foreground">{n}</span>
    </div>
  );
}

/**
 * 打ち込む前に出す「いまの様子」。**メニューの写しにしない** —
 * 出すのは「いまどうなっているか」だけで、0 のものは出さない（呼ぶ側で絞り込み済み）。
 */
export function StandbyCards({
  rows, onGo,
}: {
  rows: StandbyRow[];
  onGo: (to: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-standby-m">
      <SectionEyebrow icon={Search} label="いまの様子" n={rows.length} headingId="search-standby-m" />
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <TapCard key={r.key} onOpen={() => onGo(r.to)}>
            <IconBadge icon={r.icon} tone={r.tone} />
            <span className="min-w-0 flex-1 self-center">
              <span className="text-list block truncate font-bold text-foreground">{r.title}</span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">{r.sub}</span>
            </span>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 self-start text-muted-foreground" aria-hidden="true" />
          </TapCard>
        ))}
      </div>
    </section>
  );
}

export function EquipmentResultCards({
  items, onOpen,
}: {
  items: EquipmentRecord[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-equipment-m">
      <SectionEyebrow icon={Package} label="機材" n={items.length} headingId="search-equipment-m" />
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <TapCard key={it.id} onOpen={() => onOpen(it.id)}>
            <IconBadge icon={Package} tone="bg-primary-surface text-primary" />
            <span className="min-w-0 flex-1 self-center">
              <span className="text-list block truncate font-bold text-foreground">{it.name}</span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">
                {[it.eq_code, it.model_number, it.unit_number != null ? `No.${it.unit_number}` : '']
                  .filter(Boolean).join(' ／ ')}
              </span>
              <span className="text-sub block truncate text-muted-foreground">
                {[it.manufacturer_name, it.location_name || it.location_detail]
                  .filter(Boolean).join(' ・ ') || '置き場所は登録されていません'}
              </span>
            </span>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 self-start text-muted-foreground" aria-hidden="true" />
          </TapCard>
        ))}
      </div>
    </section>
  );
}

export function SupplyResultCards({
  items, onOpen,
}: {
  items: CatalogItem[];
  onOpen: () => void;
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-supply-m">
      <SectionEyebrow icon={Cable} label="ケーブル・コネクタ" n={items.length} headingId="search-supply-m" />
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <TapCard key={`${it.kind}-${it.id}`} onOpen={onOpen}>
            <IconBadge icon={Cable} tone="bg-muted text-muted-foreground" />
            <span className="min-w-0 flex-1 self-center">
              <span className="flex items-center gap-1.5">
                <span className="text-list truncate font-bold text-foreground">{it.name}</span>
                <span className={cn('rounded-badge shrink-0 border px-1.5 py-0.5 text-badge', KIND_TONE[it.kind])}>
                  {KIND_LABELS[it.kind]}
                </span>
              </span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">
                {[it.model_number, it.length_m != null ? `${it.length_m}m` : '', it.color,
                  it.location_name, `${it.quantity} 本`].filter(Boolean).join(' ・ ')}
              </span>
            </span>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 self-start text-muted-foreground" aria-hidden="true" />
          </TapCard>
        ))}
      </div>
    </section>
  );
}
