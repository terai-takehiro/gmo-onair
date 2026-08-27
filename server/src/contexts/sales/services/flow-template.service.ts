/**
 * 標準工程テンプレート（案件）— v4 案件管理 ⑦
 *
 * ── 案件をつくったときに黙って入れない（ご判断）────────────
 *
 * 種類を選んだら 24 件のタスクが勝手に立つ、にはしません。小さい案件でも
 * 24 行並び、**使わないタスクが山になって一覧が読めなくなります**。
 * 一覧を見せて、チェックを外してから入れます。
 *
 * ── 二度入れない ────────────────────────────────────────────
 *
 * `projects.flow_applied_at` に印を付けます。付いている案件に入れようとしたら
 * 止めます — 押し直しで**同じタスクが 2 組**できると、どちらを消すか分からなくなります。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { dueOf, describeOffset, sortKey, type FlowAnchor } from '../../../shared/services/flowDates';

export interface FlowTask {
  id: string;
  phase_id: string;
  title: string;
  role: string | null;
  anchor: FlowAnchor;
  offset_days: number;
  is_required: boolean;
  sort_order: number;
}

export interface FlowPhase { id: string; name: string; sort_order: number; tasks: FlowTask[] }

export interface FlowTemplate {
  id: string; name: string; description: string | null;
  project_types: string[]; is_system: boolean; sort_order: number;
  phases: FlowPhase[];
}

export async function listTemplates(): Promise<FlowTemplate[]> {
  const tpls = await queryAll(
    `SELECT id, name, description, project_types, is_system, sort_order
       FROM project_flow_templates WHERE deleted_at IS NULL ORDER BY sort_order, name`,
  );
  if (tpls.length === 0) return [];
  const phases = await queryAll(
    `SELECT p.id, p.template_id, p.name, p.sort_order
       FROM project_flow_phases p
       JOIN project_flow_templates t ON t.id = p.template_id AND t.deleted_at IS NULL
      ORDER BY p.sort_order`,
  );
  const tasks = await queryAll(
    `SELECT k.id, k.phase_id, k.title, k.role, k.anchor, k.offset_days, k.is_required, k.sort_order
       FROM project_flow_tasks k
       JOIN project_flow_phases p ON p.id = k.phase_id
       JOIN project_flow_templates t ON t.id = p.template_id AND t.deleted_at IS NULL
      ORDER BY k.sort_order`,
  ) as unknown as FlowTask[];

  const byPhase = new Map<string, FlowTask[]>();
  for (const k of tasks) {
    const arr = byPhase.get(k.phase_id) ?? [];
    arr.push(k);
    byPhase.set(k.phase_id, arr);
  }
  return tpls.map((t) => ({
    id: t.id as string,
    name: t.name as string,
    description: (t.description as string | null) ?? null,
    project_types: (t.project_types as string[]) ?? [],
    is_system: !!t.is_system,
    sort_order: Number(t.sort_order) || 0,
    phases: phases
      .filter((p) => p.template_id === t.id)
      .map((p) => ({
        id: p.id as string, name: p.name as string, sort_order: Number(p.sort_order) || 0,
        tasks: byPhase.get(p.id as string) ?? [],
      })),
  }));
}

/**
 * その案件の分類に合う型。**`project_types` が空の型はどの分類でも使える。**
 * 分類を指定した型があればそちらを先に出す（より具体的なものを上に）。
 *
 * ⚠️ 渡すのは **migration 182 の「客入れ:分類」の鍵**
 * （例 `with_audience:broadcast`）で、旧 `project_type` の値ではありません。
 * 旧の値を渡すと**1つも当たらず、どの型も「すべての分類で使える」ものだけ**になります
 * （黙って全部出るので気づけない）。呼ぶ側は `classificationKey()` を通してください。
 */
export async function templatesFor(classification: string | null): Promise<FlowTemplate[]> {
  const all = await listTemplates();
  if (!classification) return all;
  const specific = all.filter((t) => t.project_types.includes(classification));
  const generic = all.filter((t) => t.project_types.length === 0);
  return [...specific, ...generic];
}

export interface PreviewTask extends FlowTask {
  phase_name: string;
  /** 出せないときは null（実施日が未定など） */
  due: string | null;
  /** 「実施日 -60 日」の読める文 */
  when: string;
}

/**
 * 案件の受付日（＝登録した日）と実施日。
 *
 * **下見も本番もここを通す。** 画面から日付を送らせると、下見に出た日付と
 * 実際に入る日付が食い違います（「見たときは 9/21 だったのに 9/20 で入った」）。
 */
