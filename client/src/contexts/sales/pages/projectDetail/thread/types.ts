/**
 * 持ち帰り1件。**印は行き先ごとに別の鍵**です:
 *   `task_id` … 案件（GLS-A）でタスクにしたとき
 *   `ask_id`  … プロジェクト（GLS-B）で未確認事項にしたとき
 * どちらもサーバーが書き戻すもので、**あると二度作れません**。
 */
export interface MinutesOpenItem {
  text: string;
  owner?: string;
  due?: string;
  task_id?: string;
  ask_id?: string;
}

/** `GET /projects/:id/minutes` の1件 */
export interface Minutes {
  id: string;
  project_id: string;
  /** transcribing → draft / failed → confirmed */
  status: 'transcribing' | 'draft' | 'confirmed' | 'failed';
  error_message: string | null;
  title: string;
  met_on: string | null;
  attendees: string | null;
  /** 一覧では返ってこない（重いので詳細のときだけ）。押されたら取りに行く */
  transcript?: string | null;
  /**
   * 本文の文字数。**一覧でも返ってきます** — これが無いと画面は
   * 「文字起こしがあるのか」を知れず、「文字起こしを見る」を出せません
   * （本文の有無で判定していたので、一覧からは永久に出ませんでした）。
   */
  transcript_chars?: number | null;
  duration_sec: number | null;
  summary: string | null;
  /** 決まったこと。`quote` は文字起こしからの引用（**根拠が無いものは決定にしない**） */
  decisions: { text: string; quote?: string }[] | null;
  /**
   * 持ち帰り・未確認。`task_id` は**タスクにしたときにサーバーが書き戻す印**で、
   * これがあると二度作れない（画面のボタンを隠すだけでは、同時に開いた
   * 別の画面が古いままボタンを出す）
   */
  open_items: MinutesOpenItem[] | null;
  next_meeting: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface MinutesPatch {
  title?: string;
  summary?: string;
  attendees?: string | null;
  met_on?: string | null;
  next_meeting?: string | null;
  decisions?: { text: string; quote?: string }[];
  open_items?: MinutesOpenItem[];
  /** true で確定。**確定した時点でサーバーが差分を残す** */
  confirm?: boolean;
}

export interface MinutesResponse {
  data: Minutes[];
  /** この環境で文字起こしが使えるか。**押してから「使えません」を出さない**ため */
  stt_available: boolean;
  /** やり取りの整形（AI）が使えるか。**文字起こしとは別の鍵**で動く */
  ai_available?: boolean;
}
