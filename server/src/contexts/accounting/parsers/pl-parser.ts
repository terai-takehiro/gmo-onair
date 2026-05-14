// 損益計算書 + 残高試算表 CSV パーサ
// 入力: CP932 (Shift_JIS) バイト列の Buffer
// 出力: ParsedPlBatch (period_ym + 階層化された行配列)
//
// 階層判定 (要件書 §2.1.2):
//   level 0 = 大分類見出し (第1列のみ値、金額列は空)
//   level 1 = 勘定科目     (第2列に "コード 名前"、第3列空)
//   level 2 = 補助科目     (第3列に "コード 名前")
//   level 3 = 集計行       (第1列に "...合計" / "営業損失" / "経常損失" 等のラベル)

import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';

export interface ParsedPlLine {
  rowIndex: number;             // CSV 内物理行番号 (1-based、ヘッダ除く)
  level: 0 | 1 | 2 | 3;
  categoryLabel: string | null;
  accountCode: string | null;
  accountName: string | null;
  subAccountCode: string | null;
  subAccountName: string | null;
  detailCode: string | null;
  detailName: string | null;
  totalLabel: string | null;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  compositionRatio: number | null;  // パーセント値 (100.0%, 184.9% 等)
  rawRow: string[];
}

export interface ParsedPlBatch {
  periodYm: string;             // "2026-03"
  periodStartDate: string;      // "2026-03-01"
  periodEndDate: string;        // "2026-03-31"
  lines: ParsedPlLine[];
}

/**
 * 補助科目の二段表記をパース
 *   "8000 ｸﾞﾙｰﾌﾟ業務委託 :100 GP" → { code:"8000", name:"ｸﾞﾙｰﾌﾟ業務委託", detailCode:"100", detailName:"GP" }
 *   "1000 販売連携"               → { code:"1000", name:"販売連携", detailCode:null, detailName:null }
 * コードのみ "1220" のような行にも寛容に対応 (実 CSV のタグ列で観察)。
 */
export function parseAccountCell(cell: string): {
  code: string | null;
  name: string | null;
  detailCode: string | null;
  detailName: string | null;
} {
  const trimmed = (cell || '').trim();
  if (!trimmed) return { code: null, name: null, detailCode: null, detailName: null };

  const m = trimmed.match(/^(\d+)(?:\s+(.+?))?(?:\s*:\s*(\d+)\s+(.+))?$/);
  if (!m) {
    return { code: null, name: trimmed, detailCode: null, detailName: null };
  }
  return {
    code: m[1] ?? null,
    name: m[2]?.trim() || null,
    detailCode: m[3] ?? null,
    detailName: m[4]?.trim() || null,
  };
}

