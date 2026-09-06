/**
 * 隔週キープの数字 — 9. 進捗状況のグラフ（売上高と稼働件数 ／ スタジオ稼働率の推移）
 *
 * 資料のグラフと同じ切り口を **素の SVG** で描く（グラフ部品は client-daily に無く、
 * 資料ビルダー（pptx）は PowerPoint のグラフオブジェクトを自分で組むので、
 * ライブラリを増やさない）。色は見分けの色 `cat-1`（青＝グループ内／稼働日数）と
 * `cat-6`（赤＝外部／稼働率）— 状態の色（赤＝危ない）と混ぜないための系列色。
 *
 * `viewBox` で描いて幅は器に任せる（1440px でも 1024px でも同じ絵）。
 * 目盛りの文字は SVG の中なので型スケールの外だが、PC でしか出ない（スマホは要約だけ）。
 */
import { BarChart3 } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { formatNum } from '@gmo-onair/shared/src/client/ui/numbers';
import type { MonthlyTrendPoint } from '@gmo-onair/shared/src/keepReport/types';
import { LegendItem, SectionHead } from './SectionHead';
import { pctLabel, toThousandYen, ymLabel } from './format';

const W = 720;
// 上の余白は「単位の文字」の1行ぶん（いちばん上の目盛りと重ねない）
const PAD = { l: 44, r: 12, t: 26, b: 22 };

/** きりのいい目盛り（最大値を 4 分割して 1・2・5 の倍数に寄せる） */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return step * 4;
}

function xOf(i: number, n: number, innerW: number): number {
  return PAD.l + (innerW / n) * i;
}

function XLabels({ points, innerW, y }: { points: MonthlyTrendPoint[]; innerW: number; y: number }) {
  const n = points.length;
  const every = n > 18 ? 3 : n > 9 ? 2 : 1;
  return (
    <>
      {points.map((p, i) => (i % every === 0 ? (
        <text key={p.year_month} x={xOf(i, n, innerW) + innerW / n / 2} y={y} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          {p.year_month.replace('-', '/')}
        </text>
      ) : null))}
    </>
  );
}

/** 売上高（グループ内／外部の積み上げ・千円）＋ 案件数（線） */
export function RevenueTrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  const H = 300;
  const barsH = 200;                          // 上段: 売上の棒
  const countTop = PAD.t + barsH + 26;        // 下段: 案件数の線
  const countH = 40;
  const innerW = W - PAD.l - PAD.r;
  const n = Math.max(points.length, 1);
  const slot = innerW / n;
  const bw = Math.max(4, slot * 0.62);
  const maxK = niceMax(Math.max(...points.map((p) => (toThousandYen(p.revenue_internal + p.revenue_external) ?? 0)), 0));
  const maxC = Math.max(1, ...points.map((p) => p.project_count_internal + p.project_count_external));
  const yK = (k: number) => PAD.t + barsH - (k / maxK) * barsH;
  const yC = (c: number) => countTop + countH - (c / maxC) * countH;
  const line = (pick: (p: MonthlyTrendPoint) => number) =>
    points.map((p, i) => `${(xOf(i, n, innerW) + slot / 2).toFixed(1)},${yC(pick(p)).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="売上高と稼働件数の月次推移">
      {[0, 1, 2, 3, 4].map((t) => {
        const k = (maxK / 4) * t;
        return (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yK(k)} y2={yK(k)} className="stroke-border-faint" />
            <text x={PAD.l - 6} y={yK(k) + 3} fontSize={10} textAnchor="end" className="fill-muted-foreground">{formatNum(k)}</text>
          </g>
        );
      })}
      <text x={PAD.l - 6} y={11} fontSize={10} textAnchor="end" className="fill-muted-foreground">千円</text>
      {points.map((p, i) => {
        const x = xOf(i, n, innerW) + (slot - bw) / 2;
        const inK = toThousandYen(p.revenue_internal) ?? 0;
        const exK = toThousandYen(p.revenue_external) ?? 0;
        return (
          <g key={p.year_month}>
            <rect x={x} y={yK(inK)} width={bw} height={Math.max(0, yK(0) - yK(inK))} rx={1} className="fill-cat-1" />
            <rect x={x} y={yK(inK + exK)} width={bw} height={Math.max(0, yK(inK) - yK(inK + exK))} rx={1} className="fill-cat-6" />
          </g>
        );
      })}
      <XLabels points={points} innerW={innerW} y={PAD.t + barsH + 14} />
      {/* 下段: 案件数（グループ内／外部）。同じ横軸に載せて、売上と件数のずれを見る */}
      <line x1={PAD.l} x2={W - PAD.r} y1={countTop + countH} y2={countTop + countH} className="stroke-border-faint" />
      <text x={PAD.l - 6} y={countTop + 4} fontSize={10} textAnchor="end" className="fill-muted-foreground">{maxC}件</text>
      <text x={PAD.l - 6} y={countTop + countH + 3} fontSize={10} textAnchor="end" className="fill-muted-foreground">0</text>
      <polyline points={line((p) => p.project_count_internal)} fill="none" strokeWidth={2} className="stroke-cat-1" />
      <polyline points={line((p) => p.project_count_external)} fill="none" strokeWidth={2} className="stroke-cat-6" />
    </svg>
  );
}

/** 稼働日数（棒）と稼働率（線）。左軸は日・右軸は % */
export function UtilizationTrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  const H = 300;
  const innerH = H - PAD.t - PAD.b;
  const innerW = W - PAD.l - 40;
  const n = Math.max(points.length, 1);
  const slot = innerW / n;
  const bw = Math.max(4, slot * 0.62);
  const maxD = niceMax(Math.max(...points.map((p) => p.business_days), 1));
  const yD = (d: number) => PAD.t + innerH - (d / maxD) * innerH;
  const yP = (pct: number) => PAD.t + innerH - (pct / 100) * innerH;
  const withRate = points.map((p, i) => ({ p, i })).filter(({ p }) => p.utilization !== null);
  const path = withRate.map(({ p, i }) => `${(xOf(i, n, innerW) + slot / 2).toFixed(1)},${yP(p.utilization ?? 0).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="スタジオ稼働率の月次推移">
      {[0, 1, 2, 3, 4].map((t) => {
        const d = (maxD / 4) * t;
        return (
          <g key={t}>
            <line x1={PAD.l} x2={W - 40} y1={yD(d)} y2={yD(d)} className="stroke-border-faint" />
            <text x={PAD.l - 6} y={yD(d) + 3} fontSize={10} textAnchor="end" className="fill-muted-foreground">{Math.round(d)}</text>
            <text x={W - 34} y={yP(t * 25) + 3} fontSize={10} textAnchor="start" className="fill-muted-foreground">{t * 25}%</text>
          </g>
        );
      })}
      <text x={PAD.l - 6} y={11} fontSize={10} textAnchor="end" className="fill-muted-foreground">日</text>
      <text x={W - 34} y={11} fontSize={10} textAnchor="start" className="fill-muted-foreground">稼働率</text>
      {points.map((p, i) => {
        const x = xOf(i, n, innerW) + (slot - bw) / 2;
        return (
          <rect key={p.year_month} x={x} y={yD(p.active_days)} width={bw} height={Math.max(0, yD(0) - yD(p.active_days))} rx={1} className="fill-cat-1" />
        );
      })}
      <polyline points={path} fill="none" strokeWidth={2} className="stroke-cat-6" />
      {withRate.map(({ p, i }) => (
        <circle key={p.year_month} cx={xOf(i, n, innerW) + slot / 2} cy={yP(p.utilization ?? 0)} r={2.5} className="fill-cat-6" />
      ))}
      <XLabels points={points} innerW={innerW} y={H - 6} />
    </svg>
  );
}

