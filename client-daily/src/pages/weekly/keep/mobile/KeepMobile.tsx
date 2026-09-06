/**
 * 隔週キープの数字 — スマホ（数字を確かめるだけの画面）
 *
 * `docs/design/v4/keep-report.md` §3: スマホは要約だけ（4つの数字・未確定の注意・
 * ヨミ表のカード）。資料づくりは PC。**PC の表を縮めない**（`_rules.md`「3. スマホ」）。
 *
 * 出し分けは親（`KeepSection.tsx`）の `isMobile` 1本で、この部品はスマホでだけ描かれる。
 */
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { StatValue, formatNum } from '@gmo-onair/shared/src/client/ui/numbers';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import type { BudgetLine, KeepReportPack, PipelineRow } from '@gmo-onair/shared/src/keepReport/types';
import { CONFIDENCE_TONE, mdLabel, pctLabel, pickOf, toThousandYen, ymLabel } from '../format';

type Mode = 'landing' | 'forecast';

/** 4つの数字の1枚。判定が ✕ なら赤（資料の見方と同じ） */
function KpiCard({ label, line }: { label: string; line: BudgetLine | undefined }) {
  const k = toThousandYen(line?.actual);
  const bad = line?.judge === '✕';
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-card px-3.5 py-3">
      <span className="text-sub-sm text-muted-foreground">{label}</span>
      <StatValue size="sm" className={bad ? 'text-destructive' : ''}>{formatNum(k) ?? '—'}</StatValue>
      <span className="font-number text-sub-sm text-muted-foreground">
        {line?.budget === null || line?.budget === undefined
          ? '目標 —'
          : `目標 ${formatNum(toThousandYen(line.budget)) ?? '—'}${line.ratio !== null ? ` ・ ${pctLabel(line.ratio)}` : ''}`}
      </span>
    </div>
  );
}

function PipelineCard({ row }: { row: PipelineRow }) {
  const tone = CONFIDENCE_TONE[row.confidence] ?? CONFIDENCE_TONE.E;
  return (
    <a
      href={`/sales/projects/${row.project_id}`}
      className="flex min-h-[56px] items-center gap-2.5 rounded-card border border-border bg-card px-3.5 py-2.5"
    >
      <span className={`font-number w-4 shrink-0 text-cardtitle ${tone.letter}`}>{row.confidence}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-list truncate">{row.name}</span>
        <span className="text-sub-sm flex min-w-0 items-center gap-1 text-muted-foreground">
          <span className="truncate">{row.customer_name}</span>
          <span className="shrink-0">・</span>
          <DateRange start={row.event_start} end={row.event_end} short className="shrink-0" />
        </span>
      </span>
      {row.estimate_amount === null
        ? <span className="text-sub-sm shrink-0 text-muted-foreground">提案前</span>
        : <Money value={row.estimate_amount} inline className="text-list shrink-0" />}
    </a>
  );
}

