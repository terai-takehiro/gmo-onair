/**
 * 9. 進捗状況のグラフ — 売上高と稼働件数（積み上げ棒＋件数の線）／スタジオ稼働率の推移（棒＋線）
 *
 * 素の SVG。pptx 側は同じ数字を PowerPoint のグラフオブジェクトにする
 * （`docs/design/v4/keep-report.md` §6.2）ので、ここは**画面で確かめるための絵**。
 * 色は資料の色（`slideStyle.ts`）: グループ内＝紺・外部＝水色・線＝赤。
 */
import type { MonthlyTrendPoint } from '@gmo-onair/shared/src/keepReport/types';
import { C, emptyBox } from './slideStyle';

interface Box { w: number; h: number }

const MARGIN = { top: 34, right: 52, bottom: 30, left: 60 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return Number(m) === 1 ? `${y.slice(2)}/1` : String(Number(m));
};

function Legend({ items, x, y }: { items: Array<{ color: string; label: string; line?: boolean }>; x: number; y: number }) {
  let cx = x;
  return (
    <g fontSize={12} fontWeight={700}>
      {items.map((it) => {
        const w = it.label.length * 12 + 26;
        const el = (
          <g key={it.label} transform={`translate(${cx},${y})`}>
            {it.line
              ? <line x1={0} y1={6} x2={14} y2={6} stroke={it.color} strokeWidth={3} />
              : <rect width={12} height={12} fill={it.color} />}
            <text x={18} y={11} fill={C.text}>{it.label}</text>
          </g>
        );
        cx += w;
        return el;
      })}
    </g>
  );
}

export function TrendChart({ metric, points, box }: { metric: 'revenue' | 'utilization'; points: MonthlyTrendPoint[]; box: Box }) {
  const data = metric === 'utilization' ? points.filter((p) => p.year_month >= '2025-01') : points;
  if (!data.length) return <div style={emptyBox}>推移の数字がまだありません</div>;

  const W = box.w;
  const H = box.h;
  // 低い枠（縮めて入れた部品）では目盛り・凡例・吹き出しを省き、棒と線だけにする
  const compact = H < 150;
  const M = compact ? { top: 18, right: 8, bottom: 4, left: 8 } : MARGIN;
  const pw = Math.max(10, W - M.left - M.right);
  const ph = Math.max(10, H - M.top - M.bottom);
  const n = data.length;
  const slot = pw / n;
  const bw = Math.max(2, slot * 0.62);
  const labelEvery = n <= 14 ? 1 : n <= 30 ? 3 : 6;

  const barValue = (p: MonthlyTrendPoint) => (metric === 'revenue' ? (p.revenue_internal + p.revenue_external) / 1000 : p.active_days);
  const lineValue = (p: MonthlyTrendPoint) => (metric === 'revenue' ? p.project_count_internal + p.project_count_external : p.utilization);
  const barMax = niceMax(Math.max(...data.map(barValue)));
  const lineMax = metric === 'utilization' ? 100 : niceMax(Math.max(...data.map((p) => lineValue(p) ?? 0)));
  const yBar = (v: number) => M.top + ph - (v / barMax) * ph;
  const yLine = (v: number) => M.top + ph - (v / lineMax) * ph;
  const xOf = (i: number) => M.left + slot * i + slot / 2;

  const title = metric === 'revenue' ? '売上高と稼働件数（千円・件）' : 'スタジオ稼働率の推移（稼働日数・%）';
  const last = data[n - 1];
  const callout = metric === 'revenue'
    ? `${monthLabel(last.year_month)}月 売上高 ${Math.round(barValue(last)).toLocaleString('ja-JP')}千円 ・ 案件数 ${lineValue(last) ?? 0}件`
    : `${monthLabel(last.year_month)}月 稼働 ${last.active_days}日 ／ ${last.business_days}営業日 ・ 稼働率 ${last.utilization === null ? '—' : `${last.utilization.toFixed(1)}%`}`;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const linePath = data
    .map((p, i) => {
      const v = lineValue(p);
      return v === null ? null : `${i === 0 || lineValue(data[i - 1]) === null ? 'M' : 'L'}${xOf(i)},${yLine(v)}`;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', fontFamily: 'inherit' }}>
      <text x={0} y={14} fontSize={compact ? 12 : 16} fontWeight={700} fill={C.title}>{title}</text>
      {!compact && (
        <Legend
          x={W - (metric === 'revenue' ? 300 : 210)} y={2}
          items={metric === 'revenue'
            ? [{ color: C.band, label: 'グループ内' }, { color: C.line, label: '外部' }, { color: C.negative, label: '案件数', line: true }]
            : [{ color: C.positive, label: '稼働日数' }, { color: C.negative, label: '稼働率', line: true }]}
        />
      )}
      {!compact && ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={M.left + pw} y1={yBar(barMax * t)} y2={yBar(barMax * t)} stroke={t === 0 ? C.muted : C.softLine} strokeWidth={1} />
          <text x={M.left - 6} y={yBar(barMax * t) + 4} fontSize={11} textAnchor="end" fill={C.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(barMax * t).toLocaleString('ja-JP')}
          </text>
          <text x={M.left + pw + 6} y={yLine(lineMax * t) + 4} fontSize={11} fill={C.negative} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {metric === 'utilization' ? `${Math.round(lineMax * t)}%` : Math.round(lineMax * t)}
          </text>
        </g>
      ))}
      {data.map((p, i) => {
        const x = xOf(i) - bw / 2;
        if (metric === 'revenue') {
          const inner = p.revenue_internal / 1000;
          const outer = p.revenue_external / 1000;
          return (
            <g key={p.year_month}>
              <rect x={x} y={yBar(inner)} width={bw} height={yBar(0) - yBar(inner)} fill={C.band} />
              <rect x={x} y={yBar(inner + outer)} width={bw} height={yBar(inner) - yBar(inner + outer)} fill={C.line} />
            </g>
          );
        }
        return <rect key={p.year_month} x={x} y={yBar(p.active_days)} width={bw} height={yBar(0) - yBar(p.active_days)} fill={C.positive} />;
      })}
      {linePath && <path d={linePath} fill="none" stroke={C.negative} strokeWidth={2.5} strokeLinejoin="round" />}
      {data.map((p, i) => {
        const v = lineValue(p);
        return v === null ? null : <circle key={p.year_month} cx={xOf(i)} cy={yLine(v)} r={3} fill={C.negative} />;
      })}
      {!compact && data.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
        <text key={p.year_month} x={xOf(i)} y={H - M.bottom + 16} fontSize={11} textAnchor="middle" fill={C.muted}>{monthLabel(p.year_month)}</text>
      ))}
      {!compact && (
        <g transform={`translate(${M.left + 6},${M.top + 4})`}>
          <rect width={callout.length * 11.5 + 16} height={22} rx={4} fill="#fff" stroke={C.negative} />
          <text x={8} y={15} fontSize={12} fontWeight={700} fill={C.negative}>{callout}</text>
        </g>
      )}
    </svg>
  );
}
