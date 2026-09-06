/**
 * pptx のグラフと写真。
 *
 * - グラフは **PowerPoint のグラフオブジェクト**（画像にしない。あとから直せる。§6.2）。
 *   売上高と稼働件数: 積み上げ棒（グループ内／外部・千円）＋ 折れ線（案件数・右軸）
 *   稼働率の推移: 棒（稼働日数）＋ 折れ線（稼働率 %・右軸）。2025/1〜
 * - 写真は Box `08_写真` から取ってきて埋め込む。**Box が無い・失敗したら黙って灰色の枠**
 *   （出力を止めない）。縮小はしていない（サーバーに画像ライブラリが無い。長辺 1600px は今後）
 */
import type PptxGenJS from 'pptxgenjs';
import { getBoxClient } from '../../../shared/services/box';
import { FORMAT_COLORS } from './keep-templates';
import { addPlaceholder, FONT, type Box } from './keep-pptx-chrome.service';
import type { TrendRevenuePoint, TrendUtilizationPoint } from './keep-binding';

const C = FORMAT_COLORS;
const ym = (s: string) => s.replace(/^(\d{2})(\d{2})-(\d{2})$/, '$2/$3');

type ChartTypes = { bar: PptxGenJS.CHART_NAME; line: PptxGenJS.CHART_NAME };

const axisFont = { catAxisLabelFontFace: FONT, catAxisLabelFontSize: 8, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 8 };

export function renderRevenueChart(slide: PptxGenJS.Slide, pts: TrendRevenuePoint[], box: Box, ct: ChartTypes): void {
  if (!pts.length) { addPlaceholder(slide, box, '売上高と稼働件数（推移の材料が無い）'); return; }
  const labels = pts.map((p) => ym(p.year_month));
  const bars = [
    { name: 'グループ内イベント', labels, values: pts.map((p) => Math.round(p.internal / 1000)) },
    { name: '外部顧客イベント', labels, values: pts.map((p) => Math.round(p.external / 1000)) },
  ];
  const line = [{ name: '案件数', labels, values: pts.map((p) => p.count) }];
  slide.addChart(
    [
      { type: ct.bar, data: bars, options: { barGrouping: 'stacked', chartColors: [C.tableHead, '7FB3E6'] } },
      { type: ct.line, data: line, options: { chartColors: [C.negative], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 5, secondaryValAxis: true, secondaryCatAxis: true } },
    ],
    [],
    {
      x: box.x, y: box.y, w: box.w, h: box.h, ...axisFont,
      showTitle: true, title: `売上高と稼働件数（${ym(pts[0].year_month)}〜）`, titleFontFace: FONT, titleFontSize: 12, titleColor: C.title,
      showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 8,
      valAxes: [
        { showValAxisTitle: true, valAxisTitle: '千円', valAxisTitleFontFace: FONT, valAxisTitleFontSize: 8, valAxisLabelFormatCode: '#,##0' },
        { showValAxisTitle: true, valAxisTitle: '件', valAxisTitleFontFace: FONT, valAxisTitleFontSize: 8, valGridLine: { style: 'none' }, valAxisMinVal: 0 },
      ],
      catAxes: [{ catAxisLabelRotate: -45 }, { catAxisHidden: true }],
    },
  );
}

export function renderUtilizationChart(slide: PptxGenJS.Slide, all: TrendUtilizationPoint[], box: Box, ct: ChartTypes): void {
  const pts = all.filter((p) => p.utilization != null && p.year_month >= '2025-01');
  if (!pts.length) { addPlaceholder(slide, box, 'スタジオ稼働率の推移（2025/1〜の材料が無い）'); return; }
  const labels = pts.map((p) => ym(p.year_month));
  slide.addChart(
    [
      { type: ct.bar, data: [{ name: '稼働日数', labels, values: pts.map((p) => p.active_days) }], options: { chartColors: ['7FB3E6'] } },
      { type: ct.line, data: [{ name: '稼働率', labels, values: pts.map((p) => p.utilization ?? 0) }], options: { chartColors: [C.title], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 5, secondaryValAxis: true, secondaryCatAxis: true } },
    ],
    [],
    {
      x: box.x, y: box.y, w: box.w, h: box.h, ...axisFont,
      showTitle: true, title: `スタジオ稼働率の推移（${ym(pts[0].year_month)}〜）`, titleFontFace: FONT, titleFontSize: 12, titleColor: C.title,
      showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 8,
      valAxes: [
        { showValAxisTitle: true, valAxisTitle: '日', valAxisTitleFontFace: FONT, valAxisTitleFontSize: 8, valAxisMinVal: 0 },
        { showValAxisTitle: true, valAxisTitle: '%', valAxisTitleFontFace: FONT, valAxisTitleFontSize: 8, valAxisMinVal: 0, valAxisMaxVal: 100, valGridLine: { style: 'none' } },
      ],
      catAxes: [{ catAxisLabelRotate: -45 }, { catAxisHidden: true }],
    },
  );
}

// ── 写真 ────────────────────────────────────────────────────
function mime(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length > 7 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  return null;
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/** Box の file id → `image/jpeg;base64,...`。取れなかった id は入れない（呼ぶ側が灰色の枠にする） */
export async function fetchPhotos(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const client = getBoxClient();
  if (!client || ids.length === 0) return out;
  for (const id of Array.from(new Set(ids))) {
    try {
      const buf = await streamToBuffer(await client.files.getReadStream(id));
      const type = mime(buf);
      if (!type) { console.warn(`[keep-pptx] Box file ${id} is not an image; skipped`); continue; }
      out.set(id, `${type};base64,${buf.toString('base64')}`);
    } catch (err) {
      console.warn(`[keep-pptx] Box file ${id} unavailable:`, (err as Error).message);
    }
  }
  return out;
}

/** 写真を枠に並べる（1枚: 全面、2枚: 横並び、3〜4枚: 2×2）。無い写真はラベル付きの灰色の枠 */
export function renderPhotos(
  slide: PptxGenJS.Slide, photos: Array<{ box_file_id: string; caption: string | null }>, box: Box, data: Map<string, string>, label: string,
): void {
  const list = photos.slice(0, 4);
  if (!list.length) { addPlaceholder(slide, box, label); return; }
  const cols = list.length === 1 ? 1 : 2;
  const rowsN = list.length <= 2 ? 1 : 2;
  const gap = 0.08;
  const cw = (box.w - gap * (cols - 1)) / cols;
  const ch = (box.h - gap * (rowsN - 1)) / rowsN;
  list.forEach((p, i) => {
    const cell: Box = { x: box.x + (i % cols) * (cw + gap), y: box.y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch };
    const uri = data.get(p.box_file_id);
    if (!uri) { addPlaceholder(slide, cell, p.caption ? `写真: ${p.caption}` : `写真 ${p.box_file_id}`); return; }
    slide.addImage({ data: uri, x: cell.x, y: cell.y, w: cell.w, h: cell.h, sizing: { type: 'contain', w: cell.w, h: cell.h }, altText: p.caption ?? undefined });
  });
}

/** 上書き（Box の file id を改行・カンマで並べた文字列）→ 写真の並び */
export function photosFromOverride(text: string): Array<{ box_file_id: string; caption: string | null }> {
  return text.split(/[\n,、\s]+/).map((s) => s.trim()).filter(Boolean).map((id) => ({ box_file_id: id, caption: null }));
}
