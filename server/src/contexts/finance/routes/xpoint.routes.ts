/**
 * xpoint.routes.ts — X-Point 申請 PDF 取込 API
 *
 * GET  /xpoint/files                    : Box 監視フォルダを読み取り、PDF 一覧 + 取込状態を返す (手動ボタンから)
 * POST /xpoint/files/:boxFileId/parse   : PDF を解析してレビュー用データを返す
 * POST /xpoint/files/:id/register       : レビュー済みの内容で 仕入/販管費 に登録する (人間の確認を経た値のみ)
 * POST /xpoint/files/:id/skip           : 取込対象外としてマーク
 * POST /xpoint/files/:id/reopen         : skipped/error を再びレビュー可能に戻す
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateBillingKey, generateSgaBillingKey } from '../../../shared/services/billing-key.service';
import { isBoxConfigured, getBoxFolderUrl } from '../../../shared/services/box';
import {
  resolveXpointFolderId, scanXpointFolder, parseXpointFile,
} from '../services/xpoint-import.service';

const router = Router();

// 取込は財務データの作成を伴うため budget/editor 以上
router.use(requireAuth, requirePermission('budget', 'editor'));

function requireBox(): void {
  if (!isBoxConfigured()) {
    throw new AppError(400, 'BOX_NOT_CONFIGURED', 'Box が未設定です (BOX_CONFIG_JSON が必要です)');
  }
}

// フォルダを読み取り、PDF 一覧 + 各ファイルの取込状態を返す
router.get('/files', async (req, res) => {
  requireBox();
  const folderId = resolveXpointFolderId(req.query.folder as string | undefined);
  const files = await scanXpointFolder(folderId);
  res.json({ success: true, data: { folderId, folderUrl: getBoxFolderUrl(folderId), files } });
});

// PDF を解析 (Box の extracted_text からフィールド抽出 + マスタ照合 + 重複チェック)
router.post('/files/:boxFileId/parse', async (req, res) => {
  requireBox();
  const boxFileId = req.params.boxFileId;
  if (!/^\d+$/.test(boxFileId)) throw new AppError(400, 'VALIDATION_ERROR', '不正なファイル ID です');
  try {
    const result = await parseXpointFile(boxFileId, req.body?.file_name);
    res.json({ success: true, data: result });
  } catch (err) {
    throw new AppError(422, 'XPOINT_PARSE_ERROR', `PDF の解析に失敗しました: ${(err as Error).message}`);
  }
});

async function getFileRow(id: string): Promise<any> {
  const row = (await queryOne('SELECT * FROM xpoint_import_files WHERE id = ?', [id])) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '取込ファイルが見つかりません');
  return row;
}

/**
 * レビュー済みの内容で登録。
 * body: {
 *   kind: 'purchase' | 'sga',
 *   unit_index?: number,        // 登録単位の添字 (楽楽精算は 1 伝票から複数単位が生まれる)
 *   complete?: boolean,         // true (既定) でファイルを「登録済み」にする。複数単位の途中は false
 *   new_vendor?: { name, invoice_registration_number? },   // 未登録取引先をその場で作成
 *   purchase?: { project_id, vendor_id, tax_category, amount, ... },  // POST /purchases と同じフィールド
 *   sga?: { vendor_name, vendor_id, tax_category, amount, recognition_date, ... }  // POST /sga と同じフィールド
 * }
 * ここに来る値はすべてレビュー UI で人間が確認・修正した最終値 (PDF の生値を直接は使わない)。
 */
