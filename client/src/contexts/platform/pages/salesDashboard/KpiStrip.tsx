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
 * | 今月の売上 | `revenues` の**確定分だけ** |
 * | 止まっている案件 | 7日以上、案件もタスクも活動記録も動いていない |
 *
 * **「今月の受注」ではなく「今月の売上（確定）」です。** モックは受注額を
 * 出していますが、いまの DB は**ステージが変わった日を記録していない**ので、
 * 「今月 受注になった案件」を数えられません (`projects.updated_at` は
 * 名前を直しただけでも動くので代わりになりません)。**数えられないものを
 * それらしく出すより、実際にある数字を出します。** 履歴を残すようにしたら
 * 受注額に差し替えます。
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
      key: 'revenue', label: '今月の売上（確定）', icon: TrendingUp,
      value: manYen(k.month_revenue), unit: '',
      sub: `${k.month_revenue_count}件ぶん`,
      to: '/budget/revenues',
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
