/**
 * pptx の部品（表・帯・箇条書き）— パックの値を PowerPoint のオブジェクトにする。
 *
 * 数字はすべて**パックの計算済みの列**（judge / ratio / diff）をそのまま出す。ここで計算しない
 * （docs/design/v4/keep-report.md §5.3。手計算の写し間違いが会議に出た経緯）。
 * 見せ方の決まり（§6.3「変えてよいもの」）: 千円は3桁区切り・右揃え、マイナスは赤、比率は○✕の色に揃える。
 * 表・一覧は 24pt より小さくてよい（中身が収まる大きさ）。
 *
 * ── 「変更点は赤字」（§6.3 守るもの）────────────────────────────
 * 前回の資料（凍結したパック）から動いた所を**自動で**赤にする。どの升が動いたかは
 * `keep-pack-diff.ts`（`changedPlKeys` / `changedUtilization`）が決め、ここは色を付けるだけ:
 *   - 数値報告の表: 動いた升を赤い太字。合計行（紺の帯・白い文字）は赤い文字では読めないので升の地を赤にする
 *   - ヨミ表: 前回の会議日以降に増えた案件（`since_last: 'new'`）は行ごと赤、動いた案件（`'updated'`）は案件名だけ赤
 *   - 稼働カレンダー: 見出しの稼働率の数字を赤
 * 前回の資料が無いとき（初回）は何も赤くしない（呼ぶ側が印を渡さない）。
 * ⚠️ マイナスの数字も赤（上の決まり）なので、動いたかどうかは**太字**でも見分ける。
 */
import type PptxGenJS from 'pptxgenjs';
import type {
  MonthlyPlTable, PlByEntity, PipelineRow, ProjectPageData, UtilizationCalendar, BusinessEntity,
} from './keep-deck.types';
import { BUSINESS_ENTITY_LABELS } from './keep-deck.types';
import { FORMAT_COLORS, FORMAT_FONT } from './keep-templates';
import { plCellKey, type PlCellColumn } from './keep-pack-diff';
import {
  addTable, addText, addBullets, addPlaceholder, fmtSen, fmtYen, fmtPct, fmtMd, type Box, type Cell, FONT, SLIDE_H,
} from './keep-pptx-chrome.service';

const C = FORMAT_COLORS;
const judgeColor = (j: string) => (j === '○' ? C.positive : j === '✕' ? C.negative : C.muted);
const numCell = (yen: number | null, o: Partial<Cell> = {}): Cell =>
  ({ text: fmtSen(yen), align: 'right', ...(yen != null && yen < 0 ? { color: C.negative } : {}), ...o });

/** 動いた升の印（`keep-pack-diff.ts` の鍵 `<行>.<列>`）。無ければ赤にしない */
export type ChangedCells = ReadonlySet<string>;
/** 前回から動いた升を赤い太字に。合計行（紺の帯）は白い文字のままで升の地を赤にする */
function markChanged(cell: Cell, changed: ChangedCells | undefined, key: string, totalRow: boolean): Cell {
  if (!changed?.has(key)) return cell;
  return totalRow ? { ...cell, fill: C.negative, bold: true } : { ...cell, color: C.negative, bold: true };
}

// ── 型の見分け（binding の値は unknown で来る）────────────────────
export const isPlTable = (v: unknown): v is MonthlyPlTable =>
  !!v && typeof v === 'object' && Array.isArray((v as MonthlyPlTable).lines) && 'year_month' in (v as object);
export const isPlByEntity = (v: unknown): v is PlByEntity => !!v && typeof v === 'object' && isPlTable((v as PlByEntity).all);
export const isPipelineRows = (v: unknown): v is PipelineRow[] =>
  Array.isArray(v) && (v.length === 0 || ('confidence' in (v[0] as object) && 'customer_name' in (v[0] as object)));
export const isCalendar = (v: unknown): v is UtilizationCalendar =>
  !!v && typeof v === 'object' && 'days' in (v as object) && 'year_month' in (v as object);

