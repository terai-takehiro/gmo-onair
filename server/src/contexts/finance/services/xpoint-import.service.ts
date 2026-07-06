/**
 * xpoint-import.service.ts — X-Point 申請 PDF の Box 取込
 *
 * Box の監視フォルダから X-Point 申請 PDF を一覧し、Box の extracted_text
 * representation (Box 側が生成するテキスト抽出) を取得して解析する。
 * 解析結果は xpoint_import_files に保存し、人間のレビュー・修正を経て
 * 仕入 (purchases) / 販管費 (sga_expenses) に登録される (登録はルート側)。
 *
 * 自動登録は行わない: フォルダの読み取りは UI のボタンから明示的に実行し、
 * 全フィールドがレビュー UI での人間チェックを通ってから登録される。
 */
import { getBoxClient, extractFolderId } from '../../../shared/services/box';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { parseXpointText, toExclusiveAmount, XpointParsed } from './xpoint-parse.service';

// 既定の監視フォルダ (X-Point 申請 PDF 格納先)。env で上書き可、リクエストで都度指定も可。
const DEFAULT_XPOINT_FOLDER_ID = '397127787652';

export function resolveXpointFolderId(input?: string | null): string {
  if (input && input.trim()) return extractFolderId(input) || input.trim();
  return process.env.XPOINT_BOX_FOLDER_ID || DEFAULT_XPOINT_FOLDER_ID;
}

export interface XpointFileRow {
  id: number;
  box_file_id: string;
  file_name: string;
  box_modified_at: string | null;
  xp_number: string | null;
  kind: string;
  status: string;
  parsed_data: unknown;
  error_message: string | null;
  registered_table: string | null;
  registered_id: string | null;
  registered_at: string | null;
}

