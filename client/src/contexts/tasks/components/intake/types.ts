/**
 * 投入口の型と、行き先の見せ方（v4 で投入口を1本化した回）
 *
 * ── 行き先はサーバーが決め、画面は「見せ方」だけを持つ ──────────
 *
 * `dest` の値（`task` / `neta` / `log` / `minutes`）は
 * `server/src/contexts/tasks/services/intake-parser.service.ts` が正です。
 * ここに増やしてもサーバーは知らないので、**片方だけ足さないこと**
 * （知らない `dest` はサーバーが `task` に倒します）。
 */

export type Dest = 'task' | 'neta' | 'log' | 'minutes';

/**
 * 行き先の札。**「どのデータに入るか」を必ず添える** —
 * 「案件（ネタ）」だけだと、押した人には何が起きるのか分かりません。
 */
export const DEST_INFO: Record<Dest, { label: string; into: string; tone: string }> = {
  task: {
    label: 'タスク',
    into: '自分たちのやること',
    tone: 'border-primary-border bg-primary-surface-weak text-primary',
  },
  neta: {
    label: '案件（ネタ）',
    into: 'GLS番号を採る前の引き合い',
    tone: 'border-ai-border bg-ai-surface text-ai',
  },
  log: {
    label: '活動記録',
    into: 'お客様とのやり取り',
    tone: 'border-info-border bg-info-surface text-info',
  },
  minutes: {
    label: '議事録',
    into: '案件の「やり取り」',
    tone: 'border-success-border bg-success-surface text-success',
  },
};

export const DEST_ORDER: Dest[] = ['task', 'neta', 'log', 'minutes'];

/** サーバーが返す下書き 1 件 */
export interface Draft {
  draft_key: string;
  dest?: Dest;
  title: string;
  assigned_to?: string | null;
  requester_id?: string | null;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  due_time_assumed?: boolean;
  due_unclear?: boolean;
  assignee_unclear?: boolean;
  suggested_default?: boolean;
  quote?: string | null;

  project_id?: string | null;
  customer_name?: string | null;
  detail?: string | null;
  gls_category?: 'A' | 'B' | null;
  activity_type?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  summary?: string | null;
  decisions?: { text: string; quote: string }[];
  open_items?: { text: string; owner: string; due: string }[];
}

export interface IntakeUser { id: string; name: string }
export interface IntakeProject {
  id: string;
  name: string;
  code?: string | null;
  customer_name?: string | null;
}

export type IntakeStatus = 'pending' | 'committed' | 'discarded' | 'transcribing' | 'failed';

export interface IntakeResponse {
  id: string;
  raw_text: string;
  kind: string;
  /** `transcribing` = 録音を裏で文字にしている最中（下書きはまだ無い） */
  status?: IntakeStatus;
  /** 文字起こし・解析に失敗した理由。**画面に出す** */
  error_message?: string | null;
  drafts: Draft[] | null;
  skipped?: { line: string; reason: string }[];
  far_due_keys?: string[];
  users?: IntakeUser[];
  projects?: IntakeProject[];
  /** AI が落ちて規則ベースに縮退したか。縮退したときは行き先が全部タスクになる */
  parsed_by?: 'ai' | 'rules';
}

/** 編集中の行。checked = 登録するか */
export interface Row extends Draft {
  checked: boolean;
}

export function destOf(r: { dest?: Dest }): Dest {
  return r.dest ?? 'task';
}

/**
 * その行が登録できない理由。**空配列 = 登録できる**。
 *
 * サーバー側（`task-intake.service` の commit）と**同じ条件**にしてあります。
 * ゆるくすると押したあとに 400 で戻され、どの行が悪いのか分かりません。
 */
export function rowBlockers(r: Row): string[] {
  const out: string[] = [];
  const name = r.title?.trim() || '(無題)';
  if (!r.title?.trim()) out.push('内容が空の行があります');
  switch (destOf(r)) {
    case 'task':
      if (!r.assigned_to) out.push(`「${name}」の担当者を選んでください`);
      if (r.requester_id && !r.due_at) {
        out.push(`「${name}」は依頼なので期限が必要です（何月何日何時何分まで）`);
      }
      break;
    case 'neta':
      if (!r.customer_name?.trim()) out.push(`「${name}」のお客様を入れてください`);
      if (r.gls_category !== 'A' && r.gls_category !== 'B') {
        out.push(`「${name}」がスタジオを使う案件かどうかを選んでください`);
      }
      break;
    case 'minutes':
      if (!r.project_id) out.push(`「${name}」をどの案件の議事録にするか選んでください`);
      break;
    default:
      break;
  }
  return out;
}
