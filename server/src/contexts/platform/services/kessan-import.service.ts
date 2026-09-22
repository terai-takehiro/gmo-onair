/**
 * kessan-import.service.ts — 決算データ取込 (検証DB専用)
 *
 * freee の総勘定元帳 CSV (PCからアップロード) を ONAiR の予算管理/案件管理テーブルへ取り込む。
 * 管理画面の「決算インポート」ボタン (dev 限定) から呼ばれる。CLI 版
 * (server/scripts/import-kessan-dev.mjs) と同一ロジック。
 *
 * 抽出方針: 総勘定元帳は複式簿記のため「勘定科目」列が P/L 科目 (5/6/7xxx) の
 *   元帳行のみ採用 → 貸借科目 (現預金/売掛/未払/消費税) は採用せず二重計上を防止。
 *   - 5000      → 売上 (revenues): GLS(案件) + 顧客
 *   - 6xxx      → 仕入 (purchases): GLS(案件) + 取引先。GLS無しは固定原価Pjへ
 *   - 7xxx      → 販管費 (sga_expenses): 会社単位
 *   取引先/顧客名は freee の「相手補助科目」(先頭コード除去) から取得。
 * 冪等性: commit 時は当月マーカー `[kessan:<period>]` の既存行を削除して入れ直す。
 */
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { loadExcelWorkbook, sheetToAoa } from '../../../shared/utils/excel';
import { getDb } from '../../../shared/db/connection';
import { normalizeTaxCategory } from '../../../shared/services/tax-category.service';
import { looksLikeGmoGroup } from '../../../shared/services/gmo-group';
import { createCustomerRecord, createVendorRecord, execFromPgClient } from '../../../shared/services/company-directory.service';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';

const FIXED_CODE = 'FIXED-COGS';
const FIXED_NAME = '固定原価（スタジオ償却負担額等）';
const FIXED_CUSTOMER = '（固定費・社内）';

// 総勘定元帳CSV/xlsxの行数上限。system_admin限定のツールとはいえ、桁違いに大きい
// ファイル（誤って複数年ぶんを一括エクスポートした・悪意のあるファイル）を無制限に
// 処理すると、1行ごとにDB問い合わせを伴う後段の突き合わせ処理（ensureCustomer等）が
// 単一トランザクション内で長時間コネクションを占有し、他リクエストへ波及しうる。
// 一年分の元帳でも数千〜1万行程度に収まる想定のため、十分な余裕を持たせた上限とする。
const MAX_GL_ROWS = 50_000;

export interface KessanOptions {
  scope?: 'sga' | 'revenues' | 'purchases' | 'all';
  commit?: boolean;
  createMasters?: boolean;
  excludeFixed?: boolean;
  /** 重複候補 (既存データと同一 金額+内容+日付) の行を投入しない */
  skipDuplicates?: boolean;
  /** アップロードされた GL ファイル (freee CSV または MoneyForward xlsx) */
  file: { buffer: Buffer; name: string };
  period?: string; // YYYY-MM
}

export interface KessanReport {
  dryRun: boolean;
  period: string;
  /** 取込データの対象期間 (取引日の最小〜最大 + 含まれる年月一覧) */
  dateRange: { from: string; to: string; months: string[] };
  /** 取込先 DB 名 (prod=本番 / dev=検証 の判別用) */
  targetDb: string;
  isProd: boolean;
  scopes: string[];
  sourceFile: string;
  summary: {
    sga: { count: number; amount: number };
    revenues: { count: number; amount: number };
    purchases: { count: number; amount: number };
    fixedCogs: { count: number; amount: number; routed: string };
  };
  masters: {
    missingProjects: string[];
    missingCustomers: string[];
    /** 仕入・固定原価の取引先で、既存マスタと紐付けられなかったもの（未登録／表記の衝突で一意に決められない） */
    missingVendors: string[];
    created: { projects: number; customers: number; vendors: number };
    /** 失注・放置ネタの自動整理で論理削除されていたが、決算データに実績があったため復活させた案件（GLS番号／固定原価コード） */
    revivedProjects: string[];
  };
  /** 既存データ (非決算インポート行) に同一金額+内容が見つかった重複候補 */
  duplicates: { sga: number; revenues: number; purchases: number; samples: string[] };
  samples: { sga: string[]; revenues: string[]; purchases: string[] };
  committed?: { sga: number; revenues: number; purchases: number; skipped: number; dupSkipped: number };
  warnings: string[];
}

