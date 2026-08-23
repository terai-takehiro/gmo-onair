/**
 * 利用マニュアル・プロジェクト管理編 (GPM) — figure その2（p7・p8・p9・p10・p11）
 *
 * `figures.tsx` と同じ2つの方針（先頭のコメント参照）。
 * 体制（p7）は色・段の意味づけだけ実装の定数（`SIDE_BORDER` 等）から借り、
 * 箱そのものは fetch/mutation を持つ `MembersTab` を埋め込まず static に組む。
 * 議事録・見積・請求・書類（p8〜p11）も同じ理由で static に再現する
 * （どれも内部で `useQuery`/`useMutation` を持つ画面のため）。
 */
import { FileText, FolderLock, FolderOpen, Mic, Upload } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import {
  SIDE_BORDER, SIDE_LABEL, SIDE_TONE, TIER_LABEL,
  type MemberSide, type MemberTier,
} from '@/contexts/gpm/types';

/** タブの横スクロールの一部だけを見せる簡易版（p5・p6 と同じ見た目・実装は `DetailHeader` のタブと同じクラス） */
function MiniTabs({ tabs, active }: { tabs: { key: string; label: string }[]; active: string }) {
  return (
    <div className="flex overflow-x-auto rounded-t-card border-b border-border bg-card px-4 pt-3">
      {tabs.map((t) => (
        <span
          key={t.key}
          className={cn(
            'min-h-tap text-list inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 lg:min-h-[44px]',
            t.key === active ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground',
          )}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════
// p7 — 体制（組織図）
// ══════════════════════════════════════════════════
interface Box { key: string; label: string; side: MemberSide; hi?: boolean; members: { name: string; role: string }[] }

const TIERS: { tier: MemberTier; boxes: Box[] }[] = [
  {
    tier: 'top',
    boxes: [{ key: 'client', label: '発注者', side: 'client', hi: true, members: [{ name: '田中様', role: '発注者' }] }],
  },
  {
    tier: 'lead',
    boxes: [{ key: 'pm', label: '全体統括', side: 'internal', members: [{ name: '寺井 赳博', role: '自社PM' }] }],
  },
  {
    tier: 'unit',
    boxes: [
      { key: 'design', label: '設計ユニット', side: 'vendor', members: [{ name: '井上 直樹', role: '設計ユニット' }] },
      { key: 'av', label: '日建スペースデザイン', side: 'vendor', members: [{ name: '日建スペースデザイン', role: 'AV設計・機材選定' }] },
    ],
  },
];

export function OrgChartFigure() {
  return (
    <div className="flex min-w-[560px] flex-col gap-1">
      {TIERS.map(({ tier, boxes }, i) => (
        <div key={tier}>
          {i > 0 && <div className="mx-auto h-5 w-px bg-border" aria-hidden="true" />}
          <p className="text-cardtitle mb-2">{TIER_LABEL[tier]}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {boxes.map((b) => (
              <section
                key={b.key}
                className={cn(
                  'rounded-card overflow-hidden border-2 bg-card',
                  SIDE_BORDER[b.side],
                  b.hi && 'ring-2 ring-primary/40',
                )}
              >
                <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-subtle px-3 py-2">
                  <h3 className="text-list min-w-0 flex-1 truncate">{b.label}</h3>
                  <span className={cn('text-badge rounded-badge px-1.5 py-0.5', SIDE_TONE[b.side])}>
                    {SIDE_LABEL[b.side]}
                  </span>
                </div>
                <ul>
                  {b.members.map((m) => (
                    <li key={m.name} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="text-list block truncate">{m.name}</span>
                        <span className="text-sub-sm block truncate text-muted-foreground">{m.role}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════
// p8 — 議事録
// ══════════════════════════════════════════════════
export function MinutesFigure() {
  return (
    <div className="flex min-w-[560px] flex-col gap-3">
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <MiniTabs
          tabs={[{ key: 'overview', label: '概要' }, { key: 'members', label: '体制' }, { key: 'minutes', label: '議事録' }]}
          active="minutes"
        />
        <div className="p-4">
          <EmptyState
            title="議事録はまだありません"
            description="打合せを録音すると、文字起こし→下書きまで作ります。"
          />
        </div>
      </div>
      <Button disabled className="self-start">
        <Mic className="mr-2 h-4 w-4" aria-hidden="true" />打合せを録音する
      </Button>
    </div>
  );
}

// ══════════════════════════════════════════════════
// p9 — 個別見積
// ══════════════════════════════════════════════════
export function EstimatesFigure() {
  return (
    <div className="min-w-[620px] overflow-hidden rounded-card border-2 border-primary-border-strong bg-card">
      <MiniTabs
        tabs={[
          { key: 'members', label: '体制' }, { key: 'minutes', label: '議事録' },
          { key: 'estimates', label: '見積' }, { key: 'billing', label: '請求' },
        ]}
        active="estimates"
      />
      <div className="p-4">
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden="true" />}
          title="見積はまだありません"
          description="提出先（自社／依頼元／PM会社）ごとに1本ずつ作ります。"
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// p10 — 毎月の請求（月締め）
// ══════════════════════════════════════════════════
function MoneyStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-right">
      <span className="text-sub-sm block text-muted-foreground">{label}</span>
      <Money value={value} inline className="justify-end" />
    </span>
  );
}

const BILLING_BADGES: { label: string; tone: string }[] = [
  { label: '明細編集', tone: 'bg-muted text-muted-foreground' },
  { label: '見積書', tone: 'bg-muted text-muted-foreground' },
  { label: '請求書', tone: 'bg-success-surface text-success' },
  { label: '検収書', tone: 'bg-muted text-muted-foreground' },
  { label: 'Excel', tone: 'bg-muted text-muted-foreground' },
];

export function BillingFigure() {
  return (
    <div className="flex min-w-[640px] flex-col gap-3">
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <MiniTabs
          tabs={[
            { key: 'minutes', label: '議事録' }, { key: 'estimates', label: '見積' },
            { key: 'billing', label: '請求' }, { key: 'files', label: '書類' },
          ]}
          active="billing"
        />
      </div>
      <section className="rounded-card border-2 border-primary-border-strong bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-cardtitle">GLS-B005-2606</p>
            <p className="text-sub text-muted-foreground">2026年6月</p>
          </div>
          <div className="flex gap-4">
            <MoneyStat label="売上" value={109500} />
            <MoneyStat label="仕入" value={109500} />
            <MoneyStat label="粗利" value={0} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BILLING_BADGES.map((b) => (
            <span key={b.label} className={cn('text-badge rounded-badge px-2.5 py-1', b.tone)}>{b.label}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════════
// p11 — 書類（BOX の2フォルダ）
// ══════════════════════════════════════════════════
export function FilesFigure() {
  return (
    <div className="flex min-w-[640px] flex-col gap-2.5">
      <section className="overflow-hidden rounded-card border border-border bg-card">
        <div className="border-b border-destructive-border bg-destructive-surface p-4">
          <h2 className="text-cardtitle flex items-center gap-2 text-destructive">
            <FolderLock className="h-4 w-4" aria-hidden="true" />社内限り
          </h2>
          <p className="text-note mt-1 text-secondary-foreground">
            仕入値・発注書・原価。発注者にもPM会社にも見せません
          </p>
        </div>
      </section>
      <section className="overflow-hidden rounded-card border border-border bg-card">
        <div className="border-b border-success-border bg-success-surface p-4">
          <h2 className="text-cardtitle flex items-center gap-2 text-success">
            <FolderOpen className="h-4 w-4" aria-hidden="true" />社外共有可
          </h2>
          <p className="text-note mt-1 text-secondary-foreground">
            個別見積・議事メモ・図面・仕様書・工程表。相手と一緒に進めるもの
          </p>
        </div>
      </section>
      <div className="m-3 flex flex-col items-center gap-2 rounded-note border border-dashed border-border bg-surface-subtle p-4 text-center">
        <p className="text-note text-muted-foreground">ここに落とすと入ります（5つまで）。</p>
        <Button variant="outline" disabled>
          <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />ファイルを選ぶ
        </Button>
      </div>
    </div>
  );
}
