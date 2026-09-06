/**
 * 構成（KeepDeck）＋ 定例報告パック → PowerPoint（.pptx）。
 *
 * ── 決めごと（docs/design/v4/keep-report.md §6.2・§6.3）────────────────
 * - `pptxgenjs` で **表は表・グラフはグラフ・文はテキストボックス**として出す（画像にするのは写真だけ）。
 *   最後は PowerPoint 上で直せる
 * - 見た目は GMO流会議フォーマット Ver.2.5 の枠（`keep-pptx-chrome.service`）を守り、内側は ONAiR が決める
 * - 部品の値は `resolveBinding`（`keep-binding.ts`・画面と同じ写し）で読む。**材料が無くても投げない** —
 *   ラベル付きの灰色の枠にする。人が上書きした文は赤（「変更点は赤字」）
 * - 守るものの検査は止めずに警告だけ（題の書式・文字の大きさ）。`warnings` で返す
 *
 * 大きさ: 13.333in × 7.5in（LAYOUT_WIDE・16:9）。部品の % はテンプレの仮想キャンバス（1280×720）に対する値。
 */
import PptxGenJS from 'pptxgenjs';
import type { KeepDeck, KeepReportPack, SlidePage, SlidePart, ProjectPageData } from './keep-deck.types';
import { FORMAT_COLORS } from './keep-templates';
import { resolveBinding, deckAgenda, dateLabel, type BindingContext, type TrendRevenuePoint, type TrendUtilizationPoint } from './keep-binding';
import {
  toBox, addText, addBullets, addPlaceholder, addHeader, addFooter, checkTitleFormat, type Box,
} from './keep-pptx-chrome.service';
import {
  isPlTable, isPlByEntity, isPipelineRows, isCalendar, renderPlTable, renderPlByEntity, plNotes, renderPipeline,
  renderBand, renderConfidence, renderSchedule, renderKeyDates, renderMoney, renderReportBullets, renderCalendar,
  renderCategoryTable, minutesLines, renderGenericTable,
} from './keep-pptx-parts.service';
import { renderRevenueChart, renderUtilizationChart, fetchPhotos, renderPhotos, photosFromOverride } from './keep-pptx-charts.service';

const C = FORMAT_COLORS;
const CT = { bar: 'bar' as PptxGenJS.CHART_NAME, line: 'line' as PptxGenJS.CHART_NAME };

export interface RenderOptions {
  meeting_title?: string | null;
  /** ONAiR に無い手入力（keep_report_inputs の key → value） */
  inputs?: Record<string, unknown> | null;
  /** 試験用: Box を読まない */
  skipPhotos?: boolean;
}
export interface RenderResult { buffer: Buffer; pages: number; warnings: string[] }

type Photos = Array<{ box_file_id: string; caption: string | null }>;
const isPhotos = (v: unknown): v is Photos => Array.isArray(v) && (v.length === 0 || typeof (v[0] as { box_file_id?: unknown })?.box_file_id === 'string');
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function photosOf(pack: KeepReportPack | null, page: SlidePage, part: SlidePart, ctx: BindingContext): Photos {
  const r = resolveBinding(pack, page, part, ctx);
  if (!r.ok) return [];
  if (typeof r.value === 'string') return photosFromOverride(r.value);
  return isPhotos(r.value) ? r.value : [];
}

/** 数値報告ページの表の値（注記を自動で組むときに使う） */
function plTableOf(pack: KeepReportPack | null, page: SlidePage, ctx: BindingContext) {
  const table = page.parts.find((p) => p.type === 'table');
  if (!table) return null;
  const r = resolveBinding(pack, page, table, ctx);
  if (!r.ok) return null;
  if (isPlTable(r.value)) return r.value;
  if (isPlByEntity(r.value)) return r.value.all;
  return null;
}

