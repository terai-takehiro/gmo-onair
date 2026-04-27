import * as XLSX from 'xlsx';
import { getDb } from '../../../shared/db/connection';

export interface ImportResult {
  categoryId: number;
  inserted: number;
  skipped: number;
  warnings: string[];
}

// ── ヘッダー正規化マッピング ─────────────────────────────────
const RANK_HEADERS    = ['順位', 'rank', '位'];
const NAME_HEADERS    = ['氏名', '名前', '名称', 'name', '賞名', '受賞者'];
const ORG_HEADERS     = ['所属', '部署', '部門', '組織', 'org', 'department', '会社', '企業'];
const POINTS_HEADERS  = ['ポイント', '得票', 'votes', 'points', 'スコア', 'score', '票数'];

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function findCol(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map(normalize);
  for (const cand of candidates) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(normalize(cand)));
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function importAwardsExcel(
  buffer: Buffer,
  eventId: number,
  categoryName: string,
  generateDummyPoints: boolean
): Promise<ImportResult> {
  const warnings: string[] = [];

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel にシートが見つかりません');

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];

  if (rows.length < 2) throw new Error('データ行が存在しません');

  // ヘッダー行を探す
  const headerRow = rows[0].some((h) => String(h).trim()) ? 0 : 1;
  const headers = rows[headerRow].map(String);
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim()));

  const rankCol   = findCol(headers, RANK_HEADERS);
  const nameCol   = findCol(headers, NAME_HEADERS);
  const orgCol    = findCol(headers, ORG_HEADERS);
  const pointsCol = findCol(headers, POINTS_HEADERS);

  if (nameCol < 0) {
    warnings.push('名前列が特定できませんでした。2列目を使用します');
  }
  if (pointsCol < 0) {
    if (generateDummyPoints) {
      warnings.push('ポイント列が見つからなかったため、ダミーポイントを生成します');
    } else {
      warnings.push('ポイント列が見つかりませんでした。ポイントは空欄になります');
    }
  }

  const pool = getDb();
  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');

    const maxOrderRes = await client.query(
      `SELECT COALESCE(MAX(display_order),0) AS max FROM awards_categories WHERE event_id=$1`,
      [eventId]
    );
    const catRes = await client.query(
      `INSERT INTO awards_categories (event_id, name, display_order)
       VALUES ($1,$2,$3) RETURNING id`,
      [eventId, categoryName, (maxOrderRes.rows[0].max as number) + 1]
    );
    const categoryId: number = catRes.rows[0].id as number;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const nameRaw = String(nameCol >= 0 ? row[nameCol] : row[1] ?? '').trim();
      if (!nameRaw) { skipped++; continue; }

      const rankRaw = rankCol >= 0 ? String(row[rankCol]).trim() : String(i + 1);
      const rank = rankRaw ? parseInt(rankRaw) || null : null;
      const org = orgCol >= 0 ? String(row[orgCol] ?? '').trim() || null : null;

      let points: number | null = null;
      if (pointsCol >= 0) {
        const p = parseFloat(String(row[pointsCol]));
        if (!isNaN(p)) points = Math.round(p);
      }
      if (points === null && generateDummyPoints) {
        const base = 5000 - i * 400;
        points = Math.max(500, base + Math.floor(Math.random() * 200) - 100);
      }

      await client.query(
        `INSERT INTO awards_entries (event_id, category_id, rank, name, org, points, is_winner)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [eventId, categoryId, rank, nameRaw, org, points, rank === 1]
      );
      inserted++;
    }

    await client.query('COMMIT');
    return { categoryId, inserted, skipped, warnings };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
