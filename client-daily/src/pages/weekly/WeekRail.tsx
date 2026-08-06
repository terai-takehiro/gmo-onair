/**
 * ウィークリー活動報告 — 左の「週のリスト」 (v4)
 *
 * ── なぜ1画面 (master-detail) にしたか ──────────────────────
 *
 * 以前は 一覧 (`/weekly`) と 中身 (`/weekly/:id`) の2画面で、
 * **先週と今週を見比べるのに毎回一覧へ戻る**必要があった。週報は
 * 「先週なんて書いたか」を見ながら書くものなので、行き来が本題を邪魔していた。
 *
 * 週のリストは左に置いたまま中身だけ差し替える。**URL は `/weekly/:id` のまま**
 * なので、ブックマークもリンクもそのまま生きる。
 *
 * スマホでは横に並べられないので、リストを**上に畳んで横スクロール**にする
 * (縦に積むと、中身に着くまで週のリストを全部スクロールすることになる)。
 */
import { NavLink } from 'react-router-dom';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { formatWeekJa, type OpsReport } from '@/lib/types';

export function WeekRail({ reports, activeId }: { reports: OpsReport[]; activeId?: string }) {
  return (
    <nav
      aria-label="週を選ぶ"
      className="flex shrink-0 gap-2 overflow-x-auto rounded-card border border-border bg-card p-2 lg:w-[240px] lg:flex-col lg:overflow-x-visible"
    >
      {reports.map((r) => {
        const published = r.status === 'published';
        const active = r.id === activeId;
        return (
          <NavLink
            key={r.id}
            to={`/weekly/${r.id}`}
            className={`min-h-tap flex shrink-0 flex-col justify-center rounded-control px-3 py-2 lg:min-h-[46px] ${
              active ? 'bg-primary-surface text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            <span className="text-list whitespace-nowrap">{formatWeekJa(r.period_key)}</span>
            <span className="text-sub-sm inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
              {published
                ? <><CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />確定済み</>
                : <><CircleDashed className="h-3 w-3 text-warning" aria-hidden="true" />下書き</>}
              {typeof r.item_count !== 'undefined' && <span className="font-number">・トピック {r.item_count}</span>}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
