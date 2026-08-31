/**
 * 案件の健全性 — **しきい値・生存証拠・健全性・自動整理の単一定義**
 * （docs/core-redesign-plan.md §3-1 / §3-2 / §3-7）
 *
 * ── なぜ1か所に集めるか ─────────────────────────────────────
 *
 * 「止まっている」の7日は salesOverview / RECOMMENDED_SORT / client の3か所に
 * ハードコードされていて、**1つ直すと残りが黙ってずれる**形だった。
 * 健全性は保存せず、表示のたびに**このモジュールの式だけ**から導出する
 * （保存すると必ず実態とずれる — 「お待たせ中」の轍）。
 *
 * ── 健全性の4値 ─────────────────────────────────────────────
 *
 *   snoozed … `snooze_until` が未来。意図して寝かせている（停滞にも整理候補にも出さない）
 *   overdue … 次の一手（次回アクション / タスク）の期日が過去。最優先で浮上
 *   stalled … 次の一手が**無く**、最後の動きがステージ別しきい値を超えた
 *   ok      … それ以外（終端ステージは常に ok）
 *
 * ── 生存証拠（生きている証拠）───────────────────────────────
 *
 * 未来のスヌーズ / 未来の次回アクション / 期日が未来の未完了タスク / 未来の実施日。
 * **1つでもあれば自動整理は絶対に触らない。** 機械に判定できるのは
 * 「不要か」ではなく「生きている証拠が無いか」だけ（同計画 §2-4）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { jstDate } from '../../../shared/utils/jst';
import { recordIntakeDecision } from './project-ai-feedback.service';
/**
 * 終了ステージに入ったら次回アクションを閉じる（migration 245）。
 * **この2つの自動整理は `recordStageTransition()` を通らない**ので、
 * 集約点に足しただけでは機械が作ったゴミが残りつづける。
 */
import { syncNextActionsForStageSafe } from '../../../shared/services/next-action-state';

/**
 * 何日動いていなければ「停滞」か（ステージ別・初期値）。
 *
 * ネタは長め（引き合いは寝ることがある）、口頭決定は短め（書面が進んでいない
 * のは危険信号）。**受注済（a_won）と終端（s_completed / e_lost）は対象外** —
 * 受注後の制作の遅れはタスク側で管理する（同計画 §3-1）。
 */
export const STUCK_DAYS_BY_STAGE: Record<string, number> = {
  neta: 30,
  d_hold: 14,
  c_proposal: 14,
  b_verbal: 7,
};

/** 一覧の `?health=` で受ける値。知らない値は素通しさせない（呼び出し側が使う） */
export const HEALTH_FILTERS = ['stalled', 'overdue', 'snoozed'] as const;
export type ProjectHealth = 'ok' | 'snoozed' | 'overdue' | 'stalled';

/**
 * 「最後の動き」の式（salesOverview から移設・案件一覧と同じ考え方）。
 * 案件そのもの・タスク・活動記録のいちばん新しい時刻を採る。
 *
 * `projects.updated_at` だけでは足りない — この数字を見る目的は
 * 「放っておかれていないか」なので、タスクを動かしただけでも「動いている」。
 * 見積・請求は入れない（`revenues` は締め処理で一斉に更新されるので、
 * 誰も触っていない案件まで「たった今」になる）。
 */
export const LAST_MOVE_SQL = `
  GREATEST(
    p.updated_at,
    COALESCE((SELECT MAX(t.updated_at) FROM project_tasks t
              WHERE t.project_id = p.id AND t.deleted_at IS NULL), p.updated_at),
    COALESCE((SELECT MAX(a.updated_at) FROM activity_logs a
              WHERE a.project_id = p.id AND a.deleted_at IS NULL), p.updated_at)
  )
`;

/**
 * ステージ別しきい値の SQL（`STUCK_DAYS_BY_STAGE` から機械的に組む）。
 * **対象外のステージは NULL** — NULL の比較は成立しないので、
 * 受注済・終端は「停滞」の判定にそもそも掛からない。
 */
export const STUCK_INTERVAL_SQL = `(CASE p.stage ${Object.entries(STUCK_DAYS_BY_STAGE)
  .map(([stage, days]) => `WHEN '${stage}' THEN INTERVAL '${days} days'`)
  .join(' ')} ELSE NULL END)`;

