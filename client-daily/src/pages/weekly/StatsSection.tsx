/**
 * ウィークリー活動報告 — 主要指標 (2026-09 の再設計)
 *
 * 確定した時点の ONAiR のデータの写し。**ここは読むだけ**で、画面からは直せない
 * （直すなら元のデータを直す）。
 *
 * ── 再設計で変えたところ ────────────────────────────────────
 *
 * ・節の名前を「自動集計」から**「主要指標」**に変え、**総括の次**に置いた
 *   （以前は画面の先頭が集計で、読む人が最初に数字の表を読まされていた）
 * ・**前週比**を足した。数字だけでは増減が分からず、総括の本文と突き合わせないと
 *   意味が取れなかった（比較値は `payload.stats.prev_week`。確定時点のスナップショット
 *   に同梱するので、確定後に前週の実績が動いても表示は変わらない）
 * ・パイプライン・営業活動の内訳・イベント・来週の予定は `DetailsSection` へ移し、
 *   既定では畳んだ（読む人の大半は開かない。書く人には材料なので下書きでは開く）
 */
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Card, CardContent } from '@/components/ui/card';

export interface StatsShape {
  period?: { week_start: string; week_end: string };
  new_projects?: { count: number; ai_count: number; items: Array<Record<string, unknown>> };
  activities?: { count: number; ai_count: number; by_type: Array<{ activity_type: string; count: number }> };
  pipeline?: Array<{ stage: string; count: number; expected_amount: number }>;
  revenue?: { week_total: number; month_total: number; month: string };
  events_this_week?: Array<Record<string, unknown>>;
  next_week?: {
    events: Array<Record<string, unknown>>;
    next_actions: Array<Record<string, unknown>>;
  };
  /**
   * 前週の同じ数値（増減表示用・2026-09 で追加）。
   * ⚠️ **これより前に確定したレポートには入っていない。** 未定義なら増減を出さない。
   */
  prev_week?: { week_start: string; new_projects: number; activities: number; revenue: number };
}

export function StatsSection({ stats }: { stats: StatsShape }) {
  const prev = stats.prev_week;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <KpiTile label="新規案件" value={stats.new_projects?.count ?? 0} unit="件" prev={prev?.new_projects} />
      <KpiTile label="営業活動" value={stats.activities?.count ?? 0} unit="件" prev={prev?.activities} />
      <KpiTile label="売上（当週）" money={stats.revenue?.week_total ?? 0} prev={prev?.revenue} />
      <KpiTile
        label={`売上（${Number(stats.revenue?.month?.slice(5) ?? 0)}月累計）`}
        money={stats.revenue?.month_total ?? 0}
      />
    </div>
  );
}

function KpiTile({ label, value, money, unit, prev }: {
  label: string;
  value?: number;
  money?: number;
  unit?: string;
  /** 前週の同じ数値。渡されたときだけ増減を出す */
  prev?: number;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-th text-muted-foreground">{label}</p>
        {money !== undefined
          ? <Money value={money} className="text-h2 mt-0.5" />
          : (
            /* 金額（`Money`）が右揃えなので、件数も右端で揃える（縦の整列ポリシー） */
            <p className="text-h2 mt-0.5 flex items-baseline justify-end gap-1">
              <span className="font-number">{value ?? 0}</span>
              {unit && <span className="text-sub text-muted-foreground">{unit}</span>}
            </p>
          )}
        <Delta current={money ?? value ?? 0} prev={prev} money={money !== undefined} unit={unit} />
      </CardContent>
    </Card>
  );
}

/** 前週比。件数は差、金額は割合で出す（前週が 0 のときは割合を出さない） */
function Delta({ current, prev, money, unit }: {
  current: number; prev?: number; money: boolean; unit?: string;
}) {
  if (prev === undefined) return null;
  const diff = current - prev;
  const tone = diff > 0 ? 'bg-success-surface text-success'
    : diff < 0 ? 'bg-destructive-surface text-destructive'
      : 'bg-muted text-muted-foreground';
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  const label = money
    ? (prev === 0 ? null : `${sign}${Math.abs(Math.round((diff / prev) * 100))}%`)
    : `${sign}${Math.abs(diff)}`;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {label && <span className={`text-badge font-number rounded-badge-xs px-1.5 py-0.5 ${tone}`}>{label}</span>}
      <span className="text-sub-sm text-muted-foreground">
        前週 {money ? <Money value={prev} className="text-sub-sm inline-flex" /> : <span className="font-number">{prev}{unit}</span>}
      </span>
    </div>
  );
}