/** "100.0%" → 100.0, "-84.9%" → -84.9, "" / "0.0%" → 0 or null */
function parseCompositionRatio(cell: string): number | null {
  const trimmed = (cell || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return parseFloat(m[1]);
}

function parseInt0(cell: string): number {
  const trimmed = (cell || '').trim();
  if (!trimmed) return 0;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? 0 : n;
}

const SUMMARY_LABEL_PATTERNS: RegExp[] = [
  /合計$/,
  /^売上総(?:利益|損失)$/,
  /^営業(?:利益|損失)$/,
  /^経常(?:利益|損失)$/,
  /^税引前当期純(?:利益|損失)$/,
  /^当期純(?:利益|損失|損益)$/,
];

function isSummaryLabel(s: string): boolean {
  return SUMMARY_LABEL_PATTERNS.some((re) => re.test(s));
}

/**
 * Phase 1: P/L CSV をパース
 * @throws Error if header is unrecognized or 期間 が抽出できない
 */
export function parsePlCsv(buffer: Buffer): ParsedPlBatch {
  // CP932 → UTF-8
  const text = iconv.decode(buffer, 'cp932');

  const records: string[][] = parse(text, {
    skip_empty_lines: false,
    relax_quotes: true,
    bom: true,
  });

  if (records.length < 2) {
    throw new Error('P/L CSV: 行数が不足しています (ヘッダ + データが必要)');
  }

  // ヘッダ行 (0 行目) から period を抽出
  const header = records[0];
  const periodStart = extractDateFromHeader(header, '開始月');
  const periodEnd = extractDateFromHeader(header, '終了月');
  if (!periodStart || !periodEnd) {
    throw new Error(`P/L CSV: ヘッダから期間が抽出できません header=${JSON.stringify(header)}`);
  }
  const periodYm = periodStart.slice(0, 7);

  const lines: ParsedPlLine[] = [];
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length === 0) continue;
    // 完全に空の行は skip
    if (row.every((c) => !c || !c.trim())) continue;

    const col0 = (row[0] ?? '').trim();   // 大分類名 or 集計ラベル
    const col1 = (row[1] ?? '').trim();   // 勘定科目セル
    const col2 = (row[2] ?? '').trim();   // 補助科目セル

    let level: 0 | 1 | 2 | 3;
    let categoryLabel: string | null = null;
    let totalLabel: string | null = null;
    let account = { code: null as string | null, name: null as string | null, detailCode: null as string | null, detailName: null as string | null };
    let subAccount = { code: null as string | null, name: null as string | null, detailCode: null as string | null, detailName: null as string | null };

    if (col0 && !col1 && !col2) {
      // 大分類見出し or 集計行 (集計行は通常金額列もある)
      // 金額列を確認
      const hasAmount = (row.slice(3, 7).some((c) => (c || '').trim() !== ''));
      if (isSummaryLabel(col0) || hasAmount) {
        level = 3;
        totalLabel = col0;
      } else {
        level = 0;
        categoryLabel = col0;
      }
    } else if (col1 && !col2) {
      // 勘定科目行
      level = 1;
      account = parseAccountCell(col1);
    } else if (col2) {
      // 補助科目行
      level = 2;
      // 親勘定の情報も保持する (level=2 行でも account_code を埋めると後段の集計が楽)
      // ただし P/L の場合、補助行の col1 は空。親は文脈で決まるため、後段の処理で前 level=1 行から継承する
      subAccount = parseAccountCell(col2);
    } else {
      // どれにも該当しない (col0 と col1/col2 が混在等)。fallback として level=3 扱いにして保存
      level = 3;
      totalLabel = col0 || col1 || col2;
    }

    // 親勘定の継承 (level=2 のとき、直近の level=1 から account_code/name を引き継ぐ)
    if (level === 2 && !account.code) {
      for (let j = lines.length - 1; j >= 0; j--) {
        if (lines[j].level === 1 && lines[j].accountCode) {
          account.code = lines[j].accountCode;
          account.name = lines[j].accountName;
          break;
        }
        if (lines[j].level === 0 || lines[j].level === 3) break;
      }
    }

    lines.push({
      rowIndex: i,
      level,
      categoryLabel,
      accountCode: account.code,
      accountName: account.name,
      subAccountCode: subAccount.code,
      subAccountName: subAccount.name,
      detailCode: subAccount.detailCode ?? account.detailCode,
      detailName: subAccount.detailName ?? account.detailName,
      totalLabel,
      openingBalance: parseInt0(row[3] ?? ''),
      periodDebit:    parseInt0(row[4] ?? ''),
      periodCredit:   parseInt0(row[5] ?? ''),
      closingBalance: parseInt0(row[6] ?? ''),
      compositionRatio: parseCompositionRatio(row[7] ?? ''),
      rawRow: row,
    });
  }

  return { periodYm, periodStartDate: periodStart, periodEndDate: periodEnd, lines };
}

function extractDateFromHeader(header: string[], prefix: string): string | null {
  for (const cell of header) {
    const m = (cell || '').match(new RegExp(`${prefix}:?\\s*(\\d{4}-\\d{2}-\\d{2})`));
    if (m) return m[1];
  }
  return null;
}