// ============================================================
// CSV パーサ (引用符・セル内改行・"" エスケープ・CRLF 対応)
// ============================================================
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const toInt = (s: unknown): number => {
  const n = parseInt(String(s ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
const normDate = (s: unknown): string => String(s ?? '').trim().replace(/\//g, '-').slice(0, 10);
const acct = (s: unknown): { code: number; name: string } => {
  const m = String(s ?? '').trim().match(/^(\d+)\s+(.*)$/);
  return m ? { code: parseInt(m[1], 10), name: m[2].trim() } : { code: NaN, name: String(s ?? '').trim() };
};
const firstNonEmpty = (...xs: unknown[]): string => xs.map((x) => String(x ?? '').trim()).find((x) => x.length > 0) || '';
const stripCode = (s: unknown): string => String(s ?? '').trim().replace(/^\d+\s+/, '').trim();
// 案件番号トークン: 新形式 GLS-A004 / GLS-B005・2026-10改番後の SCS-0001 / GSS-0001 / GMO-0001 と
// 旧形式 GLS137 / GLS149,150 の全対応（抽出後の照合は `project_numbers` 経由で旧番号でも引ける。§4.10）
const GLS_TOKEN_RE = /GLS-[A-Z]\d+|GLS\d+(?:,\d+)*|(?:SCS|GSS|GMO)-\d+(?:,\d+)*/g;
function parseGls(memo: unknown): string[] {
  const out: string[] = [];
  const re = new RegExp(GLS_TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(memo ?? '')))) {
    const tok = m[0];
    if (tok.includes(',')) {
      // コンマ列挙 (GLS149,150,151 → GLS149/GLS150/GLS151・SCS-0001,0002 → SCS-0001/SCS-0002) を
      // 展開する。prefix は先頭が新形式 (SCS-/GSS-/GMO-、ダッシュ込み) か旧形式 (GLS、ダッシュ無し) かで
      // 長さが違うため固定の3文字決め打ちにはできない
      const prefixMatch = tok.match(/^(SCS-|GSS-|GMO-|GLS)/);
      const prefix = prefixMatch ? prefixMatch[1] : 'GLS';
      for (const n of tok.slice(prefix.length).split(',')) out.push(prefix + n.trim());
    } else {
      out.push(tok); // GLS-A004 / GLS137 / SCS-0001
    }
  }
  return [...new Set(out)];
}
function stripGlsName(memo: unknown): string {
  const nm = String(memo ?? '')
    .replace(/(仕入|売上)?(?:GLS-[A-Z]\d+|(?:SCS|GSS|GMO)-\d+(?:,\d+)*)/g, '')
    .replace(/(仕入|売上)?(?:GLS\d+(?:,\d+)*|(?:SCS|GSS|GMO)-\d+(?:,\d+)*)/g, '')
    .replace(/XP\d+/g, '')
    .replace(/^[\s/、,･・]+/, '')
    .replace(/[\s/、,･・]+$/, '')
    .trim();
  return (nm || String(memo ?? '').trim()).slice(0, 80);
}
function mapTax(z: unknown): 'tax10' | 'tax8' | 'exempt' | 'nontax' {
  const s = String(z ?? '');
  if (s.includes('8%') || s.includes('軽')) return 'tax8';
  // **「不課税」を先に見る**。「不課税」は「課税」を含むので順番を逆にすると取り違える。
  // 非課税 (消費税の対象だが法令で課税しない) と不課税 (そもそも対象外) は
  // 税額はどちらも 0 円だが、帳簿と申告では区別する。片方に寄せると後から分けられない。
  if (s.includes('不課税') || s.includes('対象外')) return 'nontax';
  if (s.includes('非課税')) return 'exempt';
  return 'tax10';
}
/**
 * 税込金額 → 税抜金額。freee 仕訳帳 (税込経理入力) の P/L 行金額は税込のため、
 * ONAiR が保持する税抜額に換算する (税区分で 10%/8% を除算・非課税/対象外はそのまま)。
 * 負数 (逆仕訳) も対応。
 */
function grossToNet(gross: number, taxCat: 'tax10' | 'tax8' | 'exempt' | 'nontax'): number {
  if (taxCat === 'tax10') return Math.round(gross / 1.1);
  if (taxCat === 'tax8') return Math.round(gross / 1.08);
  return gross;
}
const invQualified = (...xs: unknown[]): number => {
  const s = xs.map((x) => String(x ?? '')).join(' ');
  return (s.includes('80%') || s.includes('非適格') || s.includes('50%')) ? 0 : 1;
};
const yen = (n: number): string => '¥' + Number(n).toLocaleString();

/**
 * 取引先・顧客名の名寄せ／重複検出に使う突き合わせキー。
 * 元帳側の表記が登録済みマスタと完全一致しないと「別会社」を新規作成してしまう
 * （全角/半角スペース・㈱ と (株) ・連続する空白 など）ため、NFKC 正規化＋空白の
 * 圧縮で吸収する。**表示・保存する名前は正規化しない**（元の表記のまま使う）。
 * GLS 番号（案件コード）はこの対象外（コード値なので完全一致のまま — §分析参照）。
 */
export const normalizeForMatch = (s: unknown): string => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

/** freee CSV は UTF-8 または Shift_JIS。ヘッダー文字が読める方を採用する。 */
function decodeCsv(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  if (utf8.includes('勘定科目') || utf8.includes('取引No')) return utf8;
  try {
    const sjis = new TextDecoder('shift_jis').decode(buf);
    if (sjis.includes('勘定科目') || sjis.includes('取引No')) return sjis;
    // どちらでもヘッダーが見つからない場合、置換文字が少ない方を返す
    const bad = (s: string) => (s.match(/�/g) || []).length;
    return bad(sjis) < bad(utf8) ? sjis : utf8;
  } catch {
    return utf8;
  }
}

interface SgaRow { no: string; date: string; amount: number; tax_category: string; invoice_qualified: number; vendor_name: string; description: string; }
interface RevRow { no: string; date: string; amount: number; tax_category: string; customer_name: string; gls: string | null; project_name: string; memo: string; }
interface PurRow { no: string; date: string; amount: number; tax_category: string; invoice_qualified: number; vendor_name: string; description: string; gls: string | null; split: number; }
interface Extracted { sga: SgaRow[]; rev: RevRow[]; pur: PurRow[]; fixed: PurRow[]; }

/** ▲ / △ / (123) / -123 を負数として解釈する金額パーサ */
const toAmt = (s: unknown): number => {
  const str = String(s ?? '').trim();
  const neg = /^\(.*\)$/.test(str) || str.startsWith('▲') || str.startsWith('△') || str.startsWith('-');
  const n = parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
  return neg ? -n : n;
};
/** "M/D/YYYY ..." または ISO 日付を YYYY-MM-DD に正規化 */
const parseFlexDate = (s: unknown): string => {
  const str = String(s ?? '').trim();
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const iso = normDate(str);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
};
/** 摘要から案件 GLS 番号 (1件) を抽出: 「GLS137｢…｣」のように鍵括弧直前を優先、無ければ最初の GLS 番号。新旧両形式対応 */
function parseGlsPrimary(memo: unknown): string | null {
  const s = String(memo ?? '');
  // 鍵括弧直前を優先（旧形式 GLS137｢…｣ / 新形式 SCS-0001｢…｣ の両対応）
  const m = s.match(/(?:GLS\d+|(?:SCS|GSS|GMO)-\d+)(?=\s*[｢「])/);
  if (m) return m[0];
  return parseGls(s)[0] ?? null;
}

/**
 * freee CSV の形式を自動判別して P/L 行を抽出するディスパッチャ。
 *   - 損益計算書／残高試算表 (集計表) → 取引明細でないため取込不可 (親切なエラー)
 *   - 仕訳帳 (借方/貸方セパレート形式) → extractFreeeJournalRows
 *   - 総勘定元帳 (単一勘定科目 + 借方/貸方金額) → extractFreeeLedgerRows
 */
function extractFreeeCsv(csv: string, glFileName: string, warnings: string[]): Extracted {
  const rows = parseCsv(csv);
  if (rows.length > MAX_GL_ROWS) {
    throw new Error(`「${glFileName}」の行数が多すぎます（${rows.length.toLocaleString()}行 / 上限${MAX_GL_ROWS.toLocaleString()}行）。期間を絞ってエクスポートし直してください。`);
  }
  const header = rows[0] || [];
  const has = (n: string) => header.includes(n);
  // 損益計算書／残高試算表 (集計表): 期間借方/貸方金額・構成比があり取引No が無い
  if ((has('期間借方金額') || has('期間貸方金額') || has('構成比')) && !has('取引No')) {
    throw new Error(
      `「${glFileName}」は損益計算書／残高試算表（集計表）のため決算インポートに使えません。` +
      `決算インポートは取引明細（仕入・売上・販管費）を投入する機能です。仕訳帳（借方/貸方形式）または総勘定元帳の CSV を指定してください。`
    );
  }
  // 仕訳帳 (借方勘定科目 + 貸方勘定科目 のセパレート形式)
  if (has('借方勘定科目') && has('貸方勘定科目')) {
    warnings.push('仕訳帳（借方/貸方形式）として取り込みました。');
    return extractFreeeJournalRows(rows, glFileName);
  }
  // 総勘定元帳 (単一勘定科目)
  return extractFreeeLedgerRows(rows, glFileName);
}

/** freee 総勘定元帳 CSV (単一勘定科目 + 借方/貸方金額) から P/L 行を抽出 */
function extractFreeeLedgerRows(rows: string[][], glFileName: string): Extracted {
  const header = rows[0] || [];
  const idx = (name: string) => header.indexOf(name);
  const C = {
    no: idx('取引No'), date: idx('取引日'), acct: idx('勘定科目'), sub: idx('補助科目'),
    partner: idx('取引先'), tax: idx('税区分'), inv: idx('インボイス'),
    csub: idx('相手補助科目'), cpartner: idx('相手取引先'), cinv: idx('相手インボイス'),
    memo: idx('摘要'), debit: idx('借方金額'), credit: idx('貸方金額'),
  };
  if (C.acct < 0 || C.debit < 0) {
    throw new Error(`CSV ヘッダーが想定と異なります (勘定科目/借方金額 が見つからない)。取込元=${glFileName} / 先頭行=${(header || []).join('|').slice(0, 160)}`);
  }
  const data = rows.slice(1).filter((r) => r.length > C.credit && String(r[C.no] ?? '').trim());
  const party = (r: string[]) => stripCode(firstNonEmpty(r[C.csub], r[C.cpartner], r[C.partner]));

  const sga: SgaRow[] = [], rev: RevRow[] = [], pur: PurRow[] = [], fixed: PurRow[] = [];
  for (const r of data) {
    const a = acct(r[C.acct]);
    if (!Number.isFinite(a.code)) continue;
    const debit = toInt(r[C.debit]), credit = toInt(r[C.credit]);
    const memo = r[C.memo] ?? '', sub = r[C.sub] ?? '', date = normDate(r[C.date]);
    const tax = mapTax(r[C.tax]), no = String(r[C.no] ?? '').trim();
    const desc = [a.name, sub, memo].map((x) => String(x ?? '').trim()).filter(Boolean).join(' / ').slice(0, 240);

    if (a.code >= 7000 && a.code <= 7999) {
      const amount = debit - credit;
      if (amount === 0) continue;
      sga.push({ no, date, amount, tax_category: tax, invoice_qualified: invQualified(r[C.inv], r[C.cinv]), vendor_name: party(r) || `（${a.name}）`, description: desc });
    } else if (a.code === 5000) {
      const amount = credit - debit;
      if (amount === 0) continue;
      const gls = parseGls(memo);
      rev.push({ no, date, amount, tax_category: tax, customer_name: party(r) || '(顧客不明)', gls: gls[0] || null, project_name: stripGlsName(memo), memo: String(memo).trim() });
    } else if (a.code >= 6000 && a.code <= 6999) {
      const amount = debit - credit;
      if (amount === 0) continue;
      const gls = parseGls(memo);
      const base = { no, date, tax_category: tax, invoice_qualified: invQualified(r[C.inv], r[C.cinv]), vendor_name: party(r) || `（${a.name}）`, description: desc };
      if (gls.length === 0) {
        fixed.push({ ...base, gls: null, amount, split: 1 });
      } else {
        const per = Math.floor(amount / gls.length);
        const rem = amount - per * gls.length;
        gls.forEach((g, i) => pur.push({ ...base, gls: g, amount: per + (i === 0 ? rem : 0), split: gls.length }));
      }
    }
  }
  return { sga, rev, pur, fixed };
}

/**
 * freee 仕訳帳 CSV (借方/貸方セパレート形式) から P/L 行を抽出。
 * 1 仕訳 = 1 行で借方科目と貸方科目を両方持つため、両側を走査して P/L 科目 (5/6/7xxx) を
 * 符号付きで拾う (費用/売上原価=借方増、売上=貸方増、反対側に出る訂正は負数)。
 * 相手先 (取引先/顧客) は反対側の補助科目/取引先から取得 (総勘定元帳の「相手補助科目」に相当)。
 */
function extractFreeeJournalRows(rows: string[][], glFileName: string): Extracted {
  const header = rows[0] || [];
  const idx = (name: string) => header.indexOf(name);
  const C = {
    no: idx('取引No'), date: idx('取引日'),
    dAcct: idx('借方勘定科目'), dSub: idx('借方補助科目'), dPartner: idx('借方取引先'),
    dTax: idx('借方税区分'), dInv: idx('借方インボイス'), dAmt: idx('借方金額(円)'),
    cAcct: idx('貸方勘定科目'), cSub: idx('貸方補助科目'), cPartner: idx('貸方取引先'),
    cTax: idx('貸方税区分'), cInv: idx('貸方インボイス'), cAmt: idx('貸方金額(円)'),
    memo: idx('摘要'),
  };
  if (C.dAcct < 0 || C.dAmt < 0 || C.cAcct < 0 || C.cAmt < 0) {
    throw new Error(`CSV ヘッダーが仕訳帳形式と異なります (借方勘定科目/借方金額(円)/貸方勘定科目/貸方金額(円) が見つからない)。取込元=${glFileName} / 先頭行=${header.join('|').slice(0, 160)}`);
  }
  const maxCol = Math.max(C.dAmt, C.cAmt, C.memo);
  const data = rows.slice(1).filter((r) => r.length > maxCol && String(r[C.no] ?? '').trim());

  const sga: SgaRow[] = [], rev: RevRow[] = [], pur: PurRow[] = [], fixed: PurRow[] = [];

  const addSide = (
    isDebit: boolean,
    acctStr: unknown, amtStr: unknown, tax: unknown, inv: unknown, ownSub: unknown,
    counterPartner: unknown, counterSub: unknown,
    no: string, date: string, memo: unknown,
  ) => {
    const a = acct(acctStr);
    if (!Number.isFinite(a.code)) return;
    const amt = toInt(amtStr);
    if (amt === 0) return;
    const party = stripCode(firstNonEmpty(counterPartner, counterSub));
    const desc = [a.name, ownSub, memo].map((x) => String(x ?? '').trim()).filter(Boolean).join(' / ').slice(0, 240);
    const taxCat = mapTax(tax);
    // 仕訳帳の P/L 行金額は税込のため税抜へ換算 (ONAiR は税抜保持・手入力分と突合可能に)
    if (a.code >= 7000 && a.code <= 7999) {
      const amount = grossToNet(isDebit ? amt : -amt, taxCat); // 費用は借方増
      if (amount === 0) return;
      sga.push({ no, date, amount, tax_category: taxCat, invoice_qualified: invQualified(inv), vendor_name: party || `（${a.name}）`, description: desc });
    } else if (a.code === 5000) {
      const amount = grossToNet(isDebit ? -amt : amt, taxCat); // 売上は貸方増
      if (amount === 0) return;
      const gls = parseGls(memo);
      rev.push({ no, date, amount, tax_category: taxCat, customer_name: party || '(顧客不明)', gls: gls[0] || null, project_name: stripGlsName(memo), memo: String(memo ?? '').trim() });
    } else if (a.code >= 6000 && a.code <= 6999) {
      const amount = grossToNet(isDebit ? amt : -amt, taxCat); // 売上原価は借方増
      if (amount === 0) return;
      const gls = parseGls(memo);
      const base = { no, date, tax_category: taxCat, invoice_qualified: invQualified(inv), vendor_name: party || `（${a.name}）`, description: desc };
      if (gls.length === 0) {
        fixed.push({ ...base, gls: null, amount, split: 1 });
      } else {
        const per = Math.floor(amount / gls.length);
        const rem = amount - per * gls.length;
        gls.forEach((g, i) => pur.push({ ...base, gls: g, amount: per + (i === 0 ? rem : 0), split: gls.length }));
      }
    }
  };

  for (const r of data) {
    const no = String(r[C.no] ?? '').trim();
    const date = normDate(r[C.date]);
    const memo = r[C.memo] ?? '';
    // 借方側 (相手先 = 貸方側の取引先/補助科目)
    addSide(true, r[C.dAcct], r[C.dAmt], r[C.dTax], r[C.dInv], r[C.dSub], r[C.cPartner], r[C.cSub], no, date, memo);
    // 貸方側 (相手先 = 借方側の取引先/補助科目)
    addSide(false, r[C.cAcct], r[C.cAmt], r[C.cTax], r[C.cInv], r[C.cSub], r[C.dPartner], r[C.dSub], no, date, memo);
  }
  return { sga, rev, pur, fixed };
}

/**
 * MoneyForward 形式の GL 明細 (★グローバルスタジオPL見通し.xlsx 「費用詳細」内の元帳ブロック) を抽出。
 * - 単一金額列「機能通貨発生金額」(各勘定の自然残=正) を採用。借方/貸方なし。
 * - 案件 GLS は「文字摘要1」から抽出。税区分列が無いため一律 tax10 + 適格扱い。
 * - G社名='GLS' 以外 (AM/GLOVIA 等の他社レガシー) は除外。
 */
async function extractMoneyForwardXlsx(buf: Buffer, warnings: string[]): Promise<Extracted> {
  const wb = await loadExcelWorkbook(buf);
  let H: Record<string, number> | null = null;
  let body: string[][] = [];
  for (const ws of wb.worksheets) {
    // text: true = 旧 sheet_to_json({ raw: false }) 相当 (全セルを表示文字列で受ける。
    // 日付セルは ISO になり、下の parseFlexDate がそのまま読める)
    const aoa = sheetToAoa(ws, { text: true });
    for (let i = 0; i < aoa.length; i++) {
      const row = ((aoa[i] as unknown[]) || []).map((c) => String(c ?? '').trim());
      const at = (n: string) => row.indexOf(n);
      if (at('機能通貨発生金額') >= 0 && at('勘定科目コード') >= 0 && at('文字摘要1') >= 0) {
        H = {
          ym: at('計上月YM'), date: at('伝票日付2'), no: at('伝票番号'),
          acct: at('勘定科目コード'), acctName: at('科目名'), detail: at('細目名'),
          amount: at('機能通貨発生金額'), memo: at('文字摘要1'),
          company: at('G社名'), partner: at('取引先コード'),
        };
        body = aoa.slice(i + 1).map((rr) => ((rr as unknown[]) || []).map((c) => String(c ?? '')));
        break;
      }
    }
    if (H) break;
  }
  if (!H) {
    throw new Error('MoneyForward GL シートが見つかりません (列「機能通貨発生金額 / 勘定科目コード / 文字摘要1」を含むヘッダー行が必要)');
  }
  if (body.length > MAX_GL_ROWS) {
    throw new Error(`Excel の行数が多すぎます（${body.length.toLocaleString()}行 / 上限${MAX_GL_ROWS.toLocaleString()}行）。期間を絞ってエクスポートし直してください。`);
  }

  const sga: SgaRow[] = [], rev: RevRow[] = [], pur: PurRow[] = [], fixed: PurRow[] = [];
  let skippedOther = 0;
  for (const r of body) {
    const company = String(r[H.company] ?? '').trim();
    if (company && company !== 'GLS') { skippedOther++; continue; } // 他社 (AM/GLOVIA) は除外
    const codeStr = String(r[H.acct] ?? '').trim();
    if (!/^\d+$/.test(codeStr)) continue;
    const code = parseInt(codeStr, 10);
    const amount = toAmt(r[H.amount]);
    if (amount === 0) continue;
    const memo = String(r[H.memo] ?? '').trim();
    const ym = String(r[H.ym] ?? '').trim();
    const date = parseFlexDate(r[H.date]) || (/^\d{4}-\d{2}$/.test(ym) ? `${ym}-01` : '');
    const no = String(r[H.no] ?? '').trim();
    const acctName = String(r[H.acctName] ?? '').trim();
    const sub = String(r[H.detail] ?? '').trim();
    const desc = [acctName, sub === 'N/A' ? '' : sub, memo].filter(Boolean).join(' / ').slice(0, 240);
    const partner = stripCode(String(r[H.partner] ?? '').trim()); // ほぼ空欄

    if (code >= 7000 && code <= 7999) {
      sga.push({ no, date, amount, tax_category: 'tax10', invoice_qualified: 1, vendor_name: partner || `（${acctName}）`, description: desc });
    } else if (code === 5000) {
      rev.push({ no, date, amount, tax_category: 'tax10', customer_name: partner || '(顧客不明)', gls: parseGlsPrimary(memo), project_name: stripGlsName(memo), memo });
    } else if (code >= 6000 && code <= 6999) {
      const gls = parseGlsPrimary(memo);
      const base = { no, date, tax_category: 'tax10', invoice_qualified: 1, vendor_name: partner || `（${acctName}）`, description: desc };
      if (!gls) fixed.push({ ...base, gls: null, amount, split: 1 });
      else pur.push({ ...base, gls, amount, split: 1 });
    }
    // 8xxx(営業外) / 9xxx(税) は取込対象外
  }
  warnings.push('MoneyForward 形式: 税区分列が無いため一律 tax10 + 適格として取込みます。取引先コードが空欄のため取引先/顧客名は科目名プレースホルダになります（取込後に手修正可）。');
  if (skippedOther) warnings.push(`MoneyForward: GLS 以外 (AM/GLOVIA 等の他社レガシー) ${skippedOther} 行を除外しました。`);
  return { sga, rev, pur, fixed };
}

export async function runKessanImport(opts: KessanOptions, userId: string | null): Promise<KessanReport> {
  const scope = opts.scope || 'sga';
  const scopes = scope === 'all' ? ['sga', 'revenues', 'purchases'] : [scope];
  const commit = !!opts.commit;
  const createMasters = !!opts.createMasters;
  const excludeFixed = !!opts.excludeFixed;
  const skipDuplicates = !!opts.skipDuplicates;
  const warnings: string[] = [];

  // --- アップロードされた GL ファイル → 形式判定 (xlsx=MoneyForward / CSV=freee) → 抽出 ---
  const buf = opts.file.buffer;
  const glFileName = opts.file.name;
  const isXlsx = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b; // 'PK' (zip) = xlsx
  const sourceFmt = isXlsx ? 'MoneyForward (xlsx)' : 'freee (CSV)';
  const { sga, rev, pur, fixed } = isXlsx
    ? await extractMoneyForwardXlsx(buf, warnings)
    : extractFreeeCsv(decodeCsv(buf), glFileName, warnings);

  // period 判定 + 対象期間 (抽出行の日付の最小〜最大 + 含まれる年月)
  const counts: Record<string, number> = {};
  let dateFrom = '', dateTo = '';
  for (const x of [...sga, ...rev, ...pur, ...fixed]) {
    const d = x.date;
    const ym = d.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) counts[ym] = (counts[ym] || 0) + 1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (!dateFrom || d < dateFrom) dateFrom = d;
      if (!dateTo || d > dateTo) dateTo = d;
    }
  }
  const months = Object.keys(counts).sort();
  // 複数月にまたがる取込 (履歴インポート等) はマーカーを期間レンジにして月次取込と衝突させない
  let period = opts.period || '';
  if (!period) {
    period = months.length > 1 ? `${months[0]}〜${months[months.length - 1]}` : (months[0] || Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '0000-00');
  }
  const dateRange = { from: dateFrom, to: dateTo, months };
  const MARKER = `[kessan:${period}]`;
  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0);

  const targetDb = String(process.env.DB_NAME || process.env.DATABASE_URL || '').toLowerCase();
  const isProd = targetDb.includes('prod') || targetDb.includes('production');

  const report: KessanReport = {
    dryRun: !commit, period, dateRange, targetDb: process.env.DB_NAME || (isProd ? 'prod' : 'dev'), isProd, scopes, sourceFile: `${glFileName}（${sourceFmt}）`,
    summary: {
      sga: { count: sga.length, amount: sum(sga) },
      revenues: { count: rev.length, amount: sum(rev) },
      purchases: { count: pur.length, amount: sum(pur) },
      fixedCogs: { count: fixed.length, amount: sum(fixed), routed: excludeFixed ? '除外' : `${FIXED_NAME} (${FIXED_CODE})` },
    },
    masters: { missingProjects: [], missingCustomers: [], missingVendors: [], created: { projects: 0, customers: 0, vendors: 0 }, revivedProjects: [] },
    duplicates: { sga: 0, revenues: 0, purchases: 0, samples: [] },
    samples: {
      sga: sga.slice(0, 6).map((x) => `${x.date} ${yen(x.amount)} ${x.tax_category} ${x.vendor_name} | ${x.description.slice(0, 60)}`),
      revenues: rev.map((x) => `${x.date} ${yen(x.amount)} ${x.gls || 'GLS?'} ${x.customer_name} | ${x.project_name}`),
      purchases: pur.slice(0, 8).map((x) => `${x.date} ${yen(x.amount)} ${x.gls} ${x.vendor_name}`)
        .concat(fixed.map((x) => `[固定原価] ${x.date} ${yen(x.amount)} ${x.vendor_name}`)),
    },
    warnings,
  };

  const pool = getDb();
  const client: PoolClient = await pool.connect();
  try {
    const u = await client.query('SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1');
    const fallbackUser = userId || u.rows[0]?.id || null;

    const cache = {
      customers: new Map<string, { id: string | null; ambiguous: boolean }>(),
      vendors: new Map<string, { id: string | null; ambiguous: boolean }>(),
      projects: new Map<string, { id: string; customer_id: string | null } | null>(),
    };
    // 正規化キーが複数社に衝突していて、かつ人（利用者）にまだ知らせていない名前。
    // 同じ名前が何十行も出てきても警告を1回にまとめるための重複防止。
    const ambiguousWarned = new Set<string>();
    const counts = { sga: 0, rev: 0, pur: 0, skipped: 0, dupSkipped: 0 };
    // 既存の手入力行の「キー→件数」マップ (skipDuplicates 時に投入をスキップ)。
    // 件数ベース (min(手入力,取込)) で消費するため、同一キーの正当な複数明細を消しすぎない。
    let existSga: Map<string, number> | undefined;
    let existRev: Map<string, number> | undefined;
    let existPur: Map<string, number> | undefined;
    const incKey = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);

    // Phase 3-2a: revenues/projects.customer_id は companies.id を直接指すので、
    // customers ではなく companies（is_customer=TRUE）から引く。
    // Phase 3-3-4（2026-08-18）: 以前は `customers` 行が生きているかの `EXISTS`
    // チェックも必須だった（`DELETE /customers/:id` が `companies.is_customer` を
    // 更新していなかったため）。`DELETE` が `companies.is_customer` も更新する
    // ようになった（PR #226）ので、`is_customer = TRUE AND deleted_at IS NULL`
    // だけで足りる（`customers.routes.ts`/`search.routes.ts` と同じ判定・同じ理由）。
    //
    // 名寄せは SQL の完全一致ではなく `normalizeForMatch` した名前で行う。
    // 完全一致だと、元帳側の表記が1文字でも違う（全角/半角・㈱の位置・連続空白等）
    // だけで既存の取引先・顧客と紐付かず、同じ会社が2つに分裂して作られてしまう。
    // 正規化キーごとに候補を「配列」で持つ（Map<string,id> で上書きすると、同じ正規化
    // キーに複数社が衝突したとき SQL の返却順に依存して無作為にどちらかを選んでしまう —
    // 例えば正規化前に別会社として登録済みの「㈱ABC」と「(株)ABC」が両方存在する場合、
    // 元帳の行を誤って別の会社に紐付けかねない）。
    type Candidate = { id: string; name: string };
    const pushCandidate = (m: Map<string, Candidate[]>, key: string, c: Candidate) => {
      const arr = m.get(key); if (arr) arr.push(c); else m.set(key, [c]);
    };
    // 衝突時は「元の表記と完全一致するもの」を優先する。それも無ければ一意に決められない
    // ということなので、誤って別会社に紐付けるより安全な「未登録」扱いにする
    // （既存の missingCustomers/missingProjects と同じ経路で人の確認に回る）。
    // `ambiguous: true` は「未登録」と見た目は同じ（id: null）だが、原因が違う
    // （単に無い／複数の候補があって決め切れない）。呼び出し側（ensureCustomer/
    // ensureVendor）はこれを見て、自動作成に倒さず必ず人の確認に回す。
    type Resolution = { id: string | null; ambiguous: boolean };
    const resolveCandidate = (rawName: string, candidates: Candidate[] | undefined): Resolution => {
      if (!candidates || candidates.length === 0) return { id: null, ambiguous: false };
      if (candidates.length === 1) return { id: candidates[0].id, ambiguous: false };
      // companies.name は一意制約が無いため、完全一致が複数件ありうる
      // （同じ名前の会社が2件登録済み等）。1件に絞れたときだけ確定させる。
      const exact = candidates.filter((c) => c.name === rawName);
      return exact.length === 1 ? { id: exact[0].id, ambiguous: false } : { id: null, ambiguous: true };
    };
    const customerByKey = new Map<string, Candidate[]>();
    for (const row of (await client.query(
      `SELECT id, name FROM companies WHERE is_customer = TRUE AND deleted_at IS NULL`,
    )).rows as Candidate[]) pushCandidate(customerByKey, normalizeForMatch(row.name), row);
    const vendorByKey = new Map<string, Candidate[]>();
    for (const row of (await client.query(
      `SELECT id, name FROM companies WHERE is_vendor = TRUE AND deleted_at IS NULL`,
    )).rows as Candidate[]) pushCandidate(vendorByKey, normalizeForMatch(row.name), row);

    // cache は「元の表記そのもの」をキーにする（正規化キーだと、同じ正規化キーに
    // 衝突する複数社のうち別々の完全一致名で呼ばれたとき、最初に解決した会社の結果を
    // 別の会社の名前に対しても返してしまう）。
    // ⚠️ キャッシュは「確定した一致（id あり）」だけを信じる。未一致・曖昧は
    // キャッシュしても再計算する — 同じ取込の中で別の表記（同じ正規化キー）から
    // 先に新規作成されると、customerByKey/vendorByKey の候補が増えて「未一致」
    // だった判定が「一致」や「曖昧」に変わりうるため（例: 元帳に「㈱ABC」と
    // 「(株)ABC」の両方があり、どちらも未登録だった場合。先に「㈱ABC」を作成すると
    // 「(株)ABC」は候補1件＝一致になるはずだが、未一致をキャッシュしたままだと
    // 見逃して2社目を重複作成してしまう）。
    function resolveCustomer(name: string): Resolution {
      const cached = cache.customers.get(name);
      if (cached?.id) return cached;
      const r = resolveCandidate(name, customerByKey.get(normalizeForMatch(name)));
      cache.customers.set(name, r); return r;
    }
    function resolveVendor(name: string): Resolution {
      const cached = cache.vendors.get(name);
      if (cached?.id) return cached;
      const r = resolveCandidate(name, vendorByKey.get(normalizeForMatch(name)));
      cache.vendors.set(name, r); return r;
    }
    async function findProjectByGls(gls: string) {
      if (cache.projects.has(gls)) return cache.projects.get(gls)!;
      // 改番済みの旧番号でも `project_numbers` 経由で引けるようにする（§4.10）。
      // これをしないと改番後の案件が「未登録マスタ」として誤って報告される。
      const r = await client.query(
        `SELECT id, customer_id FROM projects
          WHERE deleted_at IS NULL
            AND (gls_number=$1 OR id = (SELECT project_id FROM project_numbers WHERE number=$1))
          LIMIT 1`,
        [gls],
      );
      const v = r.rows[0] || null; cache.projects.set(gls, v); return v;
    }

    // マスタ照合レポート
    // ⚠️ ここで missingCustomers/missingVendors に載る名前は「未登録」と「表記の衝突で
    // 一意に決められない（曖昧）」の両方を含む。曖昧な方は createMasters を ON にしても
    // 自動作成されず、該当する売上・仕入は commit 時に必ずスキップされる
    // （ensureCustomer/ensureVendor 参照）。dry-run でこの区別まで見せておかないと、
    // 「投入したのに件数が減っていた（＝マーカー行を消したのに入れ直されなかった）」に
    // 気づけない。
    if (scopes.includes('revenues') || scopes.includes('purchases')) {
      const glsNeeded = new Set<string>([...rev.filter((x) => x.gls).map((x) => x.gls as string), ...pur.map((x) => x.gls as string)]);
      for (const g of glsNeeded) if (!(await findProjectByGls(g))) report.masters.missingProjects.push(g);

      const ambiguousNames: string[] = [];
      const custNeeded = new Set(rev.map((x) => x.customer_name));
      for (const c of custNeeded) {
        const r = resolveCustomer(c);
        if (!r.id) { report.masters.missingCustomers.push(c); if (r.ambiguous) ambiguousNames.push(c); }
      }
      if (scopes.includes('purchases')) {
        const vendorNeeded = new Set<string>([
          ...pur.map((x) => x.vendor_name),
          ...(excludeFixed ? [] : fixed.map((x) => x.vendor_name)),
        ]);
        for (const v of vendorNeeded) {
          const r = resolveVendor(v);
          if (!r.id) { report.masters.missingVendors.push(v); if (r.ambiguous) ambiguousNames.push(v); }
        }
      }

      const noGls = rev.filter((x) => !x.gls).length;
      if (noGls) warnings.push(`売上で GLS 未抽出 ${noGls} 件 (案件紐付け不可)`);
      if ((report.masters.missingProjects.length || report.masters.missingCustomers.length || report.masters.missingVendors.length) && !createMasters) {
        warnings.push('未登録マスタがあります。createMasters=true で自動作成します (dev)。');
      }
      if (ambiguousNames.length) {
        warnings.push(`表記の似た取引先・顧客が複数登録されていて一意に決められないものが ${ambiguousNames.length} 件あります（${ambiguousNames.slice(0, 10).join('、')}）。これらは「案件・顧客・取引先を自動で作る」をONにしても自動作成されず、該当する売上・仕入は投入時にスキップされます。取引先マスターを確認してから投入してください。`);
      }
    }

    // 重複候補チェック (既存の「決算インポート以外」の行に同一 金額+内容 が同月にあるか)
    // 仕訳帳は月末日付、手入力は実日付とズレるため、日付は「年月 (YYYY-MM)」で突合する。
    // dry-run でも実行し、誤って二重計上しないよう事前に警告する。
    const ym = (d: unknown): string => normDate(d).slice(0, 7);
    if (dateFrom && dateTo) {
      const dupSamples: string[] = [];
      const selfMarker = `${MARKER}%`; // 今回の取込分は自己重複と見なさず除外
      if (scopes.includes('sga') && sga.length) {
        const ex = await client.query(
          `SELECT amount, vendor_name, recognition_date FROM sga_expenses
           WHERE recognition_date >= $1 AND recognition_date <= $2
             AND (notes IS NULL OR notes NOT LIKE $3) AND deleted_at IS NULL`,
          [dateFrom, dateTo, selfMarker]
        );
        existSga = new Map();
        // 取引先名は完全一致ではなく normalizeForMatch で突き合わせる（全角/半角・
        // 連続空白等の表記ゆれで「重複ではない」と誤判定し、二重計上を見逃さないため）。
        for (const r of ex.rows) incKey(existSga, `${toInt(r.amount)}|${normalizeForMatch(r.vendor_name)}|${ym(r.recognition_date)}`);
        const budget = new Map(existSga); // 検出は複製で消費 (投入スキップと二重消費しない)
        for (const x of sga) {
          const k = `${x.amount}|${normalizeForMatch(x.vendor_name)}|${ym(x.date)}`;
          if ((budget.get(k) || 0) > 0) {
            budget.set(k, budget.get(k)! - 1); report.duplicates.sga++;
            if (dupSamples.length < 8) dupSamples.push(`[販管費] ${x.date} ${yen(x.amount)} ${x.vendor_name}`);
          }
        }
      }
      if (scopes.includes('revenues') && rev.length) {
        const ex = await client.query(
          `SELECT r.amount, p.gls_number, r.recognition_date FROM revenues r
           JOIN projects p ON p.id = r.project_id
           WHERE r.recognition_date >= $1 AND r.recognition_date <= $2
             AND (r.notes IS NULL OR r.notes NOT LIKE $3) AND r.deleted_at IS NULL`,
          [dateFrom, dateTo, selfMarker]
        );
        existRev = new Map();
        for (const r of ex.rows) incKey(existRev, `${toInt(r.amount)}|${String(r.gls_number || '').trim()}|${ym(r.recognition_date)}`);
        const budget = new Map(existRev);
        for (const x of rev) {
          if (!x.gls) continue;
          const k = `${x.amount}|${x.gls}|${ym(x.date)}`;
          if ((budget.get(k) || 0) > 0) {
            budget.set(k, budget.get(k)! - 1); report.duplicates.revenues++;
            if (dupSamples.length < 8) dupSamples.push(`[売上] ${x.date} ${yen(x.amount)} ${x.gls}`);
          }
        }
      }
      if (scopes.includes('purchases') && pur.length) {
        const ex = await client.query(
          `SELECT pu.amount, p.gls_number, pu.recognition_date FROM purchases pu
           JOIN projects p ON p.id = pu.project_id
           WHERE pu.recognition_date >= $1 AND pu.recognition_date <= $2
             AND (pu.notes IS NULL OR pu.notes NOT LIKE $3) AND pu.deleted_at IS NULL`,
          [dateFrom, dateTo, selfMarker]
        );
        existPur = new Map();
        for (const r of ex.rows) incKey(existPur, `${toInt(r.amount)}|${String(r.gls_number || '').trim()}|${ym(r.recognition_date)}`);
        const budget = new Map(existPur);
        for (const x of pur) {
          if (!x.gls) continue;
          const k = `${x.amount}|${x.gls}|${ym(x.date)}`;
          if ((budget.get(k) || 0) > 0) {
            budget.set(k, budget.get(k)! - 1); report.duplicates.purchases++;
            if (dupSamples.length < 8) dupSamples.push(`[仕入] ${x.date} ${yen(x.amount)} ${x.gls}`);
          }
        }
      }
      report.duplicates.samples = dupSamples;
      const dupTotal = report.duplicates.sga + report.duplicates.revenues + report.duplicates.purchases;
      if (dupTotal > 0) {
        const note = skipDuplicates
          ? '「重複候補をスキップ」がONのため、これらの行は投入されません。'
          : '手入力分との二重計上にご注意ください (「重複候補をスキップ」をONにすると投入を除外できます)。';
        warnings.push(`既存データに同一金額+内容の重複候補が ${dupTotal} 件あります (販管費 ${report.duplicates.sga} / 売上 ${report.duplicates.revenues} / 仕入 ${report.duplicates.purchases})。${note}`);
      }
    }

    if (!commit) { return report; }

    if (fallbackUser == null && (scopes.includes('revenues') || scopes.includes('purchases'))) {
      throw new Error('案件作成に必要な users が見つかりません。先に dev をシードしてください。');
    }

    const exec = execFromPgClient(client);
    // 同じ正規化キーに複数社が衝突していて完全一致でも決め切れない名前を、1回だけ
    // warnings に積む（同じ名前が何十行も出てきても知らせは1回にまとめるため）。
    function warnAmbiguousOnce(name: string) {
      if (ambiguousWarned.has(name)) return;
      ambiguousWarned.add(name);
      warnings.push(`「${name}」は表記の似た取引先・顧客が複数登録されており、一意に決められないため未登録として扱いました（新規作成もしていません）。取引先マスターをご確認ください。`);
    }
    async function ensureCustomer(name: string): Promise<string | null> {
      const r = resolveCustomer(name);
      if (r.id) return r.id;
      if (r.ambiguous) {
        warnAmbiguousOnce(name);
        if (!report.masters.missingCustomers.includes(name)) report.masters.missingCustomers.push(name);
        return null;
      }
      if (!createMasters) return null;
      // `companies` に行を作る（company-directory.service.ts）。
      // グループの印は社名から見立てる（migration 192）。決算取込は印を持たないので、
      // ここで入れないとこの会社の案件だけグループ外のまま残る。
      // `createCustomerRecord` は companies.id を返す。名前は正規化せず元の表記のまま保存する。
      const nid = await createCustomerRecord(
        { name, notes: MARKER, is_gmo_group: looksLikeGmoGroup(name) }, fallbackUser, exec,
      );
      // 同じ取込内の同名の別行が二重作成しないよう、cache（元の表記キー）と
      // customerByKey（正規化キー・候補配列）の両方に反映する。
      cache.customers.set(name, { id: nid, ambiguous: false });
      pushCandidate(customerByKey, normalizeForMatch(name), { id: nid, name });
      report.masters.created.customers++; return nid;
    }
    async function ensureVendor(name: string): Promise<string | null> {
      // resolveVendor はマスタ照合レポートの段階で既に呼ばれ結果がキャッシュ済みのはず
      // だが（cache は「元の表記そのもの」がキー）、念のためここでも解決する。
      const resolved = resolveVendor(name);
      if (resolved.id) return resolved.id;
      if (resolved.ambiguous) {
        // 同じ正規化キーに複数社が衝突していて決め切れない。誤って別会社に紐付けたり
        // 3社目を新規作成したりするより、この行をスキップする方が安全
        // （呼び出し元は id が null なら投入をスキップする）。
        warnAmbiguousOnce(name);
        return null;
      }
      if (!createMasters) return null;
      // `companies` に行を作る（company-directory.service.ts）。名前は元の表記のまま保存する。
      const key = normalizeForMatch(name);
      const id = await createVendorRecord({ name, notes: MARKER }, fallbackUser, exec);
      report.masters.created.vendors++;
      pushCandidate(vendorByKey, key, { id, name });
      cache.vendors.set(name, { id, ambiguous: false });
      return id;
    }
    async function ensureProject(key: string, name: string, customerId: string | null, isFixed = false): Promise<{ id: string; customer_id: string | null } | null> {
      const cacheKey = isFixed ? `__fixed__${key}` : key;
      // キャッシュ命中でも null (= マスタ照合フェーズで「未登録」と記録された値) の場合は
      // ここで作成を試みる必要があるため early-return しない (ensureCustomer/ensureVendor と同じ挙動)。
      const cached = cache.projects.get(cacheKey);
      if (cached) return cached;
      // 固定原価の疑似案件は code で引く（GLS/案件番号の概念を持たない）。
      // それ以外は gls_number に加え、改番済みの旧番号も `project_numbers` 経由で引く
      // （でないと同じ案件が新番号側で二重に作られてしまう。§4.10）
      const r = isFixed
        ? await client.query(
            `SELECT id, customer_id FROM projects WHERE code=$1 AND deleted_at IS NULL LIMIT 1`,
            [key],
          )
        : await client.query(
            `SELECT id, customer_id FROM projects
              WHERE deleted_at IS NULL
                AND (gls_number=$1 OR id = (SELECT project_id FROM project_numbers WHERE number=$1))
              LIMIT 1`,
            [key],
          );
      let p = r.rows[0] || null;
      if (!p) {
        if (!createMasters) { cache.projects.set(cacheKey, null); return null; }
        // projects.customer_id は NOT NULL。仕入専用 GLS など顧客不明の場合は
        // フォールバック顧客「(顧客不明)」を割り当てて作成する。
        const cid = customerId || (await ensureCustomer('(顧客不明)'));
        if (!cid) { cache.projects.set(cacheKey, null); return null; }

        // 失注・放置ネタの自動整理 (project-purge.service.ts) で論理削除された案件が、
        // 決算データ上はこの code/gls_number の実績を持っていた、というケースがある。
        // projects.code / gls_number は deleted_at を見ない素の UNIQUE 制約 (001b) のため、
        // 削除済み行を無視してこのまま INSERT すると "duplicate key value violates unique
        // constraint" で取込全体が失敗する。決算実績があるなら本来消すべきではなかった
        // 案件なので、新規作成ではなく復活させる (project-purge 自身も「動いたお金がある
        // 案件は残す」方針)。
        // 改番済み（旧GLS番号→SCS-/GSS-/GMO-）の案件がその後パージされている場合、
        // 元帳には退役した旧番号のまま残っていることがある。アクティブ検索
        // (このすぐ上の r クエリ・findProjectByGls) と同じく project_numbers
        // 経由でも引けるようにしないと、旧番号を永続的に持つはずの削除済み案件を
        // 見逃して重複案件を作ってしまう (Codex レビュー指摘・PR #713)。
        const dead = await client.query(
          isFixed
            ? `SELECT id, customer_id FROM projects WHERE code=$1 AND deleted_at IS NOT NULL LIMIT 1`
            : `SELECT id, customer_id FROM projects
                 WHERE (code=$1 OR gls_number=$1 OR id = (SELECT project_id FROM project_numbers WHERE number=$1))
                   AND deleted_at IS NOT NULL LIMIT 1`,
          [key],
        );
        if (dead.rows[0]) {
          const rid = dead.rows[0].id as string;
          // stage も新規作成パスと同じ 'a_won' に戻す。削除時点の stage
          // (e_lost・放置 neta) のままだと project-purge.service.ts の
          // PURGE_JUNK_STAGE_SQL に該当し続ける。決算取込で入る revenues は
          // invoice_issued を立てないため PURGE_HAS_MONEY_SQL の対象にもならず、
          // deleted_at だけ戻すと次回の自動整理でこの案件と今入れた売上が
          // また一緒に削除される (Codex レビュー指摘・PR #713)。
          await client.query(`UPDATE projects SET deleted_at = NULL, stage = 'a_won', updated_at = NOW() WHERE id = $1`, [rid]);
          p = { id: rid, customer_id: dead.rows[0].customer_id };
          report.masters.revivedProjects.push(key);
        } else {
          const id = randomUUID();
          await client.query(
            // 印は **`kessan_marker` の列**に入れる (migration 184)。
            // 以前は `notes` の先頭に `[kessan:2026-03]` と書いていたが、
            // メモをやり取りへ畳んだので `notes` の列そのものが無い。
            // 列に持つと、人が書いたメモと印を取り違えなくなる
            `INSERT INTO projects (id, code, entity_code, gls_number, name, customer_id, stage, assigned_to, kessan_marker, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,'a_won',$7,$8,$9)`,
            [id, key, CURRENT_ENTITY_CODE, isFixed ? null : key, name || key, cid, fallbackUser, period, fallbackUser]
          );
          p = { id, customer_id: cid };
          report.masters.created.projects++;
        }
      }
      cache.projects.set(cacheKey, p); return p;
    }

    await client.query('BEGIN');
    try {
      if (scopes.includes('sga')) {
        await client.query('DELETE FROM sga_expenses WHERE notes LIKE $1', [`${MARKER}%`]);
        for (const x of sga) {
          if (skipDuplicates && existSga) { const k = `${x.amount}|${normalizeForMatch(x.vendor_name)}|${ym(x.date)}`; if ((existSga.get(k) || 0) > 0) { existSga.set(k, existSga.get(k)! - 1); counts.dupSkipped++; continue; } }
          await client.query(
            `INSERT INTO sga_expenses (id, entity_code, billing_key, vendor_name, description, amount, tax_category,
               invoice_qualified, expense_type, source, recognition_date, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'spot','accounting',$9,$10,$11)`,
            [randomUUID(), CURRENT_ENTITY_CODE, `KESSAN-${period}-${x.no}`, x.vendor_name, x.description, x.amount, x.tax_category, x.invoice_qualified, x.date, `${MARKER} ${x.no}`, fallbackUser]
          );
          counts.sga++;
        }
      }
      if (scopes.includes('revenues')) {
        await client.query('DELETE FROM revenues WHERE notes LIKE $1', [`${MARKER}%`]);
        for (const x of rev) {
          if (skipDuplicates && x.gls && existRev) { const k = `${x.amount}|${x.gls}|${ym(x.date)}`; if ((existRev.get(k) || 0) > 0) { existRev.set(k, existRev.get(k)! - 1); counts.dupSkipped++; continue; } }
          if (!x.gls) { counts.skipped++; continue; }
          const customerId = await ensureCustomer(x.customer_name);
          if (!customerId) { counts.skipped++; continue; }
          const proj = await ensureProject(x.gls, x.project_name, customerId);
          if (!proj) { counts.skipped++; continue; }
          await client.query(
            `INSERT INTO revenues (id, billing_key, project_id, entity_code, customer_id, tax_category, amount, recognition_date, status, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10)`,
            [randomUUID(), `KESSAN-${period}-REV-${x.no}`, proj.id, CURRENT_ENTITY_CODE, proj.customer_id || customerId, x.tax_category, x.amount, x.date, `${MARKER} ${x.no} ${x.memo}`.slice(0, 240), fallbackUser]
          );
          counts.rev++;
        }
      }
      if (scopes.includes('purchases')) {
        await client.query('DELETE FROM purchases WHERE notes LIKE $1', [`${MARKER}%`]);
        for (const x of pur) {
          if (skipDuplicates && x.gls && existPur) { const k = `${x.amount}|${x.gls}|${ym(x.date)}`; if ((existPur.get(k) || 0) > 0) { existPur.set(k, existPur.get(k)! - 1); counts.dupSkipped++; continue; } }
          // 取引先を先に解決する。案件を先に作ってしまうと、取引先が曖昧で
          // この行がスキップされたときに「使われない空の案件」だけが残ってしまう。
          const vendorId = await ensureVendor(x.vendor_name);
          if (!vendorId) { counts.skipped++; continue; }
          const proj = await ensureProject(x.gls as string, x.gls as string, null);
          if (!proj) { counts.skipped++; continue; }
          await client.query(
            `INSERT INTO purchases (id, project_id, entity_code, vendor_id, tax_category, invoice_qualified, amount, description, recognition_date, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [randomUUID(), proj.id, CURRENT_ENTITY_CODE, vendorId, x.tax_category, x.invoice_qualified, x.amount, x.description, x.date, `${MARKER} ${x.no}${x.split > 1 ? ` (1/${x.split}按分)` : ''}`.slice(0, 240), fallbackUser]
          );
          counts.pur++;
        }
        if (!excludeFixed && fixed.length) {
          // 取引先を先にすべて解決しておく。1件も解決できないのに固定原価
          // プロジェクト・顧客だけ作ってしまう（誰にも使われない空のマスタが残る）
          // のを避けるため。
          const fixedVendorIds = new Map<string, string | null>();
          for (const x of fixed) {
            if (!fixedVendorIds.has(x.vendor_name)) fixedVendorIds.set(x.vendor_name, await ensureVendor(x.vendor_name));
          }
          const anyVendorResolved = [...fixedVendorIds.values()].some((v) => v != null);
          if (!anyVendorResolved) {
            warnings.push(`固定原価の取引先が1件も解決できないため、${fixed.length} 件スキップしました。`);
            counts.skipped += fixed.length;
          } else {
            const fixedCust = await ensureCustomer(FIXED_CUSTOMER);
            const fixedProj = fixedCust ? await ensureProject(FIXED_CODE, FIXED_NAME, fixedCust, true) : null;
            if (!fixedProj) { warnings.push(`固定原価プロジェクトを作成できません (createMasters 未指定?) → ${fixed.length} 件スキップ`); counts.skipped += fixed.length; }
            else {
              for (const x of fixed) {
                const vendorId = fixedVendorIds.get(x.vendor_name) ?? null;
                if (!vendorId) { counts.skipped++; continue; }
                await client.query(
                  `INSERT INTO purchases (id, project_id, entity_code, vendor_id, tax_category, invoice_qualified, amount, description, recognition_date, notes, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                  [randomUUID(), fixedProj.id, CURRENT_ENTITY_CODE, vendorId, x.tax_category, x.invoice_qualified, x.amount, x.description, x.date, `${MARKER} ${x.no} [固定原価]`.slice(0, 240), fallbackUser]
                );
                counts.pur++;
              }
            }
          }
        }
      }
      // 取込で作成/更新された案件の開催日 (event_start/event_end) を、紐づく売上/仕入の
      // 計上日 MIN/MAX で補完する (未設定の案件のみ)。日付が無いと案件一覧の期間絞り込み・
      // 日付ソートに乗らず、終了済みの旧案件が現行ビューに混ざり続けるため (migration 110 と同ロジック)。
      await client.query(
        `WITH d AS (
           SELECT p.id, MIN(x.d) AS dmin, MAX(x.d) AS dmax
           FROM projects p
           JOIN LATERAL (
             SELECT r.recognition_date AS d FROM revenues r
             WHERE r.project_id = p.id AND r.deleted_at IS NULL
               AND r.recognition_date IS NOT NULL AND r.recognition_date <> ''
             UNION ALL
             SELECT pu.recognition_date FROM purchases pu
             WHERE pu.project_id = p.id AND pu.deleted_at IS NULL
               AND pu.recognition_date IS NOT NULL AND pu.recognition_date <> ''
           ) x ON true
           WHERE p.deleted_at IS NULL
             AND p.kessan_marker IS NOT NULL
             AND (p.event_start IS NULL OR p.event_start = '')
           GROUP BY p.id
         )
         UPDATE projects p SET event_start = d.dmin, event_end = d.dmax, updated_at = NOW()
         FROM d WHERE p.id = d.id`,
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
    report.committed = { sga: counts.sga, revenues: counts.rev, purchases: counts.pur, skipped: counts.skipped, dupSkipped: counts.dupSkipped };
    if (report.masters.revivedProjects.length) {
      warnings.push(`失注等で削除されていましたが決算データに実績があったため ${report.masters.revivedProjects.length} 件の案件を復活させました（${report.masters.revivedProjects.join('、')}）。内容をご確認ください。`);
    }
    return report;
  } finally {
    client.release();
  }
}

