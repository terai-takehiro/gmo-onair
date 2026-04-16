import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

const router = Router();

router.use(requireAuth);

// ============================================================
// Font paths
// ============================================================
const FONTS_DIR = path.join(__dirname, '../../../../fonts');
const NOTO_REGULAR = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
const NOTO_BOLD = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

// ============================================================
// Time helpers
// ============================================================
function parseDuration(str: string | number): number {
  if (typeof str === 'number') return str;
  if (!str || !str.trim()) return 0;
  const s = str.trim();
  let m = s.match(/^(\d+)[°:](\d+)[':"](\d+)[""']?$/);
  if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
  m = s.match(/^(\d+)[':.](\d+)[""']?$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  m = s.match(/^(\d+)$/);
  if (m) return parseInt(m[1]);
  return 0;
}

function parseStartTime(str: string): number {
  if (!str) return 0;
  const m = str.match(/(\d+)[°:](\d+)[':"]?(\d+)?/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (parseInt(m[3]) || 0);
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

// ============================================================
// Cell text extraction
// ============================================================
function extractCellText(row: any, block: any): string {
  const cell = row.cells?.[block.id];
  if (cell) {
    if (block.type === 'scenario' && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.name ? `【${e.name}】` : ''}${(e.html || '').replace(/<[^>]*>/g, '')}`)
        .filter((s: string) => s)
        .join('\n');
    }
    if (['video', 'audio', 'telop'].includes(block.type) && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.label || ''}${e.memo ? ' ' + e.memo : ''}`)
        .filter((s: string) => s.trim())
        .join('\n');
    }
    if (typeof cell === 'string') return cell;
    if (cell.value) return String(cell.value);
  }
  const val = row[block.id] || row[block.type] || '';
  return typeof val === 'string' ? val : String(val || '');
}

// ============================================================
// Speaker colors
// ============================================================
const SPEAKER_COLORS = [
  '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#4f46e5', '#ea580c', '#65a30d',
];

// ============================================================
// PDF Export
// ============================================================
router.post('/export-pdf', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.body;

    if (!documentId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'documentId is required' } });
      return;
    }

    const doc = await queryOne(
      'SELECT * FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
      [documentId]
    ) as any;

    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    let data = doc.data;
    if (typeof data === 'string') data = JSON.parse(data);

    const meta = data.meta || {};
    const sections: any[] = data.sections || [];
    const blocks: any[] = data.blocks || [];

    // Build speaker color map
    const speakerMap: Record<string, string> = {};
    let spIdx = 0;
    sections.forEach((sec: any) => {
      (sec.rows || []).forEach((row: any) => {
        blocks.filter((b: any) => b.type === 'scenario').forEach((blk: any) => {
          const cell = row.cells?.[blk.id];
          if (cell?.entries) {
            cell.entries.forEach((en: any) => {
              if (en?.name && !speakerMap[en.name]) {
                speakerMap[en.name] = SPEAKER_COLORS[spIdx % SPEAKER_COLORS.length];
                spIdx++;
              }
            });
          }
        });
      });
    });

    // Calculate absolute times
    const startSec = parseStartTime(meta.broadcastStartTime || '');
    let cum = 0;

    // Create PDF
    const pdf = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 50, bottom: 40, left: 30, right: 30 },
      bufferPages: true,
    });

    // Register Japanese font
    const hasNoto = fs.existsSync(NOTO_REGULAR);
    if (hasNoto) {
      pdf.registerFont('NotoSansJP', NOTO_REGULAR);
      pdf.registerFont('NotoSansJP-Bold', fs.existsSync(NOTO_BOLD) ? NOTO_BOLD : NOTO_REGULAR);
    }
    const fontRegular = hasNoto ? 'NotoSansJP' : 'Helvetica';
    const fontBold = hasNoto ? 'NotoSansJP-Bold' : 'Helvetica-Bold';

    // Response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent((meta.title || 'cuesheet') + '.pdf')}`
    );
    pdf.pipe(res);

    // ── Header ──
    pdf.font(fontBold).fontSize(14).fillColor('#1e293b')
      .text(meta.title || 'キューシート', 30, 20, { width: 500 });
    pdf.font(fontRegular).fontSize(8).fillColor('#64748b')
      .text(`${meta.draftType || ''} | ${meta.broadcastDate || ''} | ${meta.location || ''}`, 30, 38);
    pdf.fontSize(8).text(`総尺: ${fmtTime(sections.reduce((s: number, sec: any) => s + parseDuration(sec.duration || '0'), 0))}`, 700, 25, { align: 'right', width: 100 });

    // ── Column layout ──
    const visibleBlocks = blocks.filter((b: any) => b.type !== 'stage_diagram' && b.type !== 'slide');
    const pageW = 842 - 60; // A4 landscape - margins
    const colNum = 25;
    const colTime = 55;
    const colDur = 35;
    const fixedW = colNum + colTime + colDur;
    const blockW = visibleBlocks.length > 0 ? (pageW - fixedW) / visibleBlocks.length : pageW - fixedW;
    const tableTop = 55;
    const rowH = 14;

    // ── Table header ──
    let y = tableTop;
    pdf.rect(30, y, pageW, rowH).fill('#f1f5f9');
    pdf.font(fontBold).fontSize(6).fillColor('#475569');
    pdf.text('#', 30, y + 3, { width: colNum, align: 'center' });
    pdf.text('時刻', 30 + colNum, y + 3, { width: colTime, align: 'center' });
    pdf.text('尺', 30 + colNum + colTime, y + 3, { width: colDur, align: 'center' });
    visibleBlocks.forEach((blk: any, i: number) => {
      pdf.text(blk.label || blk.type, 30 + fixedW + i * blockW, y + 3, { width: blockW, align: 'left' });
    });
    y += rowH;

    // ── Rows ──
    let rowNum = 1;

    sections.forEach((sec: any) => {
      if (sec._pageBreak) {
        pdf.addPage();
        y = tableTop;
        return;
      }

      // Check if we need a new page
      if (y > 530) {
        pdf.addPage();
        y = tableTop;
      }

      if (sec._break) {
        // CM break row
        const d = parseDuration(sec.duration || '');
        pdf.rect(30, y, pageW, rowH + 2).fill('#334155');
        pdf.font(fontBold).fontSize(6).fillColor('#ffffff');
        pdf.text(`${sec.label || 'CM'}  ${fmtTime(startSec + cum)}  ${fmtDur(d)}`, 34, y + 4, { width: pageW - 8 });
        cum += d;
        y += rowH + 2;
        return;
      }

      // Section header
      pdf.rect(30, y, pageW, rowH + 2).fill('#dbeafe');
      pdf.font(fontBold).fontSize(7).fillColor('#1e40af');
      const secDur = parseDuration(sec.duration || '');
      pdf.text(`${sec.label || ''}  ${fmtTime(startSec + cum)}  ${secDur > 0 ? fmtDur(secDur) : ''}`, 34, y + 3, { width: pageW - 8 });
      y += rowH + 2;

      (sec.rows || []).forEach((row: any) => {
        if (y > 530) {
          pdf.addPage();
          y = tableTop;
        }

        const dur = parseDuration(row.duration);
        const texts = visibleBlocks.map((blk: any) => extractCellText(row, blk));
        const maxLines = Math.max(1, ...texts.map((t: string) => t.split('\n').length));
        const cellH = Math.max(rowH, maxLines * 9 + 4);

        // Alternating row background
        if (rowNum % 2 === 0) {
          pdf.rect(30, y, pageW, cellH).fill('#f8fafc');
        }

        // Row number
        pdf.font(fontBold).fontSize(7).fillColor('#3b82f6');
        pdf.text(String(rowNum), 30, y + 3, { width: colNum, align: 'center' });

        // Time
        pdf.font(fontRegular).fontSize(6).fillColor('#1e293b');
        pdf.text(fmtTime(startSec + cum), 30 + colNum, y + 3, { width: colTime, align: 'center' });

        // Duration
        pdf.font(fontRegular).fontSize(7).fillColor('#475569');
        pdf.text(dur > 0 ? fmtDur(dur) : '', 30 + colNum + colTime, y + 3, { width: colDur, align: 'center' });

        // Block cells
        visibleBlocks.forEach((blk: any, i: number) => {
          const text = texts[i];
          const x = 30 + fixedW + i * blockW;

          if (blk.type === 'scenario') {
            const cell = row.cells?.[blk.id];
            if (cell?.entries && Array.isArray(cell.entries)) {
              let ey = y + 3;
              cell.entries.forEach((en: any) => {
                if (en.name) {
                  const color = speakerMap[en.name] || '#333333';
                  pdf.font(fontBold).fontSize(6).fillColor(color);
                  pdf.text(`【${en.name}】`, x + 2, ey, { width: blockW - 4 });
                  ey += 8;
                }
                const html = (en.html || '').replace(/<[^>]*>/g, '');
                if (html) {
                  pdf.font(fontRegular).fontSize(6).fillColor('#334155');
                  pdf.text(html, x + 2, ey, { width: blockW - 4 });
                  ey += 8;
                }
              });
            } else {
              pdf.font(fontRegular).fontSize(6).fillColor('#334155');
              pdf.text(text, x + 2, y + 3, { width: blockW - 4 });
            }
          } else {
            pdf.font(fontRegular).fontSize(6).fillColor('#334155');
            pdf.text(text, x + 2, y + 3, { width: blockW - 4 });
          }

          // Column separator
          pdf.moveTo(x, y).lineTo(x, y + cellH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        });

        // Row bottom line
        pdf.moveTo(30, y + cellH).lineTo(30 + pageW, y + cellH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

        cum += dur;
        rowNum++;
        y += cellH;
      });

      // If section has a duration, add it
      if (secDur > 0 && (!sec.rows || sec.rows.length === 0)) {
        cum += secDur;
      }
    });

    // ── Page numbers ──
    const pageCount = pdf.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      pdf.switchToPage(i);
      pdf.font(fontRegular).fontSize(6).fillColor('#94a3b8');
      pdf.text(`${i + 1} / ${pageCount}`, 30, 560, { width: pageW, align: 'center' });
      pdf.text('CONFIDENTIAL', 30, 560, { width: pageW, align: 'right' });
    }

    pdf.end();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('PDF export error:', errMsg, err instanceof Error ? err.stack : '');
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL', message: `PDF生成エラー: ${errMsg}` } });
    }
  }
});

export default router;
