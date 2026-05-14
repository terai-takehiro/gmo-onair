// 総勘定元帳 CSV パーサ
// 入力: CP932 (Shift_JIS) バイト列の Buffer
// 出力: ParsedLedgerBatch
//
// 18 列構成 (要件書 §2.2.1):
//   取引No, 取引日, 勘定科目, 補助科目, 取引先, 税区分, インボイス,
//   相手勘定科目, 相手補助科目, 相手取引先, 相手税区分, 相手インボイス,
//   摘要, 借方金額, 貸方金額, 残高, メモ, タグ
//
// メモ列は セル内改行 を含む可。csv-parse の RFC 4180 準拠で扱える。
// GLS / XP 番号は摘要欄から正規表現で抽出して配列保存。

import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { parseAccountCell } from './pl-parser';

export interface ParsedLedgerEntry {
  voucherNo: string;
  lineSeq: number;
  transactionDate: string;          // 'YYYY-MM-DD'
  accountCode: string | null;
  accountName: string | null;
  subAccountCode: string | null;
  subAccountName: string | null;
  counterAccountCode: string | null;
  counterAccountName: string | null;
  counterSubCode: string | null;
  counterSubName: string | null;
  counterVendorRaw: string | null;
  taxCategory: string | null;
  counterTaxCategory: string | null;
  invoiceFlag: string | null;
  counterInvoiceFlag: string | null;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number | null;
  memo: string | null;
  tagRaw: string | null;
  extractedGlsCodes: string[];
  extractedXpCodes: string[];
  rawRow: string[];
}

export interface ParsedLedgerBatch {
  entries: ParsedLedgerEntry[];
  /** 摘要から拾った GLS 番号のユニーク集合 (取込時のサマリー表示用) */
  uniqueGlsCodes: string[];
  /** 摘要から拾った XP 番号のユニーク集合 */
  uniqueXpCodes: string[];
}

const EXPECTED_HEADER = [
  '取引No', '取引日', '勘定科目', '補助科目', '取引先', '税区分', 'インボイス',
  '相手勘定科目', '相手補助科目', '相手取引先', '相手税区分', '相手インボイス',
  '摘要', '借方金額', '貸方金額', '残高', 'メモ', 'タグ',
];

/** 摘要から GLS\d+ を抽出 (`GLS-127` のようなハイフン挟みも許容、正規化して "GLS127" 形式に揃える) */
export function extractGlsCodes(description: string): string[] {
  if (!description) return [];
  const seen = new Set<string>();
  const re = /GLS[\s\-]*?(\d{3,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) {
    seen.add(`GLS${m[1]}`);
  }
  return Array.from(seen);
}

/** 摘要から XP\d{6,} を抽出 (`XP128221` 等) */
export function extractXpCodes(description: string): string[] {
  if (!description) return [];
  const seen = new Set<string>();
  const re = /XP(\d{6,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) {
    seen.add(`XP${m[1]}`);
  }
  return Array.from(seen);
}

function parseInt0(v: string | undefined): number {
  if (!v) return 0;
  const t = v.trim();
  if (!t) return 0;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

/** "2026/03/01" → "2026-03-01" */
function normalizeDate(v: string): string {
  const t = (v || '').trim();
  const m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) throw new Error(`取引日のフォーマット不正: "${v}"`);
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function parseLedgerCsv(buffer: Buffer): ParsedLedgerBatch {
  const text = iconv.decode(buffer, 'cp932');

  const records: string[][] = parse(text, {
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
    relax_column_count: true,
  });

  if (records.length < 2) {
    throw new Error('総勘定元帳 CSV: 行数が不足しています');
  }

  // ヘッダ検証 (緩め: 主要 5 列がマッチすれば OK とする)
  const header = records[0].map((c) => (c || '').trim());
  const keyCols = ['取引No', '取引日', '勘定科目', '摘要', '借方金額'];
  for (const k of keyCols) {
    if (!header.includes(k)) {
      throw new Error(`総勘定元帳 CSV: ヘッダに "${k}" が見つかりません header=${JSON.stringify(header)}`);
    }
  }
  void EXPECTED_HEADER;

  const seqMap = new Map<string, number>();
  const entries: ParsedLedgerEntry[] = [];
  const uniqueGls = new Set<string>();
  const uniqueXp = new Set<string>();

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length === 0) continue;
    if (row.every((c) => !c || !c.trim())) continue;

    const voucherNo = (row[0] ?? '').trim();
    if (!voucherNo) continue; // 取引 No が空の行は skip (CSV 末尾の空行など)

    const transactionDate = normalizeDate(row[1] ?? '');

    const account = parseAccountCell(row[2] ?? '');
    const subAccount = parseAccountCell(row[3] ?? '');
    const counterAccount = parseAccountCell(row[7] ?? '');
    const counterSub = parseAccountCell(row[8] ?? '');

    const description = (row[12] ?? '').trim();
    const gls = extractGlsCodes(description);
    const xp = extractXpCodes(description);
    gls.forEach((g) => uniqueGls.add(g));
    xp.forEach((x) => uniqueXp.add(x));

    const seq = (seqMap.get(voucherNo) ?? 0) + 1;
    seqMap.set(voucherNo, seq);

    entries.push({
      voucherNo,
      lineSeq: seq,
      transactionDate,
      accountCode: account.code,
      accountName: account.name,
      subAccountCode: subAccount.code,
      subAccountName: subAccount.name,
      counterAccountCode: counterAccount.code,
      counterAccountName: counterAccount.name,
      counterSubCode: counterSub.code,
      counterSubName: counterSub.name,
      counterVendorRaw: (row[9] ?? '').trim() || null,
      taxCategory: (row[5] ?? '').trim() || null,
      counterTaxCategory: (row[10] ?? '').trim() || null,
      invoiceFlag: (row[6] ?? '').trim() || null,
      counterInvoiceFlag: (row[11] ?? '').trim() || null,
      description,
      debit: parseInt0(row[13]),
      credit: parseInt0(row[14]),
      runningBalance: parseIntOrNull(row[15]),
      memo: (row[16] ?? '').trim() || null,
      tagRaw: (row[17] ?? '').trim() || null,
      extractedGlsCodes: gls,
      extractedXpCodes: xp,
      rawRow: row,
    });
  }

  return {
    entries,
    uniqueGlsCodes: Array.from(uniqueGls).sort(),
    uniqueXpCodes: Array.from(uniqueXp).sort(),
  };
}
