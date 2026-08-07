/**
 * ダッシュボード上辺の数字 5つ (v4 ①)
 *
 * ── なぜカードにせず「1本の帯」なのか ──────────────────────
 *
 * モックは5つを**縦の区切り線で仕切った帯**にしています。カードを5枚並べると
 * 枠線が10本増えて、その下の本体 (案件の一覧) より目立ってしまいます。
 * ここで見たいのは数字だけなので、器は持たせません。
 *
 * ── 数字の意味 ────────────────────────────────────────────
 *
 * | 出すもの | どこから |
 * | --- | --- |
 * | 進行中の案件 | 完了・失注以外。**GLS 発番前 (ネタ) も含む** |
 * | 今週の実施 | 実施日が今日から7日以内に重なる案件 |
 * | 見積の返事待ち | `estimates` の `sent`。合計は値引きを引いたあと |
 * | 今月の受注 | `projects.won_at` (migration 164)。**モックの KPI はここ** |
 * | 止まっている案件 | 7日以上、案件もタスクも活動記録も動いていない |
 *
 * ── 「今月の受注」は記録を始めた日から ────────────────────────
 *
 * migration 164 で `projects.won_at` を足したので、モックどおり受注を出せます。
 * ただし**それより前に受注した案件は数に入りません** — いつ受注になったかが
 * どこにも残っていないためです（`updated_at` は名前を直しただけでも動くので
 * 代わりになりません）。
 *
 * **その旨を数字の下に必ず書きます。** 書かないと「受注が 0 件＝壊れた」と
 * 読まれます。1か月ぶん記録が溜まれば注記は消えます。
 */
import { FolderKanban, CalendarCheck, Receipt, TrendingUp, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatValue, manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { SalesOverview } from './types';

interface Kpi {
  key: string;
  label: string;
  icon: typeof FolderKanban;
  value: string;
  unit: string;
  sub: string;
  /** 0 でないときだけ赤くする。**常に赤い数字は色として働きません** */
  danger?: boolean;
  to?: string;
}

/** `YYYY-MM-DD` を「8/7」に */
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 受注の記録を始めたのが今月かどうか。
 * 今月なら「いつから数えているか」を出す（先月ぶんは入っていないため）。
 */
function startedThisMonth(since: string | null): boolean {
  if (!since) return true;      // 1件も記録が無い = まだ何も数えていない
  const now = new Date();
  return since.slice(0, 7) >= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function kpisOf(o: SalesOverview): Kpi[] {
  const k = o.kpi;
  return [
    {
      key: 'active', label: '進行中の案件', icon: FolderKanban,
      value: String(k.active_projects), unit: '件',
      sub: `今週動いたもの ${k.moved_this_week}件`,
      to: '/sales/projects',
    },
    {
      key: 'week', label: '今週の実施', icon: CalendarCheck,
      value: String(k.week_events), unit: '件',
      sub: k.today_events > 0 ? `うち今日 ${k.today_events}件` : '今日はありません',
      to: '/studio/calendar',
    },
    {
      key: 'quote', label: '見積の返事待ち', icon: Receipt,
      value: String(k.quote_waiting), unit: '件',
      // 0 件のときに「合計 ¥0万」と出すと、金額が 0 円の見積があるように読める
      sub: k.quote_waiting > 0 ? `合計 ${manYen(k.quote_waiting_amount)}` : '出したままの見積はありません',
    },
    {
      key: 'won', label: '今月の受注', icon: TrendingUp,
      value: manYen(k.month_won_amount), unit: '',
      // **記録を始めた日が今月なら、そう書く。** 0 件を黙って出すと壊れて見える
      sub: startedThisMonth(o.stage_history_since)
        ? `${k.month_won_count}件 ・ ${fmtDate(o.stage_history_since)}から記録`
        : `${k.month_won_count}件ぶん`,
      to: '/sales/projects?stage=a_won',
    },
    {
      key: 'stuck', label: '止まっている案件', icon: AlertTriangle,
      value: String(k.stuck_projects), unit: '件',
      sub: `${o.stuck_days}日以上動いていません`,
      danger: k.stuck_projects > 0,
    },
  ];
}

function Cell({ k }: { k: Kpi }) {
  const Icon = k.icon;
  return (
    <>
      <p className="text-note flex items-center gap-1.5 truncate text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {k.label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <StatValue size="sm" className={cn(k.danger && 'text-destructive')}>{k.value}</StatValue>
        {k.unit && <span className="text-note text-muted-foreground">{k.unit}</span>}
      </p>
      <p className="text-sub-sm truncate text-muted-foreground">{k.sub}</p>
    </>
  );
}

export function KpiStrip({ overview }: { overview: SalesOverview }) {
  return (
    // スマホは2列に折り返す。5つを横1列に押し込むと数字が読めない幅になる
    <div className="rounded-card grid grid-cols-2 gap-y-3 border border-border bg-card px-1 py-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-y-0">
      {kpisOf(overview).map((k, i) => (
        <div
          key={k.key}
          className={cn(
            'min-w-0 px-3.5 lg:px-5',
            // 区切りは**左に置く**。1つ目だけ線が要らないので i>0 で判定する
            i > 0 && 'lg:border-l lg:border-border'
          )}
        >
          {k.to ? (
            <Link to={k.to} className="block rounded-note hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Cell k={k} />
            </Link>
          ) : (
            <Cell k={k} />
          )}
        </div>
      ))}
    </div>
  );
}
