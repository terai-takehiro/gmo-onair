/**
 * pptx 出力の「枠」— GMO流会議フォーマット Ver.2.5 のヘッダー・トークスクリプトの帯・フッターと、
 * 部品を置くための共通の道具（文字箱・表・灰色の枠・数字の書式）。
 *
 * ── 守るもの（docs/design/v4/keep-report.md §6.3）────────────────────
 * ヘッダー・フッターの位置・大きさ・色・書体は**実物の `GMO流会議フォーマット_Ver_2_5.pptx` から読んだ値**
 * （`keep-templates.ts` の `FORMAT_CHROME` / `FORMAT_COLORS` / `FORMAT_FONT`。インチ・pt そのまま）:
 * - 題: レイアウトの title placeholder（0.234in/0.124in・9.817×0.707in）・36pt・太字・#005BAC・左
 * - 帯: 角丸の長方形 2 本（0.86in と 1.422in・13.003×0.449in）。青＝accent1 の淡色 #BFD7FF（進行担当／発表者）、
 *   緑＝#D2ECD8（会議オーナー／全員）。左端にスピーカーのアイコン（`formatAssets` の talkIcon）、文は 18pt・
 *   全角空白 3 つでアイコンの分を空ける（実物と同じ）。注記は赤 #D62825 で右寄せ
 * - フッター（スライドマスター）: ワードマーク「GMO INTERNET GROUP」（画像・0.256in/7.166in）／
 *   青いタグ #005AAC・10pt 白（2.988in/7.149in）／Strictly confidential 12pt #C00000 右寄せ／ページ番号 24pt 太字 #808080
 *   （スライド番号のフィールド）。**罫線は無い。表紙にも出る**
 * - 書体は Noto Sans JP（FORMAT_FONT.family）。開く PC に無いと置き換わる（§6.2）
 *
 * 位置は 13.333in × 7.5in（16:9・LAYOUT_WIDE）。部品の位置はテンプレの %（1280×720 の仮想キャンバス）から換算する。
 * 絵（ワードマーク・アイコン・締めのロゴ）は PNG で置き、`keep-pptx-svg.service.ts` が出力後に元の SVG を結びつける
 * （pptxgenjs は Node で SVG の代替 PNG を作れないため）。印は altText の `gmo-format:<key>`。
 *
 * ── templates.ts に無い寸法（ここで決めている）────
 * 「赤字＝前回から変わった所」の脚注 0.4in/6.74in/7.5in/0.28in（フッターの上・10pt・灰）。
 */
import type PptxGenJS from 'pptxgenjs';
import type { SlidePage, SlidePart } from './keep-deck.types';
import { FORMAT_CHROME, FORMAT_COLORS, FORMAT_FONT, FORMAT_FOOTER, TALK_BANDS, SLIDE_TEMPLATES } from './keep-templates';
import { formatAssetPngData, type FormatAssetKey } from './keep-format-assets';

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

// ── 表の升の高さを崩さない ────────────────────────────────────────
/**
 * 文字数から幅を見積もり（全角 1em・半角 0.65em。`keep-pptx.service.ts` の `fitPt` と同じ数え方）、
 * `maxEm` を超えたら「…」で切る。**升の中身は1行に収まる長さに切って、行数を人が決めた設計どおりに保つ**
 * ためのもの — PowerPoint の表は升の高さを「その升が実際に折り返した行数」から自動で決め直すので
 * （XML の `<a:tr h="0">` はヒントに過ぎない）、長い自由文（案件名・お客様名・分類名など）を切らずに置くと
 * 1升が2〜3行に膨らみ、表の下端がテンプレの箱をはみ出してフッターに重なる・スライドの外に出る
 */
export function truncateEm(text: string | null | undefined, maxEm: number): string {
  if (!text) return '';
  let w = 0;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const cw = chars[i].codePointAt(0)! > 0x2e7f ? 1 : 0.65;
    if (w + cw > maxEm) return `${chars.slice(0, i).join('')}…`;
    w += cw;
  }
  return text;
}

/**
 * 表の1列の中身が1行に収まる文字数の目安（em）。列の幅（in）× 列の比率 − セルの余白 を、
 * フォントの大きさ（pt）で割る（全角1文字 ≈ フォントの大きさそのものの幅、という近似）。
 */
export function colMaxEm(boxW: number, weightFrac: number, sizePt: number, marginIn = 0.11): number {
  const colWIn = Math.max(0, boxW * weightFrac - marginIn);
  return (colWIn * 72) / sizePt;
}

/**
 * 箱の高さに収まる行数の上限（見出し1行 ＋ 中身が `linesPerRow` 行の升 × N）。
 * 行の高さは「フォントの大きさ×行数×1.2（行間の目安）＋ 升の上下余白」で見積もる。
 * 表の行数を人が決めた定数（例: 16件まで）にせず箱の高さから逆算することで、
 * テンプレの高さを直しても表の上限が自動で追随する（食い違って箱をはみ出さない）
 */
