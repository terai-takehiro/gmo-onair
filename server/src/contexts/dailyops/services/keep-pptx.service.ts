/**
 * 構成（KeepDeck）＋ 定例報告パック → PowerPoint（.pptx）。
 *
 * ── 決めごと（docs/design/v4/keep-report.md §6.2・§6.3）────────────────
 * - `pptxgenjs` で **表は表・グラフはグラフ・文はテキストボックス**として出す（画像にするのは写真だけ）。
 *   最後は PowerPoint 上で直せる
 * - 見た目は GMO流会議フォーマット Ver.2.5 の枠（`keep-pptx-chrome.service`）を守り、内側は ONAiR が決める
 * - 部品の値は `resolveBinding`（`keep-binding.ts`・画面と同じ写し）で読む。**材料が無くても投げない** —
 *   ラベル付きの灰色の枠にする。人が上書きした文は赤（「変更点は赤字」）
 * - **「変更点は赤字」は前回の資料（凍結したパック・`opts.previousPack`）と比べて自動で付ける**（§6.3）:
 *   数値報告の表の動いた升・ヨミ表の新規／更新の案件・稼働率。どこが動いたかは `keep-pack-diff.ts` が決める。
 *   赤字を付けたページには左下に「赤字＝前回（M/D）の資料から変わった所」の脚注を出す。前回の資料が無ければ何も付けない
 * - 守るものの検査は止めずに警告だけ（題の書式・文字の大きさ）。`warnings` で返す
 *
 * 大きさ: 13.333in × 7.5in（LAYOUT_WIDE・16:9）。部品の % はテンプレの仮想キャンバス（1280×720）に対する値。
 */
import PptxGenJS from 'pptxgenjs';
import {
  BUSINESS_ENTITIES,
  type KeepDeck, type KeepReportPack, type SlidePage, type SlidePart, type ProjectPageData, type MonthlyPlTable, type PlByEntity,
  type UtilizationCalendar, type BusinessEntity, type InviewSummary,
} from './keep-deck.types';
import { COVER_TEXT, FORMAT_COLORS, FORMAT_FONT, TAGLINE_BINDING } from './keep-templates';
import { changedPlKeys, changedUtilization, changeNoteLabel, previousCalendar, previousPlTable } from './keep-pack-diff';
import { resolveBinding, deckAgenda, dateLabel, type BindingContext, type TrendRevenuePoint, type TrendUtilizationPoint } from './keep-binding';
import {
  toBox, addText, addBullets, addTable, addPlaceholder, addHeader, addFooter, addChangeNote, addFormatImage, checkTitleFormat, type Box, type Cell,
} from './keep-pptx-chrome.service';
import { attachFormatSvgs } from './keep-pptx-svg.service';
import {
  isPlTable, isPlByEntity, isPipelineRows, isCalendar, renderPlTable, renderPlByEntity, plNotes, renderPipeline,
  renderBand, renderConfidence, renderSchedule, renderKeyDates, renderMoney, renderReportBullets, renderCalendar,
  renderCategoryTable, minutesLines, renderGenericTable, renderInviewSummary,
} from './keep-pptx-parts.service';
import { renderRevenueChart, renderUtilizationChart, fetchPhotos, renderPhotos, photosFromOverride } from './keep-pptx-charts.service';
import { parseTsv } from './keep-tsv';

const C = FORMAT_COLORS;
const CT = { bar: 'bar' as PptxGenJS.CHART_NAME, line: 'line' as PptxGenJS.CHART_NAME };

export interface RenderOptions {
  meeting_title?: string | null;
  /** ONAiR に無い手入力（keep_report_inputs の key → value） */
  inputs?: Record<string, unknown> | null;
  /** 試験用: Box を読まない */
  skipPhotos?: boolean;
  /**
   * 前回の資料のパック（凍結版・`loadPreviousPack`）。あれば「変更点は赤字」— 前回から動いた升・案件・稼働率を
   * 赤にして脚注を出す。無ければ（初回の資料）何も付けない
   */
  previousPack?: KeepReportPack | null;
}
export interface RenderResult { buffer: Buffer; pages: number; warnings: string[] }

type Photos = Array<{ box_file_id: string; caption: string | null }>;
const isPhotos = (v: unknown): v is Photos => Array.isArray(v) && (v.length === 0 || typeof (v[0] as { box_file_id?: unknown })?.box_file_id === 'string');
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 1つの写真の部品に置く上限（`renderPhotos` の 2×2 と同じ）。**Box を読む前に**ここで切る */
const MAX_PHOTOS_PER_PART = 4;

