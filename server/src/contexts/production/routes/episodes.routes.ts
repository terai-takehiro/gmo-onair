import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { generateEpisodeCode, getNextEpisodeNumberAtomic } from '../../../shared/services/sequence.service';
import { generateBillingKey } from '../../../shared/services/billing-key.service';
import { AppError } from '../../../shared/middleware/errorHandler';
import { parseEpisodeSpec, groupConsecutive, EpisodeSpecError } from '../../../shared/production/episodeSpec';
import { jstDate } from '../../../shared/utils/jst';

const router = Router();

// v4 フォーム（BroadcastSection.tsx）は複数選択をカンマ結合した文字列
// （例: "live,recording"）として projects.broadcast_type に保存するため、
// 完全一致ではなくカンマ区切りの中に対象値が含まれるかで判定する
// （旧実装は `=== 'live'` の完全一致で、複数選択の案件では黙って外れていた）。
// **`episode-generate.routes.ts` も同じ判定を使うため export する**（同じ規則を
// 2か所目に書き写すと生放送の扱いがずれる）。
export function broadcastTypeIncludes(broadcastType: string | null | undefined, value: string): boolean {
  return (broadcastType ?? '').split(',').map((s) => s.trim()).includes(value);
}

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// List episodes for a project
router.get('/:projectId/episodes', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  let where = 'WHERE e.project_id = ? AND e.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  if (search) {
    where += ' AND (e.episode_code ILIKE ? OR e.title ILIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM episodes e ${where}`, params)) as any).c;

  // **タスクの進み具合を2本の数で持つ。** v4 のタスクタブに「回」の簡易一覧
  // （旧「エピソード」タブ）を移したときに追加。フラグではなく件数にするのは、
  // 完了かどうかの正が `is_completed`（migration 137）で、割合はここで
  // 出し直せば足りるため（別の判定を持つと `taskState()` とずれる）
  const rows = await queryAll(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost,
      (SELECT COUNT(*) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as revenue_count,
      (SELECT COUNT(*) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as purchase_count,
      (SELECT COUNT(*) FROM project_tasks WHERE episode_id = e.id AND deleted_at IS NULL AND parent_task_id IS NULL) as task_count,
      (SELECT COUNT(*) FROM project_tasks WHERE episode_id = e.id AND deleted_at IS NULL AND parent_task_id IS NULL AND is_completed = true) as task_done_count,
      -- この回に紐づく見積の件数（仕様変更 #18・migration 270）。「この回の見積」への
      -- 導線（EpisodesPanel.tsx）が件数を出すための集計。アーカイブした版も含めて数える
      -- （「もう見ない版を隠しただけ」で見積そのものが無いわけではないため）
      (SELECT COUNT(*) FROM estimates WHERE episode_id = e.id AND deleted_at IS NULL) as estimate_count
    FROM episodes e
    ${where}
    ORDER BY e.episode_number ASC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// Get single episode
router.get('/:projectId/episodes/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost,
      (SELECT COUNT(*) FROM estimates WHERE episode_id = e.id AND deleted_at IS NULL) as estimate_count
    FROM episodes e
    WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL`,
    [req.params.id, req.params.projectId]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');
  res.json({ success: true, data: row });
});

// Batch create episodes
//
// 「追加する数」欄はテキストで受ける（`docs/design/v4/regular-series.md` §1・§2）。
// - 純粋な数字だけ（例 "2"） → 従来どおり「次の話数から連番でN件」
// - 範囲・カンマ区切り（例 "1-2" "#1-2" "1,3,5-8"） → その話数を明示的に作る
// パーサーは `shared/production/episodeSpec.ts`（`shared/src/production/episodeSpec.ts` と
// 意図的に複製・`scripts/check-collab-parity.mjs` が一致を検査）。
//
// `episodes` が新しいテキスト欄。旧クライアント・MCP など `count`（数）だけを渡す
// 呼び出しにも後方互換で対応する（`episodes` が無ければ `count` を文字列として読む）。
router.post('/:projectId/episodes/batch', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId as string;
  const { episodes: episodesInput, count, order_date, notes, revenue_budget_per_episode } = req.body;

  let spec;
  try {
    const raw = typeof episodesInput === 'string' && episodesInput.trim() !== ''
      ? episodesInput
      : String(count ?? '');
    spec = parseEpisodeSpec(raw);
  } catch (e) {
    if (e instanceof EpisodeSpecError) throw new AppError(400, 'VALIDATION_ERROR', e.message);
    throw e;
  }

  const project = await queryOne('SELECT gls_number, customer_id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const customerId = project.customer_id;
  const revPerEp = revenue_budget_per_episode || 0;
  const today = order_date || jstDate();
  const userId = req.user!.id;

  let createdEpisodes: unknown[];
  try {
    createdEpisodes = await withTransaction(async (tx) => {
      // 採番からINSERTまでを同じトランザクション・同じ行ロックの中で行う
      // （estimate.service.ts の convertToRevenue と同じ考え方）。
      // 「件数」入力は sequences テーブルの行ロック（UPDATE ... RETURNING）で
      // 1件ずつアトミックに次番号を取る。「明示指定」はその番号をそのまま使う。
      const numbers: number[] = spec.mode === 'explicit'
        ? spec.numbers
        : await (async () => {
            const ns: number[] = [];
            for (let i = 0; i < spec.count; i++) {
              ns.push(await getNextEpisodeNumberAtomic(projectId, tx));
            }
            return ns;
          })();

      // 既存話数との重複は DB の UNIQUE 制約に任せず、事前にまとめてチェックする
      // （1件だけ通って残りが失敗、のような中途半端な状態を避ける）。
      // FOR UPDATE で該当行を押さえてから確かめる — 同時に別の操作が同じ話数を
      // 使おうとしても、片方はここで待たされてから重複を見つけて弾かれる。
      const dupRows = await tx.queryAll(
        `SELECT episode_number FROM episodes
         WHERE project_id = ? AND deleted_at IS NULL AND episode_number = ANY(?::int[])
         FOR UPDATE`,
        [projectId, numbers],
      ) as { episode_number: number }[];
      if (dupRows.length > 0) {
        const list = dupRows.map((r) => `#${r.episode_number}`).join('、');
        throw new AppError(400, 'VALIDATION_ERROR', `すでにある話数と重複しています（${list}）`);
      }

      // episode_orders は start_episode/end_episode の2列しか持たないため、
      // 非連続レンジは連続する区間ごとに複数レコードへ分けて記録する。
      for (const g of groupConsecutive(numbers)) {
        await tx.execute(
          `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), projectId, today, g.end - g.start + 1, g.start, g.end, notes || null, userId],
        );
      }

      const created: unknown[] = [];
      for (const episodeNumber of numbers) {
        const episodeCode = generateEpisodeCode(project.gls_number, episodeNumber);
        const id = uuidv4();

        await tx.execute(
          `INSERT INTO episodes (id, project_id, episode_code, episode_number, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [id, projectId, episodeCode, episodeNumber, userId],
        );

        if (revPerEp > 0) {
          const revId = uuidv4();
          const billingKey = generateBillingKey(episodeCode, 'tax10');
          await tx.execute(
            `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to, tax_category, amount, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'tax10', ?, ?, ?)`,
            [revId, billingKey, projectId, id, customerId, userId, revPerEp, '発注時按分', userId],
          );
        }

        const row = await tx.queryOne('SELECT * FROM episodes WHERE id = ?', [id]);
        created.push(row);
      }
      return created;
    });
  } catch (e) {
    // 事前チェックをすり抜けた同時実行だけが踏む経路（UNIQUE 制約違反）。
    // 中途半端な作成を残さずロールバックした上で、分かりやすい文言に変える。
    if (e instanceof Error && 'code' in e && (e as { code?: string }).code === '23505') {
      throw new AppError(400, 'VALIDATION_ERROR', '他の操作と同時に重なったため、話数が重複しました。もう一度お試しください');
    }
    throw e;
  }

  res.status(201).json({ success: true, data: createdEpisodes });
});

