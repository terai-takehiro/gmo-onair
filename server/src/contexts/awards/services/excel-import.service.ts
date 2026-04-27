import * as XLSX from 'xlsx';
import { getDb } from '../../../shared/db/connection';

export interface ImportResult {
  categories: { id: number; name: string; description: string | null; inserted: number }[];
  totalInserted: number;
  skipped: number;
  warnings: string[];
}

// ── ヘッダー正規化マッピング ─────────────────────────────────
const AWARD_HEADERS           = ['種別'];
const DIVISION_HEADERS        = ['エントリー部門', 'エントリー部門名'];
const RANK_HEADERS            = ['順位', 'rank', '位'];
const IMAGE_ID_HEADERS        = ['画像id', '画像ｉｄ', 'imageid', 'image_id', '画像'];
const NAME_JA_HEADERS         = ['ノミネート名', '氏名', '名前', '名称', 'name'];
const NAME_PROJECT_HEADERS    = ['プロジェクト名'];
const NAME_EN_HEADERS         = ['ノミネート名（英語）', 'ノミネート名(英語)', 'name_en', 'name(en)', '英語名'];
const NAME_EN_PROJECT_HEADERS = ['プロジェクト名（英語）', 'プロジェクト名(英語)'];
const ORG_JA_HEADERS          = ['ノミネート者会社', '所属', '会社', '企業', 'org', '部署'];
const ORG_EN_HEADERS          = ['ノミネート者会社（英語）', 'ノミネート者会社(英語)', 'org_en', 'org(en)', '会社（英語）'];

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

function cellStr(row: unknown[], col: number): string {
  if (col < 0) return '';
  return String(row[col] ?? '').trim();
}

interface RowData {
  award: string;
  division: string;
  rank: number | null;
  imageId: string | null;
  nameJa: string;
  nameEn: string | null;
  orgJa: string | null;
  orgEn: string | null;
}

export async function importAwardsExcel(
  buffer: Buffer,
  eventId: number,
): Promise<ImportResult> {
  const warnings: string[] = [];

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel にシートが見つかりません');

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];

  if (rows.length < 2) throw new Error('データ行が存在しません');

  // ヘッダー行を探す（0行目か1行目）
  const headerRow = rows[0].some((h) => String(h).trim()) ? 0 : 1;
  const headers = rows[headerRow].map(String);
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim()));

  const awardCol        = findCol(headers, AWARD_HEADERS);
  const divisionCol     = findCol(headers, DIVISION_HEADERS);
  const rankCol         = findCol(headers, RANK_HEADERS);
  const imageIdCol      = findCol(headers, IMAGE_ID_HEADERS);
  const nameJaCol       = findCol(headers, NAME_JA_HEADERS);
  const nameProjCol     = findCol(headers, NAME_PROJECT_HEADERS);
  const nameEnCol       = findCol(headers, NAME_EN_HEADERS);
  const nameEnProjCol   = findCol(headers, NAME_EN_PROJECT_HEADERS);
  const orgJaCol        = findCol(headers, ORG_JA_HEADERS);
  const orgEnCol        = findCol(headers, ORG_EN_HEADERS);

  if (awardCol < 0) warnings.push('「種別」列が見つかりませんでした。単一カテゴリ「インポート」に全エントリを追加します');
  if (divisionCol < 0) warnings.push('「エントリー部門」列が見つかりませんでした');
  if (nameJaCol < 0 && nameProjCol < 0) warnings.push('名前列が特定できませんでした。2列目を使用します');

  const parsedRows: RowData[] = [];
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const award    = awardCol >= 0 ? cellStr(row, awardCol) || 'インポート' : 'インポート';
    const division = divisionCol >= 0 ? cellStr(row, divisionCol) : '';

    // ノミネート名(JA): プロジェクト名 優先、なければ ノミネート名
    const projJa = cellStr(row, nameProjCol);
    const nomJa  = nameJaCol >= 0 ? cellStr(row, nameJaCol) : String(row[1] ?? '').trim();
    const nameJa = projJa || nomJa;
    if (!nameJa) { skipped++; continue; }

    // ノミネート名(EN): プロジェクト名（英語）優先、なければ ノミネート名（英語）
    const projEn = cellStr(row, nameEnProjCol);
    const nomEn  = cellStr(row, nameEnCol);
    const nameEn = projEn || nomEn || null;

    const rankRaw = rankCol >= 0 ? cellStr(row, rankCol) : String(i + 1);
    const rank    = rankRaw ? parseInt(rankRaw) || null : null;

    const imageId = imageIdCol >= 0 ? cellStr(row, imageIdCol) || null : null;
    const orgJa   = orgJaCol >= 0 ? cellStr(row, orgJaCol) || null : null;
    const orgEn   = orgEnCol >= 0 ? cellStr(row, orgEnCol) || null : null;

    parsedRows.push({ award, division, rank, imageId, nameJa, nameEn, orgJa, orgEn });
  }

  if (parsedRows.length === 0) throw new Error('有効なデータ行が存在しません');

  // (種別, エントリー部門) ごとにグループ化（順序を保持）
  const groupOrder: string[] = [];
  const groups = new Map<string, RowData[]>();
  for (const r of parsedRows) {
    const key = `${r.award}\x00${r.division}`;
    if (!groups.has(key)) {
      groupOrder.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  }

  const pool = getDb();
  const client = await pool.connect();
  const resultCategories: { id: number; name: string; description: string | null; inserted: number }[] = [];
  let totalInserted = 0;

  try {
    await client.query('BEGIN');

    const maxOrderRes = await client.query(
      `SELECT COALESCE(MAX(display_order),0) AS max FROM awards_categories WHERE event_id=$1`,
      [eventId]
    );
    let nextOrder = (maxOrderRes.rows[0].max as number) + 1;

    for (const key of groupOrder) {
      const rowGroup = groups.get(key)!;
      const [awardName, divisionName] = key.split('\x00');

      // 既存カテゴリを検索（同名+同部門）
      const existingCat = await client.query(
        `SELECT id FROM awards_categories
         WHERE event_id=$1 AND name=$2
           AND (($3 = '' AND description IS NULL) OR description=$3)`,
        [eventId, awardName, divisionName]
      );

      let categoryId: number;
      if (existingCat.rows.length > 0) {
        categoryId = existingCat.rows[0].id as number;
      } else {
        const catRes = await client.query(
          `INSERT INTO awards_categories (event_id, name, description, display_order)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [eventId, awardName, divisionName || null, nextOrder++]
        );
        categoryId = catRes.rows[0].id as number;
      }

      let inserted = 0;
      for (const r of rowGroup) {
        await client.query(
          `INSERT INTO awards_entries
             (event_id, category_id, rank, name, name_en, org, org_en, image_id, is_winner)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [eventId, categoryId, r.rank, r.nameJa, r.nameEn, r.orgJa, r.orgEn, r.imageId, r.rank === 1]
        );
        inserted++;
        totalInserted++;
      }
      resultCategories.push({ id: categoryId, name: awardName, description: divisionName || null, inserted });
    }

    await client.query('COMMIT');
    return { categories: resultCategories, totalInserted, skipped, warnings };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
