// 待たせている行列 (§4.2 / §4.4) の型と共通ヘルパー
//
// 元データは GET /dashboard/inbox。並びは received_at 昇順 = 最も待たせているものが先頭。

export type InboxKind = "overdue_action" | "ai_project" | "inquiry" | "finance_doc";

export interface InboxItem {
  key: string;
  kind: InboxKind;
  received_at: string | null;
  meta: Record<string, unknown>;
}

/** 見積・請求の行に付く「同じ金額が既にある」の手がかり (二重計上の警告) */
export interface DuplicateSample {
  kind: "purchase" | "sga";
  gls_number: string | null;
  label: string;
  recognition_date: string | null;
}

export interface InboxData {
  items: InboxItem[];
  /** 行列が空のときだけ使う。0 のときは画面に出さない */
  done_last_7days?: number;
  checklist: { key: string; kind: "agreement"; meta: Record<string, unknown> }[];
  counts: {
    total: number;
    overdue_action: number;
    ai_project: number;
    inquiry: number;
    finance_doc: number;
    agreement: number;
  };
  dailyops: { visible: boolean; editable: boolean };
}

export const KIND_LABELS: Record<InboxKind, string> = {
  overdue_action: "期限超過",
  ai_project: "AI作成",
  inquiry: "問い合わせ",
  finance_doc: "見積・請求",
};

/** 種別バッジ。色は「何が起きているか」を示すだけで、優先順位は並び順が表す */
export const KIND_BADGE_CLASS: Record<InboxKind, string> = {
  overdue_action: "border-destructive/25 bg-destructive-surface text-destructive",
  ai_project: "border-ai-border bg-ai-surface text-ai",
  inquiry: "border-info/25 bg-accent text-info",
  finance_doc: "border-warning/30 bg-warning-surface text-warning-strong",
};

// ── 経過時間 (受信からの待ち時間) ────────────────────────────────
export function elapsedHours(receivedAt: string | null): number | null {
  if (!receivedAt) return null;
  const t = new Date(receivedAt).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

export function formatElapsed(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}分`;
  if (hours < 24) return `${Math.round(hours)}時間`;
  return `${Math.floor(hours / 24)}日`;
}

/** 行を閉じているときに出す次の一手。行を開くと「閉じる」に変わる */
export const KIND_CTA: Record<InboxKind, string> = {
  overdue_action: "片づける",
  ai_project: "確認する",
  inquiry: "返事をする",
  finance_doc: "内容を確認する",
};

/** 期限の引き直し候補。何月何日何時何分まで で書く (§2.5 ルール3) */
export function dueOption(days: number, hour: number): { date: string; label: string } {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return { date, label: `${md} ${hour}:00` };
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  quote: "見積書",
  invoice: "請求書",
  order: "注文書",
};

export const FD_STATUS_LABELS: Record<string, string> = {
  new: "受信",
  reviewing: "確認中",
  approved: "承認済み",
  rejected: "却下",
  processed: "処理完了",
};

export const yen = (v: unknown): string =>
  v == null || v === "" ? "—" : `¥${Number(v).toLocaleString()}`;

export const str = (v: unknown): string => (v == null ? "" : String(v));