export function KeepMobile({ pack }: { pack: KeepReportPack }) {
  const [mode, setMode] = useState<Mode>('landing');
  const [more, setMore] = useState(false);
  const table = mode === 'landing' ? pack.landing.all : pack.forecast.all;
  const other = mode === 'landing' ? pack.forecast.all : pack.landing.all;
  const line = (key: BudgetLine['key']) => table.lines.find((l) => l.key === key);
  const cal = pack.calendars[0];
  const calNext = pack.calendars[1];
  const unconfirmed = pack.landing.all.unconfirmed;

  const pickedIds = new Set(pack.project_pages.map((p) => p.project_id));
  const ordinal = new Map(pack.project_pages.map((p) => [p.project_id, p.ordinal ?? 99]));
  const rows = [...pack.pipeline.external, ...pack.pipeline.samurai]
    .map((r) => ({ r, picked: pickOf(r, pickedIds) }))
    .sort((a, b) => Number(b.picked) - Number(a.picked) || (ordinal.get(a.r.project_id) ?? 99) - (ordinal.get(b.r.project_id) ?? 99));
  const picked = rows.filter((x) => x.picked).length;
  const head = rows.slice(0, 4);
  const rest = rows.slice(4);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-cardtitle">{ymLabel(table.year_month)} {mode === 'landing' ? '着地' : '見込'}</span>
        <span className="text-sub-sm text-muted-foreground">千円 ・ 全体（統合）</span>
        <button
          type="button"
          onClick={() => setMode(mode === 'landing' ? 'forecast' : 'landing')}
          className="text-sub-sm ml-auto inline-flex min-h-tap items-center gap-0.5 font-bold text-primary"
        >
          {ymLabel(other.year_month)} {mode === 'landing' ? '見込' : '着地'}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="売上高" line={line('revenue')} />
        <KpiCard label="粗利" line={line('gross_profit')} />
        <KpiCard label="営業利益" line={line('operating_profit')} />
        <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-card px-3.5 py-3">
          <span className="text-sub-sm text-muted-foreground">稼働率</span>
          <StatValue size="sm">{pctLabel(cal?.utilization)}</StatValue>
          <span className="font-number text-sub-sm text-muted-foreground">
            {calNext ? `${ymLabel(calNext.year_month)} 見込 ${pctLabel(calNext.utilization)}` : cal ? ymLabel(cal.year_month) : '—'}
          </span>
        </div>
      </div>

      {unconfirmed.length > 0 && (
        <div className="flex items-start gap-2 rounded-note border border-primary-border bg-primary-surface-weak px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="text-sub-sm text-foreground">
            未確定の売上 {unconfirmed.length}件（{unconfirmed.slice(0, 2).map((u) => u.project_name).join('・')}
            {unconfirmed.length > 2 ? ' ほか' : ''}）
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 px-0.5 pt-1">
        <span className="text-cardtitle">ヨミ表</span>
        <span className="text-sub-sm text-muted-foreground">資料に載せる {picked} 件 ／ 全 {rows.length} 件</span>
      </div>
      {rows.length === 0 && <p className="text-sub text-muted-foreground">受注前の案件はいまありません</p>}
      <div className="flex flex-col gap-2">
        {head.map(({ r }) => <PipelineCard key={r.project_id} row={r} />)}
        {more && rest.map(({ r }) => <PipelineCard key={r.project_id} row={r} />)}
      </div>

      {more && (
        <>
          <div className="flex items-center gap-2 px-0.5 pt-1">
            <span className="text-cardtitle">実施報告</span>
            <span className="text-sub-sm text-muted-foreground">{pack.event_reports.length} 件</span>
          </div>
          {pack.event_reports.length === 0 && <p className="text-sub text-muted-foreground">本番を終えた案件はまだありません</p>}
          {pack.event_reports.map((r) => (
            <div key={r.project_id} className="flex flex-col gap-0.5 rounded-card border border-border bg-card px-3.5 py-2.5">
              <span className="text-sub-sm font-number text-muted-foreground">{r.band.date_label} ・ {r.report_status === 'confirmed' ? '確定' : r.report_status === 'draft' ? '下書き' : '未記入'}</span>
              <span className="text-list truncate">{r.band.event_name}</span>
              {r.revenue !== null && (
                <span className="text-sub-sm flex items-center gap-1.5 text-muted-foreground">
                  売上 <Money value={r.revenue} inline className="text-foreground" />
                  {r.gross_margin !== null && <span>・ 粗利率 {pctLabel(r.gross_margin)}</span>}
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 px-0.5 pt-1">
            <span className="text-cardtitle">定期内覧会</span>
          </div>
          {pack.inview ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-card border border-border bg-card px-3.5 py-3">
              <span className="text-sub-sm text-muted-foreground"><span className="font-number text-foreground">{mdLabel(pack.inview.session_date)}</span> 開催</span>
              <span className="text-sub-sm text-muted-foreground">参加 <span className="font-number text-foreground">{pack.inview.groups}</span>組 <span className="font-number text-foreground">{pack.inview.people}</span>名</span>
              <span className="text-sub-sm text-muted-foreground">満足度 <span className="font-number text-foreground">{pack.inview.satisfaction === null ? '未入力' : pack.inview.satisfaction.toFixed(1)}</span></span>
              <span className="text-sub-sm text-muted-foreground">ヨミ化 <span className="font-number text-foreground">{pack.inview.promoted_projects}</span>案件</span>
            </div>
          ) : <p className="text-sub text-muted-foreground">直近の定期内覧会の回はまだありません</p>}
        </>
      )}

      {(rest.length > 0 || !more) && (
        <button
          type="button"
          onClick={() => setMore(!more)}
          className="text-sub inline-flex min-h-tap w-full items-center justify-center gap-1.5 font-bold text-primary"
        >
          {more ? '要約だけにする' : rest.length > 0 ? `残り ${rest.length} 件と 実施報告・内覧会を見る` : '実施報告・内覧会を見る'}
          {more ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}

      <p className="text-sub-sm flex min-h-tap items-center rounded-control-lg border border-dashed border-border px-3 text-muted-foreground">
        資料をつくるのは PC で。ここは数字を確かめる画面です
      </p>
    </div>
  );
}
