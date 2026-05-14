// 経理 CSV インポート サービス
// Phase 1 (Layer A): 生データを accounting_*_raw 系テーブルに永続化
// Phase 2 以降で別途 ETL ジョブが既存 revenues/purchases/sga_expenses へ反映

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { parsePlCsv, ParsedPlBatch } from '../parsers/pl-parser';
import { parseLedgerCsv, ParsedLedgerBatch } from '../parsers/ledger-parser';

export type SourceType = 'pl_trial_balance' | 'general_ledger';

export interface ImportResult {
  batchId: string;
  sourceType: SourceType;
  periodYm: string;
  rowCount: number;
  status: 'staged' | 'duplicate';
  /** 重複時は既存バッチを返す。新規 staged なら parser サマリーを返す */
  duplicateOf?: string;
  summary?: PlSummary | LedgerSummary;
}

export interface PlSummary {
  kind: 'pl_trial_balance';
  periodYm: string;
  periodStartDate: string;
  periodEndDate: string;
  totalLines: number;
  byLevel: Record<number, number>;
}

export interface LedgerSummary {
  kind: 'general_ledger';
  totalEntries: number;
  uniqueVouchers: number;
  uniqueGlsCodes: string[];
  uniqueXpCodes: string[];
  dateRange: { min: string; max: string };
}

/** ファイル全体の SHA-256 をハイフン無し hex で返す */
export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * source_type を推定 (ファイル名 + 内容の双方を見る)
 *  - "損益計算書" / "残高試算表" を含む → pl_trial_balance
 *  - "総勘定元帳" を含む                → general_ledger
 *  - 内容判定: ヘッダ行に "取引No" があれば ledger、"勘定科目" + "補助科目" + "構成比" があれば P/L
 */
export function detectSourceType(filename: string, buffer: Buffer): SourceType | null {
  const lowered = filename;
  if (/損益計算書|残高試算表|trial.?balance|^pl[_-]/i.test(lowered)) return 'pl_trial_balance';
  if (/総勘定元帳|general.?ledger|ledger/i.test(lowered)) return 'general_ledger';

  // フォールバック: 先頭 1KB を CP932 デコードしてヘッダ判定
  // (iconv-lite を import するとサイクルなので遅延)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const iconv = require('iconv-lite');
  const head = iconv.decode(buffer.subarray(0, 1024), 'cp932');
  if (head.includes('取引No') && head.includes('摘要')) return 'general_ledger';
  if (head.includes('勘定科目') && head.includes('構成比')) return 'pl_trial_balance';
  return null;
}

/**
 * 既存の同 hash + 同 period_ym + 同 source_type のバッチを探す
 * (status='superseded' は除く)
 */
async function findExistingBatch(
  sourceType: SourceType,
  periodYm: string,
  hash: string,
): Promise<{ id: string; status: string } | null> {
  const pool = getDb();
  const r = await pool.query(
    `SELECT id, status FROM accounting_import_batches
     WHERE source_type = $1 AND period_ym = $2 AND source_file_hash = $3
       AND status <> 'superseded'
     LIMIT 1`,
    [sourceType, periodYm, hash],
  );
  return (r.rows[0] as { id: string; status: string }) ?? null;
}

/**
 * CSV を取り込み (Phase 1: 生データを accounting_*_raw に保存)
 * 冪等: 同一ファイルハッシュは既存バッチ参照を返す
 */