// ============================================================
// 二重計上スクリーニング (過去データ含む・決算インポート行のみ削除候補)
// ============================================================
//
// 目的: 「手入力した行」と「決算インポートした行 (notes が [kessan:...])」が
//       同一取引で二重計上されているものを検出し、決算インポート側だけを削除する
//       (手入力は常に残す)。
//
// 突合キー: 金額 + GLS番号(売上/仕入) or 取引先名(販管費) + 計上年月(YYYY-MM)。
// 重要: 同一 GLS・同一月に同額の明細が複数正当に存在する (例: GLS-A004 に ¥110,000 が2件) ため、
//       グループを丸ごと削除してはならない。手入力 M 件・決算 D 件のグループでは、
//       min(M, D) 件の決算行だけを削除する (手入力に対応する分だけ間引く)。
//       手入力ゼロのグループ (決算のみ) は判別不能なので削除しない (誤削除防止)。

export interface DedupScreenOptions {
  scope?: 'sga' | 'revenues' | 'purchases' | 'all';
  commit?: boolean;
  monthFrom?: string; // YYYY-MM (任意)
  monthTo?: string;   // YYYY-MM (任意)
}
export interface DedupCandidate {
  table: 'revenues' | 'purchases' | 'sga';
  id: string;
  amount: number;
  key: string;   // GLS番号 or 取引先名
  month: string; // YYYY-MM
  label: string;      // 削除する決算行の表示
  keptLabel: string;  // 残す手入力行の表示
}
export interface DedupScreenReport {
  dryRun: boolean;
  targetDb: string;
  isProd: boolean;
  scopes: string[];
  monthFrom?: string;
  monthTo?: string;
  summary: {
    revenues: { count: number; amount: number };
    purchases: { count: number; amount: number };
    sga: { count: number; amount: number };
    total: { count: number; amount: number };
  };
  candidates: DedupCandidate[]; // 表示用 (先頭 300 件まで)
  truncated: boolean;
  deleted?: { revenues: number; purchases: number; sga: number; total: number };
}

