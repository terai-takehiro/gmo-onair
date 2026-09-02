/**
 * 「利用日＋回番号」をまとめて登録する（例: 9/7 に #17,18,19）— 9/2 の仕様変更・調査項目 S5
 *
 * ── なぜ3つ目の口が要るのか ──────────────────────────────────
 *
 * 回を作る口はこれまで2つあり、**どちらも「日付と回番号を同時に決める」ことが
 * できなかった**（実測）。
 *
 *   ・`POST /episodes/batch`   … 番号は `#17-19` と明示できるが、INSERT に
 *                                `recording_date` が無く**日付が入らない**
 *   ・`POST /episodes/generate` … 日付は入るが、番号は必ず自動採番で
 *                                **#17,18,19 を指定できない**
 *
 * 現場の実務は「9/7｜#17,18,19」のように**日と番号を人が決めて打ち込む**形なので、
 * どちらの口でも表現できなかった。既存2つは呼び出し元（MCP・旧クライアント）が
 * いるので**混ぜ込まず、3つ目の入口を足す**（`episode-generate.routes.ts` 冒頭の
 * 「/batch には日付計算を混ぜ込まない」という決めごとと同じ理由）。
 *
 * ── ここに DB アクセスまで置いているのはなぜか ────────────────────
 *
 * `episodes.routes.ts` は着手時点で 338 行あり、ハンドラ本体をそこに書くと
 * 1ファイル400行の上限（`scripts/check-file-size.mjs`）を超える。ルート側は
 * 「URL とこの関数を結ぶ」だけにして、検証・採番・INSERT はここに置く。
 * 入力の読み取り（DB を見ない純関数）はさらに `episodeDatedPlan.service.ts` に分けてある。
 *
 * ── 決めごと（ご判断） ──────────────────────────────────────
 *
 *   ・**既に回がある日にも足せる**（9/7 に #17 がある状態で #18,#19 を足す）。
 *     `/episodes/generate` の「その日は丸ごと飛ばす」判定はここでは使わない。
 *   ・**飛び番（#17,#18,#20）は禁止しない**。実務では欠番が起きるので、
 *     プレビューで警告を出して人に見せるだけにする。
 *   ・**既にある回番号とぶつかったら、はっきり断る**（黙って上書き・黙って
 *     飛ばすのは禁止）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, withTransaction, type TxClient } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateEpisodeCode, getNextEpisodeNumberAtomic } from '../../../shared/services/sequence.service';
import { generateBillingKey } from '../../../shared/services/billing-key.service';
import { groupConsecutive } from '../../../shared/production/episodeSpec';
import { type ParsedDatedEntry, findNumberGaps } from './episodeDatedPlan.service';
import { resolveBroadcastDate, broadcastTypeIncludes } from './episodeGenerate.service';
import { taskColumnsService, REGULAR_EPISODE_TEMPLATE_ID } from '../../tasks/services/task-columns.service';

/** 収録日→放送日の既定オフセット（`episode-generate.routes.ts` と同じ値・同じ優先順位） */
const DEFAULT_BROADCAST_OFFSET_DAYS = 7;

interface ProjectRow {
  gls_number: string | null;
  customer_id: string | null;
  broadcast_type: string | null;
  broadcast_offset_days: number | null;
  recurrence: string | null;
}

async function loadProject(projectId: string): Promise<ProjectRow> {
  const project = await queryOne(
    `SELECT gls_number, customer_id, broadcast_type, broadcast_offset_days, recurrence
       FROM projects WHERE id = ? AND deleted_at IS NULL`,
    [projectId],
  ) as ProjectRow | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (!project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'GLS発番後に回を作成できます');
  return project;
}

export interface DatedPreviewEntry {
  recording_date: string;
  /** 明示指定した回番号（件数指定のときは null＝作ってみるまで決まらない） */
  numbers: number[] | null;
  count: number;
  /** 既にある回とぶつかっている回番号 */
  conflicts: number[];
  /** その日に既にある回の本数 */
  existing_on_date: number;
}

/**
 * **一切書かずに**、何が起きるかだけを返す（`/episodes/generate` と同じ作法）。
 *
 * 回を作ると売上（見込み）の行も一緒に増えることがあるので、押したあとで
 * 分かるのは事故（`docs/design/v4/regular-series.md` §7）。画面は必ずこれを
 * 見せてから実行する。
 */
