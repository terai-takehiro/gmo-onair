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

export interface NotifyResponse {
  templates: Template[];
  runs: JobRun[];
  /** ひな形ごとに実際に出した社内通知の件数。**モックのサンプル値は使わない** */
  counts: { template_id: string; n: number }[];
  jobs: { key: string; at: string; templateId: string }[];
}
