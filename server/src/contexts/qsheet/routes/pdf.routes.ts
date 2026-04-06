import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const PdfPrinter = require('pdfmake');

const router = Router();

router.use(requireAuth, requirePermission('qsheet', 'exporter'));

// ============================================================
// Time helpers
// ============================================================
function parseDuration(str: string): number {
  if (!str || !str.trim()) return 0;
  const s = str.trim();
  // HH:MM:SS
  let m = s.match(/^(\d+)[°:](\d+)[':"](\d+)[""']?$/);
  if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
  // MM:SS
  m = s.match(/^(\d+)[':.](\d+)[""']?$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  // seconds
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

function fmtLap(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `(${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}")`;
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

    // DoS protection: limit document complexity
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

    // Build speaker color map
    const speakerMap: Record<string, string> = {};
    let speakerIdx = 0;
    sections.forEach((sec: any) => {
      (sec.rows || []).forEach((row: any) => {
        if (row.scenario) {
          const speakerMatch = row.scenario.match(/^【(.+?)】/);
          if (speakerMatch && !speakerMap[speakerMatch[1]]) {
            speakerMap[speakerMatch[1]] = SPEAKER_COLORS[speakerIdx % SPEAKER_COLORS.length];
            speakerIdx++;
          }
        }
      });
    });

    // Calculate times
    const startSec = parseStartTime(meta.broadcastStartTime || '');
    let cum = 0;
    let rowNum = 1;
    sections.forEach((sec: any) => {
      (sec.rows || []).forEach((row: any) => {
        row._num = rowNum++;
        const dur = typeof row.duration === 'number' ? row.duration : parseDuration(String(row.duration || ''));
        row._absSec = startSec + cum;
        row._lapSec = cum;
        cum += dur;
      });
    });
    const totalDuration = cum;

    // Build pdfmake document definition
    const pageSize = options.paperSize === 'A3' ? 'A3' : 'A4';

    // Build column headers
    const headerColumns = [
      { text: '#', style: 'thNum', width: 25 },
      { text: '時刻', style: 'th', width: 55 },
      { text: '尺', style: 'th', width: 30 },
    ];
    const bodyWidths: (number | string)[] = [25, 55, 30];

    for (const block of visibleBlocks) {
      headerColumns.push({ text: block.label || block.type, style: 'th', width: '*' as any });
      bodyWidths.push('*' as any);
    }

    // Build table body
    const tableBody: any[][] = [headerColumns];

    sections.forEach((sec: any) => {
      // Section header row
      const sectionRow = [
        {
          text: sec.label || '',
          style: 'sectionHeader',
          colSpan: headerColumns.length,
          fillColor: '#f1f5f9',
        },
      ];
      for (let i = 1; i < headerColumns.length; i++) sectionRow.push({} as any);
      tableBody.push(sectionRow);

      // Data rows
      (sec.rows || []).forEach((row: any) => {
        const dur = typeof row.duration === 'number' ? row.duration : parseDuration(String(row.duration || ''));
        const cells: any[] = [
          { text: String(row._num || ''), style: 'cellNum' },
          {
            stack: [
              { text: fmtAbs(row._absSec || 0), style: 'cellTime', bold: true },
              { text: fmtLap(row._lapSec || 0), style: 'cellTimeLap' },
            ],
          },
          { text: String(dur || ''), style: 'cellDur', alignment: 'center' },
        ];

        for (const block of visibleBlocks) {
          const val = row[block.id] || row[block.type] || '';
          if (block.type === 'scenario') {
            // Parse speaker name
            const speakerMatch = (val as string).match(/^【(.+?)】/);
            if (speakerMatch) {
              const speaker = speakerMatch[1];
              const rest = (val as string).slice(speakerMatch[0].length).trim();
              cells.push({
                stack: [
                  { text: speaker, style: 'speaker', color: speakerMap[speaker] || '#333' },
                  { text: rest, style: 'cellText' },
                ],
              });
            } else {
              cells.push({ text: val, style: 'cellText' });
            }
          } else {
            cells.push({ text: val, style: 'cellText' });
          }
        }

        tableBody.push(cells);
      });
    });

    const docDefinition = {
      pageSize,
      pageOrientation: 'landscape' as const,
      pageMargins: pageSize === 'A3' ? [36, 50, 36, 40] : [28, 50, 28, 40],
      header: {
        columns: [
          { text: meta.title || 'キューシート', style: 'headerTitle', margin: [28, 15, 0, 0] },
          {
            text: `${meta.draft || ''} | 総尺: ${fmtAbs(totalDuration)}`,
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
        sectionHeader: { fontSize: 8, bold: true, color: '#1e293b', margin: [4, 2, 0, 2] },
        cellNum: { fontSize: 9, bold: true, color: '#3b82f6', alignment: 'center' },
        cellTime: { fontSize: 7, color: '#1e293b' },
        cellTimeLap: { fontSize: 6, color: '#94a3b8' },
        cellDur: { fontSize: 8, color: '#475569' },
        cellText: { fontSize: 7, color: '#334155' },
        speaker: { fontSize: 7, bold: true, margin: [0, 0, 0, 1] },
        footerText: { fontSize: 6, color: '#94a3b8' },
      },
      defaultStyle: {
        font: 'NotoSansJP',
      },
    };

    // Create PDF with pdfmake
    const fonts = {
      NotoSansJP: {
        normal: require.resolve('pdfmake/build/vfs_fonts'),
        bold: require.resolve('pdfmake/build/vfs_fonts'),
      },
      Roboto: {
        normal: require.resolve('pdfmake/build/vfs_fonts'),
        bold: require.resolve('pdfmake/build/vfs_fonts'),
      },
    };

    // Use pdfmake's built-in fonts (Roboto) as fallback
    docDefinition.defaultStyle.font = 'Roboto';

    const printer = new PdfPrinter(fonts);
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