export function maxRowsForBox(boxH: number, sizePt: number, linesPerRow: number, headerLines = 1, marginIn = 0.06): number {
  const lineIn = (sizePt * 1.2) / 72;
  const headerH = headerLines * lineIn + marginIn;
  const rowH = linesPerRow * lineIn + marginIn;
  return Math.max(1, Math.floor((boxH - headerH) / rowH));
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

/** 表。`weights` は列幅の比。1行目を見出し（紺・白）にする。`rowH` は行ごとの高さ（配列なら行数ぶん・
 * 足りない分は最後の値を使う）。**渡さないと PowerPoint が升の中身から高さを決め直す**ので、
 * 行数が多い・自由文が長い表（ヨミ表など）は呼ぶ側が箱の高さから逆算して渡すこと（`maxRowsForBox`） */
export function addTable(
  slide: PptxGenJS.Slide, rows: Cell[][], box: Box, weights: number[], o: { size?: number; header?: boolean; rowH?: number | number[] } = {},
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

// ── フォーマットの絵 ────────────────────────────────────────────
/** altText の印。`keep-pptx-svg.service.ts` がこれを見て元の SVG を結びつける */
export const FORMAT_IMAGE_MARK = 'gmo-format:';

/** フォーマットの絵（ワードマーク・帯のアイコン・締めのロゴ）を PNG で置く。印を altText に入れる */
export function addFormatImage(slide: PptxGenJS.Slide, key: FormatAssetKey, box: Box): void {
  slide.addImage({ data: formatAssetPngData(key), x: box.x, y: box.y, w: box.w, h: box.h, altText: `${FORMAT_IMAGE_MARK}${key}` });
}

// ── ヘッダー・フッター ─────────────────────────────────────────
export function addHeader(slide: PptxGenJS.Slide, page: SlidePage): void {
  const header = SLIDE_TEMPLATES[page.template]?.header ?? 'title';
  if (header === 'none') return;
  // 題: レイアウトの title placeholder（36pt・太字・青・左上）。長い題は縮めて 1 行に収める
  addText(slide, page.title, { ...FORMAT_CHROME.title }, { size: FORMAT_FONT.title, bold: true, color: C.title, valign: 'top', shrink: true, wrap: false });
  if (header === 'title') return;
  const bands = header === 'bands-report' ? TALK_BANDS.report : TALK_BANDS.owner;
  const B = FORMAT_CHROME.band;
  const icon = FORMAT_CHROME.bandIcon;
  bands.forEach((b, i) => {
    const y = B.top[i] ?? B.top[0] + i * (B.top[1] - B.top[0]);
    const fill = b.tone === 'blue' ? C.talkBlue : C.talkGreen;
    // 帯は「文の入った角丸の長方形」1 つ（実物と同じ形・PowerPoint で 1 つの図形として直せる）。
    // 文の前の全角空白 3 つも実物どおり — アイコンの分を空けている
    slide.addText(`　　　${b.text}`, {
      shape: 'roundRect' as PptxGenJS.SHAPE_NAME, rectRadius: B.radius, x: B.x, y, w: B.w, h: B.h,
      fill: { color: fill }, line: { color: fill, width: 0 },
      fontFace: FONT, fontSize: FORMAT_FONT.band, color: C.text, valign: 'middle', align: 'left', isTextBox: true,
    });
    addFormatImage(slide, 'talkIcon', { x: icon.x, y: y + (B.h - icon.size) / 2, w: icon.size, h: icon.size });
    const note = 'note' in b ? b.note : null;
    if (note) {
      addText(slide, note, { x: FORMAT_CHROME.bandNoteX, y, w: B.x + B.w - FORMAT_CHROME.bandNoteX, h: B.h },
        { size: FORMAT_FONT.band, color: C.negative, align: 'right', valign: 'middle' });
    }
  });
}

/**
 * 「赤字＝前回（M/D）の資料から変わった所」の脚注（§6.3「変更点は赤字」）。
 * 表・ヨミ表・稼働カレンダーを描いたページの左下・フッターの罫線のすぐ上。文は `keep-pack-diff.ts` の `changeNoteLabel`
 */
export function addChangeNote(slide: PptxGenJS.Slide, label: string): void {
  addText(slide, label, { x: 0.4, y: 6.74, w: 7.5, h: 0.28 }, { size: 10, color: C.muted, valign: 'bottom', margin: 2 });
}

/**
 * フッター（実物のスライドマスター＋各ページのタグと同じ）: ワードマーク（画像）／青いタグ／
 * Strictly confidential（赤）／ページ番号（スライド番号のフィールド。PowerPoint で並べ替えても振り直される）。
 * 罫線は無い。表紙にも出る（実物のレイアウト「タイトルページ」もマスターの絵を隠していない）
 */
export function addFooter(slide: PptxGenJS.Slide): void {
  const F = FORMAT_CHROME.footer;
  addFormatImage(slide, 'wordmark', F.logo);
  addText(slide, FORMAT_FOOTER.tag, { ...F.tag }, { size: FORMAT_FONT.footerTag, color: 'FFFFFF', fill: C.positive, align: 'center', valign: 'middle', margin: 0, wrap: false });
  addText(slide, FORMAT_FOOTER.confidential, { ...F.confidential }, { size: FORMAT_FONT.confidential, color: C.confidential, align: 'right', valign: 'middle', wrap: false });
  slide.slideNumber = {
    x: F.pageNo.x, y: F.pageNo.y, w: F.pageNo.w, h: F.pageNo.h,
    fontFace: FONT, fontSize: FORMAT_FONT.pageNo, bold: true, color: C.pageNo, align: 'right', margin: 0,
  };
}

// ── 出力時の検査（止めない・警告だけ。§6.3）────────────────────────
const AGENDA_TITLE_RE = /【[^】]+[｜|][^】]+[｜|]\d+分】/;
const REPORT_TEMPLATES = new Set(['pl_table', 'pipeline_table', 'project_page', 'utilization_calendar', 'event_report', 'inview', 'free']);

/** 報告ページの題が【カテゴリ｜緊急×重要｜時間】の書式か */
export function checkTitleFormat(page: SlidePage, pageNo: number): string | null {
  if (!REPORT_TEMPLATES.has(page.template) || AGENDA_TITLE_RE.test(page.title)) return null;
  return `p.${pageNo}「${page.title}」: 題が【カテゴリ｜緊急×重要｜時間】の書式ではありません`;
}
