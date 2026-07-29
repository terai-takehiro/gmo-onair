import { formatCurrency } from "@gmo-onair/shared/src/client/format";
import { aiOriginTitle } from "@gmo-onair/shared/src/client/aiAttribution";
/**
 * AI 活動フィード共通ヘルパー (v2.9.198+)
 * mcp_audit_log 由来のフィード項目を人間可読に整形する。
 * HomePage の AI 活動フィードと /sales/ai-activity の全画面ページで共用。
 */

export interface AiFeedItem {
  id: string;
  tool_name: string;
  result_summary: Record<string, unknown> | null;
  requested_by: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface AiFeedPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** MCP 書き込みツール名 → 日本語ラベル (登録順 = ワークフロー順) */
export const AI_TOOL_LABELS: Record<string, string> = {
  create_project: "案件を起票",
  update_project: "案件を更新",
  change_project_stage: "ステージ変更",
  issue_gls: "GLS 発番",
  create_customer: "顧客を登録",
  update_customer: "顧客を更新",
  create_activity_log: "活動記録を登録",
  update_activity_log: "活動記録を更新",
  create_task: "タスク作成",
  update_task: "タスク更新",
  create_studio_booking: "スタジオ予約を作成",
  set_project_simulation: "見積を作成",
  record_finance_doc: "見積・請求書を記録",
  record_inquiry: "問い合わせを記録",
  register_inview_attendee: "内覧会予約を登録",
  submit_ops_report: "レポート投稿",
  add_ops_report_items: "レポート行を追加",
};

/** result_summary から人間可読の対象名を抜き出す */
export function aiFeedSubject(rs: Record<string, unknown> | null): string {
  if (!rs) return "";
  const cand = [rs.name, rs.subject, rs.title, rs.code, rs.gls_number, rs.session_label, rs.doc_type];
  const v = cand.find((x) => typeof x === "string" && x);
  let s = (v as string) ?? "";
  if (rs.total != null && typeof rs.total === "number") s += `${s ? " " : ""}(合計 ${formatCurrency(Number(rs.total))})`;
  if (rs.status === "draft") s += "（下書き）";
  if (rs.idempotent) s += "（すでに登録済み）";
  return s;
}

/** フィード項目から案件詳細へのリンク先を導出 (無ければ null) */
export function aiFeedProjectLink(f: AiFeedItem): string | null {
  const rs = f.result_summary ?? {};
  if (f.tool_name === "create_project" && typeof rs.created_id === "string") return `/sales/projects/${rs.created_id}`;
  if (typeof rs.project_id === "string") return `/sales/projects/${rs.project_id}`;
  return null;
}

/**
 * ツールチップ用の補足。**人名は出さない。**
 *
 * このフィードは `mcp_audit_log` = AI が実行した記録だけを持つ表なので、
 * どの行も実行したのは AI。`actor_name` (MCP の接続に使ったユーザー) や
 * `requested_by` (AI が推測で書く自由記述) を出すと「この人が入れた」と
 * 読めてしまうため、代わりに**何をしたか**を出す (理由: aiAttribution.ts)。
 */
export function aiFeedActorDetail(f: AiFeedItem): string {
  return aiOriginTitle(AI_TOOL_LABELS[f.tool_name] ?? f.tool_name);
}

/** created_at → 相対時刻 (○分前/○時間前/○日前) */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