// ── ①数値報告 ────────────────────────────────────────────────
export function renderPlTable(
  slide: PptxGenJS.Slide, t: MonthlyPlTable, box: Box, o: { size?: number; changed?: ChangedCells } = {},
): void {
  const actualHead = t.mode === 'forecast' ? '見通し' : '着地';
  const rows: Cell[][] = [[{ text: '項目' }, { text: '目標' }, { text: actualHead }, { text: '判定' }, { text: '対目標比' }, { text: '対目標' }]];
  t.lines.forEach((l, i) => {
    const last = i === t.lines.length - 1;
    const base: Partial<Cell> = last ? { fill: C.tableHead, color: 'FFFFFF', bold: true } : {};
    const jc = last ? 'FFFFFF' : judgeColor(l.judge);
    const mark = (col: PlCellColumn, cell: Cell) => markChanged(cell, o.changed, plCellKey(l.key, col), last);
    rows.push([
      { text: l.label, ...base },
      mark('budget', numCell(l.budget, { ...base, ...(last ? { color: 'FFFFFF' } : {}) })),
      mark('actual', numCell(l.actual, { ...base, ...(last ? { color: 'FFFFFF' } : {}) })),
      mark('judge', { text: l.judge, align: 'center', ...base, color: jc, bold: true }),
      mark('ratio', { text: fmtPct(l.ratio), align: 'right', ...base, color: jc }),
      mark('diff', numCell(l.diff, { ...base, ...(last ? { color: 'FFFFFF' } : {}) })),
    ]);
  });
  addTable(slide, rows, box, [30, 15, 15, 10, 15, 15], { size: o.size ?? FORMAT_FONT.table });
}

/** 主体別: 2つの表を横に並べる（gig は数字があるときだけ3つ目）。`changed` は主体ごとの動いた升 */
export function renderPlByEntity(
  slide: PptxGenJS.Slide, p: PlByEntity, box: Box, changed?: Partial<Record<BusinessEntity, ChangedCells>>,
): void {
  const entities: BusinessEntity[] = ['gss', 'gscs', ...(p.gig ? (['gig'] as BusinessEntity[]) : [])];
  const gap = 0.2;
  const w = (box.w - gap * (entities.length - 1)) / entities.length;
  entities.forEach((e, i) => {
    const t = p[e]!;
    const x = box.x + i * (w + gap);
    addText(slide, BUSINESS_ENTITY_LABELS[e], { x, y: box.y, w, h: 0.35 }, { size: 14, bold: true, color: C.title, valign: 'middle', margin: 2 });
    const rows: Cell[][] = [[{ text: '項目' }, { text: '目標' }, { text: t.mode === 'forecast' ? '見通し' : '着地' }, { text: '判定' }, { text: '対目標比' }]];
    t.lines.forEach((l, li) => {
      const last = li === t.lines.length - 1;
      const base: Partial<Cell> = last ? { fill: C.tableHead, color: 'FFFFFF', bold: true } : {};
      const jc = last ? 'FFFFFF' : judgeColor(l.judge);
      const mark = (col: PlCellColumn, cell: Cell) => markChanged(cell, changed?.[e], plCellKey(l.key, col), last);
      rows.push([
        { text: l.label, ...base }, mark('budget', numCell(l.budget, { ...base, ...(last ? { color: 'FFFFFF' } : {}) })),
        mark('actual', numCell(l.actual, { ...base, ...(last ? { color: 'FFFFFF' } : {}) })),
        mark('judge', { text: l.judge, align: 'center', ...base, color: jc, bold: true }),
        mark('ratio', { text: fmtPct(l.ratio), align: 'right', ...base, color: jc }),
      ]);
    });
    addTable(slide, rows, { x, y: box.y + 0.4, w, h: box.h - 0.4 }, [30, 18, 18, 12, 22], { size: entities.length > 2 ? 10 : FORMAT_FONT.tableDense });
  });
}