/**
 * 生存証拠。**COALESCE で必ず true/false に落とす** — `snooze_until` や
 * `event_start` が NULL の行で全体が NULL になると、`NOT 生存証拠` も NULL になり
 * 「証拠が無いのに停滞にも整理候補にも出ない」行が黙ってできる。
 *
 * タスクの期日は `COALESCE(due_at, due_date の 18:00)` — 読み手を1本にする決めごと
 * （同計画 §3-4・`my-tasks.service` / `NEXT_TASK_LATERAL` と同じ式）。
 * 期日の無いタスクは証拠にならない（「いつ動くか」を言っていないため）。
 */
export const ALIVE_EVIDENCE_SQL = `(
  COALESCE(p.snooze_until >= CURRENT_DATE, FALSE)
  OR EXISTS (SELECT 1 FROM activity_logs al
              WHERE al.project_id = p.id AND al.deleted_at IS NULL
                AND al.next_action IS NOT NULL AND al.next_action_date IS NOT NULL
                AND al.next_action_done_at IS NULL
                AND al.next_action_date >= CURRENT_DATE::text)
  OR EXISTS (SELECT 1 FROM project_tasks pt
              WHERE pt.project_id = p.id AND pt.deleted_at IS NULL
                AND pt.is_completed = false
                AND COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) >= CURRENT_DATE::timestamp)
  OR COALESCE(NULLIF(p.event_start, '') >= CURRENT_DATE::text, FALSE)
)`;

/**
 * 期限切れの次の一手があるか（🔴 期限超過）。
 * 次回アクションの条件は受信箱の `OVERDUE_ACTIONS_BASE` と同じ形。
 * タスクは生存証拠と**同じ式を今日で切っただけ**（過去＝超過・未来＝証拠）。
 */
export const OVERDUE_NEXT_MOVE_SQL = `(
  EXISTS (SELECT 1 FROM activity_logs al
           WHERE al.project_id = p.id AND al.deleted_at IS NULL
             AND al.next_action IS NOT NULL AND al.next_action_date IS NOT NULL
             AND al.next_action_done_at IS NULL
             AND al.next_action_date < CURRENT_DATE::text)
  OR EXISTS (SELECT 1 FROM project_tasks pt
              WHERE pt.project_id = p.id AND pt.deleted_at IS NULL
                AND pt.is_completed = false
                AND COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) < CURRENT_DATE::timestamp)
)`;

/**
 * 健全性の導出（`'ok' | 'snoozed' | 'overdue' | 'stalled'` を返す式）。
 *
 * 判定の順: 終端は常に ok → スヌーズ中 → 期限超過 → 停滞 → ok。
 * スヌーズが超過より先なのは「意図して寝かせたものは静かにする」ため（§3-1 の表）。
 *
 * @param lastMove 「最後の動き」の式。一覧のように別名（lateral）で既に
 *   持っている呼び出し側は、その別名の式を渡して二重計算を避けられる。
 *   **式の中身は必ずこのモジュールの `LAST_MOVE_SQL` と同じ意味であること。**
 */
export function healthSql(lastMove: string = LAST_MOVE_SQL): string {
  return `CASE
    WHEN p.stage IN ('s_completed', 'e_lost') THEN 'ok'
    WHEN p.snooze_until >= CURRENT_DATE THEN 'snoozed'
    WHEN ${OVERDUE_NEXT_MOVE_SQL} THEN 'overdue'
    WHEN NOT ${ALIVE_EVIDENCE_SQL}
         AND ${lastMove} < NOW() - ${STUCK_INTERVAL_SQL}
    THEN 'stalled'
    ELSE 'ok'
  END`;
}

/**
 * 「放置◯日」（最後の動きからの日数）。**stalled のときだけ数値**を返し、
 * それ以外は NULL — 健全な行にも日数を出すと、数字の意味が読めなくなる。
 */
export function stalledDaysSql(lastMove: string = LAST_MOVE_SQL): string {
  return `CASE WHEN (${healthSql(lastMove)}) = 'stalled'
    THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - ${lastMove})) / 86400)::int
    ELSE NULL END`;
}

