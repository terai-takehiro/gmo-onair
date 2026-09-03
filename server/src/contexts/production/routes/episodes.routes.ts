import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { generateEpisodeCode, getNextEpisodeNumberAtomic } from '../../../shared/services/sequence.service';
import { AppError } from '../../../shared/middleware/errorHandler';
import { parseEpisodeSpec, groupConsecutive, EpisodeSpecError } from '../../../shared/production/episodeSpec';
import { jstDate } from '../../../shared/utils/jst';
import { broadcastTypeIncludes } from '../services/episodeGenerate.service';
import { parseDatedEntries, EpisodeDatedError } from '../services/episodeDatedPlan.service';
import { previewDatedEpisodes, createDatedEpisodes } from '../services/episodeDated.service';

const router = Router();

/**
 * 回（episode）のフェーズの語彙。**`projects.stage` と同じもの**（migration 274）
 * — 利用者が2つの体系を覚えずに済むように揃えている。他のコンテキスト
 * （`project.service.ts`・`mcp/tools/projects.tools.ts`・`gpm.service.ts` 等）にも
 * 同じ配列があるが、この製品では以前からステージの語彙をコンテキストごとに
 * 複製する書き方（意図的な複製）なので、それに倣う。
 */
const EPISODE_STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost'];

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
      -- この回に紐づく見積の件数（仕様変更 #18・#20）。「この回の見積」への
      -- 導線（EpisodesPanel.tsx）が件数を出すための集計。アーカイブした版も含めて数える
      -- （「もう見ない版を隠しただけ」で見積そのものが無いわけではないため）。
      -- migration 274 で estimates.episode_id（単数）→ estimate_episodes（多対多）に変わった —
      -- 「ひとまとまり」の見積が複数の回をまとめて指せるようになったため（#20）
      (SELECT COUNT(*) FROM estimate_episodes ee JOIN estimates est ON est.id = ee.estimate_id
        WHERE ee.episode_id = e.id AND est.deleted_at IS NULL) as estimate_count
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
      (SELECT COUNT(*) FROM estimate_episodes ee JOIN estimates est ON est.id = ee.estimate_id
        WHERE ee.episode_id = e.id AND est.deleted_at IS NULL) as estimate_count
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
  const { episodes: episodesInput, count, order_date, notes } = req.body;

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

  const project = await queryOne('SELECT gls_number FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

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

/**
 * 「利用日＋回番号」をまとめて登録する（例: 9/7 に #17,18,19）— 9/2 の仕様変更・調査項目 S5
 *
 * `/batch`（番号は指定できるが日付が入らない）と `/generate`（日付は入るが番号は
 * 自動採番）の**どちらでも表現できなかった**「この日に、この回番号を」を受ける3つ目の口。
 * 既存2つは MCP・旧クライアントの呼び出し元がいるので触らず、別に立てている
 * （中身は `services/episodeDated.service.ts`。ここは URL と結ぶだけ）。
 *
 * `dry_run=true` は**一切書き込まず**、日ごとに「何件作るか・既にある回とぶつかる
 * 番号はどれか・その日に既に何件あるか」を返す。回を作ると売上（見込み）の行も
 * 一緒に増えることがあるので、画面は必ずこれを見せてから実行する（設計文書 §7）。
 */
router.post('/:projectId/episodes/dated', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId as string;

  let entries;
  try {
    entries = parseDatedEntries(req.body?.entries);
  } catch (e) {
    if (e instanceof EpisodeDatedError) throw new AppError(400, 'VALIDATION_ERROR', e.message);
    throw e;
  }

  if (req.body?.dry_run) {
    res.json({ success: true, dry_run: true, data: await previewDatedEpisodes(projectId, entries) });
    return;
  }

  const result = await createDatedEpisodes({
    projectId,
    entries,
    userId: req.user!.id,
    broadcastOffsetDays: req.body?.broadcast_offset_days,
    orderDate: req.body?.order_date || null,
    notes: req.body?.notes || null,
  });
  res.status(201).json({ success: true, dry_run: false, data: result });
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
            e.recording_per_day_count, e.stage
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
   * この回の「1日あたりの本数」（migration 269・仕様変更 #16）。
   *
   * **「渡さなければ今の値を保つ」**（client/CLAUDE.md「サーバーの部分更新の原則」）—
   * このAPIの他の項目（title/notes 等）は未指定を `|| null` で消してしまう既存の
   * 挙動だが、これは新しく足した項目なので同じ轍を踏まない。
   * 空文字・null は明示的な解除（「決めていない」に戻す）として NULL にする。
   *
   * ⚠️ 「回の単価」（`episode_unit_price`）はこの依頼で廃止した（migration 274）——
   * 1日で複数本撮ると回あたりの単価が下がるため「回の単価」という固定値は
   * 成立せず、見積・確定売上の金額はひとまとまり（`estimates`/`revenues`）単位で持つ。
   */
  const recordingPerDayCountValue = req.body.recording_per_day_count === undefined
    ? existing.recording_per_day_count
    : (req.body.recording_per_day_count === null || req.body.recording_per_day_count === ''
      ? null
      : (Number.isFinite(Number(req.body.recording_per_day_count)) && Number(req.body.recording_per_day_count) > 0
        ? Math.floor(Number(req.body.recording_per_day_count)) : existing.recording_per_day_count));

  /**
   * この回だけのフェーズ（案件と同じ受注ステージの語彙・migration 274）。
   *
   * **「渡さなければ今の値を保つ」**（同上）。空文字・null は「まだ決めていない」
   * （NULL）に戻す明示的な解除として扱う。値を渡すときは `projects.stage` と
   * 同じ語彙かどうかをここで検証する — 未知の値をそのまま入れると、後で
   * 画面のフェーズ表示（ラベル・色分け）が引けない値がサイレントに残る。
   */
  const stageValue = req.body.stage === undefined
    ? existing.stage
    : (req.body.stage === null || req.body.stage === ''
      ? null
      : (EPISODE_STAGES.includes(req.body.stage) ? req.body.stage : undefined));
  if (stageValue === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', `フェーズの値が正しくありません: ${req.body.stage}`);
  }

  await execute(
    `UPDATE episodes SET
      title = ?, recording_date = ?, broadcast_date = ?, status = ?,
      notes = ?, recording_per_day_count = ?, stage = ?,
      updated_at = NOW(), updated_by = ?
    WHERE id = ?`,
    [
      title, recordingDate, finalBroadcastDate,
      status,
      notes, recordingPerDayCountValue, stageValue,
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

/**
 * 回の削除（ソフトデリート）。この口自体は以前から存在したが、画面に削除ボタンが
 * 無かった（今回の依頼で `EpisodesPanel.tsx` に足す）。
 *
 * ⚠️ **売上・仕入がすでに紐づく回は消させない**（今回追加したガード）。
 * `episodes.deleted_at` はソフトデリートだが、`revenues.episode_id`／
 * `purchases.episode_id` は `ON DELETE` 指定が無い普通の外部キーで、回を
 * 消しても自動では外れない。回を消せてしまうと、案件詳細の「回」一覧・
 * 見積の絞り込みからは見えなくなるのに、確定した売上・仕入の記録だけが
 * 宙に浮いた `episode_id` を持ったまま残る（台帳側は `deleted_at` を見ないため
 * 集計には残り続けるが、由来をたどれなくなる）。先に財務側で回の紐づきを
 * 外してもらう（`PUT /revenues/:id` / `PUT /purchases/:id` で `episode_id` を
 * 変えるか、明細ごと削除）。
 */
router.delete('/:projectId/episodes/:id', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM episodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  const linked = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM revenues WHERE episode_id = ? AND deleted_at IS NULL) AS revenue_count,
       (SELECT COUNT(*) FROM purchases WHERE episode_id = ? AND deleted_at IS NULL) AS purchase_count`,
    [req.params.id, req.params.id]
  ) as { revenue_count: string; purchase_count: string };
  const revenueCount = Number(linked.revenue_count) || 0;
  const purchaseCount = Number(linked.purchase_count) || 0;
  if (revenueCount > 0 || purchaseCount > 0) {
    const parts = [
      revenueCount > 0 ? `売上 ${revenueCount} 件` : null,
      purchaseCount > 0 ? `仕入 ${purchaseCount} 件` : null,
    ].filter(Boolean).join('・');
    throw new AppError(409, 'EPISODE_HAS_FINANCE_RECORDS',
      `この回には${parts}が紐づいているため削除できません。先に財務管理の売上・仕入台帳でこの回の紐づきを外してください`);
  }

  await execute(
    `UPDATE episodes SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
