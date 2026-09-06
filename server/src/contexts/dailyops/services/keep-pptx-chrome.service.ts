/**
 * pptx 出力の「枠」— GMO流会議フォーマット Ver.2.5 のヘッダー・トークスクリプトの帯・フッターと、
 * 部品を置くための共通の道具（文字箱・表・灰色の枠・数字の書式）。
 *
 * ── 守るもの（docs/design/v4/keep-report.md §6.3）────────────────────
 * - 題: 左上・青（FORMAT_COLORS.title）・36pt・太字
 * - 帯: 題の下に2段（青＝進行担当／発表者、緑＝会議オーナー／全員）。右端に赤い注記
 * - フッター: 「GMO INTERNET GROUP」／フォーマット名の青いタグ／Strictly confidential（赤）／ページ番号（灰・大きめ）
 * - 書体は Noto Sans JP（FORMAT_FONT.family）。開く PC に無いと置き換わる（§6.2）
 *
 * 位置は 13.333in × 7.5in（16:9・LAYOUT_WIDE）。部品の位置はテンプレの %（1280×720 の仮想キャンバス）から換算する。
 *
 * ── templates.ts に無い寸法（ここで決めている。共通化したいものは報告に書く）────
 * 題の箱 0.4in/0.2in/12.5in/0.7in、帯 0.32in × 2（0.95in〜）、フッターの y 7.1in、ページ番号 20pt。
 */
import type PptxGenJS from 'pptxgenjs';
import type { SlidePage, SlidePart } from './keep-deck.types';
import { FORMAT_COLORS, FORMAT_FONT, FORMAT_FOOTER, TALK_BANDS, SLIDE_TEMPLATES } from './keep-templates';

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

export interface Box { x: number; y: number; w: number; h: number }

/** 部品の %（1280×720 の仮想キャンバス）→ インチ */
export function toBox(part: Pick<SlidePart, 'x' | 'y' | 'w' | 'h'>): Box {
  return { x: (part.x / 100) * SLIDE_W, y: (part.y / 100) * SLIDE_H, w: (part.w / 100) * SLIDE_W, h: (part.h / 100) * SLIDE_H };
}

export const FONT = FORMAT_FONT.family;
const C = FORMAT_COLORS;

// ── 数字の書式（表示側でだけ丸める。パックは円のまま）──────────────
/** 円 → 千円（3桁区切り）。負は ASCII のマイナス（PowerPoint で数として扱えるように） */
export const fmtSen = (yen: number | null | undefined): string =>
  yen == null ? '—' : Math.round(yen / 1000).toLocaleString('ja-JP');
export const fmtYen = (yen: number | null | undefined): string =>
  yen == null ? '—' : `¥${Math.round(yen).toLocaleString('ja-JP')}`;
export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null ? '—' : `${v.toFixed(digits)}%`;
/** 'YYYY-MM-DD' → 'M/D'。範囲は 'M/D〜M/D' */
export function fmtMd(start: string | null | undefined, end?: string | null): string {
  const md = (s: string) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s); return m ? `${Number(m[1])}/${Number(m[2])}` : s; };
  if (!start) return '未定';
  return end && end !== start ? `${md(start)}〜${md(end)}` : md(start);
}

// ── 文字・表・枠 ───────────────────────────────────────────────
export interface TextOpts {
  size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom';
  fill?: string; margin?: number; wrap?: boolean; shrink?: boolean;
}

export function addText(slide: PptxGenJS.Slide, text: string, box: Box, o: TextOpts = {}): void {
  slide.addText(text, {
    x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, fontSize: o.size ?? FORMAT_FONT.body,
    bold: o.bold ?? false, color: o.color ?? C.text, align: o.align ?? 'left', valign: o.valign ?? 'top',
    margin: o.margin ?? 4, wrap: o.wrap ?? true, ...(o.fill ? { fill: { color: o.fill } } : {}),
    ...(o.shrink ? { fit: 'shrink' as const } : {}),
  });
}

/** 箇条書き。`lines` が空なら灰色の枠 */
export function addBullets(slide: PptxGenJS.Slide, lines: string[], box: Box, o: TextOpts & { label?: string } = {}): void {
  if (lines.length === 0) { addPlaceholder(slide, box, o.label ?? '（空）'); return; }
  const runs: PptxGenJS.TextProps[] = lines.map((t, i) => ({
    text: t, options: { bullet: { indent: 14 }, breakLine: i < lines.length - 1, fontSize: o.size ?? 18, color: o.color ?? C.text, bold: o.bold ?? false },
  }));
  slide.addText(runs, { x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, valign: o.valign ?? 'top', margin: 4, paraSpaceAfter: 4 });
}

/** 材料が無いときの灰色の枠（投げない・落とさない。人が見て分かるようにラベルを書く） */
export function addPlaceholder(slide: PptxGenJS.Slide, box: Box, label: string): void {
  slide.addText(`（${label}）`, {
    x: box.x, y: box.y, w: box.w, h: box.h, fontFace: FONT, fontSize: 12, color: C.muted, align: 'center', valign: 'middle',
    fill: { color: 'F2F2F2' }, line: { color: 'C8C8C8', width: 0.75, dashType: 'dash' },
  });
}