/** フォルダ内の PDF を一覧し、未知のファイルを xpoint_import_files に登録して現況を返す */
export async function scanXpointFolder(folderId: string): Promise<XpointFileRow[]> {
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');

  const items = await client.folders.getItems(folderId, {
    fields: 'id,type,name,modified_at',
    limit: 1000,
  });
  const pdfs = ((items.entries || []) as any[]).filter(
    (e) => e.type === 'file' && /\.pdf$/i.test(e.name || '')
  );

  for (const f of pdfs) {
    await execute(
      `INSERT INTO xpoint_import_files (box_file_id, file_name, box_modified_at)
       VALUES (?, ?, ?)
       ON CONFLICT (box_file_id)
       DO UPDATE SET file_name = EXCLUDED.file_name, box_modified_at = EXCLUDED.box_modified_at, updated_at = NOW()`,
      [String(f.id), f.name, f.modified_at || null]
    );
  }

  if (pdfs.length === 0) return [];
  const ids = pdfs.map((f: any) => String(f.id));
  const placeholders = ids.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT * FROM xpoint_import_files WHERE box_file_id IN (${placeholders})
     ORDER BY box_modified_at DESC NULLS LAST, file_name`,
    ids
  );
  return rows as unknown as XpointFileRow[];
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

/**
 * Box の extracted_text representation から PDF のテキストを取得。
 * (サーバーに PDF パーサーを持たず、Box 側の抽出結果を使う。
 *  representation が未生成の場合は SDK がポーリングして待機する)
 */
export async function fetchXpointPdfText(boxFileId: string): Promise<string> {
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');
  const stream = await (client.files as any).getRepresentationContent(boxFileId, '[extracted_text]');
  const text = await streamToString(stream);
  if (!text.trim()) throw new Error('PDF からテキストを抽出できませんでした (スキャン画像 PDF の可能性があります)');
  return text;
}

export interface VendorMatch { id: string; name: string; matched_by: 'name' | 'invoice_number' | 'partial' }
export interface ProjectMatch { id: string; name: string; gls_number: string }
export interface DuplicateRow { id: string; amount: number; recognition_date: string | null; vendor_name: string | null; description: string | null }

export interface XpointParseResult {
  parsed: XpointParsed;
  match: {
    vendor: VendorMatch | null;
    vendorCandidates: VendorMatch[];
    project: ProjectMatch | null;
  };
  duplicates: {
    purchases: DuplicateRow[];
    sga: DuplicateRow[];
  };
  suggested: {
    taxCategory: 'tax10' | 'tax8' | 'exempt';
    amountExclusive: number | null;
    recognitionMonth: string | null; // YYYY-MM
  };
  parsedAt: string;
}

/** 解析結果に ONAiR マスタ (取引先/案件) の照合と重複チェックを付与 */
export async function enrichParsed(parsed: XpointParsed): Promise<XpointParseResult> {
  let vendor: VendorMatch | null = null;
  const vendorCandidates: VendorMatch[] = [];

  if (parsed.vendorName) {
    const exact = (await queryOne(
      `SELECT id, name FROM vendors WHERE deleted_at IS NULL AND name = ? LIMIT 1`,
      [parsed.vendorName]
    )) as any;
    if (exact) {
      vendor = { id: exact.id, name: exact.name, matched_by: 'name' };
    }
  }
  if (!vendor && parsed.invoiceNumber) {
    const byInv = (await queryOne(
      `SELECT id, name FROM vendors WHERE deleted_at IS NULL AND invoice_registration_number = ? LIMIT 1`,
      [parsed.invoiceNumber]
    )) as any;
    if (byInv) {
      vendor = { id: byInv.id, name: byInv.name, matched_by: 'invoice_number' };
    }
  }
  if (!vendor && parsed.vendorName) {
    // 法人格・空白の揺らぎを吸収した部分一致候補 (自動確定はせず候補として提示)
    const core = parsed.vendorName.replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\s/g, '');
    if (core.length >= 2) {
      const rows = (await queryAll(
        `SELECT id, name FROM vendors WHERE deleted_at IS NULL AND name ILIKE ? ORDER BY name LIMIT 5`,
        [`%${core}%`]
      )) as any[];
      for (const r of rows) vendorCandidates.push({ id: r.id, name: r.name, matched_by: 'partial' });
    }
  }

  let project: ProjectMatch | null = null;
  if (parsed.glsNumber) {
    const p = (await queryOne(
      `SELECT id, name, gls_number FROM projects WHERE deleted_at IS NULL AND UPPER(gls_number) = ? LIMIT 1`,
      [parsed.glsNumber]
    )) as any;
    if (p) project = { id: p.id, name: p.name, gls_number: p.gls_number };
  }

  // 二重登録チェック: 精算番号 (= X-Point 番号) が一致する既存レコード
  let dupPurchases: DuplicateRow[] = [];
  let dupSga: DuplicateRow[] = [];
  if (parsed.xpNumber) {
    dupPurchases = (await queryAll(
      `SELECT pu.id, pu.amount, pu.recognition_date, v.name as vendor_name, pu.description
       FROM purchases pu LEFT JOIN vendors v ON v.id = pu.vendor_id
       WHERE pu.deleted_at IS NULL AND pu.settlement_method = 'xpoint' AND pu.settlement_number = ?`,
      [parsed.xpNumber]
    )) as unknown as DuplicateRow[];
    dupSga = (await queryAll(
      `SELECT id, amount, recognition_date, vendor_name, description
       FROM sga_expenses
       WHERE deleted_at IS NULL AND settlement_method = 'xpoint' AND settlement_number = ?`,
      [parsed.xpNumber]
    )) as unknown as DuplicateRow[];
  }

  const amountExclusive =
    parsed.amountInclusive != null ? toExclusiveAmount(parsed.amountInclusive, 'tax10') : null;

  return {
    parsed,
    match: { vendor, vendorCandidates, project },
    duplicates: { purchases: dupPurchases, sga: dupSga },
    suggested: {
      taxCategory: 'tax10',
      amountExclusive,
      recognitionMonth: parsed.recognitionDate ? parsed.recognitionDate.slice(0, 7) : null,
    },
    parsedAt: new Date().toISOString(),
  };
}

/** PDF を解析して結果を保存 (status: parsed / error) */
export async function parseXpointFile(boxFileId: string, fileName?: string): Promise<XpointParseResult> {
  // scan 前に直接叩かれた場合にも行を用意しておく
  await execute(
    `INSERT INTO xpoint_import_files (box_file_id, file_name)
     VALUES (?, ?) ON CONFLICT (box_file_id) DO NOTHING`,
    [boxFileId, fileName || boxFileId]
  );

  try {
    const text = await fetchXpointPdfText(boxFileId);
    const parsed = parseXpointText(text);
    const result = await enrichParsed(parsed);
    await execute(
      `UPDATE xpoint_import_files
       SET xp_number = ?, kind = ?, status = 'parsed', parsed_data = ?::jsonb, error_message = NULL, updated_at = NOW()
       WHERE box_file_id = ?`,
      [parsed.xpNumber, parsed.kind, JSON.stringify(result), boxFileId]
    );
    return result;
  } catch (err) {
    const message = (err as Error).message || String(err);
    await execute(
      `UPDATE xpoint_import_files SET status = 'error', error_message = ?, updated_at = NOW() WHERE box_file_id = ?`,
      [message, boxFileId]
    );
    throw err;
  }
}