/**
 * パックが知っている写真の Box file id（案件ページ・実施報告・内覧会）。
 * 人の上書き（`text_override` に並べた id）は**この中の id だけ**を通す — 構成の JSON に
 * 任意の file id を書けば Box の任意のファイルをサーバー経由で読み出せる、という穴を閉じる。
 */
function knownPhotoIds(pack: KeepReportPack | null): Set<string> {
  const ids = new Set<string>();
  if (!pack) return ids;
  for (const p of [...pack.project_pages, ...pack.event_reports]) for (const ph of p.photos) ids.add(ph.box_file_id);
  const inview = pack.inview as (KeepReportPack['inview'] & { photos?: Photos }) | null;
  if (inview && isPhotos(inview.photos)) for (const ph of inview.photos) ids.add(ph.box_file_id);
  return ids;
}

function photosOf(pack: KeepReportPack | null, page: SlidePage, part: SlidePart, ctx: BindingContext, known: Set<string>): Photos {
  const r = resolveBinding(pack, page, part, ctx);
  if (!r.ok) return [];
  if (typeof r.value === 'string') {
    // 上書きの id はパックに載っている写真だけ。知らない id は黙って飛ばす（灰色の枠にもしない）
    return photosFromOverride(r.value).filter((p) => known.has(p.box_file_id)).slice(0, MAX_PHOTOS_PER_PART);
  }
  return isPhotos(r.value) ? r.value.slice(0, MAX_PHOTOS_PER_PART) : [];
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
interface TextStyle {
  size: number; bold?: boolean; color?: string; fill?: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; prefix?: string;
  /** 長い文は箱の幅に収まるまで小さくする（表紙の会議名） */
  fit?: boolean;
}

/**
 * 文字数から「箱の幅に収まる大きさ」を決める（全角 1em・半角 0.65em で見積もり、4% の余裕を取る。左右の余白 0.2in を引く）。
 * 太字の欧文大文字（GMO）は 0.6em より広く、余裕が無いと実測で折り返した。client の `fitPx`（slideStyle.ts）と同じ式にしておく
 * PowerPoint の自動調整（normAutofit）は開いた後に計算されるので、出力時点で収まる大きさにしておく
 */
export function fitPt(text: string, maxPt: number, widthIn: number, minPt = 20): number {
  const longest = text.split(/\r?\n/).reduce((m, l) => Math.max(m, [...l].reduce((w, ch) => w + (ch.codePointAt(0)! > 0x2e7f ? 1 : 0.65), 0)), 0);
  if (longest === 0) return maxPt;
  return Math.max(minPt, Math.min(maxPt, Math.floor(((widthIn - 0.2) * 72) / (longest * 1.04))));
}

function textStyle(page: SlidePage, part: SlidePart): TextStyle {
  const b = part.binding ?? '';
  if (page.template === 'cover') {
    // 実物の表紙: 会議名 72pt 太字・黒・中央／部署名と日付 40pt 中央／青い箱 24pt 白／注意書き 20pt
    if (b === '$meeting_title') return { size: FORMAT_FONT.coverTitle, bold: true, color: C.text, align: 'center', valign: 'middle', fit: true };
    if (b === COVER_TEXT.versionNote) return { size: FORMAT_FONT.coverNote, color: 'FFFFFF', fill: C.title, align: 'center', valign: 'middle' };
    if (b === COVER_TEXT.guide) return { size: FORMAT_FONT.coverGuide, color: C.text, valign: 'middle' };
    return { size: FORMAT_FONT.coverSub, color: C.text, align: 'center', valign: 'middle' };
  }
  if (page.template === 'appendix') return { size: FORMAT_FONT.appendix, color: C.positive, valign: 'top' };
  if (b === '$pl_heading') return { size: 20, bold: true, color: C.title, valign: 'middle' };
  if (b === '単位：千円') return { size: 12, align: 'right', valign: 'middle', color: C.muted };
  if (page.template === 'pipeline_table') return { size: 16, bold: true, valign: 'middle' };
  if (b.endsWith('.intake_channel')) return { size: 12, color: C.muted, valign: 'middle', prefix: '経路: ' };
  if (b === 'minutes.next_meeting_date') return { size: 24, bold: true, valign: 'middle', prefix: '次回開催日：' };
  if (page.template === 'slogan') return { size: 28, bold: true, align: 'center', valign: 'middle' };
  if (page.template === 'pl_table') return { size: 11 }; // 注記
  return { size: 18 };
}

/**
 * 部品の `options.font_size`（右の「このページ」の「文字の大きさ」。プレビューの 1280×720 キャンバスでの px）→ pt。
 * スライドは 13.333in ＝ 960pt 幅なので 1px ＝ 0.75pt — プレビューと同じ大きさで出す。
 * 無い・数でないときは undefined（部品ごとの既定）。プレビュー（`PartRenderer`）が読むのは文と箇条書きだけなので、
 * ここも同じ2種類にだけ効かせる（片方だけに効くと「画面では大きいのに資料では小さい」になる）
 */
function fontPt(part: SlidePart): number | undefined {
  const px = part.options?.font_size;
  return typeof px === 'number' && Number.isFinite(px) && px > 0 ? px * 0.75 : undefined;
}

/**
 * タブ区切りの表（人の上書き `text_override`・人が置いた表の `options.rows`）を**表として**出す。
 * 読み方はプレビュー（`PartRenderer` → `parseTsv` → `SlideTable`）と同じ（shared の写し `keep-tsv.ts`）。
 * 文（`addText`）で出すと pptx に生の TSV が並び、「表は表で出す・PowerPoint で直せる」の約束が崩れる（レビュー 5 回目 P1）。
 * 1行目は見出し・足りない升は空で埋める。人の上書きなら本文は赤（「変更点は赤字」）
 */
function renderTsvTable(slide: PptxGenJS.Slide, text: string, box: Box, o: { size?: number; red?: string; label: string }): void {
  const t = parseTsv(text);
  if (t.head.length === 0) { addPlaceholder(slide, box, o.label); return; }
  const cols = Math.max(t.head.length, ...t.rows.map((r) => r.length));
  const pad = (r: string[]): string[] => Array.from({ length: cols }, (_, i) => r[i] ?? '');
  const rows: Cell[][] = [
    pad(t.head).map((cell) => ({ text: cell })),
    ...t.rows.map((r) => pad(r).map((cell) => ({ text: cell, color: o.red }))),
  ];
  addTable(slide, rows, box, Array<number>(cols).fill(1), { size: o.size ?? 12 });
}

interface Ctx {
  pack: KeepReportPack | null; bind: BindingContext; photos: Map<string, string>; warnings: string[];
  /** パックが知っている写真の id（上書きの検査に使う） */
  knownPhotos: Set<string>;
  /** 前回の資料のパック。「変更点は赤字」の比較相手 */
  prev: KeepReportPack | null;
  /** このページに赤字の対象（表・ヨミ表・カレンダー）を描いたか（脚注を出す印。ページごとに戻す） */
  marked: boolean;
}

// ── 「変更点は赤字」: どの升・行・数字を赤にするか（前回の資料が無ければ何も返さない）────
/** binding（`landing.GSS` など）から計上会社を読む。読めなければ all */
function entityOfBinding(binding: string | null): keyof PlByEntity {
  const m = /^(?:landing|forecast)\.(all|SCS|GSS|GMO)$/.exec(binding ?? '');
  return (m?.[1] as keyof PlByEntity | undefined) ?? 'all';
}
function plChanges(c: Ctx, binding: string | null, t: MonthlyPlTable): ReadonlySet<string> | undefined {
  if (!c.prev) return undefined;
  c.marked = true;
  return changedPlKeys(previousPlTable(c.prev, entityOfBinding(binding), t.year_month), t);
}
function plChangesByEntity(c: Ctx, p: PlByEntity): Partial<Record<BusinessEntity, ReadonlySet<string>>> | undefined {
  if (!c.prev) return undefined;
  c.marked = true;
  const out: Partial<Record<BusinessEntity, ReadonlySet<string>>> = {};
  for (const e of BUSINESS_ENTITIES) {
    const t = p[e];
    if (t) out[e] = changedPlKeys(previousPlTable(c.prev, e, t.year_month), t);
  }
  return out;
}
/** ヨミ表（`pipeline.*`）だけ印を付ける。空の配列は `isPipelineRows` を通ってしまうので binding でも見る */
function pipelineMarks(c: Ctx, binding: string | null): boolean {
  if (!c.prev || !binding?.startsWith('pipeline')) return false;
  c.marked = true;
  return true;
}
function utilizationChanged(c: Ctx, cal: UtilizationCalendar): boolean {
  if (!c.prev) return false;
  c.marked = true;
  return changedUtilization(previousCalendar(c.prev, cal.year_month), cal);
}

function renderPart(slide: PptxGenJS.Slide, page: SlidePage, part: SlidePart, c: Ctx): void {
  const box: Box = toBox(part);
  const label = part.options?.label != null ? String(part.options.label) : part.id;
  const r = resolveBinding(c.pack, page, part, c.bind);
  if (!r.ok) {
    if (page.template === 'pl_table' && part.type === 'text' && part.binding == null) {
      const lines = plNotes(plTableOf(c.pack, page, c.bind));
      if (lines.length) { addText(slide, lines.join('\n'), box, { size: fontPt(part) ?? 11, color: C.muted }); return; }
    }
    // 人が置いた表（binding 無し）は中身を `options.rows` に持つ（プレビューと同じ読み方で表にする）
    if (part.type === 'table' && typeof part.options?.rows === 'string') { renderTsvTable(slide, part.options.rows, box, { size: fontPt(part), label }); return; }
    // 締めのページの絵（フォーマットの「すべての人にインターネット」）
    if (part.type === 'image' && part.binding === TAGLINE_BINDING) { addFormatImage(slide, 'tagline', box); return; }
    addPlaceholder(slide, box, r.reason === 'no_pack' ? `${label}（数字がまだありません）` : label);
    return;
  }
  const v = r.value;
  const red = r.overridden ? C.negative : undefined; // 人が上書きした文は赤
  switch (part.type) {
    case 'table':
      if (typeof v === 'string') { renderTsvTable(slide, v, box, { size: fontPt(part), red, label }); return; }
      if (isPlTable(v)) { renderPlTable(slide, v, box, { changed: plChanges(c, part.binding, v) }); return; }
      if (isPlByEntity(v)) { renderPlByEntity(slide, v, box, plChangesByEntity(c, v)); return; }
      // 進行表はヨミ表より先に見る — 空の配列は `isPipelineRows` を通り、空のヨミ表として描かれてしまう（灰色の枠にならない）
      if (part.binding?.endsWith('.schedule') && Array.isArray(v)) { renderSchedule(slide, v as ProjectPageData['schedule'], box); return; }
      if (isPipelineRows(v)) { renderPipeline(slide, v, box, pipelineMarks(c, part.binding)); return; }
      if (isObj(v) && 'gross_margin' in v) { renderMoney(slide, v as unknown as ProjectPageData, box); return; }
      if (part.binding === 'inview.by_category' && Array.isArray(v)) { renderCategoryTable(slide, v as Array<{ category: string; groups: number; people: number }>, box); return; }
      renderGenericTable(slide, v, box, label); return;
    case 'chart':
      if (part.binding === 'trend.revenue' && Array.isArray(v)) { renderRevenueChart(slide, v as TrendRevenuePoint[], box, CT); return; }
      if (part.binding === 'trend.utilization' && Array.isArray(v)) { renderUtilizationChart(slide, v as TrendUtilizationPoint[], box, CT); return; }
      addPlaceholder(slide, box, label); return;
    case 'photos':
      renderPhotos(slide, photosOf(c.pack, page, part, c.bind, c.knownPhotos), box, c.photos, label); return;
    case 'calendar':
      if (isCalendar(v)) { renderCalendar(slide, v, box, utilizationChanged(c, v)); return; }
      addPlaceholder(slide, box, label); return;
    case 'bullets': {
      if (typeof v === 'string') { addBullets(slide, v.split(/\r?\n/).filter(Boolean), box, { size: fontPt(part) ?? 18, color: red, label }); return; }
      if (part.binding?.endsWith('.highlights')) {
        // 実施報告の箇条書きは総括（headline）と下書きの印も一緒に出したいので、親（event_reports[i]）を読む
        const parent = resolveBinding(c.pack, page, { ...part, binding: part.binding.replace(/\.highlights$/, ''), text_override: null }, c.bind);
        if (parent.ok && isObj(parent.value) && Array.isArray(parent.value.highlights)) { renderReportBullets(slide, parent.value as unknown as ProjectPageData, box); return; }
      }
      if (part.binding === 'inview.summary' && isObj(v) && typeof v.groups === 'number' && typeof v.people === 'number') { renderInviewSummary(slide, v as unknown as InviewSummary, box); return; }
      if (isStrings(v)) { addBullets(slide, v, box, { size: fontPt(part) ?? (page.template === 'agenda' ? 22 : 16), label }); return; }
      if (isObj(v) && Array.isArray(v.decisions)) { addBullets(slide, minutesLines(v as { decisions: string[]; topics: Array<{ area: string; text: string }> }), box, { size: fontPt(part) ?? 18, label }); return; }
      if (isObj(v) && Array.isArray(v.highlights)) { renderReportBullets(slide, v as unknown as ProjectPageData, box); return; }
      addPlaceholder(slide, box, label); return;
    }
    case 'text': case 'kpi': {
      if (isObj(v) && 'event_name' in v) {
        // 帯には確度バッジも出したいので、親（project_pages[i] / event_reports[i]）を読んで confidence を添える
        let confidence: { letter: string; label: string } | null = null;
        if (part.binding?.endsWith('.band')) {
          const parent = resolveBinding(c.pack, page, { ...part, binding: part.binding.replace(/\.band$/, ''), text_override: null }, c.bind);
          if (parent.ok && isObj(parent.value) && typeof parent.value.confidence === 'string') {
            confidence = { letter: String(parent.value.confidence), label: String(parent.value.confidence_label ?? '') };
          }
        }
        renderBand(slide, v as ProjectPageData['band'], box, confidence);
        return;
      }
      if (isObj(v) && 'letter' in v) { renderConfidence(slide, v as { letter: string; label: string }, box); return; }
      if (Array.isArray(v) && v.length && isObj(v[0]) && 'label' in v[0] && 'text' in v[0]) { renderKeyDates(slide, v as ProjectPageData['key_dates'], box); return; }
      const st = textStyle(page, part);
      let text: string;
      if (typeof v === 'string') text = part.binding === '$meeting_date' || part.binding === 'minutes.next_meeting_date' ? dateLabel(v) : v;
      else if (typeof v === 'number') text = String(v);
      else if (isStrings(v)) text = v.join('\n');
      else { addPlaceholder(slide, box, label); return; }
      const size = part.type === 'kpi' ? 44 : fontPt(part) ?? (st.fit ? fitPt(text, st.size, box.w) : st.size);
      addText(slide, `${st.prefix ?? ''}${text}`, box, { ...st, color: red ?? st.color, size });
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

  // 写真は先にまとめて取る（描く側は同期）。部品ごとに 4 枚まで・パックが知っている id だけ（`photosOf`）
  const knownPhotos = knownPhotoIds(pack);
  const ids: string[] = [];
  if (!opts.skipPhotos) {
    for (const page of pages) for (const part of page.parts) if (part.type === 'photos') ids.push(...photosOf(pack, page, part, bind, knownPhotos).map((p) => p.box_file_id));
  }
  const photos = await fetchPhotos(ids);
  const c: Ctx = { pack, bind, photos, warnings, knownPhotos, prev: opts.previousPack ?? null, marked: false };

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'GMO ONAiR';
  pptx.company = 'GMO Samurai Studio';
  pptx.title = `${deck.meeting_date} 橋口社長隔週キープ`;

  pages.forEach((page, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    addHeader(slide, page);
    c.marked = false;
    for (const part of page.parts) {
      try { renderPart(slide, page, part, c); } catch (err) {
        // 1つの部品で落ちても資料全体は出す（材料の形が想定外のとき）
        warnings.push(`p.${i + 1} ${part.id}: 描けませんでした（${(err as Error).message}）`);
        addPlaceholder(slide, toBox(part), String(part.options?.label ?? part.id));
      }
    }
    // 「変更点は赤字」の脚注: 赤字の対象を描いたページだけ。文の M/D は前回の資料の会議日
    if (c.marked && c.prev) addChangeNote(slide, changeNoteLabel(c.prev.meeting_date));
    addFooter(slide);
    if (page.notes) slide.addNotes(page.notes);
    const w = checkTitleFormat(page, i + 1);
    if (w) warnings.push(w);
  });
  if (pages.length && !c.prev) warnings.push('前回の資料（凍結したパック）が無いので「変更点は赤字」は付けていません');

  const raw = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  // フォーマットの絵に元の SVG を結びつける（PNG は残る。読めない環境は PNG を見る）
  const { buffer } = await attachFormatSvgs(raw);
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