// ───────────────────────────────────────────────────────────
// 自動整理（同計画 §3-2）— 機械は候補出しとエスカレーション、決定は人の1クリック
// ───────────────────────────────────────────────────────────

/** 整理候補の通知を出すまでの日数（生存証拠なしでこの日数動かなかったネタ） */
export const TIDY_CANDIDATE_DAYS = 60;
/** 自動見送りまでの日数（候補通知からさらに30日、誰も触らなかったネタ） */
export const TIDY_AUTO_LOST_DAYS = 90;
/** 自動見送りの理由（migration 238 の失注理由マスタ `lr_09` と同じ文言） */
export const AUTO_LOST_REASON = '自動整理（長期放置）';

/**
 * 機械が動かしたときの操作者の印。**users には居ない**（changed_by / updated_by は
 * FK を持たない TEXT）。人の id にすると「その人が閉じた」ことになり、
 * mcpActorId にすると「AI が閉じた」ことになる — どちらでもない。
 */
export const SYSTEM_ACTOR = 'system:project_tidy';

/** 1日に自動で動かす上限。初回（溜まった環境）に一晩で全部動かして通知の洪水にしない */
const TIDY_BATCH_LIMIT = 200;

export interface TidyRow {
  id: string;
  name: string;
  /** 通知先（起票者）。**在籍中の users に実在するときだけ**入る。無ければ通知しない */
  creator_id: string | null;
  /** 最後の動きからの日数（通知の文面に出す） */
  stalled_days: number;
  /**
   * 通知の一意キーに使う日付。「候補になった日」＝ 最後の動き + しきい値 で**固定**する。
   * `today` を入れると一意索引（人×ひな形×対象×日）が毎日別の行を許し、
   * **同じ督促が毎朝出続ける**。固定しておけば、動きが無い限り同じ鍵で弾かれる。
   */
  ref_date: string;
}

/** ネタのうち生存証拠が無く、指定日数以上動いていないものを引く（共通の絞り） */
function staleNetaSql(select: string, extraWhere: string): string {
  return `SELECT ${select}
     FROM projects p
     LEFT JOIN users u ON u.id = p.created_by AND u.deleted_at IS NULL AND u.status = 'active'
     WHERE p.deleted_at IS NULL AND p.stage = 'neta'
       AND NOT ${ALIVE_EVIDENCE_SQL}
       ${extraWhere}
     ORDER BY ${LAST_MOVE_SQL} ASC
     LIMIT ${TIDY_BATCH_LIMIT}`;
}

const TIDY_SELECT = (thresholdDays: number) => `
  p.id, p.name, u.id AS creator_id,
  FLOOR(EXTRACT(EPOCH FROM (NOW() - ${LAST_MOVE_SQL})) / 86400)::int AS stalled_days,
  to_char(${LAST_MOVE_SQL} + INTERVAL '${thresholdDays} days', 'YYYY-MM-DD') AS ref_date
`;

/**
 * 整理候補（60日）。**60〜90日の帯だけ**を返す — 90日を超えたものは
 * `autoLoseStaleNeta` が同じ朝に見送りへ動かすので、候補と重ねて通知しない。
 */
export async function listTidyCandidates(): Promise<TidyRow[]> {
  return await queryAll(staleNetaSql(
    TIDY_SELECT(TIDY_CANDIDATE_DAYS),
    `AND ${LAST_MOVE_SQL} <  NOW() - INTERVAL '${TIDY_CANDIDATE_DAYS} days'
     AND ${LAST_MOVE_SQL} >= NOW() - INTERVAL '${TIDY_AUTO_LOST_DAYS} days'`,
  )) as unknown as TidyRow[];
}