/** 数値報告の注記（人の上書きが無いとき）: 見通しに含めた未確定の売上・経理の補正 */
export function plNotes(t: MonthlyPlTable | null): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (t.has_override) out.push(t.override_note ? `経理の補正値を使用（${t.override_note}）` : '経理の補正値を使用');
  if (t.unconfirmed.length) {
    out.push('見通しに含めた未確定の売上:');
    for (const u of t.unconfirmed) out.push(`・${u.project_name} ${fmtSen(u.amount)}千円`);
  }
  return out;
}

// ── ①ヨミ表 ──────────────────────────────────────────────────
const MAX_PIPELINE_ROWS = 16;
/** `markChanges`（前回の資料があるとき）: 新規の案件は行ごと赤、動いた案件は案件名だけ赤 */
export function renderPipeline(slide: PptxGenJS.Slide, rowsIn: PipelineRow[], box: Box, markChanges = false): void {
  const rows: Cell[][] = [[{ text: '案件／お客様' }, { text: '確度' }, { text: '実施日' }, { text: '見積金額' }, { text: '次のタスク' }, { text: '担当' }]];
  const shown = rowsIn.slice(0, MAX_PIPELINE_ROWS);
  const size = shown.length > 10 ? 9 : FORMAT_FONT.tableDense;
  shown.forEach((r) => {
    const mark = r.since_last === 'new' ? '【新規】' : r.since_last === 'updated' ? '【更新】' : '';
    const rowRed = markChanges && r.since_last === 'new' ? { color: C.negative } : {};
    const nameRed = markChanges && (r.since_last === 'new' || r.since_last === 'updated') ? { color: C.negative } : {};
    rows.push([
      { text: `${mark}${r.name}\n${r.customer_name}・${r.code}`, size, ...nameRed },
      { text: `${r.confidence}（${r.probability}%）`, align: 'center', size, bold: true, color: r.confidence === 'A' || r.confidence === 'B' ? C.positive : C.text, ...rowRed },
      { text: fmtMd(r.event_start, r.event_end), align: 'center', size, ...rowRed },
      { text: r.estimate_amount == null ? '—' : fmtYen(r.estimate_amount), align: 'right', size, ...rowRed },
      { text: `${r.next_action ?? '—'}${r.next_action_date ? `（${fmtMd(r.next_action_date)}）` : ''}`, size, ...rowRed },
      { text: r.next_action_owner ?? '—', align: 'center', size, ...rowRed },
    ]);
  });
  if (rowsIn.length > shown.length) rows.push([{ text: `ほか ${rowsIn.length - shown.length} 件（案件一覧を参照）`, colspan: 6, color: C.muted, size }]);
  addTable(slide, rows, box, [34, 9, 11, 12, 26, 8], { size });
}

// ── 案件ページ・実施報告 ──────────────────────────────────────
export function renderBand(slide: PptxGenJS.Slide, band: ProjectPageData['band'], box: Box): void {
  addText(slide, `${band.customer_short} ／ ${band.event_name} ／ ${band.date_label}`, box,
    { size: 18, bold: true, color: 'FFFFFF', fill: C.band, valign: 'middle', margin: 6, shrink: true });
}

export function renderConfidence(slide: PptxGenJS.Slide, c: { letter: string; label: string }, box: Box): void {
  slide.addText([
    { text: String(c.letter), options: { fontSize: 28, bold: true, color: C.negative, breakLine: true } },
    { text: String(c.label ?? ''), options: { fontSize: 10, color: C.negative } },
  ], { x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, align: 'center', valign: 'middle', margin: 0 });
}

export function renderSchedule(slide: PptxGenJS.Slide, s: ProjectPageData['schedule'], box: Box): void {
  if (!s.length) { addPlaceholder(slide, box, '進行表（Qシートの香盤が無いので空）'); return; }
  const rows: Cell[][] = [[{ text: '時間' }, { text: '内容' }, { text: '会場' }]];
  for (const r of s.slice(0, 10)) rows.push([{ text: r.time, align: 'center' }, { text: r.content }, { text: r.venue }]);
  addTable(slide, rows, box, [15, 60, 25], { size: 11 });
}

