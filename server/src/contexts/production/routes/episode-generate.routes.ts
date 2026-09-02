/**
 * 回の一括生成（頻度×期間×1日あたりの本数）— docs/design/v4/regular-series.md §7・§10-5
 *
 * 既存 `/episodes/batch`（件数・話数を明示指定する従来の口・GLS-B の月次以外の単発追加や
 * MCP が使う）とは**独立させた別の入口**にしてある（`episodes.routes.ts` の冒頭コメント参照）。
 * ここでは「開始日＋繰り返し＋1日あたりの本数」から収録日を組み立て（`episodeGenerate.service.ts`）、
 * 収録日ごとに既存回とぶつからないかを確かめてから作る。
 *
 * `dry_run=true` は一切書き込まず、プレビュー（何日ぶん作るか・何日は既存とぶつかって
 * 飛ばすか）だけを返す。**画面は必ず dry_run で内容を見せてから実行する**
 * （お金の行＝revenues が一緒に増えることがあるため、押したあとで分かるのは事故 — 設計文書 §7）。
 *
 * ファイルを分けているのは `shared/CLAUDE.md`／`client/CLAUDE.md` 共通の「1ファイル400行」
 * 上限のため（`episodes.routes.ts` に置くと超える）。
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, withTransaction } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { generateEpisodeCode, getNextEpisodeNumberAtomic } from '../../../shared/services/sequence.service';
import { generateBillingKey } from '../../../shared/services/billing-key.service';
import { AppError } from '../../../shared/middleware/errorHandler';
import { groupConsecutive } from '../../../shared/production/episodeSpec';
import {
  planEpisodeDates, resolveBroadcastDate, resolvePlan, summarizeResolvedPlan,
  EpisodeGenerateError, type PlannedDate,
} from '../services/episodeGenerate.service';
import { broadcastTypeIncludes } from './episodes.routes';
import { taskColumnsService, REGULAR_EPISODE_TEMPLATE_ID } from '../../tasks/services/task-columns.service';
import { jstDate } from '../../../shared/utils/jst';

const router = Router();

// 収録日→放送日の既定オフセット（設計文書 §2 の実例: 収録 6/18・公開 6/25 ＝ +7日）。
// 優先順位: リクエストの broadcast_offset_days（明示指定） > 案件の取り決め
// （projects.broadcast_offset_days・migration 264） > この決め打ち既定値。
const DEFAULT_BROADCAST_OFFSET_DAYS = 7;

router.use(requireAuth, requirePermission('sales'));

router.post('/:projectId/episodes/generate', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId as string;
  const {
    start_date, cadence, dates, per_day_count, count, end_date,
    broadcast_offset_days, revenue_budget_per_episode, order_date, notes, dry_run,
  } = req.body;

  let plan: PlannedDate[];
  try {
    plan = planEpisodeDates({
      cadence,
      start_date: start_date || null,
      dates: Array.isArray(dates) ? dates : null,
      per_day_count: per_day_count === undefined || per_day_count === null || per_day_count === ''
        ? 1 : Number(per_day_count),
      count: count === undefined || count === null || count === '' ? null : Number(count),
      end_date: end_date || null,
    });
  } catch (e) {
    if (e instanceof EpisodeGenerateError) throw new AppError(400, 'VALIDATION_ERROR', e.message);
    throw e;
  }

  const project = await queryOne(
    'SELECT gls_number, customer_id, broadcast_type, broadcast_offset_days, recurrence FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (!project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'GLS発番後に回を作成できます');

  // 優先順位: リクエストで明示指定 > 案件の取り決め（migration 264） > 決め打ち既定値
  const offsetDays = Number.isFinite(Number(broadcast_offset_days))
    ? Number(broadcast_offset_days)
    : (Number.isFinite(Number(project.broadcast_offset_days)) && project.broadcast_offset_days !== null
      ? Number(project.broadcast_offset_days) : DEFAULT_BROADCAST_OFFSET_DAYS);
  const isLive = broadcastTypeIncludes(project.broadcast_type, 'live');
  const revPerEp = revenue_budget_per_episode || 0;
  const customerId = project.customer_id;
  const today = order_date || jstDate();
  const userId = req.user!.id;
  const plannedDates = plan.map((p) => p.date);

  // dry_run: 実データの recording_date を数えて「作る/飛ばす」だけ返す。書き込まない。
  if (dry_run) {
    const existingRows = await queryAll(
      `SELECT recording_date FROM episodes
       WHERE project_id = ? AND deleted_at IS NULL AND recording_date = ANY(?::text[])`,
      [projectId, plannedDates],
    ) as { recording_date: string }[];
    const preview = summarizeResolvedPlan(resolvePlan(plan, existingRows));
    res.json({ success: true, dry_run: true, data: preview });
    return;
  }

  let result: { created: unknown[]; resolved: ReturnType<typeof resolvePlan> };
  try {
    result = await withTransaction(async (tx) => {
      // 採番からINSERTまでを同じトランザクション・同じ行ロックの中で行う（/batch と同じ作法）。
      // recording_date もここで行ロックしてから数える — 同時に別の生成が同じ日を
      // 使おうとしても、片方はここで待たされてからスキップ判定を確定させる。
      const existingRows = await tx.queryAll(
        `SELECT recording_date FROM episodes
         WHERE project_id = ? AND deleted_at IS NULL AND recording_date = ANY(?::text[])
         FOR UPDATE`,
        [projectId, plannedDates],
      ) as { recording_date: string }[];
      const resolved = resolvePlan(plan, existingRows);
      const toCreate = resolved.filter((r) => !r.skip);

      const numbers: number[] = [];
      for (const r of toCreate) {
        for (let i = 0; i < r.take; i++) numbers.push(await getNextEpisodeNumberAtomic(projectId, tx));
      }

      if (numbers.length === 0) return { created: [], resolved };

      // 既存話数との重複は /batch と同じくDBのUNIQUE制約に任せず事前にまとめてチェックする
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

      for (const g of groupConsecutive(numbers)) {
        await tx.execute(
          `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), projectId, today, g.end - g.start + 1, g.start, g.end, notes || null, userId],
        );
      }

      const created: unknown[] = [];
      let numIdx = 0;
      for (const r of toCreate) {
        const broadcastDate = resolveBroadcastDate(r.date, offsetDays, isLive);
        for (let i = 0; i < r.take; i++) {
          const episodeNumber = numbers[numIdx++];
          const episodeCode = generateEpisodeCode(project.gls_number, episodeNumber);
          const id = uuidv4();
          await tx.execute(
            `INSERT INTO episodes (id, project_id, episode_code, episode_number, recording_date, broadcast_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, projectId, episodeCode, episodeNumber, r.date, broadcastDate, userId],
          );

          if (revPerEp > 0) {
            const revId = uuidv4();
            const billingKey = generateBillingKey(episodeCode, 'tax10');
            await tx.execute(
              `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to, tax_category, amount, notes, created_by)
               VALUES (?, ?, ?, ?, ?, ?, 'tax10', ?, ?, ?)`,
              [revId, billingKey, projectId, id, customerId, userId, revPerEp, '一括生成時按分', userId],
            );
          }

          const row = await tx.queryOne('SELECT * FROM episodes WHERE id = ?', [id]);
          created.push(row);
        }
      }

      return { created, resolved };
    });
  } catch (e) {
    // 事前チェックをすり抜けた同時実行だけが踏む経路（UNIQUE 制約違反）。
    if (e instanceof Error && 'code' in e && (e as { code?: string }).code === '23505') {
      throw new AppError(400, 'VALIDATION_ERROR', '他の操作と同時に重なったため、話数が重複しました。もう一度お試しください');
    }
    throw e;
  }

  /**
   * **生成した回すべてに標準工程3列を当てる**（regular-series.md §4・§10 積み残し2）。
   * レギュラー案件だけ（単発は回に工程テンプレートという概念が無い）。
   *
   * ⚠️ **トランザクションの外（コミット後）で、1件ずつ try/catch。**
   * `applyToEpisode` はトランザクション外の実装（queryOne/execute）なので、
   * 既にコミット済みのここで呼ぶ。テンプレート未整備等で失敗しても
   * **回の作成そのものは既に成功しているので、レスポンスは止めない**。
   */
  if (project.recurrence === 'regular') {
    for (const ep of result.created as Array<{ id: string }>) {
      try {
        await taskColumnsService.applyToEpisode(projectId, ep.id, REGULAR_EPISODE_TEMPLATE_ID, userId);
      } catch (err) {
        console.warn('[episodes/generate] standard task template auto-apply failed:', projectId, ep.id, (err as Error).message);
      }
    }
  }

  const { dates: resultDates, summary } = summarizeResolvedPlan(result.resolved);
  res.status(201).json({
    success: true,
    dry_run: false,
    data: {
      episodes: result.created,
      dates: resultDates,
      summary: { ...summary, episodes_created: result.created.length },
    },
  });
});

export default router;