/** ステージを機械が動かしたときも**必ず履歴を残す**（migration 164。人の操作と同じ形） */
async function recordSystemStageChange(projectId: string, from: string, to: string): Promise<void> {
  await execute(
    `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), projectId, from, to, SYSTEM_ACTOR],
  );
}

/**
 * 自動見送り（90日）。**対象はネタだけ** — 仮押さえ以降は人が動かした案件なので
 * 機械は閉じない（誤爆防止・同計画 §3-2）。すべて可逆（ステージ帯から戻せる）で、
 * **削除は絶対にしない**。
 *
 * ⚠️ `projectService.changeStage` は通らない。あちらは
 * `markAiReviewedByStageDecision`（人がステージを動かした＝中身を確かめた、の印）を
 * 呼ぶが、**機械の見送りは誰も中身を見ていない**。印を付けると AI 起票の案件が
 * 「無修正で採用」に数えられ、受入率が嘘になる。
 * `recordIntakeDecision('dropped')` は呼ぶ — AI が拾いすぎた手がかりとして正しい
 * （note で自動整理と分かるようにする）。
 */
export async function autoLoseStaleNeta(): Promise<TidyRow[]> {
  const rows = (await queryAll(staleNetaSql(
    TIDY_SELECT(TIDY_AUTO_LOST_DAYS),
    `AND ${LAST_MOVE_SQL} < NOW() - INTERVAL '${TIDY_AUTO_LOST_DAYS} days'`,
  ))) as unknown as TidyRow[];

  const note = `自動整理: ${TIDY_AUTO_LOST_DAYS}日以上動きが無かったため自動で見送りにしました`;
  const done: TidyRow[] = [];
  for (const r of rows) {
    try {
      // **ステージ条件つきで更新し、動いたかを RETURNING で見る。**
      // 引いてから閉じるまでの間に人が触った行（レース）を黙って上書きしない
      const moved = await queryOne(
        `UPDATE projects SET stage = 'e_lost', lost_reason = ?, lost_reason_note = ?,
                lost_at = NOW(), updated_at = NOW(), updated_by = ?
          WHERE id = ? AND deleted_at IS NULL AND stage = 'neta'
          RETURNING id`,
        [AUTO_LOST_REASON, note, SYSTEM_ACTOR, r.id],
      ) as { id?: string } | null;
      if (!moved?.id) continue;
      await recordSystemStageChange(r.id, 'neta', 'e_lost');
      await recordIntakeDecision(r.id, 'dropped', SYSTEM_ACTOR, note);
      // **見送った案件のやることも閉じる**（migration 245）。この道は
      // `recordStageTransition()` を通らないので、ここで呼ばないとゴミが残る。
      // **`RETURNING id` で実際に動いた行だけ**（上のレース対策と同じ理由 —
      // 人が先に触って `neta` でなくなっていた案件のやることを閉じてはいけない）
      await syncNextActionsForStageSafe(r.id, 'e_lost');
      done.push(r);
    } catch (e) {
      // 1件の失敗で残りを止めない（scheduler の決めごとと同じ）
      console.error('[project-tidy] auto-lose failed:', r.id, (e as Error).message);
    }
  }
  return done;
}

/**
 * 受注→完了の繰り上げ（`event_end` を過ぎた受注案件を `s_completed` に）。
 *
 * これまで `GET /dashboard/check-completed` の**生 UPDATE** だった —
 * 誰もダッシュボードを開かない日は動かず、履歴も残らなかった。
 * 日次ジョブとダッシュボードの両方が**この1本**を呼ぶ（履歴付き・通知は不要）。
 */
export async function completeElapsedWonProjects(): Promise<number> {
  const today = jstDate();
  const rows = (await queryAll(
    `SELECT id FROM projects
      WHERE deleted_at IS NULL AND stage = 'a_won'
        AND NULLIF(event_end, '') IS NOT NULL AND event_end < ?`,
    [today],
  )) as { id: string }[];

  let n = 0;
  for (const r of rows) {
    const moved = await queryOne(
      `UPDATE projects SET stage = 's_completed', updated_at = NOW(), updated_by = ?
        WHERE id = ? AND deleted_at IS NULL AND stage = 'a_won'
        RETURNING id`,
      [SYSTEM_ACTOR, r.id],
    ) as { id?: string } | null;
    if (!moved?.id) continue;
    await recordSystemStageChange(r.id, 'a_won', 's_completed');
    // 繰り上げ完了もここが集約点（`recordStageTransition()` は通らない）。
    // **実際に動いた行だけ**閉じる（`RETURNING id` を見てから呼んでいる）
    await syncNextActionsForStageSafe(r.id, 's_completed');
    n += 1;
  }
  return n;
}
