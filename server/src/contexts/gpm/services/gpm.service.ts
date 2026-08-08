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

export const GPM_KINDS = ['self_build', 'group_order'] as const;
export const OPEN_ITEM_STATUSES = ['waiting', 'checking', 'resolved'] as const;
export const OPEN_ITEM_TO_KINDS = ['client', 'pm', 'vendor', 'internal'] as const;
export const PHASE_STATES = ['done', 'doing', 'blocked', 'todo'] as const;

/** 案件のステージ。**案件管理と同じ 7 段**（`projects_stage_check` と揃えること） */
export const STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'] as const;

/**
 * 一覧の絞り込みで束ねる 4 つ。**読むときだけの束ね方**で、保存するのは常に `stage`。
 *
 * 4 段で保存して 7 段に戻す形にすると、**触っていないのにステージが動きます**
 * (`neta` の案件を開いて「準備中」のまま保存 → `c_proposal` になる)。
 */
export const STAGE_GROUPS: Record<string, readonly string[]> = {
  planning: ['neta', 'd_hold', 'c_proposal', 'b_verbal'],
  active: ['a_won'],
  done: ['s_completed'],
  lost: ['e_lost'],
};

/** 自社構築の「お客様」。相手がいないので migration 179 が入れた行に寄せる */
export const SELF_CUSTOMER_ID = 'cust-self-gms';