export async function previewDatedEpisodes(projectId: string, entries: ParsedDatedEntry[]) {
  await loadProject(projectId);

  const rows = await queryAll(
    `SELECT episode_number, recording_date FROM episodes
      WHERE project_id = ? AND deleted_at IS NULL`,
    [projectId],
  ) as { episode_number: number; recording_date: string | null }[];

  const existingNumbers = new Set(rows.map((r) => r.episode_number));
  const countByDate = new Map<string, number>();
  for (const r of rows) {
    if (!r.recording_date) continue;
    countByDate.set(r.recording_date, (countByDate.get(r.recording_date) ?? 0) + 1);
  }

  const previewEntries: DatedPreviewEntry[] = entries.map((e) => ({
    recording_date: e.recordingDate,
    numbers: e.numbers,
    count: e.count,
    conflicts: (e.numbers ?? []).filter((n) => existingNumbers.has(n)),
    existing_on_date: countByDate.get(e.recordingDate) ?? 0,
  }));

  const conflicts = previewEntries.flatMap((e) => e.conflicts);
  // 飛び番の警告は「今ある回 ＋ これから作る回」を合わせた並びで見る
  const gaps = findNumberGaps([...existingNumbers, ...entries.flatMap((e) => e.numbers ?? [])]);

  return {
    entries: previewEntries,
    summary: {
      dates_total: previewEntries.length,
      episodes_to_create: entries.reduce((sum, e) => sum + e.count, 0),
      conflicts,
      gaps,
    },
  };
}

/**
 * 明示指定した回番号のぶん、採番カウンタを追い越させる。
 *
 * `getNextEpisodeNumberAtomic` は `sequences` の行（`counter` ＝最後に使った番号）を
 * 進める実装で、#17,18,19 を**手で入れてもカウンタは進まない**。放っておくと
 * 次に件数モードや「頻度で作る」を使ったときに #18 を採り直して重複エラーになる。
 * ここで `GREATEST` で追い越しておく（既存の値より小さければ何もしない）。
 *
 * ⚠️ **案件の既存最大値では進めない。** GLS-B の月次ユニット（`/episodes/month`）は
 * `episode_number` に `2607` のような YYMM を入れるので、それを種にすると
 * カウンタが一気に跳ねる。ここで追い越すのは**人が打ち込んだ番号だけ**にする。
 */
async function bumpEpisodeSequence(tx: TxClient, projectId: string, maxExplicit: number): Promise<void> {
  await tx.execute(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, 'episode', '000000', ?)
     ON CONFLICT (seq_name) DO UPDATE SET counter = GREATEST(sequences.counter, EXCLUDED.counter)`,
    [`episode:${projectId}`, maxExplicit],
  );
}

/** 既にある回番号とぶつかっていないか、行ロックを取ってから確かめる */
async function assertNoDuplicate(
  tx: TxClient, projectId: string, numbers: number[], message: (list: string) => string,
): Promise<void> {
  if (numbers.length === 0) return;
  const dupRows = await tx.queryAll(
    `SELECT episode_number FROM episodes
      WHERE project_id = ? AND deleted_at IS NULL AND episode_number = ANY(?::int[])
      FOR UPDATE`,
    [projectId, numbers],
  ) as { episode_number: number }[];
  if (dupRows.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', message(dupRows.map((r) => `#${r.episode_number}`).join('、')));
  }
}

export interface CreateDatedEpisodesInput {
  projectId: string;
  entries: ParsedDatedEntry[];
  userId: string;
  /** 放送日オフセットの明示指定（未指定なら案件の取り決め、それも無ければ既定値） */
  broadcastOffsetDays?: unknown;
  /** `episode_orders.order_date`。未指定なら**その行の利用日**を使う（発注日ではなく利用日で残す） */
  orderDate?: string | null;
  notes?: string | null;
}