export async function datesOf(projectId: string): Promise<{ intake: string | null; event: string | null }> {
  const proj = await queryOne(
    // **受付日は SQL で文字列にする。** `created_at` は TIMESTAMPTZ で、
    // pg ドライバは JS の `Date` を返す。`String(Date)` は
    // `Wed Aug 08 2026 …` なので、頭 10 文字を取ると `Wed Aug 08` になり、
    // 日付として読めず**受付から数える工程の期限が全部 null になる**
    // （型チェックには出ない。実 DB に当てて初めて分かる）。
    //
    // 時間帯は **Asia/Tokyo を明示する。** コンテナは UTC で動くので、
    // 夕方以降に登録した案件の受付日が前日になる。
    `SELECT to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS intake, event_start
       FROM projects WHERE id = ? AND deleted_at IS NULL`,
    [projectId],
  ) as Record<string, unknown> | null;
  if (!proj) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  return {
    intake: (proj.intake as string | null) || null,
    // `event_start` は DATE 型なので `Date` で返る。`toISOString` は UTC に寄せて
    // **1日ずれる**ので、ここでも文字にしてから頭を取る
    event: ymd(proj.event_start),
  };
}

/** `Date` でも文字列でも `YYYY-MM-DD` にする。読めないものは null */
function ymd(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * 案件に入れる前の下見。**保存しない。**
 * 期限が出せないものも**落とさずに返す** — 落とすと「入るはずの工程が
 * 入っていない」ことに気づけない。
 */
export async function preview(
  templateId: string, intakeDate: string | null, eventDate: string | null,
): Promise<PreviewTask[]> {
  const tpl = (await listTemplates()).find((t) => t.id === templateId);
  if (!tpl) throw new AppError(404, 'NOT_FOUND', 'その工程の型はありません');

  const out: PreviewTask[] = [];
  for (const p of tpl.phases) {
    for (const k of p.tasks) {
      out.push({
        ...k,
        phase_name: p.name,
        due: dueOf(k, intakeDate, eventDate),
        when: describeOffset(k),
      });
    }
  }
  return out.sort((a, b) => sortKey(a.due).localeCompare(sortKey(b.due)));
}

/**
 * 選んだ工程を案件のタスクとして入れる。
 *
 * @param taskIds 入れる工程の id。**渡されたものだけ**入れる（外したものは入れない）
 * @param assignments 職種（`project_flow_tasks.role`）→ 担当者（`users.id`）の対応表。
 *   **渡さなければ今までどおり全員未割当**（Phase 2 ⑥。型が持つのは職種で、
 *   誰がやるかは案件ごとに違う — だから入れる場でだけ選べるようにする。
 *   対応表に無い職種・職種の無い工程は未割当のまま）
 */
export async function apply(
  projectId: string, templateId: string, taskIds: string[], userId: string,
  assignments?: Record<string, string>,
): Promise<{ created: number }> {
  const proj = await queryOne(
    `SELECT id, flow_applied_at FROM projects WHERE id = ? AND deleted_at IS NULL`,
    [projectId],
  ) as Record<string, unknown> | null;
  if (!proj) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (proj.flow_applied_at) {
    throw new AppError(400, 'ALREADY_EXISTS',
      'この案件にはすでに工程を入れてあります。足したいときはタスクタブから1件ずつ入れてください。');
  }
  if (taskIds.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '入れる工程を1つ以上選んでください');

  // 割当表の相手が実在するかを先に確かめる（assigned_to は users への FK なので、
  // 確かめずに入れると途中の 1 件だけ FK 違反で落ち、タスクが半分だけ入る）
  const assignByRole = assignments ?? {};
  const assignees = [...new Set(Object.values(assignByRole).filter(Boolean))];
  if (assignees.length > 0) {
    const found = await queryAll(
      `SELECT id FROM users WHERE id = ANY(?::text[]) AND deleted_at IS NULL`, [assignees],
    );
    const ok = new Set(found.map((u) => String(u.id)));
    const missing = assignees.filter((id) => !ok.has(id));
    if (missing.length > 0) {
      throw new AppError(404, 'NOT_FOUND', '割当先のユーザーが見つかりません');
    }
  }

  const { intake, event } = await datesOf(projectId);
  const rows = await preview(templateId, intake, event);
  const chosen = rows.filter((r) => taskIds.includes(r.id));

  let order = 0;
  for (const r of chosen) {
    await execute(
      // 期限は due_at（時刻つき・唯一の正）にも書く（根源整理 §3-4）。
      // 日付しか無い工程なので終業 18:00 を補う。due_date は互換のため残す —
      // due_date だけだと期限前通知（tk_due 以外の COALESCE 読み）から漏れる
      `INSERT INTO project_tasks (id, project_id, title, due_date, due_at, assigned_to, sort_order, source, created_by, updated_by)
       VALUES (?, ?, ?, ?::date, (?::date + TIME '18:00')::timestamp, ?, ?, 'flow_template', ?, ?)`,
      // **担当は勝手には入れない。** 型が持つのは職種で、誰がやるかは案件ごとに決まる。
      // 適当な人を入れると「自分のタスク」に他人の仕事が並ぶ。
      // 入れる人が職種→担当の対応表を渡したときだけ、その職種の工程に割り当てる（Phase 2 ⑥）
      [uuidv4(), projectId, `${r.phase_name}｜${r.title}`, r.due, r.due,
        (r.role && assignByRole[r.role]) || null, order++, userId, userId],
    );
  }

  await execute(
    `UPDATE projects SET flow_applied_at = NOW(), flow_template_id = ?, updated_at = NOW() WHERE id = ?`,
    [templateId, projectId],
  );
  return { created: chosen.length };
}

// ───────────────────────────────────────────────────────────
// 型の編集
// ───────────────────────────────────────────────────────────

/** 型ごと複製する。**種類ごとに違う工程を作るときの入口** */
export async function duplicate(templateId: string, name: string): Promise<string> {
  const tpl = (await listTemplates()).find((t) => t.id === templateId);
  if (!tpl) throw new AppError(404, 'NOT_FOUND', 'その工程の型はありません');

  const newId = `flow-${uuidv4().slice(0, 8)}`;
  const max = await queryOne('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM project_flow_templates') as { m: number } | null;
  await execute(
    `INSERT INTO project_flow_templates (id, name, description, project_types, is_system, sort_order)
     VALUES (?, ?, ?, '{}', FALSE, ?)`,
    [newId, name.trim(), tpl.description, (max?.m ?? 0) + 1],
  );
  for (const p of tpl.phases) {
    const pid = `fp-${uuidv4().slice(0, 8)}`;
    await execute(
      'INSERT INTO project_flow_phases (id, template_id, name, sort_order) VALUES (?, ?, ?, ?)',
      [pid, newId, p.name, p.sort_order],
    );
    for (const k of p.tasks) {
      await execute(
        `INSERT INTO project_flow_tasks (id, phase_id, title, role, anchor, offset_days, is_required, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`ft-${uuidv4().slice(0, 8)}`, pid, k.title, k.role, k.anchor, k.offset_days, k.is_required, k.sort_order],
      );
    }
  }
  return newId;
}

export async function updateTemplate(
  id: string, patch: { name?: string; description?: string | null; project_types?: string[] },
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  if (typeof patch.name === 'string') { sets.push('name = ?'); params.push(patch.name.trim()); }
  if ('description' in patch) { sets.push('description = ?'); params.push(patch.description ?? null); }
  if (Array.isArray(patch.project_types)) { sets.push('project_types = ?'); params.push(patch.project_types); }
  await execute(`UPDATE project_flow_templates SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

export async function updateTask(
  id: string, patch: { title?: string; role?: string | null; anchor?: string; offset_days?: number; is_required?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof patch.title === 'string') { sets.push('title = ?'); params.push(patch.title.trim()); }
  if ('role' in patch) { sets.push('role = ?'); params.push(patch.role || null); }
  if (patch.anchor === 'intake' || patch.anchor === 'event') { sets.push('anchor = ?'); params.push(patch.anchor); }
  if (typeof patch.offset_days === 'number') { sets.push('offset_days = ?'); params.push(Math.round(patch.offset_days)); }
  if (typeof patch.is_required === 'boolean') { sets.push('is_required = ?'); params.push(patch.is_required); }
  if (sets.length === 0) return;
  await execute(`UPDATE project_flow_tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

export async function addTask(phaseId: string, title: string): Promise<string> {
  const id = `ft-${uuidv4().slice(0, 8)}`;
  const max = await queryOne(
    'SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM project_flow_tasks WHERE phase_id = ?', [phaseId],
  ) as { m: number } | null;
  await execute(
    `INSERT INTO project_flow_tasks (id, phase_id, title, anchor, offset_days, is_required, sort_order)
     VALUES (?, ?, ?, 'event', 0, FALSE, ?)`,
    [id, phaseId, title.trim(), (max?.m ?? 0) + 1],
  );
  return id;
}

export async function removeTask(id: string): Promise<void> {
  await execute('DELETE FROM project_flow_tasks WHERE id = ?', [id]);
}

/** 型を消す。**最初から入っている型は消せない**（案件をつくるときに出す物が無くなる） */
export async function removeTemplate(id: string): Promise<void> {
  const t = (await listTemplates()).find((x) => x.id === id);
  if (!t) throw new AppError(404, 'NOT_FOUND', 'その工程の型はありません');
  if (t.is_system) {
    throw new AppError(400, 'VALIDATION_ERROR', '最初から入っている型は消せません（中身は直せます）');
  }
  await execute('UPDATE project_flow_templates SET deleted_at = NOW() WHERE id = ?', [id]);
}
