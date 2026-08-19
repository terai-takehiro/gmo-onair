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
import {
  parseXpointText, scoreXpoint, scoreRakuraku, XpointParsed, type ParseScore,
  parseRakurakuText, RakurakuParsed,
  detectVoucherFormat, buildXpointUnits, buildRakurakuUnits, RegistrationUnit,
} from './xpoint-parse.service';

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
  format: string;
  status: string;
  parsed_data: unknown;
  error_message: string | null;
  registered_table: string | null;
  registered_id: string | null;
  registered_at: string | null;
  registered_records: unknown[];
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

/**
 * アップロードされた PDF を Box の監視フォルダへ保存する。
 * 解析は Box の extracted_text representation を使う一本化された経路のため、
 * アップロード取込も「まず Box に置く」ことで同じパイプラインに乗せる (原本も Box に残る)。
 */
export async function uploadXpointPdf(folderId: string, fileName: string, buffer: Buffer): Promise<{ id: string; name: string }> {
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');
  const safeName = (fileName || 'upload.pdf').replace(/[\\/:*?"<>|]/g, '_');
  const doUpload = async (name: string) => {
    const resp: any = await client.files.uploadFile(folderId, name, buffer);
    const entry = resp?.entries?.[0] ?? resp;
    return { id: String(entry.id), name: String(entry.name) };
  };
  try {
    return await doUpload(safeName);
  } catch (err: any) {
    // 同名ファイルが既にある場合はタイムスタンプを付けて別名で保存 (内容が同じとは限らないため上書きしない)
    if (err?.statusCode === 409) {
      const dot = safeName.lastIndexOf('.');
      const stamped = dot < 0
        ? `${safeName}_${Date.now()}`
        : `${safeName.slice(0, dot)}_${Date.now()}${safeName.slice(dot)}`;
      return await doUpload(stamped);
    }
    throw err;
  }
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
 * Box のテキスト抽出 (extracted_text representation) がまだ生成中で取得できなかったことを表す。
 * アップロード直後の PDF は生成に 1〜2 分かかることがある。エラーではなく「後で再解析」を促す。
 */
export class RepresentationPendingError extends Error {
  constructor() {
    super('Box のテキスト抽出が準備中です。1〜2 分待ってから「解析してレビュー」を押してください。');
    this.name = 'RepresentationPendingError';
  }
}

/**
 * Box の extracted_text representation から PDF のテキストを取得。
 * (サーバーに PDF パーサーを持たず、Box 側の抽出結果を使う。
 *  representation が未生成の場合は SDK がポーリングして待機するが、
 *  timeoutMs を超えたら RepresentationPendingError にして呼び出し側へ制御を返す。
 *  nginx の /api/ プロキシは既定 60 秒で 504 を返すため、必ずそれより短くすること)
 */
export async function fetchXpointPdfText(boxFileId: string, timeoutMs = 45_000): Promise<string> {
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RepresentationPendingError()), timeoutMs);
  });
  try {
    const stream = (await Promise.race([
      (client.files as any).getRepresentationContent(boxFileId, '[extracted_text]'),
      timeout,
    ])) as NodeJS.ReadableStream;
    const text = await Promise.race([streamToString(stream), timeout]);
    if (!text.trim()) throw new Error('PDF からテキストを抽出できませんでした (スキャン画像 PDF の可能性があります)');
    return text;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface VendorMatch { id: string; name: string; matched_by: 'name' | 'invoice_number' | 'partial' }
export interface ProjectMatch { id: string; name: string; gls_number: string }
export interface DuplicateRow { id: string; amount: number; recognition_date: string | null; vendor_name: string | null; description: string | null }

/** 登録単位 + その単位の案件照合結果 */
export interface UnitWithMatch extends RegistrationUnit {
  project: ProjectMatch | null;
}

export interface XpointParseResult {
  /** 判定したフォーマット (unknown は X-Point として解析を試みた結果) */
  format: 'xpoint' | 'rakuraku';
  /** 精算方法 (フォーマットに対応: xpoint = X-Point / rakuraku = 楽楽精算) */
  settlementMethod: 'xpoint' | 'rakuraku';
  /** 精算番号 (X-Point 番号 / 楽楽の伝票 No) */
  settlementNumber: string | null;
  /** X-Point の解析結果 (rakuraku のときは null) */
  parsed: XpointParsed | null;
  /** 楽楽精算の解析結果 (xpoint のときは null) */
  voucher: RakurakuParsed | null;
  /** 登録単位 (1 単位 = 仕入/販管費 1 レコード)。楽楽精算は 種別×GLS×税区分 で複数になり得る */
  units: UnitWithMatch[];
  /** 解析上の注意点 (人間のレビューで確認すべき点) */
  warnings: string[];
  /**
   * 読み取りの確からしさ。**AI のスコアではなく「要る項目を何個読めたか」**。
   * 同じ PDF なら必ず同じ数字になる (`scoreXpoint` / `scoreRakuraku`)
   */
  score: ParseScore;
  match: {
    vendor: VendorMatch | null;
    vendorCandidates: VendorMatch[];
  };
  duplicates: {
    purchases: DuplicateRow[];
    sga: DuplicateRow[];
  };
  parsedAt: string;
}

/**
 * 取引先マスタ照合: 名称完全一致 → 適格事業者番号 → 法人格を除いた部分一致候補
 *
 * Phase 3-2b: ここで返す `id` はレビュー UI を経て `purchases.vendor_id` /
 * `sga_expenses.vendor_id` にそのまま書き込まれる（`xpoint.routes.ts` の
 * `POST /files/:id/register`）。そのFKは companies.id を直接指すので、
 * `vendors` ではなく `companies`（`is_vendor = TRUE`）から引く。
 * **`vendors` 行が生きている会社に限る**（`preloadLookups` 等と同じ理由）。
 */
async function matchVendor(vendorName: string | null, invoiceNumber: string | null): Promise<{ vendor: VendorMatch | null; vendorCandidates: VendorMatch[] }> {
  let vendor: VendorMatch | null = null;
  const vendorCandidates: VendorMatch[] = [];
  const LIVE_VENDOR = `co.is_vendor = TRUE AND co.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM vendors v WHERE v.company_id = co.id AND v.deleted_at IS NULL)`;

  if (vendorName) {
    const exact = (await queryOne(
      `SELECT co.id, co.name FROM companies co WHERE ${LIVE_VENDOR} AND co.name = ? LIMIT 1`,
      [vendorName]
    )) as any;
    if (exact) vendor = { id: exact.id, name: exact.name, matched_by: 'name' };
  }
  if (!vendor && invoiceNumber) {
    const byInv = (await queryOne(
      `SELECT co.id, co.name FROM companies co WHERE ${LIVE_VENDOR} AND co.invoice_registration_number = ? LIMIT 1`,
      [invoiceNumber]
    )) as any;
    if (byInv) vendor = { id: byInv.id, name: byInv.name, matched_by: 'invoice_number' };
  }
  if (!vendor && vendorName) {
    // 法人格・空白の揺らぎを吸収した部分一致候補 (自動確定はせず候補として提示)
    const core = vendorName.replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\s/g, '');
    if (core.length >= 2) {
      const rows = (await queryAll(
        `SELECT co.id, co.name FROM companies co WHERE ${LIVE_VENDOR} AND co.name ILIKE ? ORDER BY co.name LIMIT 5`,
        [`%${core}%`]
      )) as any[];
      for (const r of rows) vendorCandidates.push({ id: r.id, name: r.name, matched_by: 'partial' });
    }
  }
  return { vendor, vendorCandidates };
}

