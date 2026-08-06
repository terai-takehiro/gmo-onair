/**
 * プロジェクト管理（GPM）— 画面が使う型と言葉づかい
 *
 * サーバーは `server/src/contexts/gpm/services/gpm.service.ts`、
 * 列の定義は migration 161、決めの根拠は `docs/design/gpm-model.md`。
 *
 * ── ここに置くもの ──────────────────────────────────────────
 *
 * **値 → 日本語** の対応と **値 → 色** の対応を1か所にまとめます。
 * 画面ごとに書くと、同じ `blocked` が「待ち」と「止まっている」になり、
 * 同じ状態の色が画面によって黄と赤に分かれます（案件管理で実際に起きた）。
 *
 * ── 日付の扱い ──────────────────────────────────────────────
 *
 * `DATE` 列は JSON で `2026-05-12T00:00:00.000Z` の形で返ってきます。
 * **`new Date()` に通さないこと** — 端末の時間帯で1日ずれます。
 * 先頭10文字を切るだけの `ymd()` を通してください。
 */

export type GpmKind = 'self_build' | 'group_order';
export type GpmStatus = 'planning' | 'active' | 'done' | 'onhold';
export type PhaseState = 'done' | 'doing' | 'blocked' | 'todo';
export type OpenItemStatus = 'waiting' | 'checking' | 'resolved';
export type OpenItemToKind = 'client' | 'pm' | 'vendor' | 'internal';
export type MemberSide = 'internal' | 'client' | 'pm' | 'vendor';

// ── サーバーが返す形 ────────────────────────────────────────

