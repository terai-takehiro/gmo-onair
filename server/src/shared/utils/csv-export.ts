import { Response } from 'express';

/**
 * Generate a CSV string from an array of row objects.
 * Includes UTF-8 BOM for Excel compatibility.
 */
export function generateCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) {
    // BOM + header only (or empty if no columns)
    return '\uFEFF' + (columns ? columns.join(',') : '') + '\n';
  }

  const cols = columns || Object.keys(rows[0]);

  // BOM for Excel UTF-8 compatibility
  let csv = '\uFEFF' + cols.join(',') + '\n';
  for (const row of rows) {
    csv += cols.map(c => {
      const val = row[c];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',') + '\n';
  }

  return csv;
}

/**
 * Send a CSV response with proper headers.
 */
export function csvResponse(res: Response, filename: string, csvContent: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(csvContent);
}