export function renderKeyDates(slide: PptxGenJS.Slide, d: ProjectPageData['key_dates'], box: Box): void {
  if (!d.length) { addPlaceholder(slide, box, 'チェック／リハ／本番（カレンダーに予定が無い）'); return; }
  const runs: PptxGenJS.TextProps[] = d.flatMap((k, i) => [
    { text: `${k.label}　`, options: { bold: true, color: C.title, fontSize: 13 } },
    { text: k.text, options: { fontSize: 13, breakLine: i < d.length - 1 } },
  ]);
  slide.addText(runs, { x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, valign: 'top', margin: 4 });
}

export function renderMoney(slide: PptxGenJS.Slide, m: { revenue: number | null; gross_profit: number | null; gross_margin: number | null }, box: Box): void {
  const rows: Cell[][] = [
    [{ text: '売上', bold: true, fill: 'EEF3FA' }, { text: fmtYen(m.revenue), align: 'right', bold: true }],
    [{ text: '粗利', bold: true, fill: 'EEF3FA' }, { text: `${fmtYen(m.gross_profit)}${m.gross_margin != null ? `（${fmtPct(m.gross_margin)}）` : ''}`, align: 'right', bold: true }],
  ];
  addTable(slide, rows, box, [30, 70], { size: 13, header: false });
}

export function renderReportBullets(slide: PptxGenJS.Slide, r: ProjectPageData, box: Box): void {
  const lines = [...(r.headline ? [`【総括】${r.headline}`] : []), ...r.highlights];
  if (r.report_status === 'draft') lines.push('※ ふりかえりは下書き（未確定）');
  addBullets(slide, lines, box, { size: 16, label: '成果の箇条書き（ふりかえり未記入）' });
}

// ── 稼働カレンダー ───────────────────────────────────────────
const KIND_COLOR: Record<string, string> = {
  performance: C.negative, rehearsal: C.title, hold: C.muted, maintenance: '777777', tour: '2E7D32', internal: '8E44AD', setup: 'B26A00', consultation: '2E7D32', other: C.text,
};
const KIND_LABEL: Record<string, string> = { performance: '本番', rehearsal: 'リハ', hold: '仮', maintenance: 'メンテ', tour: '内覧', internal: '社内', setup: '設営', consultation: '相談', other: 'その他' };