// 月次ユニットを1件作成 (ビジネス案件の月締め請求単位)。
// エピソードを「月」として流用し、コードは {GLS}-{YYMM} (例: GLS-B001-2607) にする。
// 通常案件の話数エピソードと同じ episodes テーブルを使うため、売上/請求書/見積書は
// 既存の episode_id 連携をそのまま利用できる (1 月 = 1 請求単位)。
router.post('/:projectId/episodes/month', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId as string;
  const yearMonth = String(req.body?.year_month || '').trim(); // 'YYYY-MM'
  const m = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new AppError(400, 'VALIDATION_ERROR', '対象月は YYYY-MM 形式で指定してください');
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new AppError(400, 'VALIDATION_ERROR', '月は 01〜12 で指定してください');

  const project = await queryOne('SELECT gls_number FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (!project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'GLS発番後に月次ユニットを作成できます');

  const yymm = `${m[1].slice(2)}${m[2]}`;            // 2026-07 → 2607
  const episodeCode = `${project.gls_number}-${yymm}`; // GLS-B001-2607
  const episodeNumber = Number(`${m[1].slice(2)}${m[2]}`); // 2607 (時系列で並ぶ)
  const title = `${year}年${month}月`;

  // 冪等: 同じ月が既にあればそれを返す (二重作成しない)
  const existing = await queryOne(
    'SELECT * FROM episodes WHERE project_id = ? AND episode_code = ? AND deleted_at IS NULL',
    [projectId, episodeCode],
  );
  if (existing) { res.json({ success: true, data: existing, existed: true }); return; }

  const id = uuidv4();
  await execute(
    `INSERT INTO episodes (id, project_id, episode_code, episode_number, title, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, projectId, episodeCode, episodeNumber, title, req.user!.id],
  );
  const row = await queryOne('SELECT * FROM episodes WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// Update episode
router.put('/:projectId/episodes/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    `SELECT e.id, e.title, e.recording_date, e.broadcast_date, e.status, e.notes,
            e.recording_per_day_count, e.episode_unit_price
       FROM episodes e WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL`,
    [req.params.id, req.params.projectId]
  ) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  /**
   * ⚠️ **「渡さなければ今の値を保つ」**（client/CLAUDE.md「サーバーの部分更新の原則」）。
   * 元の実装は title/recording_date/broadcast_date/status/notes を
   * すべて `|| null` で未指定なら消していた。これまでこのAPIを呼ぶフロントが
   * 存在しなかったため実害が出ていなかったが、`EditEpisodeDialog.tsx`
   * （回ごとの本数・単価だけを編集する画面。仕様変更 #16）が本数・単価の
   * 2フィールドだけを送るようになった今、そのまま使うと**保存するたびに
   * 収録日・放送日・タイトル・状態・備考が消える**（実測）。
   */
  const title = req.body.title === undefined ? existing.title : (req.body.title || null);
  const status = req.body.status === undefined ? existing.status : (req.body.status || null);
  const notes = req.body.notes === undefined ? existing.notes : (req.body.notes || null);
  const recordingDate = req.body.recording_date === undefined
    ? existing.recording_date : (req.body.recording_date || null);

  // For live broadcasts, recording_date also sets broadcast_date
  let finalBroadcastDate = req.body.broadcast_date === undefined
    ? existing.broadcast_date : (req.body.broadcast_date || null);
  if (recordingDate) {
    const project = await queryOne(
      'SELECT broadcast_type FROM projects WHERE id = ? AND deleted_at IS NULL',
      [req.params.projectId]
    ) as any;
    if (project && broadcastTypeIncludes(project.broadcast_type, 'live')) {
      finalBroadcastDate = recordingDate;
    }
  }

  /**
   * この回の「1日あたりの本数」「回の単価」（migration 269・仕様変更 #16）。
   *
   * **「渡さなければ今の値を保つ」**（client/CLAUDE.md「サーバーの部分更新の原則」）—
   * このAPIの他の項目（title/notes 等）は未指定を `|| null` で消してしまう既存の
   * 挙動だが、この2つは新しく足す項目なので同じ轍を踏まない。
   * 空文字・null は明示的な解除（「決めていない」に戻す）として NULL にする。
   * ⚠️ 単価は 0 も正当な値なので `Number(value) === 0` を弾かない
   * （`project.service.ts` の `episode_unit_price` と同じ守り方）。
   */
  const recordingPerDayCountValue = req.body.recording_per_day_count === undefined
    ? existing.recording_per_day_count
    : (req.body.recording_per_day_count === null || req.body.recording_per_day_count === ''
      ? null
      : (Number.isFinite(Number(req.body.recording_per_day_count)) && Number(req.body.recording_per_day_count) > 0
        ? Math.floor(Number(req.body.recording_per_day_count)) : existing.recording_per_day_count));
  const episodeUnitPriceValue = req.body.episode_unit_price === undefined
    ? existing.episode_unit_price
    : (req.body.episode_unit_price === null || req.body.episode_unit_price === ''
      ? null
      : (Number.isFinite(Number(req.body.episode_unit_price)) && Number(req.body.episode_unit_price) >= 0
        ? Number(req.body.episode_unit_price) : existing.episode_unit_price));

  await execute(
    `UPDATE episodes SET
      title = ?, recording_date = ?, broadcast_date = ?, status = ?,
      notes = ?, recording_per_day_count = ?, episode_unit_price = ?,
      updated_at = NOW(), updated_by = ?
    WHERE id = ?`,
    [
      title, recordingDate, finalBroadcastDate,
      status,
      notes, recordingPerDayCountValue, episodeUnitPriceValue,
      req.user!.id, req.params.id
    ]
  );

  const row = await queryOne(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost
    FROM episodes e WHERE e.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete episode
router.delete('/:projectId/episodes/:id', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM episodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  await execute(
    `UPDATE episodes SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
