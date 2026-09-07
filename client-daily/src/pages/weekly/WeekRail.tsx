/**
 * ウィークリー活動報告 — 左の「週のリスト」(PC専用) (v4)
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
 * ── スマホは別部品 ──────────────────────────────────────────
 *
 * 以前はここを横スクロールにして流用していたが、それだけでは専用の週ピッカー
 * になっていなかった（`docs/v4-native-ui-audit-2026-08-20.md` 指摘）。
 * スマホは `./WeekPickerSheet.tsx`（ボタン + シート）に差し替え済み
 * （出し分けは `WeeklyDetailPage.tsx` の `useIsMobile()`）。この部品は
 * 1024px 以上でだけ描かれるので、横スクロールの畳みは不要。
 *
 * ── 「次の週を作る」ボタン ──────────────────────────────────
 *
 * 週の箱は自動生成のはずが、その定期実行トリガーが未実装なので検証環境が
 * 止まっていた。閲覧権限しかない人には出さないため、`onAddNextWeek` を
 * 渡すかどうかは呼び出し側（`WeeklyDetailPage.tsx`）の責務にしてある。
 */
import { NavLink } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWeekJa, type OpsReport } from '@/lib/types';

export function WeekRail({
  reports, activeId, onAddNextWeek, addingNextWeek,
}: {
  reports: OpsReport[];
  activeId?: string;
  /** 未指定なら「次の週を作る」ボタンは出さない（閲覧権限のみのユーザー向け） */
  onAddNextWeek?: () => void;
  /** true の間はボタンを disabled にし、スピナーを出す（ensure API 実行中） */
  addingNextWeek?: boolean;
}) {
  return (
    <nav
      aria-label="週を選ぶ"
      className="flex w-[240px] shrink-0 flex-col gap-2 overflow-y-auto rounded-card border border-border bg-card p-2"
    >
      {onAddNextWeek && (
        <Button variant="outline" size="sm" className="w-full" onClick={onAddNextWeek} disabled={addingNextWeek}>
          {addingNextWeek
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Plus className="mr-1 h-4 w-4" aria-hidden="true" />}
          次の週を作る
        </Button>
      )}
      {reports.map((r) => {
        const published = r.status === 'published';
        const active = r.id === activeId;
        return (
          <NavLink
            key={r.id}
            to={`/weekly/${r.id}`}
            className={`flex min-h-[46px] flex-col justify-center rounded-control px-3 py-2 ${
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