/** `utilizationChanged`: 前回の資料から稼働率が動いたら見出しの数字を赤に */
export function renderCalendar(slide: PptxGenJS.Slide, cal: UtilizationCalendar, box: Box, utilizationChanged = false): void {
  const [y, m] = cal.year_month.split('-').map(Number);
  const rate = cal.utilization == null ? '—' : fmtPct(cal.utilization);
  slide.addText([
    { text: `${m}月（稼働率`, options: { bold: true, color: C.title } },
    { text: rate, options: { bold: true, color: utilizationChanged ? C.negative : C.title } },
    { text: '）', options: { bold: true, color: C.title } },
  ], { x: box.x, y: box.y, w: box.w, h: 0.35, fontFace: FONT, fontSize: 16, valign: 'middle', margin: 2 });
  const legend: PptxGenJS.TextProps[] = Object.entries(KIND_LABEL).filter(([k]) => k !== 'consultation' && k !== 'other')
    .map(([k, l]) => ({ text: `■${l}　`, options: { color: KIND_COLOR[k], fontSize: 9 } }));
  slide.addText(legend, { x: box.x, y: box.y + 0.33, w: box.w, h: 0.22, fontFace: FONT, margin: 0, valign: 'middle' });

  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // 月曜始まり
  const cells: PptxGenJS.TableCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ text: '', options: { fill: { color: 'F7F7F7' } } });
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (lead + d - 1) % 7;
    const items = cal.days[String(d)] ?? [];
    const runs: PptxGenJS.TextProps[] = [{ text: String(d), options: { bold: true, fontSize: 9, color: dow >= 5 ? C.negative : C.text, breakLine: items.length > 0 } }];
    items.slice(0, 3).forEach((it, i) => runs.push({
      text: it.label.length > 7 ? `${it.label.slice(0, 7)}…` : it.label,
      options: { fontSize: 7, color: KIND_COLOR[it.kind] ?? C.text, breakLine: i < Math.min(items.length, 3) - 1 },
    }));
    cells.push({ text: runs as unknown as string, options: { valign: 'top', fill: { color: dow >= 5 ? 'FBFBFB' : 'FFFFFF' } } });
  }
  while (cells.length % 7 !== 0) cells.push({ text: '', options: { fill: { color: 'F7F7F7' } } });
  const border: PptxGenJS.BorderProps = { type: 'solid', color: C.line, pt: 0.5 };
  const head: PptxGenJS.TableRow = ['月', '火', '水', '木', '金', '土', '日'].map((t) => ({
    text: t, options: { bold: true, color: 'FFFFFF', fill: { color: C.tableHead }, align: 'center', fontSize: 9, border },
  }));
  const rows: PptxGenJS.TableRow[] = [head];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).map((c) => ({ ...c, options: { ...c.options, border, margin: [1, 2, 1, 2] as [number, number, number, number] } })));
  const top = box.y + 0.6;
  // 下端はフッターと脚注（「赤字＝前回から変わった所」）の上で止める。テンプレの枠は 95% まであり、そのままだとフッターに重なる
  const bottom = Math.min(box.y + box.h, SLIDE_H - 0.8);
  const rowH = (bottom - top) / rows.length;
  slide.addTable(rows, { x: box.x, y: top, w: box.w, colW: Array(7).fill(box.w / 7), rowH, fontFace: FONT, autoPage: false });
}

// ── 内覧会・議事録・参加者 ─────────────────────────────────────
export function renderCategoryTable(slide: PptxGenJS.Slide, rowsIn: Array<{ category: string; groups: number; people: number }>, box: Box): void {
  const rows: Cell[][] = [[{ text: '来場者の分類' }, { text: '組数' }, { text: '来場人数' }]];
  for (const r of rowsIn) rows.push([{ text: r.category }, { text: String(r.groups), align: 'right' }, { text: String(r.people), align: 'right' }]);
  const g = rowsIn.reduce((s, r) => s + r.groups, 0); const p = rowsIn.reduce((s, r) => s + r.people, 0);
  rows.push([{ text: '合計', bold: true, fill: 'EEF3FA' }, { text: String(g), align: 'right', bold: true, fill: 'EEF3FA' }, { text: String(p), align: 'right', bold: true, fill: 'EEF3FA' }]);
  addTable(slide, rows, box, [60, 20, 20], { size: 11 });
}

export function minutesLines(m: { decisions: string[]; topics: Array<{ area: string; text: string }> }): string[] {
  return [...m.decisions.map((d) => `【決定】${d}`), ...m.topics.map((t) => `【${t.area}】${t.text}`)];
}

/** 手入力（配列の配列／オブジェクトの配列）を表に。形が読めなければ文として出す */
export function renderGenericTable(slide: PptxGenJS.Slide, v: unknown, box: Box, label: string): void {
  if (!Array.isArray(v) || v.length === 0) { addPlaceholder(slide, box, label); return; }
  let rows: Cell[][];
  if (Array.isArray(v[0])) rows = (v as unknown[][]).map((r) => r.map((c) => ({ text: String(c ?? '') })));
  else if (v[0] && typeof v[0] === 'object') {
    const keys = Object.keys(v[0] as object);
    rows = [keys.map((k) => ({ text: k })), ...(v as Record<string, unknown>[]).map((r) => keys.map((k) => ({ text: String(r[k] ?? '') })))];
  } else rows = (v as unknown[]).map((c) => [{ text: String(c ?? '') }]);
  addTable(slide, rows, box, rows[0].map(() => 1), { size: 12, header: !Array.isArray(v[0]) });
}
