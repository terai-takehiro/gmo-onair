/**
 * プロジェクト管理（GPM）— GLS-B の案件を工程で管理する
 *
 * 決めの根拠は `docs/design/gpm-merge.md`（161 の決め①を差し替えたもの）。
 * 押さえておくのは4つ。
 *
 * ① **プロジェクトは `projects` の行。** `gls_category = 'B'` がプロジェクト、
 *    `'A'` が案件（スタジオ）。旧 `gpm_projects` は使いません（migration 179 で
 *    子テーブルの親を `project_id` に差し替え済み。表そのものは migration B で落とす）。
 * ② **工程は `gpm_phases`、配下のタスクは `project_tasks`。**
 *    タスクは `project_id` を持つので、「自分のタスク」「期限超過」にも出ます
 *    （**GLS-B 案件のタスクなので出るのが正しい**）。案件管理の画面には
 *    `gls_category = 'A'` の絞り込みで出ません。
 * ③ **状態は `stage` 1 本。** `status`（準備中/進行中/完了/保留）という別の列は
 *    持ちません — 案件のステージと**同じ軸の粗さ違い**で、両方持つと必ず片方だけ古くなる。
 *    一覧の絞り込みだけ 4 つに束ねますが、**束ねるのは読むときだけ**です。
 * ④ **進捗 % は列に持たない。** 配下タスクの完了率から導出する。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateSequenceNumber } from '../../../shared/services/sequence.service';
import { assertCustomerCompanyId } from '../../../shared/services/company-directory.service';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';
/**
 * 見積金額の出し方は**案件一覧と同じ式を読む**（写さない）。
 * 束ごとに最新版を採る・旧版と失注を外す・値引きは別建て・税を乗せない、の
 * 4つを写すと、片方だけ直した日から同じ見積が画面によって違う金額になります
 * （`project.service.ts` の `ESTIMATE_AMOUNT_LATERAL` に理由が書いてある）。
 */
/**
 * ⚠️ **メモは `projects.notes` ではなくやり取りの1件**（migration 184 が列を落とした）。
 *
 * 列が落ちたときにプロジェクト管理側が直っておらず、**一覧・詳細・作る・直すの
 * 4つとも 500 で落ちていました**（`column "notes" does not exist`）。
 * つまりプロジェクト管理は画面がぜんぶ開けない状態でした。型検査は SQL の中身を
 * 見ないので、実 Postgres に当てるまで出ません。
 *
 * 案件と**同じ関数・同じ式**を読みます（写すと、メモの置き場所を次に変えた日に
 * また片方だけ取り残されます）。
 */
import {
  ESTIMATE_AMOUNT_LATERAL, MEMO_LATERAL, addMemoActivity, customerIsGroup,
  // ⚠️ このファイルも `projectService` を export している（プロジェクト管理のほう）。
  // **別名で受ける** — 同じ名前だと GLS の発番が自分自身を呼びに行く
  projectService as salesProjectService,
  // 段の履歴・`won_at`/`lost_at` の3点セットは案件管理と共有の1関数に集約
  // （テーマ2 PR1・docs/project-ledger-phase-c-design.md）。ここに個別ロジックを
  // 持つと、GPM 経由の見送り（`e_lost`）だけ `lost_at`/`lost_reason` が
  // 書かれない、という Phase A 未修正の穴が残ったままになる
  recordStageTransition,
} from '../../sales/services/project.service';
/**
 * 議事録は**案件と同じ表・同じサービス**（`project_minutes` / `minutes.service`）。
 * `project_minutes.project_id` は `projects(id)` を指し、プロジェクトは GLS-B の案件なので、
 * **文字起こし → AI 整形 → 決定事項・持ち帰り の仕組みがそのまま使えます**。
 * 別表にすると、Whisper の投げ方・整形のプロンプト・差分の記録が2つになります。
 */
import { getMinutes } from '../../sales/services/minutes.service';
/**
 * 健全性（snoozed / overdue / stalled / ok）と放置日数は **project-health.ts の単一定義**を読む
 * （docs/core-redesign-plan.md §3-7・案件一覧 GET /projects と同じ意味論）。
 * ここに式を写すと、案件側のしきい値を直した日からプロジェクト一覧だけ別の判定になる。
 */
import { healthSql, stalledDaysSql } from '../../sales/services/project-health';
/**
 * AI（MCP `create_gpm_project` / `create_gpm_task`）が起票した行を人が直したときの
 * 差分の記録（会社方針「AI を使い捨てにしない」の条件2）。**update の中で呼ぶ**。
 * ⚠️ GLS-B のタスクは**この口だけでなく `project-tasks.service` の update も通る**
 * （案件詳細のガント・MCP の `update_task`）ので、タスクのフックは**両方**に入れてある。
 * 片方だけにすると、その経路の修正だけが黙って数えられない。
 */
import { recordGpmProjectCorrections, recordGpmTaskCorrections } from './gpm-ai-feedback.service';

export const GPM_KINDS = ['self_build', 'group_order'] as const;
export const OPEN_ITEM_STATUSES = ['waiting', 'checking', 'resolved'] as const;
export const OPEN_ITEM_TO_KINDS = ['client', 'pm', 'vendor', 'internal'] as const;
export const PHASE_STATES = ['done', 'doing', 'blocked', 'todo'] as const;

/** 案件のステージ。**案件管理と同じ 8 段**（`projects_stage_check` と揃えること） */
export const STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost'] as const;

/**
 * 一覧の絞り込みで束ねる 5 つ。**読むときだけの束ね方**で、保存するのは常に `stage`。
 *
 * 5 段で保存して 8 段に戻す形にすると、**触っていないのにステージが動きます**
 * (`neta` の案件を開いて「準備中」のまま保存 → `c_proposal` になる)。
 *
 * `delivered`（`r_delivered`=実施済・財務処理中）は 2026-09 追加。`active` には含めない
 * （制作の仕事は終わっている）が、財務処理が済むまでは `done` とも別に見せる —
 * **`client/src/contexts/gpm/types.ts` の `STAGE_GROUPS` と必ず対で直すこと**
 */
export const STAGE_GROUPS: Record<string, readonly string[]> = {
  planning: ['neta', 'd_hold', 'c_proposal', 'b_verbal'],
  active: ['a_won'],
  delivered: ['r_delivered'],
  done: ['s_completed'],
  lost: ['e_lost'],
};

/** 自社構築の「お客様」。相手がいないので migration 179 が入れた行に寄せる */
// Phase 3-2a: customer_id は companies.id を直接指すので、companies 側の固定ID を使う
// (customers.id 'cust-self-gms' は company_id='comp-self-gms' に紐づけ済み・migration 200)
export const SELF_CUSTOMER_ID = 'comp-self-gms';