export interface Cell { text: string; bold?: boolean; color?: string; fill?: string; align?: 'left' | 'center' | 'right'; size?: number; colspan?: number }

/** 表。`weights` は列幅の比。1行目を見出し（紺・白）にする */
export function addTable(
  slide: PptxGenJS.Slide, rows: Cell[][], box: Box, weights: number[], o: { size?: number; header?: boolean; rowH?: number } = {},
): void {
  if (rows.length === 0) { addPlaceholder(slide, box, '表（空）'); return; }
  const sum = weights.reduce((a, b) => a + b, 0);
  const colW = weights.map((w) => (box.w * w) / sum);
  const size = o.size ?? FORMAT_FONT.tableDense;
  const border: PptxGenJS.BorderProps = { type: 'solid', color: C.line, pt: 0.5 };
  const tableRows: PptxGenJS.TableRow[] = rows.map((r, ri) => r.map((c) => {
    const head = (o.header ?? true) && ri === 0;
    return {
      text: c.text,
      options: {
        fontFace: FONT, fontSize: c.size ?? size, bold: c.bold ?? head, color: c.color ?? (head ? 'FFFFFF' : C.text),
        align: c.align ?? (head ? 'center' : 'left'), valign: 'middle', border,
        fill: { color: c.fill ?? (head ? C.tableHead : 'FFFFFF') }, margin: [2, 4, 2, 4],
        ...(c.colspan ? { colspan: c.colspan } : {}),
      },
    } as PptxGenJS.TableCell;
  }));
  slide.addTable(tableRows, { x: box.x, y: box.y, w: box.w, colW, ...(o.rowH ? { rowH: o.rowH } : {}), autoPage: false });
}

// ── ヘッダー・フッター ─────────────────────────────────────────
export function addHeader(slide: PptxGenJS.Slide, page: SlidePage): void {
  const header = SLIDE_TEMPLATES[page.template]?.header ?? 'title';
  if (header === 'none') return;
  addText(slide, page.title, { x: 0.4, y: 0.2, w: 12.5, h: 0.7 }, { size: FORMAT_FONT.title, bold: true, color: C.title, valign: 'middle', shrink: true, wrap: false });
  if (header === 'title') return;
  const bands = header === 'bands-report' ? TALK_BANDS.report : TALK_BANDS.owner;
  bands.forEach((b, i) => {
    const y = 0.95 + i * 0.36;
    const fill = b.tone === 'blue' ? C.talkBlue : C.talkGreen;
    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, { x: 0.4, y, w: 12.5, h: 0.32, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.08 });
    addText(slide, b.text, { x: 0.5, y, w: 7.5, h: 0.32 }, { size: 14, bold: true, valign: 'middle', margin: 2 });
    const note = 'note' in b ? b.note : null;
    if (note) addText(slide, note, { x: 7.9, y, w: 5.0, h: 0.32 }, { size: 11, color: C.negative, align: 'right', valign: 'middle', margin: 2 });
  });
}

export function addFooter(slide: PptxGenJS.Slide, pageNo: number): void {
  slide.addShape('line' as PptxGenJS.SHAPE_NAME, { x: 0.4, y: 7.05, w: 12.5, h: 0, line: { color: C.line, width: 0.75 } });
  addText(slide, FORMAT_FOOTER.logo, { x: 0.4, y: 7.1, w: 3.0, h: 0.3 }, { size: 11, bold: true, valign: 'middle', margin: 2 });
  addText(slide, FORMAT_FOOTER.tag, { x: 3.5, y: 7.13, w: 4.7, h: 0.26 }, { size: FORMAT_FONT.footer, color: 'FFFFFF', fill: C.title, align: 'center', valign: 'middle', margin: 2 });
  addText(slide, FORMAT_FOOTER.confidential, { x: 8.3, y: 7.1, w: 3.8, h: 0.3 }, { size: FORMAT_FONT.footer, color: C.negative, align: 'right', valign: 'middle', margin: 2 });
  addText(slide, String(pageNo), { x: 12.15, y: 6.95, w: 0.9, h: 0.45 }, { size: 20, color: C.muted, align: 'right', valign: 'middle', margin: 2 });
}

// ── 出力時の検査（止めない・警告だけ。§6.3）────────────────────────
const AGENDA_TITLE_RE = /【[^】]+[｜|][^】]+[｜|]\d+分】/;
const REPORT_TEMPLATES = new Set(['pl_table', 'pipeline_table', 'project_page', 'utilization_calendar', 'event_report', 'inview', 'free']);

/** 報告ページの題が【カテゴリ｜緊急×重要｜時間】の書式か */
export function checkTitleFormat(page: SlidePage, pageNo: number): string | null {
  if (!REPORT_TEMPLATES.has(page.template) || AGENDA_TITLE_RE.test(page.title)) return null;
  return `p.${pageNo}「${page.title}」: 題が【カテゴリ｜緊急×重要｜時間】の書式ではありません`;
}
