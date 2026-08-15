/**
 * ふりかえりの KPT（Keep / Problem / Try）— migration 185
 *
 * ── なぜ自由行をやめたか ────────────────────────────────────
 *
 * 旧 `event_reports.highlights` は「よかったこと・次に活かすこと」の1本の配列で、
 * 続けたいこと・困ったこと・次に試すことが混ざっていました。
 * 3枠に分けると**書くときに種類を決める**ことになり、次の案件で
 * 「困ったこと」だけを追えます。**書いた人も1件ずつ残します** —
 * ふりかえりは「その人がその現場で見たこと」なので、誰が書いたか分からないと
 * あとから確かめられません。
 *
 * ── AI の下書き（会社方針「AI を使い捨てにしない」）──────────
 *
 *   条件1 記録   下書きの全文を `ai_outputs`(kind=`kpt_draft`) に
 *   条件2 差分   人が**確かめた**ときにサーバーが自動比較 → `ai_corrections`
 *   条件3 成果   確認された行の割合（AI が起こした行のうち残った数）
 *   条件4 還流   `get_ai_feedback_digest` の advice を次の下書きに載せる
 *   条件5 レビュー 月1回・営業のマネージャー（既存の運用の決めに乗る）
 *
 * **AI が起こした行は `confirmed_at` が入るまで「未確認」**です。
 * 人が確かめずに隔週キープの資料へ出ると、AI の推測が実施報告になります。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, recordCorrections, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { draftKpt, isKptAiConfigured } from './kpt-ai.service';

export const KPT_DRAFT_KIND = 'kpt_draft';

export type KptKind = 'keep' | 'problem' | 'try';
export const KPT_KINDS: KptKind[] = ['keep', 'problem', 'try'];

export interface KptRow {
  id: string;
  project_id: string;
  kind: KptKind;
  body: string;
  author_id: string;
  author_name: string | null;
  ai_generated: boolean;
  confirmed_at: string | null;
  sort_order: number;
  created_at: string;
}

export function isKptKind(v: unknown): v is KptKind {
  return typeof v === 'string' && (KPT_KINDS as string[]).includes(v);
}

/**
 * 案件の KPT を並び順で返す。**書いた人の名前も返す**（画面がピルで出す）。
 *
 * ⚠️ **`confirmedOnly` を渡す先を間違えないこと**（レビューでの指摘 #83）。
 *
 *   ・**ふりかえりの画面**（案件詳細）… 全部返す。**未確認の下書きを確かめる場所**
 *     なので、ここで隠すと確かめる手段が消えます
 *   ・**隔週キープの資料・MCP の一覧** … `confirmedOnly`。人が確かめていない
 *     AI の推測が**そのまま実施報告として資料に載って**いました
 *     （migration 185 に「人が確かめずに資料へ出ると、AI の推測が実施報告になる」と
 *     書いてあるのに、絞りがどこにも入っていなかった）
 *
 * **人が書いた行（`ai_generated=false`）は `confirmed_at` を持ちません** —
 * 確かめる相手がいないので、絞りは「AI が起こした行のうち未確認のもの」だけを外します。
 */
export async function listKpt(
  projectId: string,
  opts: { confirmedOnly?: boolean } = {},
): Promise<KptRow[]> {
  const gate = opts.confirmedOnly
    ? 'AND (k.ai_generated = FALSE OR k.confirmed_at IS NOT NULL)'
    : '';
  return await queryAll(
    `SELECT k.id, k.project_id, k.kind, k.body, k.author_id, u.name AS author_name,
            k.ai_generated, k.confirmed_at, k.sort_order, k.created_at
       FROM event_report_kpt k
       LEFT JOIN users u ON u.id = k.author_id
      WHERE k.project_id = ? ${gate}
      ORDER BY k.kind, k.sort_order, k.created_at`,
    [projectId],
  ) as unknown as KptRow[];
}

async function assertProject(projectId: string): Promise<void> {
  const p = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!p) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
}

/** その枠の最後の並び順の次 */
async function nextOrder(projectId: string, kind: KptKind): Promise<number> {
  const row = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM event_report_kpt WHERE project_id = ? AND kind = ?',
    [projectId, kind],
  ) as { n: number };
  return Number(row.n) || 0;
}

/**
 * 1件足す。**書いた人は押した本人**で、呼ぶ側が指定することはできません
 * （画面の追加ボタンが「寺井 として足す」と自分の名前を出すのはこのため）。
 * 人が書いた行は最初から確認済みです（AI の下書きではないので）。
 */
export async function addKpt(
  projectId: string, kind: KptKind, body: string, userId: string,
): Promise<KptRow> {
  await assertProject(projectId);
  const text = body.trim();
  if (!text) throw new AppError(400, 'VALIDATION_ERROR', '中身が空です');
  const id = uuidv4();
  await execute(
    `INSERT INTO event_report_kpt (id, project_id, kind, body, author_id, ai_generated, confirmed_at, sort_order)
     VALUES (?, ?, ?, ?, ?, FALSE, NOW(), ?)`,
    [id, projectId, kind, text.slice(0, 2000), userId, await nextOrder(projectId, kind)],
  );
  return (await listKpt(projectId)).find((k) => k.id === id)!;
}