function assertIn<T extends string>(v: string, allowed: readonly T[], label: string): void {
  if (!(allowed as readonly string[]).includes(v)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} は ${allowed.join(' / ')} のいずれかです`);
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && YMD.test(v) ? v : null);

/**
 * タスクの止まり方 (migration 137)。**完了は入れない** — 完了は `is_completed` が正で、
 * `work_state` は「未完了のあいだの止まり方」（`project-tasks.service` と同じ3値）。
 */
const TASK_WORK_STATES = ['todo', 'doing', 'waiting'] as const;

/** 進捗% (migration 131)。0〜100 の整数に丸める。数字でなければ null（呼び出し側で既定を決める） */
function clampProgress(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

/** `2026-05-12` に `n` 日足す。**曜日は見ない** — 営業日で数えるかは決まっていない */
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * **プロジェクトであることの条件。** ここを書き写さないこと —
 * 1 か所でも `gls_category` を落とすと、`gpm` の権限しか無い人に
 * 案件（GLS-A）の中身が見えます。
 */
const IS_PROJECT = `p.gls_category = 'B' AND p.deleted_at IS NULL`;

/** その id がプロジェクト（GLS-B）かを確かめる。案件（A）なら 404 にする */
async function assertProject(id: string): Promise<void> {
  const row = await queryOne(
    `SELECT id FROM projects p WHERE p.id = ? AND ${IS_PROJECT}`, [id],
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
}

// ══ テンプレート（標準工程）══════════════════════════════

export const templateService = {
  async list(): Promise<Record<string, unknown>[]> {
    const tpls = await queryAll(
      `SELECT id, key, name, icon, description, is_system, sort_order
         FROM gpm_templates WHERE deleted_at IS NULL ORDER BY sort_order, name`,
    );
    if (tpls.length === 0) return [];
    // **適用件数はここで一緒に数える。** 画面が別に問い合わせると N+1 になり、
    // かつ「テンプレートを消してよいか」の判断に必ず要る
    const used = await queryAll(
      `SELECT p.gpm_template_id AS template_id, COUNT(*)::int AS n FROM projects p
        WHERE ${IS_PROJECT} AND p.gpm_template_id IS NOT NULL GROUP BY p.gpm_template_id`,
    ) as Array<{ template_id: string; n: number }>;
    const usedBy = new Map(used.map((u) => [u.template_id, u.n]));
    const phases = await queryAll(
      `SELECT id, template_id, label, days, role, sort_order
         FROM gpm_template_phases ORDER BY template_id, sort_order`,
    );
    const tasks = await queryAll(
      `SELECT id, template_phase_id, label, days, role, is_required, sort_order
         FROM gpm_template_tasks ORDER BY template_phase_id, sort_order`,
    );
    return tpls.map((t) => ({
      ...t,
      used_count: usedBy.get(String(t.id)) ?? 0,
      phases: phases.filter((p) => p.template_id === t.id).map((p) => ({
        ...p,
        tasks: tasks.filter((k) => k.template_phase_id === p.id),
      })),
    }));
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    return (await this.list()).find((t) => t.id === id);
  },

  async create(input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const name = String(input.name ?? '').trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'テンプレートの名前を入れてください');
    const id = uuidv4();
    const key = String(input.key ?? '').trim() || id.slice(0, 8);
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO gpm_templates (id, key, name, icon, description, sort_order, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, key, name, input.icon ?? null, input.description ?? null,
         Number(input.sort_order ?? 0), userId, userId],
      );
      await writePhases(tx, id, input.phases);
    });
    return (await this.getById(id))!;
  },

  async update(id: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne('SELECT id FROM gpm_templates WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');
    await withTransaction(async (tx) => {
      // icon / description は**キーが入っているときだけ**書き換える（他の update と同じ形）。
      // 以前は無条件で書いており、名前だけ直す呼び出しがアイコンを黙って消していた
      const sets = ['name = COALESCE(?, name)', 'sort_order = COALESCE(?, sort_order)',
                    'updated_by = ?', 'updated_at = NOW()'];
      const params: unknown[] = [input.name ?? null, input.sort_order ?? null, userId];
      if ('icon' in input) { sets.push('icon = ?'); params.push(input.icon ?? null); }
      if ('description' in input) { sets.push('description = ?'); params.push(input.description ?? null); }
      params.push(id);
      await tx.execute(`UPDATE gpm_templates SET ${sets.join(', ')} WHERE id = ?`, params);
      // **フェーズは全置換。** 展開済みのプロジェクトには影響しない（写して使うため）
      if (Array.isArray(input.phases)) {
        await tx.execute('DELETE FROM gpm_template_phases WHERE template_id = ?', [id]);
        await writePhases(tx, id, input.phases);
      }
    });
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    const row = await queryOne('SELECT is_system FROM gpm_templates WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');
    if (row.is_system) throw new AppError(400, 'SYSTEM_TEMPLATE', '最初から入っているテンプレートは消せません');
    await execute('UPDATE gpm_templates SET deleted_at = NOW() WHERE id = ?', [id]);
  },
};

type Tx = { execute: (sql: string, params?: unknown[]) => Promise<unknown> };

async function writePhases(tx: Tx, templateId: string, phases: unknown): Promise<void> {
  if (!Array.isArray(phases)) return;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i] as Record<string, unknown>;
    const label = String(p?.label ?? '').trim();
    if (!label) continue;
    const pid = uuidv4();
    await tx.execute(
      `INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pid, templateId, label, Number(p.days ?? 5) || 5, p.role ?? null, i],
    );
    const tasks = Array.isArray(p.tasks) ? p.tasks : [];
    for (let j = 0; j < tasks.length; j++) {
      const t = tasks[j] as Record<string, unknown>;
      const tl = String(t?.label ?? '').trim();
      if (!tl) continue;
      await tx.execute(
        `INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), pid, tl, Number(t.days ?? 1) || 1, t.role ?? null, !!t.is_required, j],
      );
    }
  }
}

// ══ プロジェクト（= GLS-B の案件）══════════════════════════

/**
 * 一覧。**進み具合はここで一緒に数える** — 画面が行ごとに問い合わせると N+1 になり、
 * さらに「同じ数字を2か所で数える」ことになる。
 */
export const projectService = {
  async list(filter: { stage?: string; kind?: string; q?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds = [IS_PROJECT];
    const params: unknown[] = [];
    if (filter.stage && filter.stage !== 'all') {
      // **束ねた名前（準備中など）でも、素のステージ名でも受ける。**
      // 束ねた名前しか受けないと、案件一覧からリンクで飛んできたときに 400 になる
      const group = STAGE_GROUPS[filter.stage];
      const stages = group ?? (STAGES as readonly string[]).filter((s) => s === filter.stage);
      // **知らない値は空で返す。** 素通しすると「絞ったのに全件」で気づけない
      if (stages.length === 0) conds.push('FALSE');
      else {
        conds.push(`p.stage IN (${stages.map(() => '?').join(', ')})`);
        params.push(...stages);
      }
    }
    if (filter.kind) {
      assertIn(filter.kind, GPM_KINDS, 'kind');
      conds.push('p.gpm_kind = ?'); params.push(filter.kind);
    }
    if (filter.q) {
      const like = `%${filter.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conds.push(`(p.name ILIKE ? ESCAPE '\\' OR c.name ILIKE ? ESCAPE '\\' OR p.gls_number ILIKE ? ESCAPE '\\')`);
      params.push(like, like, like);
    }
    return queryAll(
      `SELECT p.id, p.name, p.gls_number, p.stage, p.gpm_kind, p.pm_company,
              p.started_on, p.ends_on, p.gpm_template_id,
              -- メモは列ではなくやり取りのいちばん新しい1件（migration 184）
              memo.description AS notes,
              p.box_url_internal, p.box_url_external, p.customer_id,
              p.assigned_to, p.created_at, p.updated_at,
              c.name AS customer_name, u.name AS assigned_to_name,
              -- いま動いているフェーズ（進行中が無ければ最初の未着手）
              (SELECT ph.label FROM gpm_phases ph WHERE ph.project_id = p.id
                ORDER BY CASE ph.state WHEN 'doing' THEN 0 WHEN 'blocked' THEN 1
                                       WHEN 'todo' THEN 2 ELSE 3 END, ph.sort_order LIMIT 1) AS current_phase,
              (SELECT COUNT(*)::int FROM gpm_phases ph WHERE ph.project_id = p.id) AS phase_count,
              (SELECT COUNT(*)::int FROM gpm_phases ph WHERE ph.project_id = p.id AND ph.state = 'done') AS phase_done,
              (SELECT COUNT(*)::int FROM gpm_open_items oi
                WHERE oi.project_id = p.id AND oi.status <> 'resolved' AND oi.deleted_at IS NULL) AS open_items,
              -- 次にやること（next_t の LATERAL 参照）
              next_t.title AS next_task,
              next_t.next_due AS next_due,
              -- お金の列（モックの money = 「個別見積 v2 提出済」）。
              -- 金額は案件一覧と同じ式（ESTIMATE_AMOUNT_LATERAL）、
              -- 版と状態は**いちばん新しい1本**から採る（何本ぶら下がっていても
              -- 「いま出ているのはこれ」が読めればよい）
              -- ⚠️ この文字列はテンプレートリテラルなので、注釈にバッククォートを書かないこと
              --    （書くと SQL の途中で文字列が終わり、構文エラーになる）
              est.amount AS estimate_amount,
              last_est.version AS estimate_version,
              last_est.status AS estimate_status,
              -- 健全性と放置日数（project-health.ts の単一定義・案件一覧と同じ意味論）。
              -- snooze_until は DATE を ::text にする（pg が JS Date にして UTC で1日ずれるため）
              ${healthSql()} AS health,
              ${stalledDaysSql()} AS stalled_days,
              p.snooze_until::text AS snooze_until
         FROM projects p
         LEFT JOIN companies c ON c.id = p.customer_id
         LEFT JOIN users u ON u.id = p.assigned_to
         ${MEMO_LATERAL}
         ${ESTIMATE_AMOUNT_LATERAL}
         LEFT JOIN LATERAL (
           SELECT e.version, e.status FROM estimates e
            WHERE e.project_id = p.id AND e.deleted_at IS NULL
              AND e.status NOT IN ('superseded', 'rejected')
            ORDER BY e.updated_at DESC, e.version DESC LIMIT 1
         ) last_est ON TRUE
         -- 次にやること: 期限がいちばん近い未完了タスク。
         -- **工程に付いていないタスクも数える** — GLS-B 案件のタスクはどれも
         -- このプロジェクトのものなので、工程の有無で見え方が変わるほうが分かりにくい。
         -- 期限は COALESCE(due_at, due_date+18:00) で読む（根源整理 §3-4）—
         -- due_at だけ見ると、カンバン・標準工程で作られた行が常に最後に回る。
         -- title と期限を1つの LATERAL で採る（別々の相関サブクエリだと同じ走査が2回になる）
         LEFT JOIN LATERAL (
           SELECT t.title, COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp) AS next_due
             FROM project_tasks t
            WHERE t.project_id = p.id AND t.is_completed = false AND t.deleted_at IS NULL
            ORDER BY COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp) NULLS LAST
            LIMIT 1
         ) next_t ON TRUE
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE p.stage WHEN 'a_won' THEN 0 WHEN 'b_verbal' THEN 1 WHEN 'c_proposal' THEN 2
                              WHEN 'd_hold' THEN 3 WHEN 'neta' THEN 4 WHEN 'r_delivered' THEN 5
                              WHEN 's_completed' THEN 6 ELSE 7 END,
                 p.ends_on NULLS LAST, p.created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    const p = await queryOne(
      `SELECT p.id, p.name, p.gls_number, p.stage, p.gpm_kind, p.pm_company,
              p.started_on, p.ends_on, p.gpm_template_id,
              memo.description AS notes,
              p.box_url_internal, p.box_url_external, p.customer_id,
              -- entity_code: 2026年10月の事業再編・P3（§4.7）。「予算と実績」タブに
              -- 差し替えるかどうかを画面が判定する材料（isCostCenterProject）。
              -- 一覧（list）はこの判定をしないので持たない
              p.assigned_to, p.entity_code, p.created_at, p.updated_at,
              u.name AS assigned_to_name, c.name AS customer_name, t.name AS template_name
         FROM projects p
         LEFT JOIN users u ON u.id = p.assigned_to
         LEFT JOIN companies c ON c.id = p.customer_id
         LEFT JOIN gpm_templates t ON t.id = p.gpm_template_id
         ${MEMO_LATERAL}
        WHERE p.id = ? AND ${IS_PROJECT}`, [id],
    );
    if (!p) return undefined;
    const phases = await queryAll(
      `SELECT ph.*,
              (SELECT COUNT(*)::int FROM project_tasks t
                WHERE t.gpm_phase_id = ph.id AND t.deleted_at IS NULL) AS task_count,
              (SELECT COUNT(*)::int FROM project_tasks t
                WHERE t.gpm_phase_id = ph.id AND t.deleted_at IS NULL AND t.is_completed = true) AS task_done
         FROM gpm_phases ph WHERE ph.project_id = ? ORDER BY ph.sort_order`, [id],
    );
    const openItems = await queryAll(
      `SELECT * FROM gpm_open_items WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY CASE status WHEN 'waiting' THEN 0 WHEN 'checking' THEN 1 ELSE 2 END,
                 due_date NULLS LAST, raised_at`, [id],
    );
    const members = await queryAll(
      `SELECT * FROM gpm_members WHERE project_id = ?
        ORDER BY CASE tier WHEN 'top' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END, sort_order, name`, [id],
    );
    return { ...p, phases, open_items: openItems, members };
  },

  /**
   * 作る。テンプレートを選んでいれば**そのとき写して**フェーズとタスクを日付付きで作る。
   * 写したあとにテンプレートを直しても、動いているプロジェクトは変わらない。
   *
   * **案件の行として作る**（`gls_category = 'B'`）ので、売上・仕入・見積・請求が
   * そのままぶら下がる。GLS 番号はここでは採らない — 発番は案件と同じ
   * `POST /projects/:id/issue-gls` の流れ（確認ダイアログ付き）に任せる。
   */
  async create(input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const name = String(input.name ?? '').trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'プロジェクト名を入れてください');
    const kind = String(input.gpm_kind ?? 'self_build');
    assertIn(kind, GPM_KINDS, 'gpm_kind');
    const stage = String(input.stage ?? 'a_won');
    assertIn(stage, STAGES, 'stage');

    const id = uuidv4();
    const startedOn = dateOrNull(input.started_on);
    const templateId = typeof input.gpm_template_id === 'string' && input.gpm_template_id
      ? input.gpm_template_id : null;
    // **自社構築には相手がいない。** `customer_id` は NOT NULL なので自社の行に寄せる
    // （NULL を許すと、`customers` を内部結合している読み手からプロジェクトが黙って消える）
    const customerId = (typeof input.customer_id === 'string' && input.customer_id)
      ? input.customer_id : SELF_CUSTOMER_ID;
    // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
    // 「顧客ロールの会社か」を保証しない（レビュー指摘・PR #200 P2・案件側の
    // project.service.ts と同じ理由）。渡された値だけ確かめる — `SELF_CUSTOMER_ID`
    // への既定の寄せ先は内部で作った固定行なので確かめ直さない
    if (typeof input.customer_id === 'string' && input.customer_id) {
      await assertCustomerCompanyId(input.customer_id);
    }
    const code = await generateSequenceNumber('opp_code', 'OPP');

    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO projects
           (id, code, entity_code, name, customer_id, stage, gls_category, customer_type, assigned_to,
            gpm_kind, pm_company, started_on, ends_on, gpm_template_id,
            created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 'B', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, CURRENT_ENTITY_CODE, name, customerId, stage,
         // グループ内 / グループ外は**お客様の印から決める**（migration 192）。
         // 自社の行（`comp-self-gms` ＝「自社（GMOグローバルスタジオ）」）にも
         // 印が付くので、自社構築はこれまでどおり internal になる
         await customerIsGroup(customerId) ? 'internal' : 'external',
         (input.assigned_to as string) || userId,
         kind, input.pm_company ?? null, startedOn, dateOrNull(input.ends_on),
         templateId, userId, userId],
      );

      // **最初のステージも履歴に残す**（案件管理の `create()` と同じ形・migration 164）。
      // GPM は「既に受注が決まった構築案件」を最初から `a_won` で作るのが正しい既定だが
      // （このロジック自体は変えない）、履歴が1件も無いまま `stage='a_won'` の行が
      // できると「いつ受注になったか」が言えず、`recordStageTransition` を経由しない
      // ぶん `won_at` も NULL のまま残る（テーマ2 PR2・docs/project-ledger-phase-c-design.md）
      await tx.execute(
        `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
         VALUES (?, ?, NULL, ?, ?)`,
        [uuidv4(), id, stage, userId],
      );
      if (stage === 'a_won') {
        // 受注の時刻を残す（`update()` 側の `recordStageTransition` と同じ
        // `COALESCE(won_at, NOW())`。新規作成なので必ず NULL だが式は揃えておく）
        await tx.execute(
          `UPDATE projects SET won_at = COALESCE(won_at, NOW()) WHERE id = ?`,
          [id],
        );
      }

      if (templateId) await expandTemplate(tx, id, templateId, startedOn, userId);
    });
    // **メモはやり取りの1件として、行ができたあとに書く。** 取引の外で書くので、
    // ここで失敗してもプロジェクトは残る（メモが1件無いほうが、案件ごと無いよりよい）
    await addMemoActivity(id, customerId, input.notes, userId);
    return (await this.getById(id))!;
  },

  async update(id: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    await assertProject(id);
    if (typeof input.stage === 'string') assertIn(input.stage, STAGES, 'stage');
    if (typeof input.gpm_kind === 'string') assertIn(input.gpm_kind, GPM_KINDS, 'gpm_kind');
    // 段が動いたかを**書き換える前に**見る（履歴と発番の判断に要る）。
    // AI 起票の修正差分（gpm-ai-feedback）にも同じ before を使うので、
    // 突き合わせる項目（name / gpm_kind / pm_company / 日付 / 担当）も一緒に読む
    const before = await queryOne(
      `SELECT stage, gls_number, gls_category, customer_id, name, gpm_kind, pm_company,
              started_on::text AS started_on, ends_on::text AS ends_on, assigned_to
         FROM projects WHERE id = ?`, [id],
    ) as {
      stage: string | null; gls_number: string | null; gls_category: string | null;
      customer_id: string | null; name: string; gpm_kind: string | null; pm_company: string | null;
      started_on: string | null; ends_on: string | null; assigned_to: string | null;
    };
    // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
    // 「顧客ロールの会社か」を保証しない（レビュー指摘・PR #200 P2・create() と同じ理由）。
    // **実際に変わったときだけ確かめる**（レビュー指摘・PR #201 P1）— 詳細画面の
    // 段変更・直すダイアログはどちらも今の customer_id を送り直すので、変化の有無を
    // 見ないと、あとから顧客ロールを外された会社のプロジェクトは無関係な直しまで
    // 止まってしまう（段を進められない・他の項目も直せない）
    if (typeof input.customer_id === 'string' && input.customer_id && input.customer_id !== before.customer_id) {
      await assertCustomerCompanyId(input.customer_id);
    }
    const nextStage = typeof input.stage === 'string' ? input.stage : null;
    const stageChanged = !!nextStage && nextStage !== before.stage;
    /**
     * **渡した項目だけを書き換える**（`gpmTaskService.update` と同じ形）。
     * 以前は `pm_company` / `started_on` / `ends_on` を無条件で書いていたので、
     * 一部の項目だけ送る呼び出し（MCP の部分更新）が**触っていない日付を黙って消す**
     * 形だった。画面は全項目を送るので挙動は変わらない。
     * `pm_company` と日付は「空にする」も送れるように、**キーが入っていれば** null でも書く。
     */
    const sets = ['name = COALESCE(?, name)', 'gpm_kind = COALESCE(?, gpm_kind)',
                  'customer_id = COALESCE(?, customer_id)', 'assigned_to = COALESCE(?, assigned_to)',
                  'stage = COALESCE(?, stage)'];
    const params: unknown[] = [input.name ?? null, input.gpm_kind ?? null,
                               input.customer_id ?? null, input.assigned_to ?? null, input.stage ?? null];
    if ('pm_company' in input) { sets.push('pm_company = ?'); params.push(input.pm_company ?? null); }
    if ('started_on' in input) { sets.push('started_on = ?'); params.push(dateOrNull(input.started_on)); }
    if ('ends_on' in input) { sets.push('ends_on = ?'); params.push(dateOrNull(input.ends_on)); }
    sets.push('updated_by = ?', 'updated_at = NOW()');
    params.push(userId, id);
    await execute(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);
    // **同じ本文なら足さない**（`skipIfSame`）。保存し直すたびに同じメモが積むと、
    // やり取りがメモで埋まって読めなくなる（案件側と同じ決めごと）
    const cur = await queryOne('SELECT customer_id FROM projects WHERE id = ?', [id]) as { customer_id: string } | null;
    await addMemoActivity(id, cur?.customer_id ?? null, input.notes, userId, true);

    /*
     * ⚠️ **段が動いたら履歴に残し、受注なら GLS を採る**（レビューでの指摘 #67）。
     *
     * 案件管理は `changeStage` がこの2つをやっていますが、プロジェクト管理は
     * **`stage` の列を書き換えるだけ**でした。つまり:
     *
     *  ・**いつ受注になったか**がどこにも残らない（停滞の理由が言えない）
     *  ・**GLS-B が永久に採られない**。しかも発番の口は案件側にしかなく
     *    `sales` を要求するので、`gpm` だけの人には**採る手段がありません**。
     *    番号が無いと請求（月次）にも上がらず、BOX のフォルダ名も OPP のまま
     *
     * **分類が無いときは受注そのものを止めない**（案件側と同じ判断）。
     * 採れなかったことは `gls_error` で返し、画面がそう出します。
     *
     * 履歴・`won_at`（受注）は `recordStageTransition` に集約（テーマ2 PR1）。
     * **`lost_at`/`lost_reason` もここで初めて書かれるようになる** — 今までは
     * GPM 経由で見送り（`e_lost`）にしても `lost_at` が NULL のまま `updated_at` に
     * 付け替えられて失注理由分析に集計される穴があった（画面に入力欄はまだ無いため
     * `input.lost_reason`/`input.lost_reason_note` は今は常に未指定＝NULL のままだが、
     * MCP などから値が来れば正しく保存される）。GLS 発番は引き続きここが担当する
     */
    let glsError: string | null = null;
    // `nextStage` を条件にも入れて絞り込む（`stageChanged` は `!!nextStage` 込みの
    // 別変数なので、TS は `stageChanged` だけでは `nextStage` を string に絞れない）
    if (stageChanged && nextStage) {
      await recordStageTransition(id, before.stage ?? null, nextStage, userId, {
        lost_reason: input.lost_reason,
        lost_reason_note: input.lost_reason_note,
      });
      if (nextStage === 'a_won' && !before.gls_number) {
        try {
          await salesProjectService.issueGls(id, {}, userId);
        } catch (err) {
          glsError = err instanceof AppError ? err.message : 'GLS番号を採れませんでした';
          console.warn('[gpm.update] GLS auto-issue failed:', id, glsError);
        }
      }
    }
    // AI（MCP）が起票したプロジェクトなら、人がどこを直したかを差分で残す（7日窓・
    // 失敗しても保存は成功のまま）。after は同じ ::text キャストで読み直して比べる
    const after = await queryOne(
      `SELECT name, gpm_kind, pm_company, started_on::text AS started_on,
              ends_on::text AS ends_on, assigned_to, customer_id
         FROM projects WHERE id = ?`, [id],
    ) as Record<string, unknown> | null;
    if (after) await recordGpmProjectCorrections(id, before, after, userId);

    const saved = (await this.getById(id))!;
    return glsError ? { ...saved, gls_error: glsError } : saved;
  },

  async remove(id: string): Promise<void> {
    await assertProject(id);
    await execute('UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  },
};

/**
 * その id がプロジェクト（GLS-B）かを確かめる。案件（A）なら 404。
 * `gpm/index.ts` の私用ヘルパーと同じ確認を、見積・議事録・BOX の MCP ツール
 * （`gpm.tools.ts`）からも呼べるように公開したもの — 書き写すと `gls_category`
 * の確認を1か所でも落としたときに気づけない
 */
export async function assertGpmProjectId(id: string): Promise<void> {
  await assertProject(id);
}

/** その project_id がプロジェクト（GLS-B）か（見積の所属確認用・404にしない場合） */
export async function isGpmProjectId(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const row = await queryOne(`SELECT id FROM projects p WHERE p.id = ? AND ${IS_PROJECT}`, [id]);
  return !!row;
}

/** その議事録がプロジェクト（GLS-B）のものか。案件の議事録を触らせない（`gpm/index.ts` と同じ確認） */
export async function assertGpmMinutesId(minutesId: string): Promise<{ project_id: string }> {
  const row = await queryOne(
    `SELECT m.id, m.project_id FROM project_minutes m
       JOIN projects p ON p.id = m.project_id
      WHERE m.id = ? AND m.deleted_at IS NULL AND ${IS_PROJECT}`,
    [minutesId],
  ) as { id: string; project_id: string } | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '議事録が見つかりません');
  return row;
}

/**
 * 体制（組織図）のメンバー (migration 169)。
 *
 * ── 箱は「名前が同じ人の集まり」 ────────────────────────────
 *
 * `group_label` が同じ人が1つの箱に入り、`tier` でどの段かが決まります。
 * **箱を別テーブルにしていません** — 箱そのものに持たせる値が無く、
 * 分けると人を消したときに空の箱が残って、それを消す画面がまた要ります。
 *
 * ── `project_members` と統合しない ──────────────────────────
 *
 * `project_members` は**社内の担当者**、`gpm_members` は**発注者・PM 会社・業者を含む体制**。
 * 同じ表にすると、取引先の名前が「自分のタスク」の担当候補に出ます。
 *
 * ── 消すのは1人ずつ ────────────────────────────────────────
 *
 * 「箱ごと消す」は作りません。押した人は「箱の名前を消した」つもりでも
 * **中の人が全員消えます**。1人ずつ消せば、最後の1人が消えたときに箱も消えます。
 */
export const MEMBER_SIDES = ['internal', 'client', 'pm', 'vendor'] as const;
export const MEMBER_TIERS = ['top', 'lead', 'unit'] as const;

export const memberService = {
  async add(projectId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    await assertProject(projectId);

    const name = String(input.name ?? '').trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前を入れてください');
    const side = String(input.side ?? 'internal');
    assertIn(side, MEMBER_SIDES, 'side');
    const tier = String(input.tier ?? 'unit');
    assertIn(tier, MEMBER_TIERS, 'tier');

    // 並び順は**同じ段の末尾**。段をまたいで通し番号にすると、
    // 段を変えたときに他の段の並びまで動く
    const maxRow = await queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM gpm_members WHERE project_id = ? AND tier = ?',
      [projectId, tier],
    );
    const id = uuidv4();
    await execute(
      `INSERT INTO gpm_members
         (id, project_id, user_id, name, org, role, email, side, tier, group_label, badge, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, projectId, input.user_id ?? null, name,
        input.org ?? null, input.role ?? null, input.email ?? null,
        side, tier, (input.group_label as string) || null, (input.badge as string) || null,
        Number(maxRow?.m ?? 0) + 1,
      ],
    );
    return (await queryOne('SELECT * FROM gpm_members WHERE id = ?', [id]))!;
  },

  async update(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await queryOne('SELECT * FROM gpm_members WHERE id = ?', [id]) as Record<string, unknown> | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'メンバーが見つかりません');
    if (typeof input.side === 'string') assertIn(input.side, MEMBER_SIDES, 'side');
    if (typeof input.tier === 'string') assertIn(input.tier, MEMBER_TIERS, 'tier');

    // **渡さなかった項目は今の値を保つ。** 画面が一部だけ送っても消えない
    const keep = <T>(v: unknown, cur: T) => (v === undefined ? cur : v);
    await execute(
      `UPDATE gpm_members SET
         name = ?, org = ?, role = ?, email = ?, side = ?, tier = ?, group_label = ?, badge = ?, user_id = ?
       WHERE id = ?`,
      [
        keep(input.name, existing.name), keep(input.org, existing.org),
        keep(input.role, existing.role), keep(input.email, existing.email),
        keep(input.side, existing.side), keep(input.tier, existing.tier),
        keep(input.group_label, existing.group_label), keep(input.badge, existing.badge),
        keep(input.user_id, existing.user_id), id,
      ],
    );
    return (await queryOne('SELECT * FROM gpm_members WHERE id = ?', [id]))!;
  },

  async remove(id: string): Promise<void> {
    const row = await queryOne('SELECT id FROM gpm_members WHERE id = ?', [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'メンバーが見つかりません');
    // **物理削除。** 体制は「いま誰がやっているか」で、履歴を残す表ではない
    await execute('DELETE FROM gpm_members WHERE id = ?', [id]);
  },

  /**
   * 並び替え（画面にも HTTP にも今までこの操作は無かった・MCP 整備で新設）。
   * `sort_order` は段（`tier`）の中の位置なので、**この案件のメンバーだけ**を
   * 対象にする（`project_id` で絞る・`taskColumnsService.reorder` と同じ形）。
   * 段をまたぐ並び替えは呼べる（段は `update` の別呼び出しで変える）。
   */
  async reorder(projectId: string, items: Array<{ id: string; sort_order: number }>): Promise<void> {
    await assertProject(projectId);
    // 1トランザクションで適用する。行ごとの UPDATE だと、途中失敗や同時の並び替えで
    // どちらのリクエストとも違う混ざった順序が残る
    await withTransaction(async (tx) => {
      for (const item of items) {
        await tx.execute(
          'UPDATE gpm_members SET sort_order = ? WHERE id = ? AND project_id = ?',
          [item.sort_order, item.id, projectId],
        );
      }
    });
  },
};