const isKessanNotes = (notes: unknown): boolean => /^\s*\[kessan:/.test(String(notes ?? ''));

interface ScreenRow { id: string; amount: number; recognition_date: string; notes: string; created_at: string; key: string; label: string; taxCat: 'tax10' | 'tax8' | 'exempt' | 'nontax'; }

export async function screenKessanDuplicates(opts: DedupScreenOptions, _userId: string | null): Promise<DedupScreenReport> {
  const scope = opts.scope || 'all';
  const scopes = scope === 'all' ? ['revenues', 'purchases', 'sga'] : [scope];
  const commit = !!opts.commit;
  const monthFrom = /^\d{4}-\d{2}$/.test(opts.monthFrom || '') ? opts.monthFrom : undefined;
  const monthTo = /^\d{4}-\d{2}$/.test(opts.monthTo || '') ? opts.monthTo : undefined;
  const ymOf = (d: unknown): string => normDate(d).slice(0, 7);
  const inRange = (m: string): boolean => (!monthFrom || m >= monthFrom) && (!monthTo || m <= monthTo);

  const targetDb = String(process.env.DB_NAME || process.env.DATABASE_URL || '').toLowerCase();
  const isProd = targetDb.includes('prod') || targetDb.includes('production');

  const allCandidates: DedupCandidate[] = [];
  const byTable = { revenues: 0, purchases: 0, sga: 0 };
  const amtByTable = { revenues: 0, purchases: 0, sga: 0 };

  // グループ化 + ペアリング: (GLS/取引先 + 計上年月) でまとめ、決算行を手入力行に突き合わせる。
  // 手入力は税抜。決算行は「税抜(新取込)」または「税込(旧取込・v2.9.224以前)」の両方があり得るため、
  //   ①金額完全一致 → ②決算金額を税抜換算した値が手入力と一致、の2パスで突合する
  //   (税込 ¥5,024,517 の決算 ↔ 税抜 ¥4,567,743 の手入力 を拾う)。
  // 手入力の件数だけ決算を消費する (min(M,D)) ため、同一キー・同月の正当な複数明細は消しすぎない。
  // 手入力が無いグループ (決算のみ) は削除しない。
  const pair = (rows: ScreenRow[], table: DedupCandidate['table']) => {
    const groups = new Map<string, ScreenRow[]>();
    for (const r of rows) {
      const m = ymOf(r.recognition_date);
      if (!inRange(m)) continue;
      const gk = `${r.key}|${m}`;
      const g = groups.get(gk);
      if (g) g.push(r); else groups.set(gk, [r]);
    }
    const byCreated = (a: ScreenRow, b: ScreenRow) => String(a.created_at).localeCompare(String(b.created_at));
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      const manual = arr.filter((x) => !isKessanNotes(x.notes)).sort(byCreated);
      const decal = arr.filter((x) => isKessanNotes(x.notes)).sort(byCreated);
      if (manual.length === 0 || decal.length === 0) continue; // 手入力が無ければ削除しない

      // 手入力を「税抜金額 → 未消費キュー」に。決算行を金額でここから消費する。
      const manualQ = new Map<number, ScreenRow[]>();
      for (const mrow of manual) {
        const q = manualQ.get(mrow.amount);
        if (q) q.push(mrow); else manualQ.set(mrow.amount, [mrow]);
      }
      const take = (amt: number): ScreenRow | undefined => {
        const q = manualQ.get(amt);
        return q && q.length ? q.shift() : undefined;
      };
      // 税抜換算は Math.round のため freee の税抜額と ±1 ずれることがある (例 9,457,004÷1.1=8,597,276
      // だが公式税抜は 8,597,277)。パス2 のみ ±1 の許容で突合する。
      const takeNear = (target: number): ScreenRow | undefined => take(target) || take(target - 1) || take(target + 1);
      const matchedKept = new Map<string, ScreenRow>();
      const pending: ScreenRow[] = [];
      // パス1: 金額完全一致 (新取込=税抜 と 手入力=税抜、または 手入力が税込で入っている場合)
      for (const d of decal) {
        const kept = take(d.amount);
        if (kept) matchedKept.set(d.id, kept); else pending.push(d);
      }
      // パス2: 残った決算行 (旧取込=税込) を税抜換算 (±1 許容) して手入力と突合
      for (const d of pending) {
        const net = grossToNet(d.amount, d.taxCat);
        if (net === d.amount) continue; // 非課税等は換算しても同じ → パス1で拾えていなければ対象外
        const kept = takeNear(net);
        if (kept) matchedKept.set(d.id, kept);
      }
      for (const d of decal) {
        const kept = matchedKept.get(d.id);
        if (!kept) continue;
        byTable[table]++; amtByTable[table] += d.amount;
        allCandidates.push({
          table, id: d.id, amount: d.amount, key: d.key, month: ymOf(d.recognition_date),
          label: d.label, keptLabel: kept.label,
        });
      }
    }
  };

  const pool = getDb();
  const client: PoolClient = await pool.connect();
  try {
    if (scopes.includes('revenues')) {
      const r = await client.query(
        `SELECT r.id, r.amount, r.recognition_date, r.notes, r.created_at, r.tax_category, p.gls_number, c.name AS cname
         FROM revenues r JOIN projects p ON p.id = r.project_id LEFT JOIN companies c ON c.id = r.customer_id
         WHERE r.deleted_at IS NULL`
      );
      pair(r.rows.map((row): ScreenRow => ({
        id: row.id, amount: toInt(row.amount), recognition_date: row.recognition_date, notes: row.notes, created_at: row.created_at,
        taxCat: normalizeTaxCategory(row.tax_category),
        key: String(row.gls_number || ''),
        label: `${ymOf(row.recognition_date)} ${yen(toInt(row.amount))} ${row.gls_number || 'GLS?'} ${row.cname || ''}`.trim(),
      })), 'revenues');
    }
    if (scopes.includes('purchases')) {
      // Phase 3-3-9（`vendors` テーブル削除）以降、仕入先名は companies から
      // 直接読む（purchases.routes.ts と同じ理由）
      const r = await client.query(
        `SELECT pu.id, pu.amount, pu.recognition_date, pu.notes, pu.created_at, pu.tax_category, p.gls_number, vco.name AS vname
         FROM purchases pu JOIN projects p ON p.id = pu.project_id
         LEFT JOIN companies vco ON vco.id = pu.vendor_id
         WHERE pu.deleted_at IS NULL`
      );
      pair(r.rows.map((row): ScreenRow => ({
        id: row.id, amount: toInt(row.amount), recognition_date: row.recognition_date, notes: row.notes, created_at: row.created_at,
        taxCat: normalizeTaxCategory(row.tax_category),
        key: String(row.gls_number || ''),
        label: `${ymOf(row.recognition_date)} ${yen(toInt(row.amount))} ${row.gls_number || 'GLS無'} ${row.vname || ''}`.trim(),
      })), 'purchases');
    }
    if (scopes.includes('sga')) {
      const r = await client.query(
        `SELECT id, amount, recognition_date, notes, created_at, tax_category, vendor_name
         FROM sga_expenses WHERE deleted_at IS NULL`
      );
      pair(r.rows.map((row): ScreenRow => ({
        id: row.id, amount: toInt(row.amount), recognition_date: row.recognition_date, notes: row.notes, created_at: row.created_at,
        taxCat: normalizeTaxCategory(row.tax_category),
        key: String(row.vendor_name || ''),
        label: `${ymOf(row.recognition_date)} ${yen(toInt(row.amount))} ${row.vendor_name || ''}`.trim(),
      })), 'sga');
    }

    const report: DedupScreenReport = {
      dryRun: !commit, targetDb: process.env.DB_NAME || (isProd ? 'prod' : 'dev'), isProd, scopes, monthFrom, monthTo,
      summary: {
        revenues: { count: byTable.revenues, amount: amtByTable.revenues },
        purchases: { count: byTable.purchases, amount: amtByTable.purchases },
        sga: { count: byTable.sga, amount: amtByTable.sga },
        total: { count: allCandidates.length, amount: amtByTable.revenues + amtByTable.purchases + amtByTable.sga },
      },
      candidates: allCandidates.slice(0, 300),
      truncated: allCandidates.length > 300,
    };

    if (commit && allCandidates.length) {
      const ids = { revenues: [] as string[], purchases: [] as string[], sga: [] as string[] };
      for (const c of allCandidates) ids[c.table].push(c.id);
      const tableName: Record<string, string> = { revenues: 'revenues', purchases: 'purchases', sga: 'sga_expenses' };
      await client.query('BEGIN');
      try {
        const del = { revenues: 0, purchases: 0, sga: 0 };
        for (const t of ['revenues', 'purchases', 'sga'] as const) {
          if (!ids[t].length) continue;
          const res = await client.query(
            `UPDATE ${tableName[t]} SET deleted_at = NOW(), updated_at = NOW(),
               notes = COALESCE(notes, '') || ' [dedup-removed]'
             WHERE id = ANY($1) AND deleted_at IS NULL`,
            [ids[t]]
          );
          del[t] = res.rowCount || 0;
        }
        await client.query('COMMIT');
        report.deleted = { ...del, total: del.revenues + del.purchases + del.sga };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    return report;
  } finally {
    client.release();
  }
}