/** 一覧にも詳細にも入っている列（`gpm_projects` そのもの） */
export interface GpmProjectBase {
  id: string;
  name: string;
  kind: GpmKind;
  client_name: string | null;
  customer_id: string | null;
  pm_company: string | null;
  pm_user_id: string | null;
  pm_name: string | null;
  started_on: string | null;
  ends_on: string | null;
  status: GpmStatus;
  template_id: string | null;
  project_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `GET /gpm/projects` の1行。**進み具合はサーバーが数えたもの**。
 *
 * **`open_items` の意味が一覧と詳細で違います。** 一覧は「未解決の件数」
 * （数値）、詳細は「未確認事項の配列」です（サーバーが同じ名前を使っている）。
 * 型を分けてあるので、取り違えるとその場でコンパイルが止まります。
 */
export interface GpmProjectRow extends GpmProjectBase {
  /** いま動いている工程（進行中が無ければ最初の未着手） */
  current_phase: string | null;
  phase_count: number;
  phase_done: number;
  /** 未解決の未確認事項の**件数** */
  open_items: number;
  next_task: string | null;
  next_due: string | null;
}

export interface GpmPhase {
  id: string;
  gpm_project_id: string;
  label: string;
  state: PhaseState;
  started_on: string | null;
  ends_on: string | null;
  role: string | null;
  sort_order: number;
  task_count: number;
  task_done: number;
}

export interface GpmOpenItem {
  id: string;
  gpm_project_id: string;
  phase_id: string | null;
  question: string;
  to_kind: OpenItemToKind;
  to_name: string | null;
  status: OpenItemStatus;
  blocks: string | null;
  due_date: string | null;
  raised_at: string;
  resolved_at: string | null;
  /** `GET /gpm/open-items`（プロジェクトまたぎ）でだけ付く */
  project_name?: string;
  phase_label?: string | null;
}

export interface GpmMember {
  id: string;
  gpm_project_id: string;
  user_id: string | null;
  name: string;
  org: string | null;
  role: string | null;
  email: string | null;
  side: MemberSide;
  sort_order: number;
}

/**
 * `GET /gpm/projects/:id`。
 *
 * **一覧が返す集計（`phase_count` / `phase_done` / `current_phase` /
 * `next_task`）は入っていません。** 詳細は工程そのものを返すので、
 * 進み具合は `phases` から出します（`phaseProgress()`）。
 * 集計を写して持たせると、同じ数字を2か所で数えることになります。
 */
export interface GpmProjectDetail extends GpmProjectBase {
  customer_name: string | null;
  template_name: string | null;
  phases: GpmPhase[];
  /** 未確認事項の**中身**（一覧の `open_items` は件数なので別物） */
  open_items: GpmOpenItem[];
  members: GpmMember[];
}

export interface GpmTemplateTask {
  id: string;
  label: string;
  days: number;
  role: string | null;
  is_required: boolean;
  sort_order: number;
}

export interface GpmTemplatePhase {
  id: string;
  label: string;
  days: number;
  role: string | null;
  sort_order: number;
  tasks: GpmTemplateTask[];
}

export interface GpmTemplate {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  /** このひな形から作られたプロジェクトの数（消してよいかの判断に要る） */
  used_count: number;
  phases: GpmTemplatePhase[];
}

// ── 言葉づかい ──────────────────────────────────────────────

export const KIND_LABEL: Record<GpmKind, string> = {
  self_build: '自社構築',
  group_order: 'グループ受託',
};

/** 区分の説明（新規作成で選ぶときに出す） */
export const KIND_NOTE: Record<GpmKind, string> = {
  self_build: '自分たちのスタジオ・設備を作る／更新する',
  group_order: 'グループ本体から依頼を受けて作る',
};

export const STATUS_LABEL: Record<GpmStatus, string> = {
  planning: '準備中',
  active: '進行中',
  done: '完了',
  onhold: '保留',
};

/**
 * 状態の色。**進行中に色を付けない** — ほとんどが進行中なので、
 * 色を付けると一覧が同じ色で埋まって「保留」と「完了」が拾えなくなる。
 */
export const STATUS_TONE: Record<GpmStatus, string> = {
  planning: 'bg-info-surface text-info',
  active: 'bg-muted text-muted-foreground',
  done: 'bg-success-surface text-success',
  onhold: 'bg-warning-surface text-warning',
};

export const PHASE_STATE_LABEL: Record<PhaseState, string> = {
  done: '完了',
  doing: '進行中',
  blocked: '待ち',
  todo: '未着手',
};

export const PHASE_STATE_TONE: Record<PhaseState, string> = {
  done: 'bg-success-surface text-success',
  doing: 'bg-primary-surface-weak text-primary',
  blocked: 'bg-destructive-surface text-destructive',
  todo: 'bg-muted text-muted-foreground',
};

export const OPEN_STATUS_LABEL: Record<OpenItemStatus, string> = {
  waiting: '返事待ち',
  checking: '確認中',
  resolved: '解決',
};

export const OPEN_STATUS_TONE: Record<OpenItemStatus, string> = {
  waiting: 'bg-destructive-surface text-destructive',
  checking: 'bg-warning-surface text-warning',
  resolved: 'bg-success-surface text-success',
};

export const TO_KIND_LABEL: Record<OpenItemToKind, string> = {
  client: '発注者',
  pm: 'PM会社',
  vendor: '業者',
  internal: '社内',
};

export const SIDE_LABEL: Record<MemberSide, string> = {
  internal: '自社',
  client: '発注者',
  pm: 'PM会社',
  vendor: '業者',
};

/** 社外は同じ淡い色にする（自社／社外の2つだけ見分けばよい） */
export const SIDE_TONE: Record<MemberSide, string> = {
  internal: 'bg-primary-surface-weak text-primary',
  client: 'bg-muted text-muted-foreground',
  pm: 'bg-muted text-muted-foreground',
  vendor: 'bg-muted text-muted-foreground',
};

// ── 小さな道具 ──────────────────────────────────────────────

/**
 * `2026-05-12T00:00:00.000Z` → `2026-05-12`。
 * **`new Date()` を通さない** — 端末の時間帯で前日になる。
 */
export function ymd(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/**
 * 進み具合（%）。**列には無いので工程の完了数から出す**
 * （列に持つと同じ数字を2か所で数えることになり、必ず食い違う）。
 * 工程が1つも無いプロジェクトは `null`（0% と「まだ工程が無い」は別）。
 */
export function progressPct(done: number, count: number): number | null {
  if (!count) return null;
  return Math.round((done / count) * 100);
}

/**
 * 詳細画面での進み具合。**一覧と同じ数え方**（完了した工程 ÷ 工程の数）に
 * 揃えてあります — 詳細だけタスクの完了率で出すと、一覧と詳細で
 * 違う％が出て「どちらが本当か」が分からなくなります。
 */
export function phaseProgress(phases: { state: PhaseState }[]): { done: number; count: number; pct: number | null } {
  const done = phases.filter((p) => p.state === 'done').length;
  return { done, count: phases.length, pct: progressPct(done, phases.length) };
}

/** 期限の色。**超過だけを赤にする** — 全部に色を付けると超過が埋もれる */
export function dueTone(due: string | null, today: string): string {
  if (!due) return 'text-muted-foreground';
  if (due < today) return 'text-destructive';
  if (due === today) return 'text-warning';
  return 'text-muted-foreground';
}

/** `2026-08-05` → `08/05 超過` のような短い表記 */
export function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const short = due.slice(5).replace('-', '/');
  if (due < today) return `${short} 超過`;
  if (due === today) return `${short} 今日`;
  return short;
}