/**
 * テンプレートを写してフェーズと配下タスクを作る。
 * **前の工程の終わりの翌日が次の工程の始まり**（モックの新規作成プレビューと同じ数え方）。
 * 開始日を入れていなければ日付は入れない（**推測しない**）。
 */
async function expandTemplate(
  tx: Tx, projectId: string, templateId: string, startedOn: string | null, userId: string,
): Promise<void> {
  const phases = await queryAll(
    'SELECT id, label, days, role, sort_order FROM gpm_template_phases WHERE template_id = ? ORDER BY sort_order',
    [templateId],
  ) as Array<{ id: string; label: string; days: number; role: string | null; sort_order: number }>;

  let cursor = startedOn;
  for (const p of phases) {
    const start = cursor;
    const end = cursor ? addDays(cursor, Math.max(0, (p.days || 1) - 1)) : null;
    const phaseId = uuidv4();
    await tx.execute(
      `INSERT INTO gpm_phases (id, project_id, label, state, started_on, ends_on, role, sort_order)
       VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)`,
      [phaseId, projectId, p.label, start, end, p.role, p.sort_order],
    );

    const tasks = await queryAll(
      'SELECT label, days, role, is_required, sort_order FROM gpm_template_tasks WHERE template_phase_id = ? ORDER BY sort_order',
      [p.id],
    ) as Array<{ label: string; days: number; role: string | null; is_required: boolean; sort_order: number }>;
    let tCursor = start;
    for (const t of tasks) {
      const due = tCursor ? addDays(tCursor, Math.max(0, (t.days || 1) - 1)) : null;
      await tx.execute(
        `INSERT INTO project_tasks
           (id, project_id, title, description, is_completed, sort_order, due_at, gpm_phase_id, created_by)
         VALUES (?, ?, ?, ?, false, ?, ?, ?, ?)`,
        [uuidv4(), projectId, t.label, t.role ? `担当: ${t.role}` : null, t.sort_order,
         due ? `${due}T18:00:00` : null, phaseId, userId],
      );
      if (tCursor && due) tCursor = addDays(due, 1);
    }
    if (end) cursor = addDays(end, 1);
  }
}

