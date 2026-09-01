// テロップCG — 名簿（Excel）からのページ一括生成。
//
// docs/design/v4/graphics.md §6「大量ページの一括生成（受賞者20名分のネームなど）は
// テンプレート×名簿から作る」・§9 段5「名簿/Sheets 差し込み」（今回は Excel/CSV 限定）。
//
// awards の `excel-import.service.ts` と違い、**diff（新規/更新/変更なし）は無い**
// （常に新規ページを複数件つくるだけ）。ただし awards 譲りで
// **列の型自動判定・推奨マッピング・dry-run（投入前の件数確認）**は持つ
// （docs/design/v4/graphics-awards-migration-plan.md §2-2の8番）。
// awards の CG 項目カタログ（グループ化・複数選択肢からの割当）ほど作り込む必要は無い
// — 「ヘッダーを読む → 列をフィールドキーへマッピング → プレビュー → dry-run → 一括作成」の流れ。
import { loadExcelWorkbook, normalizeHeader, sheetToAoa } from '../../../shared/utils/excel';
import { withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { GraphicsPage, mapPage, PartKey, SLOT_CALL_BASE, Slot } from '../store';

/** ページ名（`graphics_pages.name`）を決める代表フィールド（`nameColumn` 未指定時）。
 *  `client-techops/src/pages/graphics/pageFields.ts` の `PART_FIELDS` の並びと対応させる
 *  — 各部品でいちばん「その行を代表する文言」が入るキー。
 *
 *  `title` はフィールド定義の刷新（`text` → `title`/`speaker`/`speakerTitle`）に合わせて
 *  `title` に更新した。`list` の項目配列（`items`）は可変長配列でCSVの1列とは噛み合わず
 *  クライアント側の列マッピングUIから外れているため、`fields.items` が代表として埋まる
 *  ことは実質無い — この部品で名簿一括生成をするときは `nameColumn` の指定が事実上必須になる
 *  （クライアント側 `RosterImportDialog.tsx` の同名コメント参照）。 */
const REPRESENTATIVE_FIELD: Record<PartKey, string> = {
  name: 'mainText',
  title: 'title',
  list: 'items',
  ticker: 'text',
  countdown: 'prefix',
  score: 'text',
  flash: 'text',
  side: 'text',
  vote: 'text',
  ranking: 'categoryName',
};

// ── 列の型自動判定 ──────────────────────────────────────────────
// awards の `excel-import.service.ts` の `ColumnType`/`analyzeColumn` が発想源だが、
// テロップCGは url/list/id の判定までは要らない（§2-2の8番「5種程度で十分」）。
export type RosterColumnType = 'empty' | 'number' | 'date' | 'shortText' | 'longText';

/** マッピング先の候補（`PART_FIELDS` は client 側にしか無いため、サーバーは
 *  key/label のペアを呼び出し側から受け取って突き合わせるだけ — CG項目カタログを
 *  サーバー側に複製しない）。 */
export interface RosterFieldCandidate {
  key: string;
  label: string;
}

export interface RosterColumnAnalysis {
  /** Excel ヘッダー文字列（元の表記そのまま） */
  header: string;
  type: RosterColumnType;
  /** 入力済セル比率（0-1） */
  filledRatio: number;
  /** ユニークなサンプル値（最大3件） */
  samples: string[];
  /** 推奨マッピング先のフィールドキー（見つからなければ undefined） */
  suggestedKey?: string;
  /** 推奨の自信度（exact: ヘッダー名完全一致 / partial: 部分一致 / none: 推奨なし） */
  suggestedConfidence: 'exact' | 'partial' | 'none';
}

export interface RosterPreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  /** 列ごとの型自動判定＋推奨マッピング（`fieldCandidates` 未指定なら推奨は空のまま） */
  columns: RosterColumnAnalysis[];
}

function isDateLikeCell(s: string): boolean {
  if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(s)) return true;
  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) return true;
  return false;
}

function analyzeRosterColumn(header: string, values: string[]): RosterColumnAnalysis {
  const trimmed = values.map((v) => v.trim());
  const nonEmpty = trimmed.filter(Boolean);
  const filledRatio = trimmed.length > 0 ? nonEmpty.length / trimmed.length : 0;

  if (nonEmpty.length === 0) {
    return { header, type: 'empty', filledRatio: 0, samples: [], suggestedConfidence: 'none' };
  }

  let type: RosterColumnType;
  if (nonEmpty.every((v) => /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, '')))) {
    type = 'number';
  } else if (nonEmpty.every((v) => isDateLikeCell(v))) {
    type = 'date';
  } else {
    const avgLength = nonEmpty.reduce((s, v) => s + v.length, 0) / nonEmpty.length;
    type = avgLength < 30 ? 'shortText' : 'longText';
  }

  const samples = Array.from(new Set(nonEmpty)).slice(0, 3);
  return { header, type, filledRatio, samples, suggestedConfidence: 'none' };
}

/** ヘッダー文字列と候補ラベルを `normalizeHeader`（NFKC＋空白除去）で正規化して突き合わせる。
 *  完全一致→部分一致の2パスで、既に割当済みのキーは後続の列に使い回さない
 *  （同じキーに2列がぶら下がって「どちらが正か」曖昧になるのを避ける — awards の
 *  `suggestMappingKey` と同じ考え方）。 */
