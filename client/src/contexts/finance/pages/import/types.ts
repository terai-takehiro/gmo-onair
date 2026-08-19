/** ⑦ 取り込み（財務）が扱うデータの形 — 3つの取込元で共有する (v4) */

// ══ 精算 PDF（X-Point / 楽楽精算）══════════════════════════

export interface XpointParsed {
  xpNumber: string | null;
  kind: 'purchase' | 'sga' | 'unknown';
  subject: string | null;
  glsNumber: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  amountInclusive: number | null;
  paymentMethod: string | null;
  invoiceNumber: string | null;
  invoiceQualified: boolean;
  applicationDate: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  paymentDueDate: string | null;
  recognitionDate: string | null;
  description: string | null;
  detailLines: string[];
  account: string | null;
  applicantName: string | null;
  warnings: string[];
}

export interface RakurakuItem {
  no: number;
  date: string | null;
  taxLabel: string;
  taxCategory: string;
  body: string;
  amountInclusive: number;
  usage: string | null;
  kind: 'purchase' | 'sga' | 'unknown';
  glsNumber: string | null;
  description: string | null;
}

export interface RakurakuParsed {
  denpyoNumber: string | null;
  headerNumber: string | null;
  applicantName: string | null;
  applicationDate: string | null;
  totalInclusive: number | null;
  items: RakurakuItem[];
  warnings: string[];
}

/** 1 単位 = 仕入 or 販管費の 1 レコード。楽楽精算は 1 伝票が複数単位に割れる */
export interface RegistrationUnit {
  kind: 'purchase' | 'sga' | 'unknown';
  glsNumber: string | null;
  taxCategory: 'tax10' | 'tax8' | 'exempt';
  amountInclusive: number;
  amountExclusive: number;
  description: string | null;
  recognitionDate: string | null;
  itemNos: number[];
  project: { id: string; name: string; gls_number: string } | null;
}

export interface VendorMatch { id: string; name: string; matched_by: string }
export interface DuplicateRow {
  id: string;
  amount: number;
  recognition_date: string | null;
  vendor_name: string | null;
  description: string | null;
}

/**
 * 読み取りの確からしさ。**AI のスコアではありません** —
 * 「台帳に入れるのに要る項目のうち何個読めたか」を数えたものです
 * (`server/.../xpoint-parse.service.ts` の `scoreXpoint` / `scoreRakuraku`)。
 * 同じ PDF なら必ず同じ数字になります。
 */
export interface ParseScore {
  score: number;
  filled: number;
  total: number;
  /** 読めなかった項目の名前。**% だけでは何を直せばよいか分からない** */
  missing: string[];
}

export interface XpointParseResult {
  score: ParseScore;
  format: 'xpoint' | 'rakuraku';
  settlementMethod: 'xpoint' | 'rakuraku';
  settlementNumber: string | null;
  parsed: XpointParsed | null;
  voucher: RakurakuParsed | null;
  units: RegistrationUnit[];
  warnings: string[];
  match: { vendor: VendorMatch | null; vendorCandidates: VendorMatch[] };
  duplicates: { purchases: DuplicateRow[]; sga: DuplicateRow[] };
  parsedAt: string;
}

export interface RegisteredRecord {
  table: string;
  id: string;
  kind: string;
  unit_index: number | null;
  amount: number;
  at: string;
}

export type XpointStatus = 'new' | 'parsed' | 'registered' | 'skipped' | 'error';

export interface XpointFileRow {
  id: number;
  box_file_id: string;
  file_name: string;
  box_modified_at: string | null;
  xp_number: string | null;
  kind: string;
  format: 'xpoint' | 'rakuraku' | 'unknown';
  status: XpointStatus;
  parsed_data: XpointParseResult | null;
  error_message: string | null;
  registered_table: string | null;
  registered_id: string | null;
  registered_records: RegisteredRecord[] | null;
}

/** 受注確定済みでも案件分類未設定の古いデータでは gls_number が空のことがある（v4.1.8） */
export interface ProjectOption { id: string; gls_number: string | null; name: string }

/**
 * 状態の色。**意味で決める**（画面ごとに変えない）。
 * 生の Tailwind パレット（`bg-slate-100` 等）ではなくトークンを使う —
 * v4 の色は `tokens-v4.css` で切り替わるので、直書きするとここだけ取り残される。
 */
export const XPOINT_STATUS: Record<XpointStatus, { label: string; tone: string }> = {
  new: { label: '未解析', tone: 'border-transparent bg-muted text-muted-foreground' },
  parsed: { label: 'レビュー待ち', tone: 'border-transparent bg-info-surface text-info' },
  registered: { label: '登録済み', tone: 'border-transparent bg-success-surface text-success' },
  skipped: { label: 'スキップ', tone: 'border-transparent bg-warning-surface text-warning' },
  error: { label: 'エラー', tone: 'border-transparent bg-destructive-surface text-destructive' },
};

/** `X-` / `楽-` の頭。精算番号の見た目を1か所にする */
export function settlementPrefix(format: string): string {
  return format === 'rakuraku' ? '楽' : 'X';
}

// ══ 総勘定元帳（決算インポート）══════════════════════════

export type ImportScope = 'sga' | 'revenues' | 'purchases' | 'all';

export interface KessanReport {
  dryRun: boolean;
  period: string;
  dateRange: { from: string; to: string; months: string[] };
  targetDb: string;
  isProd: boolean;
  scopes: string[];
  sourceFile?: string;
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
  duplicates: { sga: number; revenues: number; purchases: number; samples: string[] };
  samples: { sga: string[]; revenues: string[]; purchases: string[] };
  committed?: { sga: number; revenues: number; purchases: number; skipped: number; dupSkipped: number };
  warnings: string[];
}

// ══ 二重計上を調べる ══════════════════════════════════════

export interface DedupCandidate {
  table: 'revenues' | 'purchases' | 'sga';
  id: string;
  amount: number;
  key: string;
  month: string;
  label: string;
  keptLabel: string;
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
  candidates: DedupCandidate[];
  truncated: boolean;
  deleted?: { revenues: number; purchases: number; sga: number; total: number };
}

export const TABLE_LABEL: Record<string, string> = {
  revenues: '売上', purchases: '仕入', sga: '販管費',
};