// ══ タスク（⑤ 全プロジェクトのタスク一覧）════════════════════

/**
 * GPM のタスクは既存 `project_tasks` の行で、**GLS-B 案件にぶら下がっています**。
 * 工程（`gpm_phase_id`）に付いているものも、付いていないものも同じプロジェクトのものなので
 * **両方返します** — 工程の有無で見え方が変わるほうが分かりにくい。
 *
 * この口は「プロジェクトを横断して1枚で見る」ためのものです。
 * 案件管理のタスク一覧には `gls_category = 'A'` の絞り込みで出ません。
 */
export const gpmTaskService = {
  async listAll(
    filter: { status?: string; project_id?: string; viewer_id?: string } = {},
  ): Promise<Record<string, unknown>[]> {
    const conds = ['t.deleted_at IS NULL', IS_PROJECT];
    const params: unknown[] = [];

    // visibility='private' の行は担当者か作成者が本人のときだけ返す
    // （根源整理 §3-4 の漏れ修正。getTeamLoad と同じ規則）。
    // 以前はこの一覧が private タスクの全文を gpm 権限者全員に返していた。
    // **viewer_id が無い呼び出しは private を1行も返さない**（漏らすより隠すほうが安全側）
    if (filter.viewer_id) {
      conds.push(`(t.visibility IS DISTINCT FROM 'private' OR t.assigned_to = ? OR t.created_by = ?)`);
      params.push(filter.viewer_id, filter.viewer_id);
    } else {
      conds.push(`t.visibility IS DISTINCT FROM 'private'`);
    }

    // 状態は**完了したかどうか**が正（`is_completed`）。止まり方は `work_state`。
    // 期限超過の判定は COALESCE(due_at, due_date+18:00)（根源整理 §3-4）—
    // due_at だけ見ると、カンバン・標準工程で作られた行の遅れが見えない
    if (filter.status === 'open') conds.push('t.is_completed = false');
    else if (filter.status === 'done') conds.push('t.is_completed = true');
    else if (filter.status === 'overdue') {
      conds.push(`t.is_completed = false
                  AND COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp) IS NOT NULL
                  AND COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp) < NOW()`);
    } else if (filter.status && filter.status !== 'all') {
      // **知らない状態は空で返す。** 素通しすると「絞ったのに全件」で気づけない
      conds.push('FALSE');
    }
    if (filter.project_id) { conds.push('p.id = ?'); params.push(filter.project_id); }

    return queryAll(
      `SELECT t.id, t.title, t.description, t.is_completed, t.work_state,
              COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)::text AS due_at,
              -- ガント用の3列 (migration 131)。読めないと、ガントの見た目を
              -- MCP から直すときに現状が分からず「読める場所が案件側の口だけ」になる
              t.start_date::text AS start_date, t.progress, t.is_milestone,
              t.sort_order, t.assigned_to,
              u.name AS assigned_to_name,
              ph.id AS phase_id, ph.label AS phase_label, ph.state AS phase_state,
              p.id AS project_id, p.name AS project_name, p.gpm_kind AS project_kind
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN gpm_phases ph ON ph.id = t.gpm_phase_id
         LEFT JOIN users u ON u.id = t.assigned_to
        WHERE ${conds.join(' AND ')}
        ORDER BY t.is_completed ASC,
                 COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp) ASC NULLS LAST,
                 p.name ASC, ph.sort_order ASC NULLS LAST, t.sort_order ASC`,
      params,
    );
  },

  /** 1件ぶん。**一覧と同じ形で返す**（画面が同じ型で受けられるように） */
  async getById(taskId: string): Promise<Record<string, unknown> | undefined> {
    const rows = await queryAll(
      // 期限の読みは一覧と同じ COALESCE（根源整理 §3-4）
      `SELECT t.id, t.title, t.description, t.is_completed, t.work_state,
              COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)::text AS due_at,
              t.start_date::text AS start_date, t.progress, t.is_milestone,
              t.sort_order, t.assigned_to,
              u.name AS assigned_to_name,
              ph.id AS phase_id, ph.label AS phase_label, ph.state AS phase_state,
              p.id AS project_id, p.name AS project_name, p.gpm_kind AS project_kind
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN gpm_phases ph ON ph.id = t.gpm_phase_id
         LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.id = ? AND t.deleted_at IS NULL AND ${IS_PROJECT}`,
      [taskId],
    );
    return rows[0];
  },

  /**
   * 足す。**工程に付けるかどうかは任意**（`gpm_phase_id` が NULL のタスクもある）。
   *
   * 期限は `due_at`（時刻つき）に **18:00** で入れます。ひな形から写すときと
   * 同じ形にしないと、同じプロジェクトのタスクが2つの列に分かれて
   * 「自分のタスク」の並び (`COALESCE(due_at, due_date+18:00)`) が日によって入れ替わります。
   */
  async create(projectId: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    await assertProject(projectId);
    const title = String(input.title ?? '').trim();
    if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'タスクの名前を入れてください');

    const phaseId = await resolvePhaseId(projectId, input.gpm_phase_id);
    const due = dateOrNull(input.due_date);
    // 並びは**同じ工程の末尾**。工程をまたいで通し番号にすると、
    // 工程を付け替えたときに他の工程の並びまで動く
    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM project_tasks
        WHERE project_id = ? AND gpm_phase_id IS NOT DISTINCT FROM ? AND deleted_at IS NULL`,
      [projectId, phaseId],
    ) as { m: number } | undefined;

    const id = uuidv4();
    // 期限は due_at (18:00) と**旧 `due_date` 列の両方**に書く（update と同じ形）。
    // due_at だけだと、start_date/due_date を読む案件詳細のガント（GLS-B の既定ビュー）
    // からは「未スケジュール」に見える
    await execute(
      `INSERT INTO project_tasks
         (id, project_id, title, description, is_completed, sort_order, due_at, due_date,
          start_date, progress, is_milestone, assigned_to, gpm_phase_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, false, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, title, input.description ?? null, Number(maxRow?.m ?? -1) + 1,
       due ? `${due}T18:00:00` : null, due,
       dateOrNull(input.start_date), clampProgress(input.progress) ?? 0, input.is_milestone === true,
       (typeof input.assigned_to === 'string' && input.assigned_to) ? input.assigned_to : null,
       phaseId, userId, userId],
    );
    return (await this.getById(id))!;
  },

  /**
   * 直す。**渡した項目だけを書き換えます** — 画面が持っていない項目
   * （担当・工程）を空で送られて黙って外れるのを防ぐため。
   * 期限は「空にする」を送れないと直せないので、**`due_date` が キーとして
   * 入っていれば** `null` でも書き換えます。
   */
  async update(taskId: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const task = await assertGpmTask(taskId);
    // AI 起票の修正差分（gpm-ai-feedback）用の before。期限は日付に丸めて比べる
    // （書き込みは常に `<日付>T18:00:00` なので、日付が同じなら「直していない」）
    const FEEDBACK_COLS = `SELECT title, description, assigned_to,
              due_at::date::text AS due_date, start_date::text AS start_date,
              is_milestone, gpm_phase_id
         FROM project_tasks WHERE id = ?`;
    const before = await queryOne(FEEDBACK_COLS, [taskId]) as Record<string, unknown> | null;
    const sets: string[] = ['updated_at = NOW()', 'updated_by = ?'];
    const params: unknown[] = [userId];

    if (typeof input.title === 'string') {
      const title = input.title.trim();
      if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'タスクの名前を入れてください');
      sets.push('title = ?'); params.push(title);
    }
    if ('description' in input) { sets.push('description = ?'); params.push(input.description ?? null); }
    if ('assigned_to' in input) {
      sets.push('assigned_to = ?');
      params.push((typeof input.assigned_to === 'string' && input.assigned_to) ? input.assigned_to : null);
    }
    if ('due_date' in input) {
      const due = dateOrNull(input.due_date);
      // **旧 `due_date` 列も一緒に書く**（project-tasks.service の update と同じ形）。
      // 読み手は全員 COALESCE(due_at, due_date+18:00) なので、due_at だけ NULL にすると
      // 旧列に日付が残っている行（カンバン/ガント/一括作成で作られたもの）では
      // 「期限を消したのに消えない」になる
      sets.push('due_at = ?', 'due_date = ?');
      params.push(due ? `${due}T18:00:00` : null, due);
    }
    if ('gpm_phase_id' in input) {
      const phaseId = await resolvePhaseId(String(task.project_id), input.gpm_phase_id);
      sets.push('gpm_phase_id = ?'); params.push(phaseId);
    }
    // ── ガント用の細かい編集 (migration 131 の列) ──────────────
    // これまで「案件タスク側の update_task で」と案内していたが、GPM の画面に
    // ガント・かんばんが載った回からこの口でも直せるようにした（口が2つあると
    // 片方だけ検証が緩む形になるので、確認 (assertGpmTask) はこの update 1本に寄せる）
    if ('start_date' in input) { sets.push('start_date = ?'); params.push(dateOrNull(input.start_date)); }
    if ('progress' in input) {
      // 列は NOT NULL DEFAULT 0。null で「消す」= 0 に戻す
      sets.push('progress = ?'); params.push(clampProgress(input.progress) ?? 0);
    }
    if ('is_milestone' in input) { sets.push('is_milestone = ?'); params.push(input.is_milestone === true); }
    if ('work_state' in input) {
      const ws = String(input.work_state ?? 'todo');
      assertIn(ws, TASK_WORK_STATES, 'work_state');
      sets.push('work_state = ?'); params.push(ws);
    }
    if ('sort_order' in input) {
      const so = Number(input.sort_order);
      if (!Number.isInteger(so)) throw new AppError(400, 'VALIDATION_ERROR', 'sort_order は整数です');
      sets.push('sort_order = ?'); params.push(so);
    }
    if ('is_completed' in input) {
      const done = input.is_completed !== false;
      sets.push('is_completed = ?', 'completed_at = CASE WHEN ? THEN COALESCE(completed_at, NOW()) ELSE NULL END');
      params.push(done, done);
    }
    params.push(taskId);
    await execute(`UPDATE project_tasks SET ${sets.join(', ')} WHERE id = ?`, params);
    // AI（MCP）が起票したタスクなら、人がどこを直したかを差分で残す（7日窓）
    const after = await queryOne(FEEDBACK_COLS, [taskId]) as Record<string, unknown> | null;
    if (before && after) await recordGpmTaskCorrections(taskId, before, after, userId);
    return (await this.getById(taskId))!;
  },

  /** 消す（論理削除）。**完了とは別**なので、終わったタスクは消さずに完了にする */
  async remove(taskId: string, userId: string): Promise<void> {
    await assertGpmTask(taskId);
    await execute(
      'UPDATE project_tasks SET deleted_at = NOW(), updated_at = NOW(), updated_by = ? WHERE id = ?',
      [userId, taskId],
    );
  },

  /** 完了の入切。**`is_completed` だけを触る** — 止まり方 (`work_state`) は別の列 */
  async setDone(taskId: string, done: boolean, userId: string): Promise<Record<string, unknown>> {
    await assertGpmTask(taskId);
    await execute(
      `UPDATE project_tasks
          SET is_completed = ?, completed_at = CASE WHEN ? THEN NOW() ELSE NULL END,
              updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [done, done, userId, taskId],
    );
    return (await queryOne('SELECT * FROM project_tasks WHERE id = ?', [taskId]))!;
  },
};

/**
 * **案件（GLS-A）のタスクは触らせない。** この確認を通さない口を1つ作ると、
 * `gpm` の権限しか無い人が案件のタスクを直せます（`setDone` を書いたときに
 * インラインで書いていたものを、足す・直す・消すでも使うので1本にした）。
 */
async function assertGpmTask(taskId: string): Promise<{ project_id: string }> {
  const row = await queryOne(
    `SELECT t.id, t.project_id FROM project_tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ? AND t.deleted_at IS NULL AND ${IS_PROJECT}`,
    [taskId],
  ) as { project_id: string } | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
  return row;
}

/**
 * 工程の id を確かめる。**他のプロジェクトの工程には付けさせない** —
 * 付いてしまうと、そのタスクが別のプロジェクトの工程の下に並び、
 * 進み具合の分母（`task_count`）も相手側に足されます。
 */
async function resolvePhaseId(projectId: string, raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string' || !raw) return null;
  const row = await queryOne('SELECT id FROM gpm_phases WHERE id = ? AND project_id = ?', [raw, projectId]);
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', 'その工程はこのプロジェクトのものではありません');
  return raw;
}

// ══ 未確認事項 ════════════════════════════════════════════

export const openItemService = {
  /** プロジェクトをまたいで引く（① ダッシュボードと ⑤ タスク一覧で使う） */
  async listAll(filter: { status?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['oi.deleted_at IS NULL', IS_PROJECT];
    const params: unknown[] = [];
    if (filter.status && filter.status !== 'all') {
      assertIn(filter.status, OPEN_ITEM_STATUSES, 'status');
      conds.push('oi.status = ?'); params.push(filter.status);
    } else if (!filter.status) {
      conds.push(`oi.status <> 'resolved'`);
    }
    return queryAll(
      `SELECT oi.*, p.name AS project_name, ph.label AS phase_label
         FROM gpm_open_items oi
         JOIN projects p ON p.id = oi.project_id
         LEFT JOIN gpm_phases ph ON ph.id = oi.phase_id
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE oi.status WHEN 'waiting' THEN 0 WHEN 'checking' THEN 1 ELSE 2 END,
                 oi.due_date NULLS LAST, oi.raised_at`,
      params,
    );
  },

  async create(projectId: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    await assertProject(projectId);
    const question = String(input.question ?? '').trim();
    if (!question) throw new AppError(400, 'VALIDATION_ERROR', '何を訊いているのかを書いてください');
    const toKind = String(input.to_kind ?? 'client');
    assertIn(toKind, OPEN_ITEM_TO_KINDS, 'to_kind');
    const id = uuidv4();
    await execute(
      `INSERT INTO gpm_open_items
         (id, project_id, phase_id, question, to_kind, to_name, blocks, due_date, source_minutes_id, raised_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, input.phase_id ?? null, question, toKind, input.to_name ?? null,
       input.blocks ?? null, dateOrNull(input.due_date), input.source_minutes_id ?? null, userId],
    );
    return (await queryOne('SELECT * FROM gpm_open_items WHERE id = ?', [id]))!;
  },

  async update(id: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne('SELECT id, status FROM gpm_open_items WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '未確認事項が見つかりません');
    const status = typeof input.status === 'string' ? input.status : null;
    if (status) assertIn(status, OPEN_ITEM_STATUSES, 'status');

    // **解決したときだけ日時と人を打ち、戻したら消す。**
    // 1つの UPDATE 文に CASE を並べて同じ値を何度も渡す形にすると、
    // 位置がずれた瞬間に黙って効かなくなる（実際に効かなかった）。
    // 組み立ててから流すほうが読めるし、試験でずれに気づける
    // **渡した項目だけを書き換える**（タスクの update と同じ形）。以前は
    // to_name / blocks / due_date を無条件で書いており、一部の項目だけ送る呼び出し
    // （MCP の部分更新）が触っていない値を黙って消す形だった。画面は全項目を送るので
    // 挙動は変わらない。「空にする」はキーごと null を送れば書ける
    const sets = ['question = COALESCE(?, question)', 'to_kind = COALESCE(?, to_kind)'];
    const params: unknown[] = [input.question ?? null, input.to_kind ?? null];
    if ('to_name' in input) { sets.push('to_name = ?'); params.push(input.to_name ?? null); }
    if ('blocks' in input) { sets.push('blocks = ?'); params.push(input.blocks ?? null); }
    if ('due_date' in input) { sets.push('due_date = ?'); params.push(dateOrNull(input.due_date)); }
    if (status) {
      sets.push('status = ?');
      params.push(status);
      if (status === 'resolved') {
        sets.push('resolved_at = COALESCE(resolved_at, NOW())', 'resolved_by = ?');
        params.push(userId);
      } else {
        sets.push('resolved_at = NULL', 'resolved_by = NULL');
      }
    }
    sets.push('updated_at = NOW()');
    params.push(id);
    await execute(`UPDATE gpm_open_items SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await queryOne('SELECT * FROM gpm_open_items WHERE id = ?', [id]))!;
  },

  async remove(id: string): Promise<void> {
    await execute('UPDATE gpm_open_items SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  },
};

/**
 * 議事録の持ち帰りを**未確認事項にする** (migration 161 の `source_minutes_id`)。
 *
 * ── なぜタスクではなく未確認事項か ──────────────────────────
 *
 * 案件側の同じ操作（`openItemToTask`）はタスクを作りますが、工事・構築で
 * 打合せから出てくる持ち帰りは**「先方の判断待ち」がほとんど**です。
 * タスクにすると「自分がやること」の一覧に相手待ちのものが混ざり、
 * **プロジェクトをまたいで「いま何件止まっているか」を数えられません**
 * （それが `gpm_open_items` を作った理由そのもの）。
 *
 * ── 二度作れない ────────────────────────────────────────────
 *
 * 作ると `open_items` のその要素に `ask_id` を書き戻します。
 * 画面のボタンを隠すだけだと、**同時に開いた別の画面が古いままボタンを出す**。
 *
 * ⚠️ **印の確認は取引の中で、行を押さえてから行います**（`FOR UPDATE`）。
 * 取引の外で確かめると、2人が古いタブからほぼ同時に押したときに
 * **両方が確認を通り、未確認事項が2件でき、印は後から書いた1つだけが残ります** —
 * 参照の無い1件が「止まっているもの」として数えられ続け、
 * 議事録の画面からは消せません（Codex の指摘・PR #103）。
 *
 * ── 担当（誰に訊くか）は入れない ────────────────────────────
 *
 * `open_items[].owner` は **AI が文字起こしから拾った名前の文字列**で、
 * 取引先の担当者名も社内の名前も同じ形で入っています。`to_kind`
 * （発注者／PM会社／業者／社内）を機械で決めると必ず取り違えるので、
 * **既定は「発注者」にして、拾った名前は `to_name` に文字として残す**だけにします。
 */
export async function openItemToAsk(
  minutesId: string, index: number, userId: string,
): Promise<{ ask_id: string; question: string }> {
  // プロジェクト（GLS-B）のものかは先に確かめる（案件の議事録を触らせない）
  const head = await getMinutes(minutesId);
  await assertProject(String(head.project_id));

  const id = uuidv4();
  return withTransaction(async (tx) => {
    /*
      **行を押さえてから読み直す。** ここで読んだ `open_items` が、この取引が
      commit するまで他の取引に書き換えられないことが要点で、印の確認と
      書き戻しのあいだに割り込まれないようにしています。
    */
    const locked = await tx.queryOne(
      'SELECT project_id, open_items FROM project_minutes WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [minutesId],
    ) as { project_id: string; open_items: unknown } | undefined;
    if (!locked) throw new AppError(404, 'NOT_FOUND', '議事録が見つかりません');

    const items = Array.isArray(locked.open_items)
      ? [...(locked.open_items as Record<string, unknown>[])] : [];
    const item = items[index];
    if (!item) throw new AppError(404, 'NOT_FOUND', 'その持ち帰りはありません');
    if (item.ask_id) throw new AppError(400, 'ALREADY_EXISTS', 'この持ち帰りはもう未確認事項にしてあります');

    const text = String(item.text ?? '').trim();
    if (!text) throw new AppError(400, 'VALIDATION_ERROR', '中身が空の持ち帰りは未確認事項にできません');
    const owner = String(item.owner ?? '').trim();
    const due = dateOrNull(item.due);

    await tx.execute(
      `INSERT INTO gpm_open_items
         (id, project_id, question, to_kind, to_name, due_date, source_minutes_id, raised_by)
       VALUES (?, ?, ?, 'client', ?, ?, ?, ?)`,
      [id, locked.project_id, text, owner || null, due, minutesId, userId],
    );
    items[index] = { ...item, ask_id: id };
    await tx.execute(
      'UPDATE project_minutes SET open_items = ?, updated_at = NOW(), updated_by = ? WHERE id = ?',
      [JSON.stringify(items), userId, minutesId],
    );
    return { ask_id: id, question: text };
  });
}

// ══ フェーズ ══════════════════════════════════════════════

export const phaseService = {
  /**
   * 足す。**いちばん後ろに付けます**（差し込む位置は並べ替えで動かす）。
   *
   * ひな形を選ばずに作ったプロジェクトも、ここから工程を組めます
   * — 選び直すには作り直すしかない、という状態を無くすため。
   */
  async create(projectId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    await assertProject(projectId);
    const label = String(input.label ?? '').trim();
    if (!label) throw new AppError(400, 'VALIDATION_ERROR', '工程の名前を入れてください');
    const state = String(input.state ?? 'todo');
    assertIn(state, PHASE_STATES, 'state');

    const maxRow = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM gpm_phases WHERE project_id = ?', [projectId],
    ) as { m: number } | undefined;
    const id = uuidv4();
    await execute(
      `INSERT INTO gpm_phases (id, project_id, label, state, started_on, ends_on, role, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, label, state, dateOrNull(input.started_on), dateOrNull(input.ends_on),
       input.role ?? null, Number(maxRow?.m ?? -1) + 1],
    );
    return (await queryOne('SELECT * FROM gpm_phases WHERE id = ?', [id]))!;
  },

  async update(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await queryOne('SELECT id FROM gpm_phases WHERE id = ?', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '工程が見つかりません');
    if (typeof input.state === 'string') assertIn(input.state, PHASE_STATES, 'state');
    // **渡した項目だけを書き換える**（open-item の update と同じ形・同じ理由）。
    // 画面は全項目を送るので挙動は変わらない
    const sets = ['label = COALESCE(?, label)', 'state = COALESCE(?, state)', 'updated_at = NOW()'];
    const params: unknown[] = [input.label ?? null, input.state ?? null];
    if ('started_on' in input) { sets.push('started_on = ?'); params.push(dateOrNull(input.started_on)); }
    if ('ends_on' in input) { sets.push('ends_on = ?'); params.push(dateOrNull(input.ends_on)); }
    if ('role' in input) { sets.push('role = ?'); params.push(input.role ?? null); }
    params.push(id);
    await execute(`UPDATE gpm_phases SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await queryOne('SELECT * FROM gpm_phases WHERE id = ?', [id]))!;
  },

  /**
   * 隣と入れ替える。**押した工程と隣の2行だけを書き換えます** —
   * 並び全体を採番し直す作りにすると、2人が同時に押したときに
   * 片方の並びが丸ごと巻き戻ります。
   */
  async move(id: string, dir: 'up' | 'down'): Promise<Record<string, unknown>[]> {
    const me = await queryOne(
      'SELECT id, project_id, sort_order FROM gpm_phases WHERE id = ?', [id],
    ) as { id: string; project_id: string; sort_order: number } | null;
    if (!me) throw new AppError(404, 'NOT_FOUND', '工程が見つかりません');

    const neighbor = await queryOne(
      dir === 'up'
        ? `SELECT id, sort_order FROM gpm_phases WHERE project_id = ? AND sort_order < ?
             ORDER BY sort_order DESC LIMIT 1`
        : `SELECT id, sort_order FROM gpm_phases WHERE project_id = ? AND sort_order > ?
             ORDER BY sort_order ASC LIMIT 1`,
      [me.project_id, me.sort_order],
    ) as { id: string; sort_order: number } | null;
    // **端では何もしない。** 400 を返すと、端の工程で押した人にだけ赤い札が出る
    if (!neighbor) return [];

    await withTransaction(async (tx) => {
      await tx.execute('UPDATE gpm_phases SET sort_order = ?, updated_at = NOW() WHERE id = ?',
        [neighbor.sort_order, me.id]);
      await tx.execute('UPDATE gpm_phases SET sort_order = ?, updated_at = NOW() WHERE id = ?',
        [me.sort_order, neighbor.id]);
    });
    return queryAll('SELECT * FROM gpm_phases WHERE id IN (?, ?)', [me.id, neighbor.id]);
  },

  /**
   * 消す。**配下のタスクは消しません** — 工程から外すだけです
   * （`gpm_phase_id` を NULL にする）。
   *
   * 一緒に消す作りにすると、「工程の名前を直したかっただけ」の人が
   * **タスクを何十件も消します**。外れたタスクは詳細画面の「工程なし」の束と
   * ⑤ 全プロジェクトのタスクに残るので、付け直せます。
   */
  async remove(id: string): Promise<{ detached: number }> {
    const row = await queryOne('SELECT id FROM gpm_phases WHERE id = ?', [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', '工程が見つかりません');
    const detached = await queryOne(
      'SELECT COUNT(*)::int AS n FROM project_tasks WHERE gpm_phase_id = ? AND deleted_at IS NULL', [id],
    ) as { n: number } | undefined;
    await withTransaction(async (tx) => {
      await tx.execute('UPDATE project_tasks SET gpm_phase_id = NULL, updated_at = NOW() WHERE gpm_phase_id = ?', [id]);
      // 未確認事項の `phase_id` は `ON DELETE SET NULL`（migration 161）なので任せる
      await tx.execute('DELETE FROM gpm_phases WHERE id = ?', [id]);
    });
    return { detached: Number(detached?.n ?? 0) };
  },
};