function applySuggestions(columns: RosterColumnAnalysis[], fieldCandidates: RosterFieldCandidate[]): void {
  if (fieldCandidates.length === 0) return;
  const used = new Set<string>();
  for (const pass of ['exact', 'partial'] as const) {
    for (const col of columns) {
      if (col.type === 'empty' || col.suggestedKey) continue;
      const headerNorm = normalizeHeader(col.header);
      for (const cand of fieldCandidates) {
        if (used.has(cand.key)) continue;
        const labelNorm = normalizeHeader(cand.label);
        const hit = pass === 'exact'
          ? labelNorm === headerNorm
          : (labelNorm.includes(headerNorm) || headerNorm.includes(labelNorm));
        if (hit) {
          col.suggestedKey = cand.key;
          col.suggestedConfidence = pass;
          used.add(cand.key);
          break;
        }
      }
    }
  }
}

/** 1シート目のヘッダー行・先頭数行のサンプル・列ごとの型判定を返す（マッピングUI用）。
 *  `fieldCandidates` を渡すと、その部品のフィールドに対する推奨マッピングも一緒に返す
 *  （部品が未選択のときは省略してよい＝型判定だけを返す）。 */
export async function previewRosterExcel(
  buffer: Buffer,
  fieldCandidates: RosterFieldCandidate[] = [],
): Promise<RosterPreview> {
  const wb = await loadExcelWorkbook(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], sampleRows: [], totalRows: 0, columns: [] };

  const data = sheetToAoa(ws, { maxRows: 10000, maxCols: 50, text: true }) as string[][];
  if (data.length === 0) return { headers: [], sampleRows: [], totalRows: 0, columns: [] };

  // 空ヘッダーの列は無視するが、データ行の列位置は保つ（元の列インデックスを覚えておく）
  const rawHeaderRow = (data[0] ?? []).map((h) => String(h ?? '').trim());
  const headerIndexes: number[] = [];
  const headers: string[] = [];
  rawHeaderRow.forEach((h, i) => {
    if (h !== '') { headers.push(h); headerIndexes.push(i); }
  });

  const dataRows = data.slice(1);
  const sampleRows = dataRows.slice(0, 5).map((row) => headerIndexes.map((i) => String(row[i] ?? '')));

  const columns = headers.map((h, col) =>
    analyzeRosterColumn(h, dataRows.map((row) => String(row[headerIndexes[col]] ?? '')))
  );
  applySuggestions(columns, fieldCandidates);

  return { headers, sampleRows, totalRows: dataRows.length, columns };
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
  /** true のとき DB へは書き込まず、件数・スキップ・エラーだけを返す（投入前の確認用）。 */
  dryRun?: boolean;
}

export interface RosterCommitResult {
  created: GraphicsPage[];
  createdCount: number;
  /** 全カラム空だったためスキップした行数 */
  skippedBlank: number;
  /** ページ名が空になり作成できなかった行（他の行は作成を続ける寛容設計） */
  errors: { row: number; message: string }[];
  /** true なら dry-run の結果（`created` は常に空配列。件数は `createdCount` を見る） */
  dryRun: boolean;
}

interface ParsedRosterRow {
  excelRowNo: number;
  name: string;
  fields: Record<string, unknown>;
}

/** 名簿の全行をパースし、空行スキップ・ページ名必須のバリデーションまで行う純粋関数
 *  （DB を触らない）。dry-run と本投入の両方がこれを共有する — 判定基準がずれないように。 */
function parseRosterRows(
  dataRows: string[][],
  rawHeaderRow: string[],
  mapping: Record<string, string>,
  nameColumn: string | undefined,
  repField: string,
): { skippedBlank: number; errors: { row: number; message: string }[]; rows: ParsedRosterRow[] } {
  const indexOfHeader = (name: string): number => rawHeaderRow.indexOf(name);

  const fieldIndexes: [string, number][] = [];
  for (const [fieldKey, header] of Object.entries(mapping)) {
    if (!header) continue;
    const idx = indexOfHeader(header);
    if (idx !== -1) fieldIndexes.push([fieldKey, idx]);
  }
  const nameIdx = nameColumn ? indexOfHeader(nameColumn) : -1;

  const rows: ParsedRosterRow[] = [];
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

    rows.push({ excelRowNo, name, fields });
  }

  return { skippedBlank, errors, rows };
}

/** 名簿の全行をパースし、`graphics_pages` へ一括 INSERT する。
 *  `dryRun: true` のときは DB に一切触れず（トランザクションすら開かない）、
 *  作成される件数・スキップされる件数・エラー行だけを返す。 */
export async function commitRosterImport(input: RosterCommitInput): Promise<RosterCommitResult> {
  const { projectId, buffer, slot, partKey, mapping, nameColumn, dryRun = false } = input;

  const wb = await loadExcelWorkbook(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError(400, 'BAD_REQUEST', 'シートが見つかりません');

  const data = sheetToAoa(ws, { maxRows: 10000, maxCols: 50, text: true }) as string[][];
  if (data.length < 2) throw new AppError(400, 'BAD_REQUEST', 'データ行がありません');

  const rawHeaderRow = (data[0] ?? []).map((h) => String(h ?? '').trim());
  const dataRows = data.slice(1);
  const repField = REPRESENTATIVE_FIELD[partKey];

  const { skippedBlank, errors, rows } = parseRosterRows(dataRows, rawHeaderRow, mapping, nameColumn, repField);

  if (dryRun) {
    return { created: [], createdCount: rows.length, skippedBlank, errors, dryRun: true };
  }

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

    for (const row of rows) {
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
        [projectId, callNo, slot, partKey, row.name, JSON.stringify(row.fields), sortOrder]
      );
      if (inserted) created.push(mapPage(inserted));
    }

    return { created, createdCount: created.length, skippedBlank, errors, dryRun: false };
  });
}
