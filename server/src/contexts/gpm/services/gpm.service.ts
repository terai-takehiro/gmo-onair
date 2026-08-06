/**
 * プロジェクト管理（GPM）— 工程で管理する構築案件 (migration 161)
 *
 * 決めの根拠は `docs/design/gpm-model.md`。ここで押さえておくのは3つ。
 *
 * ① **`projects` とは別のテーブル。** `FROM projects` を書いている 94 か所のうち
 *    **75 か所が stage で絞っていない**（実測）ので、混ぜると案件一覧・財務の集計・
 *    決算取込・検索・MCP・週報が全部これを拾う。
 * ② **フェーズ配下のタスクは既存 `project_tasks`。** 列を1つ（`gpm_phase_id`）
 *    足して紐づける。タスクの実装を二重に持たない。
 * ③ **進捗 % は列に持たない。** 配下タスクの完了率から導出する。
 *    列に持つと同じ数字を2か所で数えることになり、必ず食い違う。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export const GPM_KINDS = ['self_build', 'group_order'] as const;
export const GPM_STATUSES = ['planning', 'active', 'done', 'onhold'] as const;
export const OPEN_ITEM_STATUSES = ['waiting', 'checking', 'resolved'] as const;
export const OPEN_ITEM_TO_KINDS = ['client', 'pm', 'vendor', 'internal'] as const;
export const PHASE_STATES = ['done', 'doing', 'blocked', 'todo'] as const;

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
      `SELECT template_id, COUNT(*)::int AS n FROM gpm_projects
        WHERE deleted_at IS NULL AND template_id IS NOT NULL GROUP BY template_id`,
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

// ══ プロジェクト ══════════════════════════════════════════

/**
 * 一覧。**進み具合はここで一緒に数える** — 画面が行ごとに問い合わせると N+1 になり、
 * さらに「同じ数字を2か所で数える」ことになる。
 */