function ChartCard({ title, sub, legend, note, children }: {
  title: string; sub: string; legend: React.ReactNode; note: string; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-cardtitle whitespace-nowrap">{title}</h4>
        <span className="text-sub-sm min-w-0 truncate text-muted-foreground">{sub}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">{legend}</span>
      </div>
      {children}
      <p className="text-sub-sm mt-2 text-muted-foreground">{note}</p>
    </div>
  );
}

/** 推移は 2024-01〜 が全部入っているので、読める範囲に切る（売上 24 か月・稼働率 20 か月） */
export function TrendCharts({ trend }: { trend: MonthlyTrendPoint[] }) {
  const revenue = trend.slice(-24);
  const util = trend.filter((p) => p.business_days > 0).slice(-20);
  const latest = trend[trend.length - 1];
  return (
    <div className="flex flex-col gap-3">
      <SectionHead
        icon={BarChart3}
        title="進捗状況"
        note="資料の 9. 進捗状況と同じ2枚。確定売上を計上日で、稼働率はカレンダーの予定から"
        right={latest ? (
          <span className="text-sub-sm inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
            {ymLabel(latest.year_month)} 売上高
            <Money value={latest.revenue_internal + latest.revenue_external} inline className="text-sub-sm text-foreground" />
            ・ 案件数 {latest.project_count_internal + latest.project_count_external}件 ・ 稼働率 {pctLabel(latest.utilization)}
          </span>
        ) : undefined}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <ChartCard
            title="売上高と稼働件数"
            sub={`${revenue[0] ? revenue[0].year_month.replace('-', '/') : ''}〜 ・ 月次 ・ 確定売上を計上日で集計`}
            legend={<><LegendItem swatch="bg-cat-1" label="グループ内イベント" /><LegendItem swatch="bg-cat-6" label="外部顧客イベント" /></>}
            note="上段は売上高（千円）の積み上げ、下段は本番日がその月にある案件の数。お客様の区分は案件の当時の値です"
          >
            {revenue.length ? <RevenueTrendChart points={revenue} /> : <p className="text-sub text-muted-foreground">推移に載せる月がまだありません</p>}
          </ChartCard>
        </div>
        <div className="min-w-0 xl:col-span-2">
          <ChartCard
            title="スタジオ稼働率の推移"
            sub={`${util[0] ? util[0].year_month.replace('-', '/') : ''}〜`}
            legend={<><LegendItem swatch="bg-cat-1" label="稼働日数" /><LegendItem swatch="bg-cat-6" label="稼働率" /></>}
            note="稼働率 ＝ 何かしらのスタジオ利用があった日 ÷ 営業日。内覧も数え、メンテナンスと仮押さえは数えません（設定で変えられます）"
          >
            {util.length ? <UtilizationTrendChart points={util} /> : <p className="text-sub text-muted-foreground">稼働率を出せる月がまだありません</p>}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
