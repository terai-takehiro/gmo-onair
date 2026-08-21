/**
 * お客様の詳細（顧客360）— 取引実績サマリー (v4)
 *
 * ダッシュボードの `KpiStrip.tsx`（`salesDashboard/`）と同じ考え方
 * （数字は大きく・単位は12pxのグレーで別要素・状態色は「効いているときだけ」）
 * だが、あちらは「1本の帯」・こちらは**個別カード**にしてある。ダッシュボードの
 * 5つは並びで見比べる数字だが、ここの4つは意味がバラバラ（金額・件数の比・
 * 経過日数・件数）で、警告色（最終接点30日超・未完了アクションあり）を
 * 個別に効かせたいのでカードのほうが読みやすい。
 */
import type { LucideIcon } from 'lucide-react';
import { CalendarClock, Clock, FolderKanban, TrendingUp } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { daysSince, type CustomerSummary } from './types';

type Emphasis = 'warning' | 'info' | undefined;

const TILE_TONE: Record<'warning' | 'info', string> = {
  warning: 'border-warning-border bg-warning-surface',
  info: 'border-info-border bg-info-surface',
};
const ICON_TONE: Record<'warning' | 'info', string> = {
  warning: 'text-warning',
  info: 'text-info',
};

function Tile({
  icon: Icon, label, emphasis, children, sub,
}: {
  icon: LucideIcon; label: string; emphasis?: Emphasis; children: React.ReactNode; sub?: string;
}) {
  return (
    <div className={cn(
      'rounded-card min-w-0 border p-3',
      emphasis ? TILE_TONE[emphasis] : 'border-border bg-card',
    )}>
      <p className="text-note flex items-center gap-1.5 truncate text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', emphasis && ICON_TONE[emphasis])} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">{children}</p>
      {sub && <p className="text-note truncate text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SummaryTiles({ summary: s }: { summary: CustomerSummary }) {
  const since = daysSince(s.last_contact_date);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
      <Tile icon={TrendingUp} label="累計売上（確定）">
        <Money inline value={s.confirmed_revenue} className="text-xl font-bold sm:text-2xl" />
      </Tile>

      <Tile icon={FolderKanban} label="案件数" sub="進行中 ／ 全体">
        <StatValue size="sm">{s.project_active.toLocaleString('ja-JP')}</StatValue>
        <span className="text-note text-muted-foreground">／ {s.project_total.toLocaleString('ja-JP')}件</span>
      </Tile>

      <Tile
        icon={Clock}
        label="最終接点"
        emphasis={since !== null && since >= 30 ? 'warning' : undefined}
        sub={s.last_contact_date ?? undefined}
      >
        {since === null ? (
          <StatValue size="sm">—</StatValue>
        ) : since === 0 ? (
          <StatValue size="sm">今日</StatValue>
        ) : (
          <>
            <StatValue size="sm">{since.toLocaleString('ja-JP')}</StatValue>
            <span className="text-note text-muted-foreground">日前</span>
          </>
        )}
      </Tile>

      <Tile
        icon={CalendarClock}
        label="未完了アクション"
        emphasis={s.open_actions > 0 ? 'info' : undefined}
      >
        <StatValue size="sm">{s.open_actions.toLocaleString('ja-JP')}</StatValue>
        <span className="text-note text-muted-foreground">件</span>
      </Tile>
    </div>
  );
}