export const projectService = {
  async list(filter: { status?: string; kind?: string; q?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['p.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.status && filter.status !== 'all') {
      assertIn(filter.status, GPM_STATUSES, 'status');
      conds.push('p.status = ?'); params.push(filter.status);
    }
    if (filter.kind) { assertIn(filter.kind, GPM_KINDS, 'kind'); conds.push('p.kind = ?'); params.push(filter.kind); }
    if (filter.q) {
      const like = `%${filter.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conds.push(`(p.name ILIKE ? ESCAPE '\\' OR p.client_name ILIKE ? ESCAPE '\\')`);
      params.push(like, like);
    }
    return queryAll(
      `SELECT p.*, u.name AS pm_name,
              -- いま動いているフェーズ（進行中が無ければ最初の未着手）
              (SELECT ph.label FROM gpm_phases ph WHERE ph.gpm_project_id = p.id
                ORDER BY CASE ph.state WHEN 'doing' THEN 0 WHEN 'blocked' THEN 1
                                       WHEN 'todo' THEN 2 ELSE 3 END, ph.sort_order LIMIT 1) AS current_phase,
              (SELECT COUNT(*)::int FROM gpm_phases ph WHERE ph.gpm_project_id = p.id) AS phase_count,
              (SELECT COUNT(*)::int FROM gpm_phases ph WHERE ph.gpm_project_id = p.id AND ph.state = 'done') AS phase_done,
              (SELECT COUNT(*)::int FROM gpm_open_items oi
                WHERE oi.gpm_project_id = p.id AND oi.status <> 'resolved' AND oi.deleted_at IS NULL) AS open_items,
              -- 次にやること: 期限がいちばん近い未完了タスク
              (SELECT t.title FROM project_tasks t
                 JOIN gpm_phases ph2 ON ph2.id = t.gpm_phase_id
                WHERE ph2.gpm_project_id = p.id AND t.is_completed = false AND t.deleted_at IS NULL
                ORDER BY t.due_at NULLS LAST LIMIT 1) AS next_task,
              (SELECT t.due_at FROM project_tasks t
                 JOIN gpm_phases ph3 ON ph3.id = t.gpm_phase_id
                WHERE ph3.gpm_project_id = p.id AND t.is_completed = false AND t.deleted_at IS NULL
                ORDER BY t.due_at NULLS LAST LIMIT 1) AS next_due
         FROM gpm_projects p
         LEFT JOIN users u ON u.id = p.pm_user_id
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'onhold' THEN 2 ELSE 3 END,
                 p.ends_on NULLS LAST, p.created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    const p = await queryOne(
      `SELECT p.*, u.name AS pm_name, c.name AS customer_name, t.name AS template_name
         FROM gpm_projects p
         LEFT JOIN users u ON u.id = p.pm_user_id
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN gpm_templates t ON t.id = p.template_id
        WHERE p.id = ? AND p.deleted_at IS NULL`, [id],
    );
    if (!p) return undefined;
    const phases = await queryAll(
      `SELECT ph.*,
              (SELECT COUNT(*)::int FROM project_tasks t
                WHERE t.gpm_phase_id = ph.id AND t.deleted_at IS NULL) AS task_count,
              (SELECT COUNT(*)::int FROM project_tasks t
                WHERE t.gpm_phase_id = ph.id AND t.deleted_at IS NULL AND t.is_completed = true) AS task_done
         FROM gpm_phases ph WHERE ph.gpm_project_id = ? ORDER BY ph.sort_order`, [id],
    );
    const openItems = await queryAll(
      `SELECT * FROM gpm_open_items WHERE gpm_project_id = ? AND deleted_at IS NULL
        ORDER BY CASE status WHEN 'waiting' THEN 0 WHEN 'checking' THEN 1 ELSE 2 END,
                 due_date NULLS LAST, raised_at`, [id],
    );
    const members = await queryAll(
      'SELECT * FROM gpm_members WHERE gpm_project_id = ? ORDER BY sort_order, name', [id],
    );
    return { ...p, phases, open_items: openItems, members };
  },

  /**
   * 作る。テンプレートを選んでいれば**そのとき写して**フェーズとタスクを日付付きで作る。
   * 写したあとにテンプレートを直しても、動いているプロジェクトは変わらない。
   */
  async create(input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const name = String(input.name ?? '').trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'プロジェクト名を入れてください');
    const kind = String(input.kind ?? 'self_build');
    assertIn(kind, GPM_KINDS, 'kind');
    const status = String(input.status ?? 'active');
    assertIn(status, GPM_STATUSES, 'status');

    const id = uuidv4();
    const startedOn = dateOrNull(input.started_on);
    const templateId = typeof input.template_id === 'string' && input.template_id ? input.template_id : null;

    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO gpm_projects
           (id, name, kind, client_name, customer_id, pm_company, pm_user_id,
            started_on, ends_on, status, template_id, project_id, notes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, kind, input.client_name ?? null, input.customer_id ?? null,
         input.pm_company ?? null, input.pm_user_id ?? null,
         startedOn, dateOrNull(input.ends_on), status, templateId,
         input.project_id ?? null, input.notes ?? null, userId, userId],
      );
      if (templateId) await expandTemplate(tx, id, templateId, startedOn, userId);
    });
    return (await this.getById(id))!;
  },

  async update(id: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne('SELECT id FROM gpm_projects WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
    if (typeof input.status === 'string') assertIn(input.status, GPM_STATUSES, 'status');
    if (typeof input.kind === 'string') assertIn(input.kind, GPM_KINDS, 'kind');
    await execute(
      `UPDATE gpm_projects SET
         name = COALESCE(?, name), kind = COALESCE(?, kind), client_name = ?, customer_id = ?,
         pm_company = ?, pm_user_id = ?, started_on = ?, ends_on = ?,
         status = COALESCE(?, status), project_id = ?, notes = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [input.name ?? null, input.kind ?? null, input.client_name ?? null, input.customer_id ?? null,
       input.pm_company ?? null, input.pm_user_id ?? null,
       dateOrNull(input.started_on), dateOrNull(input.ends_on),
       input.status ?? null, input.project_id ?? null, input.notes ?? null, userId, id],
    );
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    const row = await queryOne('SELECT id FROM gpm_projects WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
    await execute('UPDATE gpm_projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  },
};

/**
 * テンプレートを写してフェーズと配下タスクを作る。
 * **前の工程の終わりの翌日が次の工程の始まり**（モックの新規作成プレビューと同じ数え方）。
 * 開始日を入れていなければ日付は入れない（**推測しない**）。
 */
async function expandTemplate(
  tx: Tx, gpmProjectId: string, templateId: string, startedOn: string | null, userId: string,
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
      `INSERT INTO gpm_phases (id, gpm_project_id, label, state, started_on, ends_on, role, sort_order)
       VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)`,
      [phaseId, gpmProjectId, p.label, start, end, p.role, p.sort_order],
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
         VALUES (?, NULL, ?, ?, false, ?, ?, ?, ?)`,
        [uuidv4(), t.label, t.role ? `担当: ${t.role}` : null, t.sort_order,
         due ? `${due}T18:00:00` : null, phaseId, userId],
      );
      if (tCursor && due) tCursor = addDays(due, 1);
    }
    if (end) cursor = addDays(end, 1);
  }
}

// ══ 未確認事項 ════════════════════════════════════════════

export const openItemService = {
  /** プロジェクトをまたいで引く（① ダッシュボードと ⑤ タスク一覧で使う） */
  async listAll(filter: { status?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['oi.deleted_at IS NULL'];
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
         JOIN gpm_projects p ON p.id = oi.gpm_project_id AND p.deleted_at IS NULL
         LEFT JOIN gpm_phases ph ON ph.id = oi.phase_id
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE oi.status WHEN 'waiting' THEN 0 WHEN 'checking' THEN 1 ELSE 2 END,
                 oi.due_date NULLS LAST, oi.raised_at`,
      params,
    );
  },

  async create(gpmProjectId: string, input: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
    const question = String(input.question ?? '').trim();
    if (!question) throw new AppError(400, 'VALIDATION_ERROR', '何を訊いているのかを書いてください');
    const toKind = String(input.to_kind ?? 'client');
    assertIn(toKind, OPEN_ITEM_TO_KINDS, 'to_kind');
    const id = uuidv4();
    await execute(
      `INSERT INTO gpm_open_items
         (id, gpm_project_id, phase_id, question, to_kind, to_name, blocks, due_date, source_minutes_id, raised_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, gpmProjectId, input.phase_id ?? null, question, toKind, input.to_name ?? null,
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
