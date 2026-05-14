// Accounting Imports API (Phase 1 — Layer A 生データ取込み)

import { Router } from 'express';
import multer from 'multer';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { importCsv, SourceType } from '../services/import.service';

const router = Router();

// 5MB 上限 (要件書では損益計算書 9KB + 元帳 189KB なので余裕)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/** 数値クエリパラメータを安全にパース (NaN / 範囲外はデフォルトに) */
function clampInt(
  raw: unknown,
  opts: { default: number; min: number; max: number },
): number {
  if (raw == null || raw === '') return opts.default;
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n)) return opts.default;
  if (n < opts.min) return opts.min;
  if (n > opts.max) return opts.max;
  return n;
}

router.use(requireAuth, requirePermission('budget'));

/**
 * POST /accounting/imports
 *   form-data:
 *     - file: <CSV ファイル>       (必須)
 *     - source_type?: 'pl_trial_balance' | 'general_ledger'
 *     - period_ym?:   'YYYY-MM'
 *     - notes?:       備考 (任意)
 *
 * 戻り: { batch: {...}, status: 'staged' | 'duplicate', summary?: {...} }
 */
router.post(
  '/imports',
  requirePermission('budget', 'editor'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'FILE_REQUIRED', 'CSV ファイルを添付してください (form-data の "file")');
    }
    const sourceTypeHint = (req.body?.source_type as SourceType | undefined) || undefined;
    if (sourceTypeHint && !['pl_trial_balance', 'general_ledger'].includes(sourceTypeHint)) {
      throw new AppError(400, 'INVALID_SOURCE_TYPE', `source_type は pl_trial_balance / general_ledger のいずれか`);
    }
    const periodYmHint = (req.body?.period_ym as string | undefined) || undefined;
    if (periodYmHint && !/^\d{4}-\d{2}$/.test(periodYmHint)) {
      throw new AppError(400, 'INVALID_PERIOD_YM', 'period_ym は YYYY-MM 形式');
    }

    const result = await importCsv({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      userId: req.user?.id ?? null,
      sourceTypeHint,
      periodYmHint,
      persistRawBytes: true,
      notes: (req.body?.notes as string | undefined) || undefined,
    });

    const batchRow = await queryOne(
      `SELECT id, period_ym, source_type, source_filename, source_file_hash,
              row_count, status, imported_by, imported_at, confirmed_at, notes
       FROM accounting_import_batches WHERE id = $1`,
      [result.batchId],
    );

    res.status(result.status === 'duplicate' ? 200 : 201).json({
      success: true,
      data: { batch: batchRow, status: result.status, summary: result.summary },
    });
  },
);

/**
 * GET /accounting/imports
 *   ?period_ym=YYYY-MM   (任意)
 *   ?source_type=...     (任意)
 *   ?status=staged|confirmed|superseded
 */