/** GLS 番号 → 案件の照合 (単位ごと・重複クエリはキャッシュ) */
async function matchProjects(units: RegistrationUnit[]): Promise<UnitWithMatch[]> {
  const cache = new Map<string, ProjectMatch | null>();
  const out: UnitWithMatch[] = [];
  for (const u of units) {
    let project: ProjectMatch | null = null;
    if (u.glsNumber) {
      if (cache.has(u.glsNumber)) {
        project = cache.get(u.glsNumber)!;
      } else {
        const p = (await queryOne(
          `SELECT id, name, gls_number FROM projects WHERE deleted_at IS NULL AND UPPER(gls_number) = ? LIMIT 1`,
          [u.glsNumber]
        )) as any;
        project = p ? { id: p.id, name: p.name, gls_number: p.gls_number } : null;
        cache.set(u.glsNumber, project);
      }
    }
    out.push({ ...u, project });
  }
  return out;
}

/** 二重登録チェック: 同じ精算方法 + 精算番号の既存レコード */
async function findDuplicates(method: string, settlementNumber: string | null): Promise<{ purchases: DuplicateRow[]; sga: DuplicateRow[] }> {
  if (!settlementNumber) return { purchases: [], sga: [] };
  // ⚠️ 仕入先名は vendors を正としつつ、消えたら companies へ落とす
  // （レビュー指摘・PR #207 4巡目・purchases.routes.ts と同じ理由）
  const purchases = (await queryAll(
    `SELECT pu.id, pu.amount, pu.recognition_date, COALESCE(v.name, vco.name) as vendor_name, pu.description
     FROM purchases pu
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL
     LEFT JOIN companies vco ON vco.id = pu.vendor_id
     WHERE pu.deleted_at IS NULL AND pu.settlement_method = ? AND pu.settlement_number = ?`,
    [method, settlementNumber]
  )) as unknown as DuplicateRow[];
  const sga = (await queryAll(
    `SELECT id, amount, recognition_date, vendor_name, description
     FROM sga_expenses
     WHERE deleted_at IS NULL AND settlement_method = ? AND settlement_number = ?`,
    [method, settlementNumber]
  )) as unknown as DuplicateRow[];
  return { purchases, sga };
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
    const detected = detectVoucherFormat(text);

    let parsed: XpointParsed | null = null;
    let voucher: RakurakuParsed | null = null;
    let units: RegistrationUnit[];
    let warnings: string[];
    let settlementNumber: string | null;
    let format: 'xpoint' | 'rakuraku';
    let score: ParseScore;

    if (detected === 'rakuraku') {
      format = 'rakuraku';
      voucher = parseRakurakuText(text);
      units = buildRakurakuUnits(voucher);
      warnings = voucher.warnings;
      settlementNumber = voucher.denpyoNumber;
      score = scoreRakuraku(voucher);
    } else {
      format = 'xpoint';
      parsed = parseXpointText(text);
      units = buildXpointUnits(parsed);
      warnings = [...parsed.warnings];
      settlementNumber = parsed.xpNumber;
      score = scoreXpoint(parsed);
      if (detected === 'unknown') {
        warnings.unshift('フォーマット (X-Point / 楽楽精算) を判定できませんでした。X-Point として解析していますが全項目を確認してください。');
      }
    }

    const method = format;
    const unitsWithMatch = await matchProjects(units);
    const vendorMatch = parsed
      ? await matchVendor(parsed.vendorName, parsed.invoiceNumber)
      : { vendor: null, vendorCandidates: [] };
    const duplicates = await findDuplicates(method, settlementNumber);

    const result: XpointParseResult = {
      score,
      format,
      settlementMethod: method,
      settlementNumber,
      parsed,
      voucher,
      units: unitsWithMatch,
      warnings,
      match: vendorMatch,
      duplicates,
      parsedAt: new Date().toISOString(),
    };

    // ファイル単位の kind: 全単位が同じならそれ、混在なら unknown (レビューで単位ごとに選択)
    const kinds = new Set(units.map((u) => u.kind));
    const fileKind = kinds.size === 1 ? units[0].kind : 'unknown';

    await execute(
      `UPDATE xpoint_import_files
       SET xp_number = ?, kind = ?, format = ?, status = 'parsed', parsed_data = ?::jsonb, error_message = NULL, updated_at = NOW()
       WHERE box_file_id = ?`,
      [settlementNumber, fileKind, format, JSON.stringify(result), boxFileId]
    );
    return result;
  } catch (err) {
    if (err instanceof RepresentationPendingError) {
      // 抽出準備中はエラーにせず「未解析」のまま (後から解析ボタンで再実行できる)
      await execute(
        `UPDATE xpoint_import_files SET status = 'new', error_message = NULL, updated_at = NOW()
         WHERE box_file_id = ? AND status NOT IN ('registered', 'skipped')`,
        [boxFileId]
      );
      throw err;
    }
    const message = (err as Error).message || String(err);
    await execute(
      `UPDATE xpoint_import_files SET status = 'error', error_message = ?, updated_at = NOW() WHERE box_file_id = ?`,
      [message, boxFileId]
    );
    throw err;
  }
}