router.post('/files/:id/register', async (req, res) => {
  const file = await getFileRow(req.params.id);
  if (file.status === 'registered') {
    throw new AppError(409, 'ALREADY_REGISTERED', 'このファイルは既に登録済みです');
  }

  const { kind, new_vendor, purchase, sga, unit_index, complete } = req.body || {};
  const defaultMethod = file.format === 'rakuraku' ? 'rakuraku' : 'xpoint';
  if (kind !== 'purchase' && kind !== 'sga') {
    throw new AppError(400, 'VALIDATION_ERROR', 'kind は purchase / sga を指定してください');
  }

  // 未登録取引先の新規作成 (レビュー UI でユーザーが明示的に選んだ場合のみ)
  let createdVendorId: string | null = null;
  if (new_vendor?.name) {
    const existing = (await queryOne(
      'SELECT id FROM vendors WHERE name = ? AND deleted_at IS NULL LIMIT 1',
      [new_vendor.name]
    )) as any;
    if (existing) {
      createdVendorId = existing.id;
    } else {
      createdVendorId = uuidv4();
      await execute(
        `INSERT INTO vendors (id, name, invoice_registration_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [createdVendorId, new_vendor.name, new_vendor.invoice_registration_number || null,
         `[xpoint取込] ${file.file_name} から自動作成`, req.user!.id]
      );
    }
  }

  let registeredTable: string;
  let registeredId: string;

  if (kind === 'purchase') {
    const p = purchase || {};
    const vendorId = p.vendor_id || createdVendorId;
    if (!p.project_id || !vendorId) {
      throw new AppError(400, 'VALIDATION_ERROR', '案件と仕入先は必須です');
    }
    let billing_key: string | null = null;
    if (p.episode_id) {
      const episode = (await queryOne('SELECT episode_code FROM episodes WHERE id = ?', [p.episode_id])) as any;
      if (episode) billing_key = generateBillingKey(episode.episode_code, p.tax_category || 'tax10');
    }
    registeredTable = 'purchases';
    registeredId = uuidv4();
    await execute(
      `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, settlement_url, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes, is_provisional, service_completed_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [registeredId, billing_key, p.project_id, p.episode_id || null, vendorId, req.user!.id,
       p.settlement_method || defaultMethod, p.settlement_number || file.xp_number || null, p.settlement_url || null,
       p.tax_category || 'tax10',
       p.invoice_qualified !== undefined ? (p.invoice_qualified ? 1 : 0) : 1,
       p.amount || 0, p.description || null, p.recognition_date || null,
       p.inspection_date || null, p.payment_due_date || null, p.notes || null,
       p.is_provisional ? true : false, p.service_completed_date || null, req.user!.id]
    );
  } else {
    const s = sga || {};
    if (!s.recognition_date) throw new AppError(400, 'VALIDATION_ERROR', '発生日は必須です');
    const billing_key = generateSgaBillingKey(s.recognition_date, s.tax_category || 'tax10');
    registeredTable = 'sga_expenses';
    registeredId = uuidv4();
    await execute(
      `INSERT INTO sga_expenses (id, billing_key, vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, expense_type, amortize_start, amortize_end, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [registeredId, billing_key, s.vendor_name || null, s.vendor_id || createdVendorId || null,
       s.settlement_method || defaultMethod, s.settlement_number || file.xp_number || null, s.settlement_url || null,
       s.description || null, s.notes || null,
       s.recognition_date, s.payment_due_date || null,
       s.tax_category || 'tax10',
       s.invoice_qualified !== undefined ? (s.invoice_qualified ? 1 : 0) : 1,
       s.amount || 0, s.expense_type || 'spot',
       s.amortize_start || null, s.amortize_end || null,
       'staff', req.user!.id]
    );
  }

  // 登録履歴 (楽楽精算は 1 伝票から複数レコードになるため配列で保持)
  const record = {
    table: registeredTable,
    id: registeredId,
    kind,
    unit_index: typeof unit_index === 'number' ? unit_index : null,
    amount: kind === 'purchase' ? (purchase?.amount || 0) : (sga?.amount || 0),
    at: new Date().toISOString(),
    by: req.user!.id,
  };
  // complete=false (複数単位の途中) はステータスを据え置き、最後の単位で registered に。
  const markRegistered = complete !== false;
  await execute(
    `UPDATE xpoint_import_files
     SET status = ${markRegistered ? `'registered'` : 'status'},
         kind = ?, registered_table = ?, registered_id = ?, registered_by = ?, registered_at = NOW(),
         registered_records = COALESCE(registered_records, '[]'::jsonb) || ?::jsonb,
         updated_at = NOW()
     WHERE id = ?`,
    [kind, registeredTable, registeredId, req.user!.id, JSON.stringify([record]), file.id]
  );

  const row = await queryOne(`SELECT * FROM ${registeredTable} WHERE id = ?`, [registeredId]);
  res.status(201).json({ success: true, data: { registered_table: registeredTable, registered_id: registeredId, row } });
});

// 取込対象外としてマーク
router.post('/files/:id/skip', async (req, res) => {
  const file = await getFileRow(req.params.id);
  if (file.status === 'registered') throw new AppError(409, 'ALREADY_REGISTERED', '登録済みのファイルはスキップできません');
  await execute(`UPDATE xpoint_import_files SET status = 'skipped', updated_at = NOW() WHERE id = ?`, [file.id]);
  res.json({ success: true, message: 'スキップしました' });
});

// skipped / error を再びレビュー可能に戻す
router.post('/files/:id/reopen', async (req, res) => {
  const file = await getFileRow(req.params.id);
  if (file.status === 'registered') throw new AppError(409, 'ALREADY_REGISTERED', '登録済みのファイルは戻せません');
  const next = file.parsed_data ? 'parsed' : 'new';
  await execute(`UPDATE xpoint_import_files SET status = ?, error_message = NULL, updated_at = NOW() WHERE id = ?`, [next, file.id]);
  res.json({ success: true, message: '再オープンしました' });
});

export default router;
