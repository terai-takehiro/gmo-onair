import { Router } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { getProjectContext } from '../services/projectContext.service';

const router = Router();

// 認証のみ（sales権限不要）の軽量エンドポイント
// Qシート・EventStampなど他アプリからGLS案件・エピソードを参照するため
router.use(requireAuth);

// GLS番号付き案件一覧（セレクター用）
router.get('/gls-options', async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.id, p.gls_number, p.name, c.name as customer_name
     FROM projects p
     LEFT JOIN companies c ON c.id = p.customer_id
     WHERE p.gls_number IS NOT NULL AND p.deleted_at IS NULL
     ORDER BY p.gls_number DESC`
  );

  // 改番で退役した旧番号（案件ごとに配列へ畳む。1行ずつ引かず案件IDをまとめて1回で引く —
  // `qsheet/routes/top.routes.ts` の `GET /top-items` と同じ形）。旧番号でもこの
  // セレクターが検索できるようにするため（2026年10月の事業再編・P1・§4.10）。
  // 表示用のラベルは変えず、`CreateSheetDialog.tsx` 側で `SelectItem` の `textValue`
  // （検索対象テキスト）にだけ混ぜる
  const projectIds = rows.map((r) => r.id as string);
  const retiredRows = projectIds.length === 0 ? [] : await queryAll(
    `SELECT project_id, number FROM project_numbers
      WHERE project_id = ANY(?::text[]) AND retired_at IS NOT NULL
      ORDER BY retired_at`,
    [projectIds]
  );
  const retiredByProject = new Map<string, string[]>();
  for (const r of retiredRows) {
    const pid = r.project_id as string;
    const list = retiredByProject.get(pid) ?? [];
    list.push(r.number as string);
    retiredByProject.set(pid, list);
  }

  const data = rows.map((r) => ({
    ...r,
    retired_numbers: retiredByProject.get(r.id as string) ?? [],
  }));
  res.json({ success: true, data });
});

// エピソード一覧（セレクター用）
router.get('/:projectId/episodes-options', async (req, res) => {
  const projectId = req.params.projectId;

  const project = await queryOne(
    'SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId]
  );
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const rows = await queryAll(
    `SELECT id, episode_code, episode_number, broadcast_date, recording_date
     FROM episodes
     WHERE project_id = ? AND deleted_at IS NULL
     ORDER BY episode_number ASC`,
    [projectId]
  );
  res.json({ success: true, data: rows });
});

/**
 * 案件1件の「台本を作るのに要る事実」（案件名・顧客名・会場・本番日・リハ日）。
 *
 * **案件を1つ選んだ瞬間に1回だけ叩く想定。** 一覧（`/gls-options`）には
 * 絶対に足さない — 全案件ぶん `project_dates` と `studio_bookings` の JOIN を
 * 引くことになり、**セレクターを開くだけで重くなる**。
 *
 * ── 権限の判断 ──────────────────────────────────────────
 *
 * この経路は上の `router.use(requireAuth)` のとおり**認証だけ**で、
 * `sales` 権限を要求しない。制作技術支援（qsheet）の利用者は
 * `GET /projects`（`projects.routes.ts` の `requirePermission('sales')`）も
 * `GET /studios/bookings`（`studio.routes.ts` の同）も叩けないので、
 * **越境用のこの経路でしか案件の事実を読めない**ため。
 *
 * そのかわり**返す中身を必要最小限に絞る**（実装は
 * `../services/projectContext.service.ts`）。金額・見込額・ステージ・
 * 失注理由・BOX の URL といった営業情報は**1つも返さない** —
 * 権限を要求しない以上、返した時点で全社員に見えるのと同じ意味になる。
 */
router.get('/:projectId/context', async (req, res) => {
  const context = await getProjectContext(req.params.projectId);
  if (!context) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  res.json({ success: true, data: context });
});

export default router;