router.get('/imports', async (req, res) => {
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (req.query.period_ym) { where.push(`period_ym = ?`); params.push(req.query.period_ym); }
  if (req.query.source_type) { where.push(`source_type = ?`); params.push(req.query.source_type); }
  if (req.query.status) { where.push(`status = ?`); params.push(req.query.status); }

  const rows = await queryAll(
    `SELECT id, period_ym, source_type, source_filename, source_file_hash,
            row_count, status, imported_by, imported_at, confirmed_at, notes,
            (source_file_bytea IS NOT NULL) AS has_raw_file
     FROM accounting_import_batches
     WHERE ${where.join(' AND ')}
     ORDER BY imported_at DESC
     LIMIT 200`,
    params,
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /accounting/imports/:id
 *   バッチ詳細 + 内容のサマリーを返す。生データは別途 /pl-lines / /ledger-entries で取得。
 */
router.get('/imports/:id', async (req, res) => {
  const batch = await queryOne(
    `SELECT id, period_ym, source_type, source_filename, source_file_hash,
            row_count, status, imported_by, imported_at, confirmed_at, notes,
            (source_file_bytea IS NOT NULL) AS has_raw_file
     FROM accounting_import_batches WHERE id = $1`,
    [req.params.id],
  );
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'バッチが見つかりません');

  let summary: Record<string, unknown> = {};
  if ((batch as any).source_type === 'pl_trial_balance') {
    const counts = (await queryAll(
      `SELECT level, COUNT(*) AS c FROM accounting_pl_lines_raw WHERE batch_id = $1 GROUP BY level ORDER BY level`,
      [req.params.id],
    )) as { level: number; c: number }[];
    summary = { byLevel: Object.fromEntries(counts.map((r) => [r.level, Number(r.c)])) };
  } else if ((batch as any).source_type === 'general_ledger') {
    const stats = await queryOne(
      `SELECT
         COUNT(*)::int AS total_entries,
         COUNT(DISTINCT voucher_no)::int AS unique_vouchers,
         MIN(transaction_date) AS min_date,
         MAX(transaction_date) AS max_date
       FROM accounting_ledger_entries_raw WHERE batch_id = $1`,
      [req.params.id],
    );
    const glsRow = await queryOne(
      `SELECT COALESCE(ARRAY(SELECT DISTINCT unnest(extracted_gls_codes) FROM accounting_ledger_entries_raw WHERE batch_id = $1 ORDER BY 1), '{}') AS codes`,
      [req.params.id],
    );
    const xpRow = await queryOne(
      `SELECT COALESCE(ARRAY(SELECT DISTINCT unnest(extracted_xp_codes) FROM accounting_ledger_entries_raw WHERE batch_id = $1 ORDER BY 1), '{}') AS codes`,
      [req.params.id],
    );
    summary = {
      ...stats,
      uniqueGlsCodes: (glsRow as any)?.codes ?? [],
      uniqueXpCodes: (xpRow as any)?.codes ?? [],
    };
  }

  res.json({ success: true, data: { batch, summary } });
});

/**
 * GET /accounting/imports/:id/pl-lines
 *   損益計算書バッチの行を取得 (P/L 表示用)
 */
router.get('/imports/:id/pl-lines', async (req, res) => {
  const rows = await queryAll(
    `SELECT id, row_index, level, category_label, account_code, account_name,
            sub_account_code, sub_account_name, detail_code, detail_name, total_label,
            opening_balance, period_debit, period_credit, closing_balance, composition_ratio
     FROM accounting_pl_lines_raw WHERE batch_id = $1 ORDER BY row_index`,
    [req.params.id],
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /accounting/imports/:id/ledger-entries
 *   元帳バッチのエントリ (ページング、フィルタ)
 *     ?limit=  default 100
 *     ?offset= default 0
 *     ?gls=GLS127            extracted_gls_codes に含まれるもの
 *     ?xp=XP128221           extracted_xp_codes に含まれるもの
 *     ?account_code=5000     勘定コード前方一致
 */
router.get('/imports/:id/ledger-entries', async (req, res) => {
  const limit = clampInt(req.query.limit, { default: 100, min: 1, max: 1000 });
  const offset = clampInt(req.query.offset, { default: 0, min: 0, max: 1_000_000 });
  const where: string[] = ['batch_id = ?'];
  const params: unknown[] = [req.params.id];
  if (req.query.gls) { where.push(`? = ANY(extracted_gls_codes)`); params.push(req.query.gls); }
  if (req.query.xp)  { where.push(`? = ANY(extracted_xp_codes)`);  params.push(req.query.xp); }
  if (req.query.account_code) { where.push(`account_code LIKE ?`); params.push(`${req.query.account_code}%`); }

  const totalRow = await queryOne(
    `SELECT COUNT(*)::int AS c FROM accounting_ledger_entries_raw WHERE ${where.join(' AND ')}`,
    params,
  );
  const rows = await queryAll(
    `SELECT id, voucher_no, line_seq, transaction_date,
            account_code, account_name, sub_account_code, sub_account_name,
            counter_account_code, counter_account_name, counter_vendor_raw,
            tax_category, invoice_flag, description, debit, credit, running_balance,
            memo, tag_raw, extracted_gls_codes, extracted_xp_codes
     FROM accounting_ledger_entries_raw
     WHERE ${where.join(' AND ')}
     ORDER BY transaction_date, voucher_no, line_seq
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  res.json({
    success: true,
    data: rows,
    meta: { total: (totalRow as any)?.c ?? 0, limit, offset },
  });
});

/**
 * POST /accounting/imports/:id/confirm
 *   staged → confirmed への昇格 (Phase 2 で ETL が走る判定材料)
 */
router.post('/imports/:id/confirm', requirePermission('budget', 'editor'), async (req, res) => {
  const batch = await queryOne(
    `SELECT id, status FROM accounting_import_batches WHERE id = $1`,
    [req.params.id],
  );
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'バッチが見つかりません');
  const status = (batch as any).status;
  if (status === 'confirmed') {
    res.json({ success: true, data: { id: req.params.id, status: 'confirmed', already: true } });
    return;
  }
  if (status === 'superseded') {
    throw new AppError(409, 'BATCH_SUPERSEDED', '廃棄済みバッチは確定できません');
  }
  await queryOne(
    `UPDATE accounting_import_batches SET status='confirmed', confirmed_at = NOW() WHERE id = $1 RETURNING id`,
    [req.params.id],
  );
  res.json({ success: true, data: { id: req.params.id, status: 'confirmed' } });
});

/**
 * POST /accounting/imports/:id/supersede
 *   管理者のみ。旧バッチを superseded に遷移 (再取込み用)
 */
router.post('/imports/:id/supersede', requirePermission('budget', 'manager'), async (req, res) => {
  const batch = await queryOne(
    `SELECT id, status FROM accounting_import_batches WHERE id = $1`,
    [req.params.id],
  );
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'バッチが見つかりません');
  if ((batch as any).status === 'superseded') {
    res.json({ success: true, data: { id: req.params.id, status: 'superseded', already: true } });
    return;
  }
  await queryOne(
    `UPDATE accounting_import_batches SET status='superseded' WHERE id = $1 RETURNING id`,
    [req.params.id],
  );
  res.json({ success: true, data: { id: req.params.id, status: 'superseded' } });
});

export default router;