/** 文の部品の大きさと置き方（binding とテンプレで決める） */
function textStyle(page: SlidePage, part: SlidePart): { size: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; prefix?: string } {
  const b = part.binding ?? '';
  if (page.template === 'cover') return b === '$meeting_title' ? { size: 40, bold: true, color: C.title, align: 'center', valign: 'middle' } : { size: 24, align: 'center', valign: 'middle' };
  if (b === '$pl_heading') return { size: 20, bold: true, color: C.title, valign: 'middle' };
  if (b === '単位：千円') return { size: 12, align: 'right', valign: 'middle', color: C.muted };
  if (page.template === 'pipeline_table') return { size: 16, bold: true, valign: 'middle' };
  if (b.endsWith('.intake_channel')) return { size: 12, color: C.muted, valign: 'middle', prefix: '経路: ' };
  if (b === 'minutes.next_meeting_date') return { size: 24, bold: true, valign: 'middle', prefix: '次回開催日：' };
  if (page.template === 'appendix') return { size: 36, bold: true, color: C.title, valign: 'middle' };
  if (page.template === 'slogan') return { size: 28, bold: true, align: 'center', valign: 'middle' };
  if (page.template === 'pl_table') return { size: 11 }; // 注記
  return { size: 18 };
}

interface Ctx { pack: KeepReportPack | null; bind: BindingContext; photos: Map<string, string>; warnings: string[] }

function renderPart(slide: PptxGenJS.Slide, page: SlidePage, part: SlidePart, c: Ctx): void {
  const box: Box = toBox(part);
  const label = part.options?.label != null ? String(part.options.label) : part.id;
  const r = resolveBinding(c.pack, page, part, c.bind);
  if (!r.ok) {
    if (page.template === 'pl_table' && part.type === 'text' && part.binding == null) {
      const lines = plNotes(plTableOf(c.pack, page, c.bind));
      if (lines.length) { addText(slide, lines.join('\n'), box, { size: 11, color: C.muted }); return; }
    }
    addPlaceholder(slide, box, r.reason === 'no_pack' ? `${label}（数字がまだありません）` : label);
    return;
  }
  const v = r.value;
  const red = r.overridden ? C.negative : undefined; // 人が上書きした文は赤
  switch (part.type) {
    case 'table':
      if (typeof v === 'string') { addText(slide, v, box, { size: 12, color: red }); return; }
      if (isPlTable(v)) { renderPlTable(slide, v, box); return; }
      if (isPlByEntity(v)) { renderPlByEntity(slide, v, box); return; }
      if (isPipelineRows(v)) { renderPipeline(slide, v, box); return; }
      if (isObj(v) && 'gross_margin' in v) { renderMoney(slide, v as unknown as ProjectPageData, box); return; }
      if (part.binding?.endsWith('.schedule') && Array.isArray(v)) { renderSchedule(slide, v as ProjectPageData['schedule'], box); return; }
      if (part.binding === 'inview.by_category' && Array.isArray(v)) { renderCategoryTable(slide, v as Array<{ category: string; groups: number; people: number }>, box); return; }
      renderGenericTable(slide, v, box, label); return;
    case 'chart':
      if (part.binding === 'trend.revenue' && Array.isArray(v)) { renderRevenueChart(slide, v as TrendRevenuePoint[], box, CT); return; }
      if (part.binding === 'trend.utilization' && Array.isArray(v)) { renderUtilizationChart(slide, v as TrendUtilizationPoint[], box, CT); return; }
      addPlaceholder(slide, box, label); return;
    case 'photos':
      renderPhotos(slide, photosOf(c.pack, page, part, c.bind), box, c.photos, label); return;
    case 'calendar':
      if (isCalendar(v)) { renderCalendar(slide, v, box); return; }
      addPlaceholder(slide, box, label); return;
    case 'bullets': {
      if (typeof v === 'string') { addBullets(slide, v.split(/\r?\n/).filter(Boolean), box, { size: 18, color: red, label }); return; }
      if (part.binding?.endsWith('.highlights')) {
        // 実施報告の箇条書きは総括（headline）と下書きの印も一緒に出したいので、親（event_reports[i]）を読む
        const parent = resolveBinding(c.pack, page, { ...part, binding: part.binding.replace(/\.highlights$/, ''), text_override: null }, c.bind);
        if (parent.ok && isObj(parent.value) && Array.isArray(parent.value.highlights)) { renderReportBullets(slide, parent.value as unknown as ProjectPageData, box); return; }
      }
      if (isStrings(v)) { addBullets(slide, v, box, { size: page.template === 'agenda' ? 22 : 16, label }); return; }
      if (isObj(v) && Array.isArray(v.decisions)) { addBullets(slide, minutesLines(v as { decisions: string[]; topics: Array<{ area: string; text: string }> }), box, { size: 18, label }); return; }
      if (isObj(v) && Array.isArray(v.highlights)) { renderReportBullets(slide, v as unknown as ProjectPageData, box); return; }
      addPlaceholder(slide, box, label); return;
    }
    case 'text': case 'kpi': {
      if (isObj(v) && 'event_name' in v) { renderBand(slide, v as ProjectPageData['band'], box); return; }
      if (isObj(v) && 'letter' in v) { renderConfidence(slide, v as { letter: string; label: string }, box); return; }
      if (Array.isArray(v) && v.length && isObj(v[0]) && 'label' in v[0] && 'text' in v[0]) { renderKeyDates(slide, v as ProjectPageData['key_dates'], box); return; }
      const st = textStyle(page, part);
      let text: string;
      if (typeof v === 'string') text = part.binding === '$meeting_date' || part.binding === 'minutes.next_meeting_date' ? dateLabel(v) : v;
      else if (typeof v === 'number') text = String(v);
      else if (isStrings(v)) text = v.join('\n');
      else { addPlaceholder(slide, box, label); return; }
      addText(slide, `${st.prefix ?? ''}${text}`, box, { ...st, color: red ?? st.color, size: part.type === 'kpi' ? 44 : st.size });
      return;
    }
    default:
      addPlaceholder(slide, box, label);
  }
}

