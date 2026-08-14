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
import type { ProjectStage } from '@/types';


export type GpmKind = 'self_build' | 'group_order';
export type PhaseState = 'done' | 'doing' | 'blocked' | 'todo';
export type OpenItemStatus = 'waiting' | 'checking' | 'resolved';
export type OpenItemToKind = 'client' | 'pm' | 'vendor' | 'internal';
export type MemberSide = 'internal' | 'client' | 'pm' | 'vendor';

// ── サーバーが返す形 ────────────────────────────────────────

/**
 * 一覧にも詳細にも入っている列。
 *
 * **実体は `projects` の行です**（`gls_category = 'B'`・migration 179）。
 * だから `stage` は案件と同じ 7 段で、売上・仕入・見積・請求がそのままぶら下がります。
 */
export interface GpmProjectBase {
  id: string;
  name: string;
  /** GLS 番号。**発番するまで null**（発番は案件と同じ流れ） */
  gls_number: string | null;
  gpm_kind: GpmKind | null;
  customer_id: string | null;
  customer_name: string | null;
  pm_company: string | null;
  /** 社内の担当（案件の `assigned_to` と同じ列） */
  assigned_to: string | null;
  assigned_to_name: string | null;
  started_on: string | null;
  ends_on: string | null;
  /**
   * **案件と同じ 7 段**。`status`（準備中/進行中/完了/保留）という別の列は持ちません —
   * 同じ軸の粗さ違いで、両方持つと必ず片方だけ古くなります。
   * 一覧の絞り込みだけ 4 つに束ねますが、**保存するのは常にこの値**です。
   */
  stage: ProjectStage;
  gpm_template_id: string | null;
  notes: string | null;
  /** BOX フォルダ。**作るまで null**（作るのは押したときだけ・消せないため） */
  box_url_internal: string | null;
  box_url_external: string | null;
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
  /**
   * いま出ている見積の合計（税抜・値引きを引いたもの）。**1本も無ければ null**
   * （`0` は「0円の見積がある」なので別）。数え方は案件一覧と同じ式。
   */
  estimate_amount: number | null;
  /** いちばん新しい1本の版と状態（`v2 提出済`） */
  estimate_version: number | null;
  estimate_status: EstimateStatus | null;
}

/** 見積の状態。`estimates.status`（案件と共用の表・migration 138） */
export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';

/**
 * 一覧に出す見積の状態。**旧版（`superseded`）と失注（`rejected`）は
 * サーバー側で外している**ので出てこないが、型としては来うるので言葉を持たせる
 * （持たせないと生の英語が画面に出る）。
 */
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: '作成中',
  sent: '提出済',
  accepted: '受注',
  rejected: '失注',
  superseded: '旧版',
};

export interface GpmPhase {
  id: string;
  project_id: string;
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
  project_id: string;
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
  project_id: string;
  user_id: string | null;
  name: string;
  org: string | null;
  role: string | null;
  email: string | null;
  side: MemberSide;
  /** 組織図の段 (migration 169) */
  tier: MemberTier;
  /** 組織図の箱の名前。同じ名前の人が1つの箱に入る。空なら立場の名前で束ねる */
  group_label: string | null;
  /** 箱の中で目立たせる印（決裁 / 進行 / 議事録 など） */
  badge: string | null;
  sort_order: number;
}

/**
 * 組織図の段 (migration 169・モックの `GP_ORG2`)。
 *
 *   top   上段  オブザーバー ／ 責任者（オーナー） ／ 管理業務・財務
 *   lead  中段  全体統括（PM会社）
 *   unit  下段  設計ユニット ／ テクニカルユニット ／ 施工ユニット
 */
export type MemberTier = 'top' | 'lead' | 'unit';

export const TIER_LABEL: Record<MemberTier, string> = {
  top: '決める人',
  lead: '進める人',
  unit: '手を動かす人',
};

/**
 * `GET /gpm/projects/:id`。
 *
 * **一覧が返す集計（`phase_count` / `phase_done` / `current_phase` /
 * `next_task`）は入っていません。** 詳細は工程そのものを返すので、
 * 進み具合は `phases` から出します（`phaseProgress()`）。
 * 集計を写して持たせると、同じ数字を2か所で数えることになります。
 */
export interface GpmProjectDetail extends GpmProjectBase {
  template_name: string | null;
  phases: GpmPhase[];
  /** 未確認事項の**中身**（一覧の `open_items` は件数なので別物） */
  open_items: GpmOpenItem[];
  members: GpmMember[];
}

/**
 * ⑤ 全プロジェクトのタスク1件（`GET /gpm/tasks`）。
 *
 * 実体は既存 `project_tasks` の行で、**GLS-B の案件にぶら下がっています**
 * （migration 179）。工程に付いていないタスクも同じプロジェクトのものなので返します
 * — だから `phase_id` は null になりえます。
 */
export interface GpmTask {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  work_state: string | null;
  due_at: string | null;
  sort_order: number;
  assigned_to: string | null;
  assigned_to_name: string | null;
  /** 工程に付いていないタスクは null */
  phase_id: string | null;
  phase_label: string | null;
  phase_state: PhaseState | null;
  project_id: string;
  project_name: string;
  project_kind: GpmKind | null;
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

/**
 * 一覧の絞り込みで束ねる 4 つ。**読むときだけの束ね方**で、保存するのは常に `stage`。
 *
 * 4 段で保存して 7 段に戻す形にすると、**触っていないのにステージが動きます**
 * （`neta` のプロジェクトを開いて「準備中」のまま保存 → `c_proposal` になる）。
 * サーバー側の `STAGE_GROUPS`（`gpm.service.ts`）と**同じ束ね方**にしてあります。
 */
export const STAGE_GROUPS: { key: string; label: string; stages: ProjectStage[] }[] = [
  { key: 'all', label: 'すべて', stages: [] },
  { key: 'active', label: '進行中', stages: ['a_won'] },
  { key: 'planning', label: '準備中', stages: ['neta', 'd_hold', 'c_proposal', 'b_verbal'] },
  { key: 'done', label: '完了', stages: ['s_completed'] },
  { key: 'lost', label: '見送り', stages: ['e_lost'] },
];

/**
 * そのステージが束ねの何番に入るか。**チップの絞り込みと KPI の数え方を1本にする** —
 * 別々に書くと「進行中 3 件」と出ているのに開くと 4 件、が起きる。
 */
export function inStageGroup(stage: ProjectStage, key: string): boolean {
  const g = STAGE_GROUPS.find((x) => x.key === key);
  return !!g && g.stages.includes(stage);
}

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
/** 箱の枠の色。段ではなく**立場**で決める（どこの会社かが読めるほうが役に立つ） */
export const SIDE_BORDER: Record<MemberSide, string> = {
  internal: 'border-primary-border',
  client: 'border-warning-border',
  pm: 'border-info-border',
  vendor: 'border-border',
};

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