export async function importCsv(params: {
  buffer: Buffer;
  filename: string;
  userId: string | null;
  /** 明示指定がなければファイル名 + 内容から推定 */
  sourceTypeHint?: SourceType;
  /** 明示指定がなければ P/L はヘッダから抽出、ledger はファイル名から推定 */
  periodYmHint?: string;
  /** CSV 原本を BYTEA で DB に保存するか (検証環境 / 監査用、デフォルト true) */
  persistRawBytes?: boolean;
  notes?: string;
}): Promise<ImportResult> {
  const { buffer, filename, userId } = params;
  const persistRawBytes = params.persistRawBytes ?? true;

  // 1. source_type を確定
  const sourceType = params.sourceTypeHint ?? detectSourceType(filename, buffer);
  if (!sourceType) {
    throw new AppError(
      400, 'UNRECOGNIZED_SOURCE',
      'CSV の種類が判別できません。ファイル名に "損益計算書" / "総勘定元帳" を含めるか、明示してください',
    );
  }

  // 2. パース実施 (失敗するなら早期に止める)
  let pl: ParsedPlBatch | null = null;
  let ledger: ParsedLedgerBatch | null = null;
  let periodYm: string;

  if (sourceType === 'pl_trial_balance') {
    pl = parsePlCsv(buffer);
    periodYm = pl.periodYm;
  } else {
    ledger = parseLedgerCsv(buffer);
    // 元帳は CSV 内に期間情報がないため、引数 or ファイル名から
    periodYm = params.periodYmHint ?? extractPeriodFromFilename(filename, ledger);
  }

  // 3. ハッシュ + 冪等性チェック (事前): レースが無ければ早期に duplicate を返す
  const hash = hashBuffer(buffer);
  const existing = await findExistingBatch(sourceType, periodYm, hash);
  if (existing) {
    return {
      batchId: existing.id,
      sourceType,
      periodYm,
      rowCount: 0,
      status: 'duplicate',
      duplicateOf: existing.id,
    };
  }

  // 4. トランザクションで永続化
  //    レース対策: 上記の事前チェックを擦り抜けて同一バッチが並行 INSERT された場合、
  //    uq_accounting_batches_idem (UNIQUE INDEX) で 23505 が発生する。
  //    その場合は失敗扱いではなく既存バッチを findExistingBatch で再取得して
  //    duplicate として返す (idempotency 維持)。
  const pool = getDb();
  const client = await pool.connect();
  const batchId = uuidv4();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO accounting_import_batches
         (id, period_ym, source_type, source_filename, source_file_hash,
          source_file_bytea, row_count, status, imported_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'staged', $8, $9)`,
      [
        batchId, periodYm, sourceType, filename, hash,
        persistRawBytes ? buffer : null,
        pl ? pl.lines.length : (ledger ? ledger.entries.length : 0),
        userId, params.notes ?? null,
      ],
    );

    let rowCount = 0;
    let summary: PlSummary | LedgerSummary | undefined;

    if (pl) {
      rowCount = await insertPlLines(client, batchId, pl);
      const byLevel: Record<number, number> = {};
      for (const l of pl.lines) byLevel[l.level] = (byLevel[l.level] ?? 0) + 1;
      summary = {
        kind: 'pl_trial_balance',
        periodYm: pl.periodYm,
        periodStartDate: pl.periodStartDate,
        periodEndDate: pl.periodEndDate,
        totalLines: pl.lines.length,
        byLevel,
      };
    } else if (ledger) {
      rowCount = await insertLedgerEntries(client, batchId, ledger);
      const dates = ledger.entries.map((e) => e.transactionDate).sort();
      summary = {
        kind: 'general_ledger',
        totalEntries: ledger.entries.length,
        uniqueVouchers: new Set(ledger.entries.map((e) => e.voucherNo)).size,
        uniqueGlsCodes: ledger.uniqueGlsCodes,
        uniqueXpCodes: ledger.uniqueXpCodes,
        dateRange: { min: dates[0] ?? '', max: dates[dates.length - 1] ?? '' },
      };
    }

    await client.query(
      `UPDATE accounting_import_batches SET row_count = $1 WHERE id = $2`,
      [rowCount, batchId],
    );

    await client.query('COMMIT');
    return { batchId, sourceType, periodYm, rowCount, status: 'staged', summary };
  } catch (err) {
    await client.query('ROLLBACK');
    // 23505 = UNIQUE 違反。並行 INSERT で先に他リクエストが入った場合、
    // ここに到達する。既存バッチを再取得して duplicate として返す。
    if ((err as { code?: string })?.code === '23505') {
      const winner = await findExistingBatch(sourceType, periodYm, hash);
      if (winner) {
        return {
          batchId: winner.id,
          sourceType,
          periodYm,
          rowCount: 0,
          status: 'duplicate',
          duplicateOf: winner.id,
        };
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

async function insertPlLines(client: any, batchId: string, pl: ParsedPlBatch): Promise<number> {
  // バルク挿入 (1 行 1 INSERT × 158 行は十分許容範囲)
  for (const l of pl.lines) {
    await client.query(
      `INSERT INTO accounting_pl_lines_raw
         (batch_id, row_index, level, category_label, account_code, account_name,
          sub_account_code, sub_account_name, detail_code, detail_name, total_label,
          opening_balance, period_debit, period_credit, closing_balance,
          composition_ratio, raw_row)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
      [
        batchId, l.rowIndex, l.level, l.categoryLabel,
        l.accountCode, l.accountName, l.subAccountCode, l.subAccountName,
        l.detailCode, l.detailName, l.totalLabel,
        l.openingBalance, l.periodDebit, l.periodCredit, l.closingBalance,
        l.compositionRatio, JSON.stringify(l.rawRow),
      ],
    );
  }
  return pl.lines.length;
}

async function insertLedgerEntries(client: any, batchId: string, ledger: ParsedLedgerBatch): Promise<number> {
  for (const e of ledger.entries) {
    await client.query(
      `INSERT INTO accounting_ledger_entries_raw
         (batch_id, voucher_no, line_seq, transaction_date,
          account_code, account_name, sub_account_code, sub_account_name,
          counter_account_code, counter_account_name, counter_sub_code, counter_sub_name,
          counter_vendor_raw, tax_category, counter_tax_category, invoice_flag, counter_invoice_flag,
          description, debit, credit, running_balance, memo, tag_raw,
          extracted_gls_codes, extracted_xp_codes, raw_row)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb)`,
      [
        batchId, e.voucherNo, e.lineSeq, e.transactionDate,
        e.accountCode, e.accountName, e.subAccountCode, e.subAccountName,
        e.counterAccountCode, e.counterAccountName, e.counterSubCode, e.counterSubName,
        e.counterVendorRaw, e.taxCategory, e.counterTaxCategory, e.invoiceFlag, e.counterInvoiceFlag,
        e.description, e.debit, e.credit, e.runningBalance, e.memo, e.tagRaw,
        e.extractedGlsCodes, e.extractedXpCodes, JSON.stringify(e.rawRow),
      ],
    );
  }
  return ledger.entries.length;
}

/**
 * 元帳ファイル名から月を抽出 (`総勘定元帳_20260507_1652.csv` → "2026-05" は不正確)
 * 実用上は entries 中の transaction_date から最頻値を取る。
 * fallback: ファイル名の YYYYMMDD を年月だけ拾う
 */
function extractPeriodFromFilename(filename: string, ledger: ParsedLedgerBatch): string {
  // entries の中で最も件数の多い YYYY-MM を採用
  const counts: Record<string, number> = {};
  for (const e of ledger.entries) {
    const ym = e.transactionDate.slice(0, 7);
    counts[ym] = (counts[ym] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) return sorted[0][0];

  // fallback: ファイル名から
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  throw new AppError(400, 'PERIOD_UNDETERMINED', '元帳の対象月が判別できません。periodYm を明示してください');
}