function assertIn<T extends string>(v: string, allowed: readonly T[], label: string): void {
  if (!(allowed as readonly string[]).includes(v)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} は ${allowed.join(' / ')} のいずれかです`);
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && YMD.test(v) ? v : null);

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
      await tx.execute(
        `UPDATE gpm_templates SET name = COALESCE(?, name), icon = ?, description = ?,
                sort_order = COALESCE(?, sort_order), updated_by = ?, updated_at = NOW()
          WHERE id = ?`,
        [input.name ?? null, input.icon ?? null, input.description ?? null,
         input.sort_order ?? null, userId, id],
      );
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
              p.started_on, p.ends_on, p.gpm_template_id, p.notes,
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
              -- 次にやること: 期限がいちばん近い未完了タスク。
              -- **工程に付いていないタスクも数える** — GLS-B 案件のタスクはどれも
              -- このプロジェクトのものなので、工程の有無で見え方が変わるほうが分かりにくい
              (SELECT t.title FROM project_tasks t
                WHERE t.project_id = p.id AND t.is_completed = false AND t.deleted_at IS NULL
                ORDER BY t.due_at NULLS LAST LIMIT 1) AS next_task,
              (SELECT t.due_at FROM project_tasks t
                WHERE t.project_id = p.id AND t.is_completed = false AND t.deleted_at IS NULL
                ORDER BY t.due_at NULLS LAST LIMIT 1) AS next_due
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN users u ON u.id = p.assigned_to
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE p.stage WHEN 'a_won' THEN 0 WHEN 'b_verbal' THEN 1 WHEN 'c_proposal' THEN 2
                              WHEN 'd_hold' THEN 3 WHEN 'neta' THEN 4 WHEN 's_completed' THEN 5 ELSE 6 END,
                 p.ends_on NULLS LAST, p.created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    const p = await queryOne(
      `SELECT p.id, p.name, p.gls_number, p.stage, p.gpm_kind, p.pm_company,
              p.started_on, p.ends_on, p.gpm_template_id, p.notes,
              p.box_url_internal, p.box_url_external, p.customer_id,
              p.assigned_to, p.created_at, p.updated_at,
              u.name AS assigned_to_name, c.name AS customer_name, t.name AS template_name
         FROM projects p
         LEFT JOIN users u ON u.id = p.assigned_to
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN gpm_templates t ON t.id = p.gpm_template_id
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
    const code = await generateSequenceNumber('opp_code', 'OPP');

    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO projects
           (id, code, name, customer_id, stage, gls_category, customer_type, assigned_to,
            gpm_kind, pm_company, started_on, ends_on, gpm_template_id, notes,
            created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'B', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, name, customerId, stage,
         customerId === SELF_CUSTOMER_ID ? 'internal' : 'external',
         (input.assigned_to as string) || userId,
         kind, input.pm_company ?? null, startedOn, dateOrNull(input.ends_on),
         templateId, input.notes ?? null, userId, userId],
      );
      if (templateId) await expandTemplate(tx, id, templateId, startedOn, userId);
    });
    return (await this.getById(id))!;
  },

  async update(id: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    await assertProject(id);
    if (typeof input.stage === 'string') assertIn(input.stage, STAGES, 'stage');
    if (typeof input.gpm_kind === 'string') assertIn(input.gpm_kind, GPM_KINDS, 'gpm_kind');
    await execute(
      `UPDATE projects SET
         name = COALESCE(?, name), gpm_kind = COALESCE(?, gpm_kind),
         customer_id = COALESCE(?, customer_id),
         pm_company = ?, assigned_to = COALESCE(?, assigned_to),
         started_on = ?, ends_on = ?, stage = COALESCE(?, stage), notes = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [input.name ?? null, input.gpm_kind ?? null, input.customer_id ?? null,
       input.pm_company ?? null, input.assigned_to ?? null,
       dateOrNull(input.started_on), dateOrNull(input.ends_on),
       input.stage ?? null, input.notes ?? null, userId, id],
    );
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    await assertProject(id);
    await execute('UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  },
};

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
const MEMBER_SIDES = ['internal', 'client', 'pm', 'vendor'];
const MEMBER_TIERS = ['top', 'lead', 'unit'];

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
  async listAll(filter: { status?: string; project_id?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['t.deleted_at IS NULL', IS_PROJECT];
    const params: unknown[] = [];

    // 状態は**完了したかどうか**が正（`is_completed`）。止まり方は `work_state`
    if (filter.status === 'open') conds.push('t.is_completed = false');
    else if (filter.status === 'done') conds.push('t.is_completed = true');
    else if (filter.status === 'overdue') {
      conds.push("t.is_completed = false AND t.due_at IS NOT NULL AND t.due_at < NOW()");
    } else if (filter.status && filter.status !== 'all') {
      // **知らない状態は空で返す。** 素通しすると「絞ったのに全件」で気づけない
      conds.push('FALSE');
    }
    if (filter.project_id) { conds.push('p.id = ?'); params.push(filter.project_id); }

    return queryAll(
      `SELECT t.id, t.title, t.description, t.is_completed, t.work_state,
              t.due_at, t.sort_order, t.assigned_to,
              u.name AS assigned_to_name,
              ph.id AS phase_id, ph.label AS phase_label, ph.state AS phase_state,
              p.id AS project_id, p.name AS project_name, p.gpm_kind AS project_kind
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN gpm_phases ph ON ph.id = t.gpm_phase_id
         LEFT JOIN users u ON u.id = t.assigned_to
        WHERE ${conds.join(' AND ')}
        ORDER BY t.is_completed ASC,
                 t.due_at ASC NULLS LAST,
                 p.name ASC, ph.sort_order ASC NULLS LAST, t.sort_order ASC`,
      params,
    );
  },

  /** 完了の入切。**`is_completed` だけを触る** — 止まり方 (`work_state`) は別の列 */
  async setDone(taskId: string, done: boolean, userId: string): Promise<Record<string, unknown>> {
    // **案件（GLS-A）のタスクは触らせない。** ここを通せば `gpm` だけの人が
    // 案件のタスクを完了にできてしまう
    const row = await queryOne(
      `SELECT t.id FROM project_tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.id = ? AND t.deleted_at IS NULL AND ${IS_PROJECT}`,
      [taskId],
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
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
    const sets = ['question = COALESCE(?, question)', 'to_kind = COALESCE(?, to_kind)',
                  'to_name = ?', 'blocks = ?', 'due_date = ?'];
    const params: unknown[] = [input.question ?? null, input.to_kind ?? null,
                               input.to_name ?? null, input.blocks ?? null, dateOrNull(input.due_date)];
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

// ══ フェーズ ══════════════════════════════════════════════

export const phaseService = {
  async update(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await queryOne('SELECT id FROM gpm_phases WHERE id = ?', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '工程が見つかりません');
    if (typeof input.state === 'string') assertIn(input.state, PHASE_STATES, 'state');
    await execute(
      `UPDATE gpm_phases SET label = COALESCE(?, label), state = COALESCE(?, state),
              started_on = ?, ends_on = ?, role = ?, updated_at = NOW() WHERE id = ?`,
      [input.label ?? null, input.state ?? null, dateOrNull(input.started_on),
       dateOrNull(input.ends_on), input.role ?? null, id],
    );
    return (await queryOne('SELECT * FROM gpm_phases WHERE id = ?', [id]))!;
  },
};
