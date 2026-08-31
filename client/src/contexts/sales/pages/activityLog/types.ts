/**
 * 営業活動記録（`/sales/activity-logs`）の型 (v4)
 *
 * サーバーは `any` に近い形で返す（`activity-logs.routes.ts`）。
 * 画面側で使う項目だけをここに1つ書き、各部品はこれを見る。
 */
export interface ActivityLogRow {
  id: string;
  activity_type: string;
  activity_date: string;
  duration_minutes: number | null;
  subject: string;
  description: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_done_at: string | null;
  /**
   * **機械が閉じた理由**（migration 245）。`null` = 人が「完了」を押した、または未対応。
   * 値は `project_lost`（失注）/ `project_completed`（完了）。
   * 画面はこれを見て「対応済み」ではなく**何が起きたか**を出す（`autoClosedLabel`）。
   */
  next_action_auto_closed_reason: string | null;
  project_id: string | null;
  project_name: string | null;
  project_gls: string | null;
  project_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  user_name: string | null;
  is_ai_created: boolean;
  ai_requested_by: string | null;
  source_channel: string | null;
  message_id: string | null;
}

export interface FormData {
  project_id: string;
  customer_id: string;
  activity_type: string;
  activity_date: string;
  duration_minutes: string;
  subject: string;
  description: string;
  next_action: string;
  next_action_date: string;
}

export const EMPTY_FORM: FormData = {
  project_id: '', customer_id: '', activity_type: 'call',
  activity_date: new Date().toISOString().split('T')[0]!,
  duration_minutes: '', subject: '', description: '',
  next_action: '', next_action_date: '',
};

/** 活動の紐づけ先（案件名 > 顧客名）— 内部コードではなく人が読める名前を出す */
export function relatedName(log: Pick<ActivityLogRow, 'project_name' | 'customer_name'>): string | null {
  return log.project_name || log.customer_name || null;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** `YYYY-MM-DD` → `8/2(水)`。列幅が狭いので曜日1文字だけ添える */
export function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function isOverdue(dateStr: string): boolean {
  return dateStr < new Date().toISOString().split('T')[0]!;
}

/**
 * 「済み」の**理由**を人の言葉にする（migration 245）。
 *
 * ⚠️ **機械が閉じたものを「対応済み」と書かないこと。** 誰も片づけていないのに
 * 片づけたと書くのは嘘で、しかも**閉じた理由が分からないと開き直す判断もできません**
 * （案件を失注から戻せば自動で開き直る、ということが画面から読めない）。
 *
 * `null` を返したときは**人が押した完了**なので、呼ぶ側は従来どおり「対応済み」。
 * 知らない値も `null` に落とす — 増えた値をここに書き忘れても、
 * 画面が壊れるのではなく従来の表示に戻るだけで済む。
 */
export function autoClosedLabel(reason: string | null | undefined): string | null {
  if (reason === 'project_lost') return '失注により終了';
  if (reason === 'project_completed') return '完了により終了';
  return null;
}
