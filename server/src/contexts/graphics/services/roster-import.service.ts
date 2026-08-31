// テロップCG — 名簿（Excel）からのページ一括生成。
//
// docs/design/v4/graphics.md §6「大量ページの一括生成（受賞者20名分のネームなど）は
// テンプレート×名簿から作る」・§9 段5「名簿/Sheets 差し込み」（今回は Excel/CSV 限定）。
//
// awards の `excel-import.service.ts` と違い、**diff（新規/更新/変更なし）は無い**
// （常に新規ページを複数件つくるだけ）。列タイプの自動判定・信頼度表示のような
// 凝った機能も無い — 「ヘッダーを読む → 列をフィールドキーへマッピング →
// プレビュー → 一括作成」のシンプルな流れ。
import { loadExcelWorkbook, sheetToAoa } from '../../../shared/utils/excel';
import { withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { GraphicsPage, mapPage, PartKey, SLOT_CALL_BASE, Slot } from '../store';

export interface RosterPreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

/** ページ名（`graphics_pages.name`）を決める代表フィールド（`nameColumn` 未指定時）。
 *  `client-techops/src/pages/graphics/pageFields.ts` の `PART_FIELDS` の並びと対応させる
 *  — 各部品でいちばん「その行を代表する文言」が入るキー。 */
const REPRESENTATIVE_FIELD: Record<PartKey, string> = {
  name: 'mainText',
  title: 'text',
  list: 'text',
  ticker: 'text',
  countdown: 'prefix',
  score: 'text',
  flash: 'text',
  side: 'text',
  vote: 'text',
};

/** 1シート目のヘッダー行と先頭数行のサンプルを返す（マッピングUI用）。 */
export async function previewRosterExcel(buffer: Buffer): Promise<RosterPreview> {
  const wb = await loadExcelWorkbook(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], sampleRows: [], totalRows: 0 };

  const data = sheetToAoa(ws, { maxRows: 10000, maxCols: 50, text: true }) as string[][];
  if (data.length === 0) return { headers: [], sampleRows: [], totalRows: 0 };

  // 空ヘッダーの列は無視するが、データ行の列位置は保つ（元の列インデックスを覚えておく）
  const rawHeaderRow = (data[0] ?? []).map((h) => String(h ?? '').trim());
  const headerIndexes: number[] = [];
  const headers: string[] = [];
  rawHeaderRow.forEach((h, i) => {
    if (h !== '') { headers.push(h); headerIndexes.push(i); }
  });

  const dataRows = data.slice(1);
  const sampleRows = dataRows.slice(0, 5).map((row) => headerIndexes.map((i) => String(row[i] ?? '')));

  return { headers, sampleRows, totalRows: dataRows.length };
}

export interface RosterCommitInput {
  projectId: number;
  buffer: Buffer;
  slot: Slot;
  partKey: PartKey;
  /** フィールドキー → Excel のヘッダー名 */
  mapping: Record<string, string>;
  /** ページ名に使う列（ヘッダー名）。無指定なら代表フィールドの値を使う */
  nameColumn?: string;
}

export interface RosterCommitResult {
  created: GraphicsPage[];
  createdCount: number;
  /** 全カラム空だったためスキップした行数 */
  skippedBlank: number;
  /** ページ名が空になり作成できなかった行（他の行は作成を続ける寛容設計） */
  errors: { row: number; message: string }[];
}

/** 名簿の全行をパースし、`graphics_pages` へ一括 INSERT する。 */
export async function commitRosterImport(input: RosterCommitInput): Promise<RosterCommitResult> {
  const { projectId, buffer, slot, partKey, mapping, nameColumn } = input;

  const wb = await loadExcelWorkbook(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError(400, 'BAD_REQUEST', 'シートが見つかりません');

  const data = sheetToAoa(ws, { maxRows: 10000, maxCols: 50, text: true }) as string[][];
  if (data.length < 2) throw new AppError(400, 'BAD_REQUEST', 'データ行がありません');

  const rawHeaderRow = (data[0] ?? []).map((h) => String(h ?? '').trim());
  const indexOfHeader = (name: string): number => rawHeaderRow.indexOf(name);

  const fieldIndexes: [string, number][] = [];
  for (const [fieldKey, header] of Object.entries(mapping)) {
    if (!header) continue;
    const idx = indexOfHeader(header);
    if (idx !== -1) fieldIndexes.push([fieldKey, idx]);
  }
  const nameIdx = nameColumn ? indexOfHeader(nameColumn) : -1;
  const repField = REPRESENTATIVE_FIELD[partKey];

  const dataRows = data.slice(1);

  return withTransaction(async (tx) => {
    // 呼出番号・並び順は既存の使用状況を1回だけ読み、以降はメモリ上で払い出す
    // （行ごとに DB を引くと N 往復になるうえ、同一トランザクション内では
    //  未コミットの直前行を SELECT で拾えない）。
    const existing = await tx.queryAll(
      `SELECT call_no, sort_order FROM graphics_pages WHERE project_id = ?`,
      [projectId]
    );
    const usedCallNos = new Set(existing.map((r) => r.call_no as number));
    let nextSortOrder = existing.reduce((max, r) => Math.max(max, (r.sort_order as number) ?? 0), 0) + 1;
    let candidateCallNo = SLOT_CALL_BASE[slot];

    const created: GraphicsPage[] = [];
    const errors: { row: number; message: string }[] = [];
    let skippedBlank = 0;

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r] ?? [];
      const excelRowNo = r + 2; // ヘッダーが1行目なのでデータ行は2始まり
      const allEmpty = row.every((v) => String(v ?? '').trim() === '');
      if (allEmpty) { skippedBlank++; continue; }

      const fields: Record<string, unknown> = {};
      for (const [fieldKey, idx] of fieldIndexes) {
        const v = String(row[idx] ?? '').trim();
        if (v !== '') fields[fieldKey] = v;
      }

      const name = nameIdx !== -1
        ? String(row[nameIdx] ?? '').trim()
        : String(fields[repField] ?? '').trim();

      if (!name) {
        errors.push({ row: excelRowNo, message: 'ページ名になる列が空です' });
        continue;
      }

      while (usedCallNos.has(candidateCallNo)) candidateCallNo += 1;
      const callNo = candidateCallNo;
      usedCallNos.add(callNo);
      candidateCallNo += 1;

      const sortOrder = nextSortOrder;
      nextSortOrder += 1;

      const inserted = await tx.queryOne(
        `INSERT INTO graphics_pages (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order)
         VALUES (?, ?, ?, ?, ?, ?::jsonb, 'draft', ?)
         RETURNING *`,
        [projectId, callNo, slot, partKey, name, JSON.stringify(fields), sortOrder]
      );
      if (inserted) created.push(mapPage(inserted));
    }

    return { created, createdCount: created.length, skippedBlank, errors };
  });
}
