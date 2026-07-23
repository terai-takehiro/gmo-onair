/**
 * kessan-import.service.ts — 決算データ取込 (検証DB専用)
 *
 * freee の総勘定元帳 CSV (Box 格納) を ONAiR の予算管理/案件管理テーブルへ取り込む。
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
import * as XLSX from 'xlsx';
import { getDb } from '../../../shared/db/connection';
import { getBoxClient } from '../../../shared/services/box';

export const DEFAULT_GL_FILE_ID = '2285559397453'; // 総勘定元帳_20260507_1652.csv
const FIXED_CODE = 'FIXED-COGS';
const FIXED_NAME = '固定原価（スタジオ償却負担額等）';
const FIXED_CUSTOMER = '（固定費・社内）';

export interface KessanOptions {
  scope?: 'sga' | 'revenues' | 'purchases' | 'all';
  commit?: boolean;
  createMasters?: boolean;
  excludeFixed?: boolean;
  /** 重複候補 (既存データと同一 金額+内容+日付) の行を投入しない */
  skipDuplicates?: boolean;
  glFileId?: string;
  boxFolderId?: string; // 指定フォルダ内の最新CSVを自動選択 (未指定なら env KESSAN_BOX_FOLDER_ID)
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
    created: { projects: number; customers: number; vendors: number };
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
// GLS 番号トークン: 新形式 GLS-A004 / GLS-B005 と 旧形式 GLS137 / GLS149,150 の両対応
const GLS_TOKEN_RE = /GLS-[A-Z]\d+|GLS\d+(?:,\d+)*/g;
function parseGls(memo: unknown): string[] {
  const out: string[] = [];
  const re = new RegExp(GLS_TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(memo ?? '')))) {
    const tok = m[0];
    if (tok.includes(',')) {
      // 旧コンマ列挙 (GLS149,150,151) → GLS149 / GLS150 / GLS151
      for (const n of tok.slice(3).split(',')) out.push('GLS' + n.trim());
    } else {
      out.push(tok); // GLS-A004 / GLS137
    }
  }
  return [...new Set(out)];
}
function stripGlsName(memo: unknown): string {
  const nm = String(memo ?? '')
    .replace(/(仕入|売上)?GLS-[A-Z]\d+/g, '')
    .replace(/(仕入|売上)?GLS\d+(?:,\d+)*/g, '')
    .replace(/XP\d+/g, '')
    .replace(/^[\s/、,･・]+/, '')
    .replace(/[\s/、,･・]+$/, '')
    .trim();
  return (nm || String(memo ?? '').trim()).slice(0, 80);
}
function mapTax(z: unknown): 'tax10' | 'tax8' | 'exempt' {
  const s = String(z ?? '');
  if (s.includes('8%') || s.includes('軽')) return 'tax8';
  if (s.includes('対象外') || s.includes('非課税') || s.includes('不課税')) return 'exempt';
  return 'tax10';
}
/**
 * 税込金額 → 税抜金額。freee 仕訳帳 (税込経理入力) の P/L 行金額は税込のため、
 * ONAiR が保持する税抜額に換算する (税区分で 10%/8% を除算・非課税/対象外はそのまま)。
 * 負数 (逆仕訳) も対応。
 */
function grossToNet(gross: number, taxCat: 'tax10' | 'tax8' | 'exempt'): number {
  if (taxCat === 'tax10') return Math.round(gross / 1.1);
  if (taxCat === 'tax8') return Math.round(gross / 1.08);
  return gross;
}
const invQualified = (...xs: unknown[]): number => {
  const s = xs.map((x) => String(x ?? '')).join(' ');
  return (s.includes('80%') || s.includes('非適格') || s.includes('50%')) ? 0 : 1;
};
const yen = (n: number): string => '¥' + Number(n).toLocaleString();

