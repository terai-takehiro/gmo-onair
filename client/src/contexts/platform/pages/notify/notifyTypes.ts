/** ⑦ 通知とテンプレート で使う形（v4 設定） */

export interface Template {
  id: string;
  name: string;
  /** いつ送るか（人が読む文。判定には使わない） */
  trigger: string;
  audience: 'internal' | 'external';
  channel: 'mail' | 'inapp';
  send_to: string;
  subject: string;
  body: string;
  /** `{案件名}` のような差し込み語 */
  vars: string[];
  /** 自動で出すか。**社外は常に false**（v4 に送信の経路が無い） */
  enabled: boolean;
  sort_order: number;
}

export interface JobRun {
  job_key: string;
  run_date: string;
  started_at: string;
  finished_at: string | null;
  created: number;
  error: string | null;
}

/**
 * 定時実行の1本（サーバーの `SCHEDULER_JOBS`）。
 *
 * `sendTo` / `cadence` は**人が読む文**で、判定には使わない（宛先と頻度を決めるのは
 * サーバーの各ジョブのコード）。画面に出すのは、**どの通知が誰に・どのくらいの頻度で
 * 出るかが設定画面から読めないと、通知を減らしたことが誰にも伝わらない**ため。
 */
export interface SchedulerJob {
  key: string;
  at: string;
  /** ひな形の id。**`null` = 通知を出さない裏方の仕事** */
  templateId: string | null;
  sendTo: string;
  cadence: string;
}

export interface NotifyResponse {
  templates: Template[];
  runs: JobRun[];
  /** ひな形ごとに実際に出した社内通知の件数。**モックのサンプル値は使わない** */
  counts: { template_id: string; n: number }[];
  jobs: SchedulerJob[];
}
