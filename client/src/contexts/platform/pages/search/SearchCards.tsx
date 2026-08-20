/**
 * 「探す」— スマホのカード積み
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md` search-sales）の指摘:
 * 「結果セクション（案件/お客様/仕入先）がカード化されておらず、PCと同じ罫線区切り
 * リストのまま」を受けて、PC の罫線区切りリスト（`SearchPageDesktop.tsx`）とは別に、
 * スマホだけ独立したカードを積む形にした。**PC の行を縮めたものではない**
 * （案件一覧の `sales/pages/projectList/ProjectCards.tsx`・機材管理の
 * `pages/search/SearchCards.tsx` と同じ考え方）。
 *
 * **アイコンの色で先に種類を見分けられるようにした。** 案件＝プライマリ・
 * お客様＝インフォ・仕入先とやること以外の場所＝グレーと、意味の重さで
 * 色を分けている（元の `Row` 版は全部同じ灰色のアイコンだった）。
 */
import type { KeyboardEvent, ReactNode } from 'react';
import { Building2, ChevronRight, Clock, FolderKanban, Truck, X, type LucideIcon } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import type { RecentItem } from '@gmo-onair/shared/src/client-v4/recent';
import type { Shortcut } from './shortcuts';
import type { SearchResults } from './types';

/**
 * 押せるカード。**`<div role="button">` にしてある** — お客様カードは中に
 * 電話番号リンクを持つので、素の `<button>` にすると押せるものの入れ子になる
 * （HTML として無効なうえ、キー操作が読めなくなる）。案件一覧と同じ、
 * `Row` の `ClickRow`（PC版）とも同じ「キーボードでも押せる div」の形に揃えた。
 */
function TapCard({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className="rounded-card min-h-tap flex w-full cursor-pointer items-start gap-3 border border-border bg-card p-3 text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </div>
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

/** やること・場所。**行き先の名前ではなく「何が起きるか」を下に書く**（PC版と同じ） */
export function ShortcutCards({
  icon, label, headingId, items, tone, onOpen,
}: {
  icon: LucideIcon; label: string; headingId: string; items: Shortcut[]; tone: string; onOpen: (s: Shortcut) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <SectionEyebrow icon={icon} label={label} n={items.length} headingId={headingId} />
      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <TapCard key={s.key} onOpen={() => onOpen(s)}>
            <IconBadge icon={s.icon} tone={tone} />
            <span className="min-w-0 flex-1 self-center">
              <span className="text-list block truncate font-bold text-foreground">{s.label}</span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">{s.sub}</span>
            </span>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 self-start text-muted-foreground" aria-hidden="true" />
          </TapCard>
        ))}
      </div>
    </section>
  );
}

/**
 * 最近見たもの。**削除ボタンをカードの右端に外付けする**（同じカードの中で
 * 「開く」と「消す」を両方タップにすると、消したいだけなのに開いてしまう。
 * 監査の指摘「読むだけで削除操作が無い」に対応した部分）。
 */
export function RecentCards({
  items, onOpen, onRemove,
}: {
  items: RecentItem[]; onOpen: (to: string) => void; onRemove: (to: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-recent-m">
      <SectionEyebrow icon={Clock} label="最近見たもの" n={items.length} headingId="search-recent-m" />
      <div className="flex flex-col gap-2">
        {items.map((r) => (
          <div key={r.to} className="rounded-card flex items-stretch gap-0.5 border border-border bg-card">
            <button
              type="button"
              onClick={() => onOpen(r.to)}
              className="min-h-tap flex min-w-0 flex-1 items-center gap-3 p-3 text-left active:bg-muted"
            >
              <IconBadge icon={r.kind === 'customer' ? Building2 : FolderKanban} tone="bg-muted text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="text-list block truncate font-bold text-foreground">{r.label}</span>
                <span className="text-sub mt-0.5 block truncate text-muted-foreground">
                  {[r.kind === 'customer' ? 'お客様' : '案件', r.sub].filter(Boolean).join(' ・ ')}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`「${r.label}」を最近見たものから消す`}
              onClick={() => onRemove(r.to)}
              className="v4-tap flex shrink-0 items-center justify-center px-3 text-muted-foreground active:text-destructive"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProjectResultCards({
  items, onOpen,
}: {
  items: SearchResults['projects']; onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-project-m">
      <SectionEyebrow icon={FolderKanban} label="案件" n={items.length} headingId="search-project-m" />
      <div className="flex flex-col gap-2">
        {items.map((p) => (
          <TapCard key={p.id} onOpen={() => onOpen(p.id)}>
            <IconBadge icon={FolderKanban} tone="bg-primary-surface text-primary" />
            <span className="min-w-0 flex-1 self-center">
              <span className="text-list block truncate font-bold text-foreground">{p.name}</span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">{p.gls_number || p.code}</span>
            </span>
            <span className="rounded-badge mt-1 shrink-0 border px-1.5 py-0.5 text-badge text-muted-foreground">
              {statusOf(PROJECT_STAGE, p.stage).label}
            </span>
          </TapCard>
        ))}
      </div>
    </section>
  );
}

export function CustomerResultCards({
  items, onOpen,
}: {
  items: SearchResults['customers']; onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-customer-m">
      <SectionEyebrow icon={Building2} label="お客様" n={items.length} headingId="search-customer-m" />
      <div className="flex flex-col gap-2">
        {items.map((c) => (
          <TapCard key={c.id} onOpen={() => onOpen(c.id)}>
            <IconBadge icon={Building2} tone="bg-info-surface text-info" />
            <span className="min-w-0 flex-1 self-center">
              <span className="text-list block truncate font-bold text-foreground">{c.name}</span>
              {c.short_name && (
                <span className="text-sub mt-0.5 block truncate text-muted-foreground">{c.short_name}</span>
              )}
              {/*
                ⚠️ **電話番号はここに出す**（PC版と同じ理由・レビューでの指摘 #73）。
                お客様の詳細はスマホでは PC 専用の案内に差し替わるので、
                外から電話をかけたい人は番号に辿り着けない。**画面を開かずに答えにする**
              */}
              {c.phone && (
                <span className="text-sub mt-0.5 block">
                  <a
                    href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}
                    // ⚠️ **押下だけでなくキー操作も止める**（PC版と同じ・レビューでの指摘 #140）。
                    // 止めないと、番号に来て Enter を押した人はお客様の画面へ飛ばされる
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="v4-tap font-number font-bold text-primary hover:underline"
                  >
                    {c.phone}
                  </a>
                  {c.contact_name && <span className="ml-2 text-muted-foreground">{c.contact_name}</span>}
                </span>
              )}
            </span>
          </TapCard>
        ))}
      </div>
    </section>
  );
}

export function VendorResultCards({
  items, onOpen,
}: {
  items: SearchResults['vendors']; onOpen: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="search-vendor-m">
      <SectionEyebrow icon={Truck} label="仕入先" n={items.length} headingId="search-vendor-m" />
      <div className="flex flex-col gap-2">
        {items.map((v) => (
          // **仕入先だけ個別の画面が無い**ので一覧へ送る（PC版と同じ）
          <TapCard key={v.id} onOpen={onOpen}>
            <IconBadge icon={Truck} tone="bg-muted text-muted-foreground" />
            <span className="min-w-0 flex-1 self-center">
              <span className="text-list block truncate font-bold text-foreground">{v.name}</span>
              {v.vendor_type && (
                <span className="text-sub mt-0.5 block truncate text-muted-foreground">{v.vendor_type}</span>
              )}
            </span>
          </TapCard>
        ))}
      </div>
    </section>
  );
}