/**
 * 直す。**AI が起こした行を人が直したら、そこで確認済みにします** —
 * 直した時点でその人が中身に責任を持ったということなので、
 * もう一度「確かめる」を押させるのは二度手間です。
 * 直した差分は `ai_corrections` に入ります（条件2）。
 */
export async function updateKpt(
  id: string, body: string, userId: string,
): Promise<KptRow> {
  const before = await queryOne(
    'SELECT * FROM event_report_kpt WHERE id = ?', [id],
  ) as (KptRow & { ai_output_id: string | null }) | undefined;
  if (!before) throw new AppError(404, 'NOT_FOUND', 'その行はありません');
  const text = body.trim();
  if (!text) throw new AppError(400, 'VALIDATION_ERROR', '中身が空です');

  await execute(
    `UPDATE event_report_kpt SET body = ?, confirmed_at = COALESCE(confirmed_at, NOW()), updated_at = NOW()
      WHERE id = ?`,
    [text.slice(0, 2000), id],
  );
  if (before.ai_generated && before.ai_output_id && text !== before.body) {
    await recordKptCorrection(before.ai_output_id, before.body, text, 'fix', userId);
  }
  return (await listKpt(before.project_id)).find((k) => k.id === id)!;
}

/**
 * 確かめる（AI の下書きをそのまま採る）。
 * **無修正で採ったことを残します** — これが「無修正採用率」の分母になります。
 */
export async function confirmKpt(id: string, userId: string): Promise<KptRow> {
  const row = await queryOne(
    'SELECT * FROM event_report_kpt WHERE id = ?', [id],
  ) as (KptRow & { ai_output_id: string | null }) | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その行はありません');
  if (row.confirmed_at) return (await listKpt(row.project_id)).find((k) => k.id === id)!;

  await execute('UPDATE event_report_kpt SET confirmed_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  if (row.ai_generated && row.ai_output_id) {
    await recordCorrections(row.ai_output_id, [{ fieldPath: `kpt[${row.kind}]`, type: 'none' }], userId);
  }
  return (await listKpt(row.project_id)).find((k) => k.id === id)!;
}

/**
 * 消す。**AI の下書きを消したのは「拾いすぎ」の指標**なので、
 * `reject` として残します（消した事実そのものが教師データ）。
 */
export async function deleteKpt(id: string, userId: string): Promise<{ project_id: string }> {
  const row = await queryOne(
    'SELECT * FROM event_report_kpt WHERE id = ?', [id],
  ) as (KptRow & { ai_output_id: string | null }) | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その行はありません');
  await execute('DELETE FROM event_report_kpt WHERE id = ?', [id]);
  if (row.ai_generated && row.ai_output_id) {
    await recordKptCorrection(row.ai_output_id, row.body, null, 'reject', userId);
  }
  return { project_id: row.project_id };
}

async function recordKptCorrection(
  outputId: string, before: string, after: string | null,
  type: CorrectionInput['type'], userId: string,
): Promise<void> {
  await recordCorrections(outputId, [{ fieldPath: 'kpt.body', before, after, type }], userId);
}

/**
 * 1つの枠を丸ごと入れ替える（MCP の `upsert_event_report` 用）。
 *
 * ── なぜ「全置換」を残すのか ────────────────────────────────
 *
 * 旧 `highlights` は全置換でした。MCP の引数を消すと**呼び出しごと落ちる**ので、
 * 引数は残して**書き込み先だけ KPT に変えて**あります。
 * 一覧の並びを持たない口なので、1件ずつの追加ではなく従来どおり丸ごと置き換えます。
 *
 * **書いた人は案件の担当。** MCP を叩いた人ではありません — 資料の内容は
 * その現場の担当のものだからです（AI の下書きと同じ考え方）。
 */
export async function replaceKptKind(
  projectId: string, kind: KptKind, bodies: string[],
): Promise<number> {
  await assertProject(projectId);
  const p = await queryOne('SELECT assigned_to FROM projects WHERE id = ?', [projectId]) as { assigned_to: string };
  await execute('DELETE FROM event_report_kpt WHERE project_id = ? AND kind = ?', [projectId, kind]);
  let n = 0;
  for (const body of bodies) {
    const text = String(body ?? '').trim();
    if (!text) continue;
    await execute(
      `INSERT INTO event_report_kpt (id, project_id, kind, body, author_id, ai_generated, confirmed_at, sort_order)
       VALUES (?, ?, ?, ?, ?, FALSE, NOW(), ?)`,
      [uuidv4(), projectId, kind, text.slice(0, 2000), p.assigned_to, n],
    );
    n += 1;
  }
  return n;
}