/** 取込対象の GL ファイルを解決: 明示ID → 指定フォルダの最新CSV → 既定ID */
async function resolveGlFile(opts: KessanOptions): Promise<{ id: string; name: string }> {
  if (opts.glFileId) {
    // 指定ファイルの実ファイル名を取得 (エラーメッセージ/レポートで役立つ)。取得失敗は無視。
    let name = '(指定ファイル)';
    try {
      const client = getBoxClient();
      if (client) {
        const info = await client.files.get(opts.glFileId, { fields: 'name' });
        if (info?.name) name = info.name;
      }
    } catch { /* best-effort */ }
    return { id: opts.glFileId, name };
  }
  const folderId = opts.boxFolderId || process.env.KESSAN_BOX_FOLDER_ID;
  if (folderId) {
    const client = getBoxClient();
    if (!client) throw new Error('BOX が未設定です (BOX_CONFIG_JSON)');
    const items = await client.folders.getItems(folderId, { fields: 'id,name,type,created_at', limit: 1000 });
    const csvs = items.entries.filter((e) => e.type === 'file' && /\.csv$/i.test(e.name));
    if (!csvs.length) throw new Error(`Box フォルダ (${folderId}) に CSV ファイルがありません`);
    // 取引明細 (仕訳帳/総勘定元帳) を優先。損益計算書/残高試算表 (集計表) は取込不可のため後回し。
    // 最新 (created_at 降順、同点はファイル名降順) を採用。
    const preferred = csvs.filter((e) => /仕訳|元帳|総勘定/.test(e.name));
    const pool = preferred.length ? preferred : csvs;
    pool.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.name).localeCompare(String(a.name)));
    return { id: pool[0].id, name: pool[0].name };
  }
  return { id: DEFAULT_GL_FILE_ID, name: '(既定の総勘定元帳)' };
}

