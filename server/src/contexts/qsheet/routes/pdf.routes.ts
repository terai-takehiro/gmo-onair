import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import path from 'path';

// pdfmake server-side printer
const PdfPrinter = require('pdfmake/src/printer');

// Font paths — Noto Sans JP for Japanese, Roboto as fallback
const NOTO_DIR = path.join(__dirname, '../../../../fonts');
const ROBOTO_DIR = path.join(require.resolve('pdfmake/package.json'), '..', 'build', 'fonts', 'Roboto');

const fonts = {
  NotoSansJP: {
    normal: path.join(NOTO_DIR, 'NotoSansJP-Regular.ttf'),
    bold: path.join(NOTO_DIR, 'NotoSansJP-Bold.ttf'),
    italics: path.join(NOTO_DIR, 'NotoSansJP-Regular.ttf'),
    bolditalics: path.join(NOTO_DIR, 'NotoSansJP-Bold.ttf'),
  },
  Roboto: {
    normal: path.join(ROBOTO_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(ROBOTO_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(ROBOTO_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(ROBOTO_DIR, 'Roboto-MediumItalic.ttf'),
  },
};

const printer = new PdfPrinter(fonts);

const router = Router();

router.use(requireAuth, requirePermission('qsheet', 'exporter'));

// ============================================================
// Time helpers
// ============================================================
function parseDuration(str: string): number {
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

function fmtAbs(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}秒`;
  return s > 0 ? `${m}'${String(s).padStart(2, '0')}"` : `${m}'00"`;
}

// ============================================================
// Cell text extraction — supports both old flat and new cells model
// ============================================================
function extractCellText(row: any, block: any): string {
  // New data model: row.cells[block.id]
  const cell = row.cells?.[block.id];
  if (cell) {
    // Scenario with entries array
    if (block.type === 'scenario' && cell.entries && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.name ? `【${e.name}】` : ''}${(e.html || '').replace(/<[^>]*>/g, '')}`)
        .filter((s: string) => s)
        .join('\n');
    }
    // Paired cell (video/audio/telop) with entries
    if (['video', 'audio', 'telop'].includes(block.type) && cell.entries && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.label || ''}${e.memo ? ' ' + e.memo : ''}`)
        .filter((s: string) => s.trim())
        .join('\n');
    }
    // Simple string value
    if (typeof cell === 'string') return cell;
    if (cell.value) return String(cell.value);
    return '';
  }
  // Old data model fallback: row[block.id] or row[block.type]
  const val = row[block.id] || row[block.type] || '';
  return typeof val === 'string' ? val : String(val || '');
}

// ============================================================
// Speaker color palette
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
    const { documentId, options = {} } = req.body;

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

    // DoS protection
    if (sections.length > 500) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'セクション数が多すぎます (上限500)' } });
      return;
    }
    const totalRows = sections.reduce((sum: number, s: any) => sum + ((s.rows || []).length), 0);
    if (totalRows > 5000) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'キュー数が多すぎます (上限5000)' } });
      return;
    }

    // Filter excluded blocks
    const excludeSet = new Set(options.excludeBlocks || []);
    const visibleBlocks = blocks.filter((b: any) => !excludeSet.has(b.id));

    // Build speaker color map from entries
    const speakerMap: Record<string, string> = {};
    let speakerIdx = 0;
    sections.forEach((sec: any) => {
      (sec.rows || []).forEach((row: any) => {
        blocks.filter((b: any) => b.type === 'scenario').forEach((blk: any) => {
          const cell = row.cells?.[blk.id];
          if (cell?.entries) {
            cell.entries.forEach((en: any) => {
              if (en?.name && !speakerMap[en.name]) {
                speakerMap[en.name] = SPEAKER_COLORS[speakerIdx % SPEAKER_COLORS.length];
                speakerIdx++;
              }
            });
          }
          // Also check old flat model
          const flat = row[blk.id] || row.scenario || '';
          if (typeof flat === 'string') {
            const match = flat.match(/^【(.+?)】/);
            if (match && !speakerMap[match[1]]) {
              speakerMap[match[1]] = SPEAKER_COLORS[speakerIdx % SPEAKER_COLORS.length];
              speakerIdx++;
            }
          }
        });
      });
    });

    // Calculate times
    const startSec = parseStartTime(meta.broadcastStartTime || '');
    let cum = 0;
    let rowNum = 1;
    sections.forEach((sec: any) => {
      if (sec._break) {
        const d = parseDuration(sec.duration || '');
        sec._absSec = startSec + cum;
        cum += d;
        return;
      }
      if (sec._pageBreak) return;
      (sec.rows || []).forEach((row: any) => {
        row._num = rowNum++;
        const dur = typeof row.duration === 'number' ? row.duration : parseDuration(String(row.duration || ''));
        row._absSec = startSec + cum;
        cum += dur;
      });
    });
    const totalDuration = cum;

    // Build pdfmake document definition
    const pageSize = options.paperSize === 'A3' ? 'A3' : 'A4';

    // Build column headers
    const headerColumns: any[] = [
      { text: '#', style: 'thNum', width: 22 },
      { text: '時刻', style: 'th', width: 48 },
      { text: '尺', style: 'th', width: 28 },
    ];
    const bodyWidths: (number | string)[] = [22, 48, 28];

    for (const block of visibleBlocks) {
      headerColumns.push({ text: block.label || block.type, style: 'th', width: '*' as any });
      bodyWidths.push('*' as any);
    }

    // Build table body
    const tableBody: any[][] = [headerColumns];

    sections.forEach((sec: any) => {
      if (sec._pageBreak) return;

      if (sec._break) {
        // CM break row
        const d = parseDuration(sec.duration || '');
        const breakRow = [
          {
            text: `${sec.label || 'CM'}  ${fmtAbs(sec._absSec || 0)}  ${d > 0 ? fmtDur(d) : ''}`,
            style: 'breakRow',
            colSpan: headerColumns.length,
            fillColor: '#334155',
          },
        ];
        for (let i = 1; i < headerColumns.length; i++) breakRow.push({} as any);
        tableBody.push(breakRow);
        return;
      }

      // Section header row
      const sectionRow = [
        {
          text: sec.label || '',
          style: 'sectionHeader',
          colSpan: headerColumns.length,
          fillColor: '#dbeafe',
        },
      ];
      for (let i = 1; i < headerColumns.length; i++) sectionRow.push({} as any);
      tableBody.push(sectionRow);

      // Data rows
      (sec.rows || []).forEach((row: any) => {
        const dur = typeof row.duration === 'number' ? row.duration : parseDuration(String(row.duration || ''));
        const cells: any[] = [
          { text: String(row._num || ''), style: 'cellNum' },
          { text: fmtAbs(row._absSec || 0), style: 'cellTime' },
          { text: dur > 0 ? fmtDur(dur) : '', style: 'cellDur', alignment: 'center' },
        ];

        for (const block of visibleBlocks) {
          const text = extractCellText(row, block);
          if (block.type === 'scenario') {
            // Parse entries or speaker names for colored output
            const cell = row.cells?.[block.id];
            if (cell?.entries && Array.isArray(cell.entries) && cell.entries.length > 0) {
              const stack: any[] = [];
              cell.entries.forEach((en: any) => {
                if (en.name) {
                  stack.push({ text: en.name, style: 'speaker', color: speakerMap[en.name] || '#333' });
                }
                const html = (en.html || '').replace(/<[^>]*>/g, '');
                if (html) {
                  stack.push({ text: html, style: 'cellText' });
                }
              });
              cells.push({ stack: stack.length > 0 ? stack : [{ text: '', style: 'cellText' }] });
            } else {
              cells.push({ text, style: 'cellText' });
            }
          } else {
            cells.push({ text, style: 'cellText' });
          }
        }

        tableBody.push(cells);
      });
    });

    const docDefinition: any = {
      pageSize,
      pageOrientation: 'landscape' as const,
      pageMargins: pageSize === 'A3' ? [36, 50, 36, 40] : [28, 50, 28, 40],
      header: {
        columns: [
          { text: meta.title || 'キューシート', style: 'headerTitle', margin: [28, 15, 0, 0] },
          {
            text: `${meta.draftType || meta.draft || ''} | 総尺: ${fmtAbs(totalDuration)}`,
            style: 'headerMeta',
            alignment: 'right',
            margin: [0, 18, 28, 0],
          },
        ],
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: meta.title || '', style: 'footerText', margin: [28, 0, 0, 0] },
          { text: `${currentPage} / ${pageCount}`, alignment: 'center', style: 'footerText' },
          { text: 'CONFIDENTIAL', alignment: 'right', style: 'footerText', margin: [0, 0, 28, 0] },
        ],
      }),
      content: [
        {
          table: {
            headerRows: 1,
            widths: bodyWidths,
            body: tableBody,
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#e2e8f0',
            vLineColor: () => '#e2e8f0',
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
        },
      ],
      styles: {
        headerTitle: { fontSize: 12, bold: true, color: '#1e293b' },
        headerMeta: { fontSize: 8, color: '#64748b' },
        th: { fontSize: 7, bold: true, color: '#475569', fillColor: '#f8fafc', margin: [0, 2, 0, 2] },
        thNum: { fontSize: 7, bold: true, color: '#475569', fillColor: '#f8fafc', alignment: 'center', margin: [0, 2, 0, 2] },
        sectionHeader: { fontSize: 8, bold: true, color: '#1e40af', margin: [4, 2, 0, 2] },
        breakRow: { fontSize: 7, bold: true, color: '#ffffff', margin: [4, 2, 0, 2] },
        cellNum: { fontSize: 9, bold: true, color: '#3b82f6', alignment: 'center' },
        cellTime: { fontSize: 7, color: '#1e293b' },
        cellDur: { fontSize: 8, color: '#475569' },
        cellText: { fontSize: 7, color: '#334155' },
        speaker: { fontSize: 7, bold: true, margin: [0, 0, 0, 1] },
        footerText: { fontSize: 6, color: '#94a3b8' },
      },
      defaultStyle: {
        font: 'NotoSansJP',
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent((meta.title || 'cuesheet') + '.pdf')}`
    );

    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err: unknown) {
    console.error('PDF export error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'PDF生成中にエラーが発生しました' } });
  }
});

export default router;