/**
 * AI に下書きを起こさせる。
 *
 * ── 材料 ────────────────────────────────────────────────────
 *
 * やり取り（`activity_logs`）・議事録（`project_minutes`）・
 * **期限を過ぎたタスク**。指示書のとおりです。どれも「その現場で実際に起きたこと」で、
 * ここに無いことは AI にも書けません（それでよい — 作り話をさせない）。
 *
 * ── 二度は起こさない ────────────────────────────────────────
 *
 * **未確認の下書きが残っているあいだは起こしません。** 押し直しで同じ内容が
 * 2組できると、どちらを消すか分からなくなります（標準工程テンプレートと同じ守り方）。
 */
export async function generateKptDraft(
  projectId: string, userId: string,
): Promise<{ created: number; skipped?: string }> {
  await assertProject(projectId);
  if (!isKptAiConfigured()) {
    throw new AppError(503, 'NOT_CONFIGURED', 'この環境は AI につないでいないので、下書きは作れません');
  }

  const pending = await queryOne(
    'SELECT COUNT(*)::int AS n FROM event_report_kpt WHERE project_id = ? AND ai_generated AND confirmed_at IS NULL',
    [projectId],
  ) as { n: number };
  if (Number(pending.n) > 0) {
    return { created: 0, skipped: '確かめていない下書きが残っています。先に確かめるか消してください' };
  }

  const project = await queryOne(
    `SELECT p.name, p.event_start, p.event_end, p.assigned_to, c.name AS customer_name
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`,
    [projectId],
  ) as { name: string; event_start: string | null; event_end: string | null; assigned_to: string; customer_name: string | null };

  const activities = await queryAll(
    `SELECT activity_date, activity_type, subject, description
       FROM activity_logs WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY activity_date DESC LIMIT 40`,
    [projectId],
  ) as { activity_date: string; activity_type: string; subject: string; description: string | null }[];

  const minutes = await queryAll(
    `SELECT met_on, title, summary, decisions, open_items
       FROM project_minutes WHERE project_id = ? AND deleted_at IS NULL AND status <> 'transcribing'
      ORDER BY created_at DESC LIMIT 10`,
    [projectId],
  ) as Record<string, unknown>[];

  // **期限を過ぎたタスク**だけを渡す。全部渡すと「予定どおり終わった仕事」が
  // 困ったことの材料に見えてしまう
  const lateTasks = await queryAll(
    `SELECT title, due_date, is_completed, completed_at
       FROM project_tasks
      WHERE project_id = ? AND deleted_at IS NULL AND due_date IS NOT NULL
        AND (
          (is_completed = false AND due_date < to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD'))
          OR (is_completed = true AND completed_at IS NOT NULL
              AND to_char(completed_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') > due_date)
        )
      ORDER BY due_date LIMIT 20`,
    [projectId],
  ) as Record<string, unknown>[];

  if (activities.length === 0 && minutes.length === 0 && lateTasks.length === 0) {
    return { created: 0, skipped: 'この案件には、下書きの材料になるやり取り・議事録・遅れたタスクがありません' };
  }

  let advice: string[] = [];
  try {
    advice = (await getFeedbackDigest(KPT_DRAFT_KIND, 90)).advice ?? [];
  } catch { /* 助言が取れなくても続ける */ }

  const draft = await draftKpt({
    projectName: project.name,
    customerName: project.customer_name,
    eventStart: project.event_start,
    eventEnd: project.event_end,
    activities, minutes, lateTasks, advice,
  });

  const items = [
    ...draft.keep.map((body) => ({ kind: 'keep' as KptKind, body })),
    ...draft.problem.map((body) => ({ kind: 'problem' as KptKind, body })),
    ...draft.try.map((body) => ({ kind: 'try' as KptKind, body })),
  ].filter((x) => x.body.trim());

  if (items.length === 0) return { created: 0, skipped: '材料からは書けることが見つかりませんでした' };

  // AI が出したものの**全文**を残す（条件1）
  const outputId = await recordAiOutput({
    kind: KPT_DRAFT_KIND,
    targetTable: 'projects',
    targetId: projectId,
    payload: { keep: draft.keep, problem: draft.problem, try: draft.try },
    toolName: 'kpt.draft',
    model: draft.model,
    promptVersion: draft.promptVersion,
    actorId: userId,
  });

  /*
   * **書いた人は案件の担当。** 押した人ではありません — AI が起こした行を
   * 押した人の名前で残すと、「その人が現場で見たこと」ではないものが
   * その人の言葉として並びます（定時実行では押した人すら居ません）。
   */
  const author = project.assigned_to;
  for (const item of items) {
    await execute(
      `INSERT INTO event_report_kpt (id, project_id, kind, body, author_id, ai_generated, ai_output_id, sort_order)
       VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)`,
      [uuidv4(), projectId, item.kind, item.body.slice(0, 2000), author, outputId,
       await nextOrder(projectId, item.kind)],
    );
  }
  return { created: items.length };
}
