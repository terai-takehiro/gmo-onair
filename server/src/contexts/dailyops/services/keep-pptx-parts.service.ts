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
  MonthlyPlTable, PlByEntity, PipelineRow, ProjectPageData, UtilizationCalendar, BusinessEntity, InviewSummary,
} from './keep-deck.types';
import { BUSINESS_ENTITY_LABELS, BUSINESS_ENTITIES } from './keep-deck.types';
import { FORMAT_COLORS, FORMAT_FONT } from './keep-templates';
import { plCellKey, type PlCellColumn } from './keep-pack-diff';
import {
  addTable, addText, addPlaceholder, fmtSen, fmtYen, fmtPct, fmtMd, truncateEm, colMaxEm, maxRowsForBox,
  renderInfoBand, renderHeadlineAndChecklist, renderStatRow,
  type Box, type Cell, FONT, SLIDE_H,
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

/** 計上会社別: GJV・GSS の2つの表を横に並べる（GMO は数字があるときだけ3つ目）。`changed` は会社ごとの動いた升 */
export function renderPlByEntity(
  slide: PptxGenJS.Slide, p: PlByEntity, box: Box, changed?: Partial<Record<BusinessEntity, ChangedCells>>,
): void {
  const entities: BusinessEntity[] = BUSINESS_ENTITIES.filter((e) => p[e] != null);
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

/**
 * 数値報告の注記（人の上書きが無いとき）: 未確定の売上・売上未登録の案件・経理の補正。
 * 見込（forecast）の表は未確定の売上を確度加味で**含めている**が、着地（landing）の表には入っていない —
 * 書き分けないと「含めた」と書いた注記に含めていない金額が並ぶ。売上未登録の案件はどちらの表にも入っていない
 */
export function plNotes(t: MonthlyPlTable | null): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (t.has_override) out.push(t.override_note ? `経理の補正値を使用（${t.override_note}）` : '経理の補正値を使用');
  if (t.unconfirmed.length) {
    out.push(t.mode === 'forecast' ? '見通しに含めた未確定の売上（確度加味）:' : '未確定の売上（着地には入れていない・確定待ち）:');
    for (const u of t.unconfirmed) out.push(`・${u.project_name} ${fmtSen(u.amount)}千円`);
  }
  if (t.unregistered.length) {
    out.push('本番があるのにこの月の売上が未登録の案件（表には入れていない・見積または想定額）:');
    for (const u of t.unregistered) out.push(`・${u.project_name} ${fmtSen(u.amount)}千円`);
  }
  return out;
}

// ── ①ヨミ表 ──────────────────────────────────────────────────
/** 列の比率（`addTable` の weights と同じ並び。名前・お客様の列の折り返し幅の見積もりに使う） */
const PIPELINE_WEIGHTS = [34, 9, 11, 12, 26, 8] as const;
/**
 * `markChanges`（前回の資料があるとき）: 新規の案件は行ごと赤、動いた案件は案件名だけ赤
 *
 * ⚠️ **案件名・お客様名は2行（案件名／お客様名・コード）に収まる長さへ切る。** PowerPoint の表は
 * 升の高さを実際に折り返した行数から決め直す（`<a:tr h="0">` はヒントに過ぎない）ため、切らずに
 * 置くと長い案件名（実データで30〜40字は普通にある）が3〜4行に折り返し、表の下端がテンプレの箱
 * （`utilization_calendar` の上に来る `pipeline_table` の箱は下端がフッターの直前）をはみ出す。
 * 件数の上限も**箱の高さから逆算**する（固定 16 件のままテンプレの高さだけ変えると食い違うため）
 */
export function renderPipeline(slide: PptxGenJS.Slide, rowsIn: PipelineRow[], box: Box, markChanges = false): void {
  const rows: Cell[][] = [[{ text: '案件／お客様' }, { text: '確度' }, { text: '実施日' }, { text: '見積金額' }, { text: '次のタスク' }, { text: '担当' }]];
  const size = rowsIn.length > 10 ? 9 : FORMAT_FONT.tableDense;
  const maxRows = maxRowsForBox(box.h, size, 2);
  const shown = rowsIn.slice(0, maxRows);
  const nameEm = colMaxEm(box.w, PIPELINE_WEIGHTS[0] / 100, size);
  const actionEm = colMaxEm(box.w, PIPELINE_WEIGHTS[4] / 100, size);
  shown.forEach((r) => {
    const mark = r.since_last === 'new' ? '【新規】' : r.since_last === 'updated' ? '【更新】' : '';
    const rowRed = markChanges && r.since_last === 'new' ? { color: C.negative } : {};
    const nameRed = markChanges && (r.since_last === 'new' || r.since_last === 'updated') ? { color: C.negative } : {};
    const nameLine = truncateEm(`${mark}${r.name}`, nameEm);
    const customerLine = truncateEm(`${r.customer_name}・${r.code}`, nameEm);
    const actionText = `${r.next_action ?? '—'}${r.next_action_date ? `（${fmtMd(r.next_action_date)}）` : ''}`;
    rows.push([
      { text: `${nameLine}\n${customerLine}`, size, ...nameRed },
      { text: `${r.confidence}（${r.probability}%）`, align: 'center', size, bold: true, color: r.confidence === 'A' || r.confidence === 'B' ? C.positive : C.text, ...rowRed },
      { text: fmtMd(r.event_start, r.event_end), align: 'center', size, ...rowRed },
      { text: r.estimate_amount == null ? '—' : fmtYen(r.estimate_amount), align: 'right', size, ...rowRed },
      { text: truncateEm(actionText, actionEm), size, ...rowRed },
      { text: r.next_action_owner ?? '—', align: 'center', size, ...rowRed },
    ]);
  });
  if (rowsIn.length > shown.length) rows.push([{ text: `ほか ${rowsIn.length - shown.length} 件（案件一覧を参照）`, colspan: 6, color: C.muted, size }]);
  // 見出し行は1行・案件の行は2行の比で箱の高さを配る（案件の行だけ2行ぶんの高さが要る）
  const dataRows = rows.length - 1;
  const rowH = dataRows === 0 ? undefined : (() => {
    const headerH = Math.max(0.22, box.h / (dataRows * 2 + 1));
    const dataH = Math.max(0.05, (box.h - headerH) / dataRows);
    return [headerH, ...Array<number>(dataRows).fill(dataH)];
  })();
  addTable(slide, rows, box, [...PIPELINE_WEIGHTS], { size, rowH });
}

// ── 案件ページ・実施報告 ──────────────────────────────────────
/** 帯（お客様／イベント名／日付＋確度）。2026-09 刷新: 罫線ではなく面（塗り）と確度バッジで見せる（`renderInfoBand`） */
export function renderBand(slide: PptxGenJS.Slide, band: ProjectPageData['band'], box: Box, confidence?: { letter: string; label: string } | null): void {
  renderInfoBand(slide, box, {
    main: band.event_name,
    sub: `${band.customer_short} ／ ${band.date_label}`,
    pill: confidence ? `${confidence.letter}・${confidence.label}` : null,
  });
}

export function renderConfidence(slide: PptxGenJS.Slide, c: { letter: string; label: string }, box: Box): void {
  slide.addText([
    { text: String(c.letter), options: { fontSize: 28, bold: true, color: C.negative, breakLine: true } },
    { text: String(c.label ?? ''), options: { fontSize: 10, color: C.negative } },
  ], { x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, align: 'center', valign: 'middle', margin: 0 });
}

const SCHEDULE_WEIGHTS = [15, 60, 25] as const;
export function renderSchedule(slide: PptxGenJS.Slide, s: ProjectPageData['schedule'], box: Box): void {
  if (!s.length) { addPlaceholder(slide, box, '進行表（Qシートの香盤が無いので空）'); return; }
  const size = 11;
  const contentEm = colMaxEm(box.w, SCHEDULE_WEIGHTS[1] / 100, size);
  const venueEm = colMaxEm(box.w, SCHEDULE_WEIGHTS[2] / 100, size);
  const shown = s.slice(0, maxRowsForBox(box.h, size, 1));
  const rows: Cell[][] = [[{ text: '時間' }, { text: '内容' }, { text: '会場' }]];
  for (const r of shown) rows.push([{ text: r.time, align: 'center' }, { text: truncateEm(r.content, contentEm) }, { text: truncateEm(r.venue, venueEm) }]);
  addTable(slide, rows, box, [...SCHEDULE_WEIGHTS], { size, rowH: box.h / rows.length });
}

export function renderKeyDates(slide: PptxGenJS.Slide, d: ProjectPageData['key_dates'], box: Box): void {
  if (!d.length) { addPlaceholder(slide, box, 'チェック／リハ／本番（カレンダーに予定が無い）'); return; }
  const runs: PptxGenJS.TextProps[] = d.flatMap((k, i) => [
    { text: `${k.label}　`, options: { bold: true, color: C.title, fontSize: 13 } },
    { text: k.text, options: { fontSize: 13, breakLine: i < d.length - 1 } },
  ]);
  slide.addText(runs, { x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, valign: 'top', margin: 4 });
}

/** 売上／粗利／粗利率。2026-09 刷新: 2行の表ではなく数字カード（`renderStatRow`）で見せる */
export function renderMoney(slide: PptxGenJS.Slide, m: { revenue: number | null; gross_profit: number | null; gross_margin: number | null }, box: Box): void {
  const stats: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: '売上', value: fmtYen(m.revenue) },
    { label: '粗利', value: fmtYen(m.gross_profit) },
  ];
  if (m.gross_margin != null) stats.push({ label: '粗利率', value: fmtPct(m.gross_margin), accent: true });
  renderStatRow(slide, box, stats);
}

