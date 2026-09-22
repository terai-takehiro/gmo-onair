/**
 * 営業活動記録（`/sales/activity-logs`）の型 (v4)
 *
 * サーバーは `any` に近い形で返す（`activity-logs.routes.ts`）。
 * 画面側で使う項目だけをここに1つ書き、各部品はこれを見る。
 */
import { localDateStr } from '@gmo-onair/shared/src/client/format';
import { eventDateLabel } from './eventDate';

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
  /**
   * 案件の実施日（任意）。**時系列の行に「どの案件の話か」を1行で出す**ために使う。
   * ⚠️ いまのサーバーの `GET /activity-logs` は返していないので `?` にしてある —
   * 来ていないときは実施日を出さないだけで、行の他の部分は今までどおり描ける
   * （サーバーに追加を申し送り済み）。
   */
  event_start?: string | null;
  /** 実施日の総数（0 = 未定）。`eventDateLabel` にそのまま渡す */
  event_day_count?: number | null;
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

/**
 * 新規フォームの初期値。**定数ではなく関数** — モジュール定数にすると活動日が
 * バンドル読込時に固定され、タブを開いたまま日付をまたぐと前日のままになる。
 * 日付は UTC ではなくローカル（`toISOString()` だと JST の 0:00〜9:00 は前日になる）。
 */
export function emptyForm(): FormData {
  return {
    project_id: '', customer_id: '', activity_type: 'call',
    activity_date: localDateStr(new Date()),
    duration_minutes: '', subject: '', description: '',
    next_action: '', next_action_date: '',
  };
}

/**
 * 時系列の行に出す1行（**案件名 ・ クライアント ・ 実施日**）。
 *
 * 利用者のご指摘「案件別に見られないと分からない」は案件別の並びで解きましたが、
 * **時系列のほうでも「どの案件の話か」が1行で分かる**必要があります
 * （旧実装は案件名か顧客名のどちらか片方だけでした）。
 * 実施日はサーバーが返してきたときだけ添える（`event_start` の説明を参照）。
 */
export function relatedLine(log: Pick<ActivityLogRow,
  'project_name' | 'customer_name' | 'event_start' | 'event_day_count'>): string {
  const parts = [log.project_name, log.customer_name].filter(Boolean) as string[];
  if (log.project_name && log.event_start) {
    parts.push(eventDateLabel(log.event_start, log.event_day_count));
  }
  return parts.length > 0 ? parts.join(' ・ ') : '案件・顧客のひも付けなし';
}

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

/** 「今日」はローカルで比べる（UTC だと JST の 0:00〜9:00 に期限切れが出遅れる） */
export function isOverdue(dateStr: string): boolean {
  return dateStr < localDateStr(new Date());
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