/** 実際に回を作る。既存の `/batch`・`/generate` と採番・重複チェックの作法を揃える */
export async function createDatedEpisodes(input: CreateDatedEpisodesInput) {
  const { projectId, entries, userId } = input;
  const project = await loadProject(projectId);

  // 優先順位: リクエストで明示指定 > 案件の取り決め（migration 264） > 決め打ち既定値
  const offsetDays = Number.isFinite(Number(input.broadcastOffsetDays))
    ? Number(input.broadcastOffsetDays)
    : (project.broadcast_offset_days !== null && Number.isFinite(Number(project.broadcast_offset_days))
      ? Number(project.broadcast_offset_days) : DEFAULT_BROADCAST_OFFSET_DAYS);
  const isLive = broadcastTypeIncludes(project.broadcast_type, 'live');

  let created: Array<Record<string, unknown>>;
  try {
    created = await withTransaction(async (tx) => {
      const explicit = entries.flatMap((e) => e.numbers ?? []);
      await assertNoDuplicate(tx, projectId, explicit, (list) => `すでにある話数と重複しています（${list}）`);

      // その日に既に何本あるか。`recording_per_day_count`（その収録日に撮った本数）の
      // 合計に使うので、追記のときも「既存＋今回」で数える
      const dates = entries.map((e) => e.recordingDate);
      const onDateRows = await tx.queryAll(
        `SELECT recording_date FROM episodes
          WHERE project_id = ? AND deleted_at IS NULL AND recording_date = ANY(?::text[])
          FOR UPDATE`,
        [projectId, dates],
      ) as { recording_date: string }[];
      const existingByDate = new Map<string, number>();
      for (const r of onDateRows) {
        existingByDate.set(r.recording_date, (existingByDate.get(r.recording_date) ?? 0) + 1);
      }

      // 明示指定を先にカウンタへ反映してから件数モードの採番を取る
      // （同じリクエストに「#17,18,19」と「3件」が混ざっても衝突しないようにする）
      if (explicit.length > 0) await bumpEpisodeSequence(tx, projectId, Math.max(...explicit));

      const resolved: Array<{ entry: ParsedDatedEntry; numbers: number[] }> = [];
      const auto: number[] = [];
      for (const entry of entries) {
        if (entry.numbers) { resolved.push({ entry, numbers: entry.numbers }); continue; }
        const ns: number[] = [];
        for (let i = 0; i < entry.count; i++) ns.push(await getNextEpisodeNumberAtomic(projectId, tx));
        auto.push(...ns);
        resolved.push({ entry, numbers: ns });
      }
      await assertNoDuplicate(tx, projectId, auto, (list) => `自動で採った話数が既存とぶつかりました（${list}）。話数を明示して指定してください`);

      const out: Array<Record<string, unknown>> = [];
      for (const { entry, numbers } of resolved) {
        // `episode_orders` は start/end の2列しか持たないので連続区間ごとに分ける
        for (const g of groupConsecutive(numbers)) {
          await tx.execute(
            `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), projectId, input.orderDate || entry.recordingDate,
              g.end - g.start + 1, g.start, g.end, input.notes || null, userId],
          );
        }

        // その収録日の合計本数（既にあるぶんを含む）。
        // ⚠️ **既存行は書き換えない** — 人が `EditEpisodeDialog` で直した値を
        // 黙って上書きしないため。分けて登録した日は既存行とズレるので、
        // 気になるときは同じダイアログで直せる
        const perDay = (existingByDate.get(entry.recordingDate) ?? 0) + numbers.length;
        // 生放送は収録＝放送（`PUT /:id` と同じ規則）なので明示指定より優先する
        const broadcastDate = isLive
          ? entry.recordingDate
          : (entry.broadcastDate ?? resolveBroadcastDate(entry.recordingDate, offsetDays, false));

        for (const episodeNumber of numbers) {
          const episodeCode = generateEpisodeCode(project.gls_number as string, episodeNumber);
          const id = uuidv4();
          await tx.execute(
            `INSERT INTO episodes (id, project_id, episode_code, episode_number, recording_date, broadcast_date,
                                   recording_per_day_count, episode_unit_price, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, projectId, episodeCode, episodeNumber, entry.recordingDate, broadcastDate,
              perDay, entry.unitPrice, userId],
          );

          // 単価を入れた行だけ売上（見込み）も作る（`/batch`・`/generate` と同じ）。
          // ⚠️ 0円は「作らない」— 金額のない売上行を増やしても月次に乗るだけなので
          if (entry.unitPrice !== null && entry.unitPrice > 0) {
            await tx.execute(
              `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to, tax_category, amount, notes, created_by)
               VALUES (?, ?, ?, ?, ?, ?, 'tax10', ?, ?, ?)`,
              [uuidv4(), generateBillingKey(episodeCode, 'tax10'), projectId, id,
                project.customer_id, userId, entry.unitPrice, '回の登録時按分', userId],
            );
          }

          out.push(await tx.queryOne('SELECT * FROM episodes WHERE id = ?', [id]) as Record<string, unknown>);
        }
      }
      return out;
    });
  } catch (e) {
    // 事前チェックをすり抜けた同時実行だけが踏む経路（UNIQUE 制約違反）
    if (e instanceof Error && 'code' in e && (e as { code?: string }).code === '23505') {
      throw new AppError(400, 'VALIDATION_ERROR', '他の操作と同時に重なったため、話数が重複しました。もう一度お試しください');
    }
    throw e;
  }

  /**
   * **作った回に標準工程3列を当てる**（`/episodes/generate` と同じ）。
   * トランザクションの外（コミット後）で1件ずつ try/catch —
   * テンプレート未整備で失敗しても、回の作成そのものは既に成功しているので止めない。
   */
  if (project.recurrence === 'regular') {
    for (const ep of created) {
      try {
        await taskColumnsService.applyToEpisode(projectId, ep.id as string, REGULAR_EPISODE_TEMPLATE_ID, userId);
      } catch (err) {
        console.warn('[episodes/dated] standard task template auto-apply failed:', projectId, ep.id, (err as Error).message);
      }
    }
  }

  return {
    episodes: created,
    summary: {
      dates_total: entries.length,
      episodes_created: created.length,
    },
  };
}