/** 総括＋成果の箇条書き。2026-09 刷新: 総括を専用カードに分け、箇条書きはチェック印にする（`renderHeadlineAndChecklist`） */
export function renderReportBullets(slide: PptxGenJS.Slide, r: ProjectPageData, box: Box): void {
  const items = [...r.highlights, ...(r.report_status === 'draft' ? ['※ ふりかえりは下書き（未確定）'] : [])];
  if (!r.headline && items.length === 0) { addPlaceholder(slide, box, '成果の箇条書き（ふりかえり未記入）'); return; }
  renderHeadlineAndChecklist(slide, box, { headline: r.headline, items });
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
    // `days` の鍵は `YYYY-MM-DD`（`keep-pack-calendar.service.ts` の `daysOf` が作る形。画面の
    // CalendarRenderer と同じ読み方）。`String(d)` は古い形のパックへの保険
    const items = cal.days[`${cal.year_month}-${String(d).padStart(2, '0')}`] ?? cal.days[String(d)] ?? [];
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
/** 内覧会の帯（定期内覧会／開催日）＋来場組数・来場人数・分類数の数字カード。`inview.summary` 1本で組む */
export function renderInviewSummary(slide: PptxGenJS.Slide, s: InviewSummary, box: Box): void {
  const bandH = Math.min(box.h * 0.3, 1.1);
  renderInfoBand(slide, { x: box.x, y: box.y, w: box.w, h: bandH }, {
    main: '定期内覧会', sub: `${fmtMd(s.session_date)}開催`,
    pill: s.next_session ? `次回 ${fmtMd(s.next_session.date)}` : null,
  });
  const gap = 0.14;
  renderStatRow(slide, { x: box.x, y: box.y + bandH + gap, w: box.w, h: box.y + box.h - (box.y + bandH + gap) }, [
    { label: '来場組数', value: `${s.groups}組` },
    { label: '来場人数', value: `${s.people}名` },
    { label: '分類数', value: `${s.category_count}`, accent: true },
  ]);
}

const CATEGORY_WEIGHTS = [60, 20, 20] as const;
/** 分類名（内覧会の来場者名簿の会社名・肩書）は実データで50字を超えることがあり、切らずに置くと
 * 1升が2〜3行に折り返して表の下端が箱をはみ出す（`renderPipeline` と同じ理由）。1行に収まる長さへ切る */
export function renderCategoryTable(slide: PptxGenJS.Slide, rowsIn: Array<{ category: string; groups: number; people: number }>, box: Box): void {
  const size = 11;
  const nameEm = colMaxEm(box.w, CATEGORY_WEIGHTS[0] / 100, size);
  const rows: Cell[][] = [[{ text: '来場者の分類' }, { text: '組数' }, { text: '来場人数' }]];
  for (const r of rowsIn) rows.push([{ text: truncateEm(r.category, nameEm) }, { text: String(r.groups), align: 'right' }, { text: String(r.people), align: 'right' }]);
  const g = rowsIn.reduce((s, r) => s + r.groups, 0); const p = rowsIn.reduce((s, r) => s + r.people, 0);
  rows.push([{ text: '合計', bold: true, fill: 'EEF3FA' }, { text: String(g), align: 'right', bold: true, fill: 'EEF3FA' }, { text: String(p), align: 'right', bold: true, fill: 'EEF3FA' }]);
  addTable(slide, rows, box, [...CATEGORY_WEIGHTS], { size, rowH: box.h / rows.length });
}

export function minutesLines(m: { decisions: string[]; topics: Array<{ area: string; text: string }> }): string[] {
  return [...m.decisions.map((d) => `【決定】${d}`), ...m.topics.map((t) => `【${t.area}】${t.text}`)];
}

/**
 * 手入力（配列の配列／オブジェクトの配列）を表に。形が読めなければ文として出す。
 * **人の手入力は行数も1升の長さも決めごとが無い**ので、他の表と同じく箱の高さから
 * 行数の上限を決め、升の中身は1行に収まる長さへ切る（切らないと長い自由文で升が膨らみ、
 * 箱の下端をはみ出す）
 */
export function renderGenericTable(slide: PptxGenJS.Slide, v: unknown, box: Box, label: string): void {
  if (!Array.isArray(v) || v.length === 0) { addPlaceholder(slide, box, label); return; }
  const hasHeader = !Array.isArray(v[0]);
  let rows: Cell[][];
  if (Array.isArray(v[0])) rows = (v as unknown[][]).map((r) => r.map((c) => ({ text: String(c ?? '') })));
  else if (v[0] && typeof v[0] === 'object') {
    const keys = Object.keys(v[0] as object);
    rows = [keys.map((k) => ({ text: k })), ...(v as Record<string, unknown>[]).map((r) => keys.map((k) => ({ text: String(r[k] ?? '') })))];
  } else rows = (v as unknown[]).map((c) => [{ text: String(c ?? '') }]);
  const size = 12;
  const cols = rows[0].length;
  const maxRows = maxRowsForBox(box.h, size, 1, hasHeader ? 1 : 0);
  const headRows = hasHeader ? 1 : 0;
  const shown = rows.length - headRows > maxRows ? [...rows.slice(0, headRows + maxRows)] : rows;
  const cellEm = colMaxEm(box.w, 1 / cols, size);
  const truncated = shown.map((r) => r.map((c) => ({ ...c, text: truncateEm(c.text, cellEm) })));
  if (rows.length > shown.length) truncated.push([{ text: `ほか ${rows.length - shown.length} 行（省略）`, colspan: cols, color: C.muted, size }]);
  addTable(slide, truncated, box, rows[0].map(() => 1), { size, header: hasHeader, rowH: box.h / truncated.length });
}