async function boxDownloadBuf(fileId: string): Promise<Buffer> {
  const client = getBoxClient();
  if (!client) throw new Error('BOX が未設定です (BOX_CONFIG_JSON)');
  const stream = await client.files.getReadStream(fileId);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return Buffer.concat(chunks);
}

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
  const m = s.match(/GLS\d+(?=\s*[｢「])/); // 旧形式の鍵括弧直前を優先
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
function extractMoneyForwardXlsx(buf: Buffer, warnings: string[]): Extracted {
  const wb = XLSX.read(buf, { type: 'buffer' });
  let H: Record<string, number> | null = null;
  let body: string[][] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
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

  // --- Box から GL 取得 → 形式判定 (xlsx=MoneyForward / CSV=freee) → 抽出 ---
  const glFile = await resolveGlFile(opts);
  const buf = await boxDownloadBuf(glFile.id);
  const isXlsx = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b; // 'PK' (zip) = xlsx
  const sourceFmt = isXlsx ? 'MoneyForward (xlsx)' : 'freee (CSV)';
  const { sga, rev, pur, fixed } = isXlsx
    ? extractMoneyForwardXlsx(buf, warnings)
    : extractFreeeCsv(decodeCsv(buf), glFile.name, warnings);

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
    dryRun: !commit, period, dateRange, targetDb: process.env.DB_NAME || (isProd ? 'prod' : 'dev'), isProd, scopes, sourceFile: `${glFile.name}（${sourceFmt}）`,
    summary: {
      sga: { count: sga.length, amount: sum(sga) },
      revenues: { count: rev.length, amount: sum(rev) },
      purchases: { count: pur.length, amount: sum(pur) },
      fixedCogs: { count: fixed.length, amount: sum(fixed), routed: excludeFixed ? '除外' : `${FIXED_NAME} (${FIXED_CODE})` },
    },
    masters: { missingProjects: [], missingCustomers: [], created: { projects: 0, customers: 0, vendors: 0 } },
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

    const cache = { customers: new Map<string, string | null>(), vendors: new Map<string, string | null>(), projects: new Map<string, { id: string; customer_id: string | null } | null>() };
    const counts = { sga: 0, rev: 0, pur: 0, skipped: 0, dupSkipped: 0 };
    // 重複候補チェックで作った「既存キー」集合 (skipDuplicates 時に投入をスキップするのに使う)
    let dupSetSga: Set<string> | undefined;
    let dupSetRev: Set<string> | undefined;
    let dupSetPur: Set<string> | undefined;

    async function findCustomer(name: string) {
      if (cache.customers.has(name)) return cache.customers.get(name)!;
      const r = await client.query('SELECT id FROM customers WHERE name=$1 AND deleted_at IS NULL LIMIT 1', [name]);
      const id = r.rows[0]?.id || null; cache.customers.set(name, id); return id;
    }
    async function findProjectByGls(gls: string) {
      if (cache.projects.has(gls)) return cache.projects.get(gls)!;
      const r = await client.query('SELECT id, customer_id FROM projects WHERE gls_number=$1 AND deleted_at IS NULL LIMIT 1', [gls]);
      const v = r.rows[0] || null; cache.projects.set(gls, v); return v;
    }

    // マスタ照合レポート
    if (scopes.includes('revenues') || scopes.includes('purchases')) {
      const glsNeeded = new Set<string>([...rev.filter((x) => x.gls).map((x) => x.gls as string), ...pur.map((x) => x.gls as string)]);
      for (const g of glsNeeded) if (!(await findProjectByGls(g))) report.masters.missingProjects.push(g);
      const custNeeded = new Set(rev.map((x) => x.customer_name));
      for (const c of custNeeded) if (!(await findCustomer(c))) report.masters.missingCustomers.push(c);
      const noGls = rev.filter((x) => !x.gls).length;
      if (noGls) warnings.push(`売上で GLS 未抽出 ${noGls} 件 (案件紐付け不可)`);
      if ((report.masters.missingProjects.length || report.masters.missingCustomers.length) && !createMasters) {
        warnings.push('未登録マスタがあります。createMasters=true で自動作成します (dev)。');
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
        dupSetSga = new Set(ex.rows.map((r) => `${toInt(r.amount)}|${String(r.vendor_name || '').trim()}|${ym(r.recognition_date)}`));
        for (const x of sga) {
          if (dupSetSga.has(`${x.amount}|${x.vendor_name}|${ym(x.date)}`)) {
            report.duplicates.sga++;
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
        dupSetRev = new Set(ex.rows.map((r) => `${toInt(r.amount)}|${String(r.gls_number || '').trim()}|${ym(r.recognition_date)}`));
        for (const x of rev) {
          if (x.gls && dupSetRev.has(`${x.amount}|${x.gls}|${ym(x.date)}`)) {
            report.duplicates.revenues++;
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
        dupSetPur = new Set(ex.rows.map((r) => `${toInt(r.amount)}|${String(r.gls_number || '').trim()}|${ym(r.recognition_date)}`));
        for (const x of pur) {
          if (x.gls && dupSetPur.has(`${x.amount}|${x.gls}|${ym(x.date)}`)) {
            report.duplicates.purchases++;
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

    async function ensureCustomer(name: string): Promise<string | null> {
      const id = await findCustomer(name);
      if (id) return id;
      if (!createMasters) return null;
      const nid = randomUUID();
      await client.query('INSERT INTO customers (id, name, notes, created_by) VALUES ($1,$2,$3,$4)', [nid, name, MARKER, fallbackUser]);
      cache.customers.set(name, nid); report.masters.created.customers++; return nid;
    }
    async function ensureVendor(name: string): Promise<string | null> {
      if (cache.vendors.has(name)) { const c = cache.vendors.get(name)!; if (c) return c; }
      const r = await client.query('SELECT id FROM vendors WHERE name=$1 AND deleted_at IS NULL LIMIT 1', [name]);
      let id: string | null = r.rows[0]?.id || null;
      if (!id && createMasters) {
        id = randomUUID();
        await client.query('INSERT INTO vendors (id, name, notes, created_by) VALUES ($1,$2,$3,$4)', [id, name, MARKER, fallbackUser]);
        report.masters.created.vendors++;
      }
      cache.vendors.set(name, id); return id;
    }
    async function ensureProject(key: string, name: string, customerId: string | null, isFixed = false): Promise<{ id: string; customer_id: string | null } | null> {
      const cacheKey = isFixed ? `__fixed__${key}` : key;
      // キャッシュ命中でも null (= マスタ照合フェーズで「未登録」と記録された値) の場合は
      // ここで作成を試みる必要があるため early-return しない (ensureCustomer/ensureVendor と同じ挙動)。
      const cached = cache.projects.get(cacheKey);
      if (cached) return cached;
      const col = isFixed ? 'code' : 'gls_number';
      const r = await client.query(`SELECT id, customer_id FROM projects WHERE ${col}=$1 AND deleted_at IS NULL LIMIT 1`, [key]);
      let p = r.rows[0] || null;
      if (!p) {
        if (!createMasters) { cache.projects.set(cacheKey, null); return null; }
        // projects.customer_id は NOT NULL。仕入専用 GLS など顧客不明の場合は
        // フォールバック顧客「(顧客不明)」を割り当てて作成する。
        const cid = customerId || (await ensureCustomer('(顧客不明)'));
        if (!cid) { cache.projects.set(cacheKey, null); return null; }
        const id = randomUUID();
        await client.query(
          `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, assigned_to, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,'a_won',$6,$7,$8)`,
          [id, key, isFixed ? null : key, name || key, cid, fallbackUser, MARKER, fallbackUser]
        );
        p = { id, customer_id: cid };
        report.masters.created.projects++;
      }
      cache.projects.set(cacheKey, p); return p;
    }

    await client.query('BEGIN');
    try {
      if (scopes.includes('sga')) {
        await client.query('DELETE FROM sga_expenses WHERE notes LIKE $1', [`${MARKER}%`]);
        for (const x of sga) {
          if (skipDuplicates && dupSetSga?.has(`${x.amount}|${x.vendor_name}|${ym(x.date)}`)) { counts.dupSkipped++; continue; }
          await client.query(
            `INSERT INTO sga_expenses (id, billing_key, vendor_name, description, amount, tax_category,
               invoice_qualified, expense_type, source, recognition_date, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'spot','accounting',$8,$9,$10)`,
            [randomUUID(), `KESSAN-${period}-${x.no}`, x.vendor_name, x.description, x.amount, x.tax_category, x.invoice_qualified, x.date, `${MARKER} ${x.no}`, fallbackUser]
          );
          counts.sga++;
        }
      }
      if (scopes.includes('revenues')) {
        await client.query('DELETE FROM revenues WHERE notes LIKE $1', [`${MARKER}%`]);
        for (const x of rev) {
          if (skipDuplicates && x.gls && dupSetRev?.has(`${x.amount}|${x.gls}|${ym(x.date)}`)) { counts.dupSkipped++; continue; }
          if (!x.gls) { counts.skipped++; continue; }
          const customerId = await ensureCustomer(x.customer_name);
          if (!customerId) { counts.skipped++; continue; }
          const proj = await ensureProject(x.gls, x.project_name, customerId);
          if (!proj) { counts.skipped++; continue; }
          await client.query(
            `INSERT INTO revenues (id, billing_key, project_id, customer_id, tax_category, amount, recognition_date, status, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',$8,$9)`,
            [randomUUID(), `KESSAN-${period}-REV-${x.no}`, proj.id, proj.customer_id || customerId, x.tax_category, x.amount, x.date, `${MARKER} ${x.no} ${x.memo}`.slice(0, 240), fallbackUser]
          );
          counts.rev++;
        }
      }
      if (scopes.includes('purchases')) {
        await client.query('DELETE FROM purchases WHERE notes LIKE $1', [`${MARKER}%`]);
        for (const x of pur) {
          if (skipDuplicates && x.gls && dupSetPur?.has(`${x.amount}|${x.gls}|${ym(x.date)}`)) { counts.dupSkipped++; continue; }
          const proj = await ensureProject(x.gls as string, x.gls as string, null);
          if (!proj) { counts.skipped++; continue; }
          const vendorId = await ensureVendor(x.vendor_name);
          if (!vendorId) { counts.skipped++; continue; }
          await client.query(
            `INSERT INTO purchases (id, project_id, vendor_id, tax_category, invoice_qualified, amount, description, recognition_date, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [randomUUID(), proj.id, vendorId, x.tax_category, x.invoice_qualified, x.amount, x.description, x.date, `${MARKER} ${x.no}${x.split > 1 ? ` (1/${x.split}按分)` : ''}`.slice(0, 240), fallbackUser]
          );
          counts.pur++;
        }
        if (!excludeFixed && fixed.length) {
          const fixedCust = await ensureCustomer(FIXED_CUSTOMER);
          const fixedProj = fixedCust ? await ensureProject(FIXED_CODE, FIXED_NAME, fixedCust, true) : null;
          if (!fixedProj) { warnings.push(`固定原価プロジェクトを作成できません (createMasters 未指定?) → ${fixed.length} 件スキップ`); counts.skipped += fixed.length; }
          else {
            for (const x of fixed) {
              const vendorId = await ensureVendor(x.vendor_name);
              if (!vendorId) { counts.skipped++; continue; }
              await client.query(
                `INSERT INTO purchases (id, project_id, vendor_id, tax_category, invoice_qualified, amount, description, recognition_date, notes, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [randomUUID(), fixedProj.id, vendorId, x.tax_category, x.invoice_qualified, x.amount, x.description, x.date, `${MARKER} ${x.no} [固定原価]`.slice(0, 240), fallbackUser]
              );
              counts.pur++;
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
             AND p.notes LIKE '[kessan:%'
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
    return report;
  } finally {
    client.release();
  }
}