export async function renderDeckPptx(deck: KeepDeck, pack: KeepReportPack | null, opts: RenderOptions = {}): Promise<RenderResult> {
  const pages = deck.pages.filter((p) => !p.removed);
  const bind: BindingContext = { meeting_date: deck.meeting_date, meeting_title: opts.meeting_title ?? null, agenda: deckAgenda(deck.pages), inputs: opts.inputs ?? null };
  const warnings: string[] = [];

  // 写真は先にまとめて取る（描く側は同期）
  const ids: string[] = [];
  if (!opts.skipPhotos) {
    for (const page of pages) for (const part of page.parts) if (part.type === 'photos') ids.push(...photosOf(pack, page, part, bind).map((p) => p.box_file_id));
  }
  const photos = await fetchPhotos(ids);
  const c: Ctx = { pack, bind, photos, warnings };

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'GMO ONAiR';
  pptx.company = 'GMO Samurai Studio';
  pptx.title = `${deck.meeting_date} 橋口社長隔週キープ`;

  pages.forEach((page, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    addHeader(slide, page);
    for (const part of page.parts) {
      try { renderPart(slide, page, part, c); } catch (err) {
        // 1つの部品で落ちても資料全体は出す（材料の形が想定外のとき）
        warnings.push(`p.${i + 1} ${part.id}: 描けませんでした（${(err as Error).message}）`);
        addPlaceholder(slide, toBox(part), String(part.options?.label ?? part.id));
      }
    }
    addFooter(slide, i + 1);
    if (page.notes) slide.addNotes(page.notes);
    const w = checkTitleFormat(page, i + 1);
    if (w) warnings.push(w);
  });
  if (pages.length) warnings.push('表・一覧・注記は中身が収まる大きさ（9〜18pt）で出しています（目安 24pt・§6.3）');

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return { buffer, pages: pages.length, warnings };
}

/** Box に置くファイル名: `<YYMMDD>_橋口社長隔週キープ_ONAiR.pptx` */
export function deckFileName(meetingDate: string): string {
  return `${meetingDate.replace(/-/g, '').slice(2)}_橋口社長隔週キープ_ONAiR.pptx`;
}
/** Box のサブフォルダ名（会議日の YYMMDD） */
export function deckFolderName(meetingDate: string): string {
  return meetingDate.replace(/-/g, '').slice(2);
}
