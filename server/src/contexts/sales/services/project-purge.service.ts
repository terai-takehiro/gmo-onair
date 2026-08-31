/**
 * **ゴミになった案件を案件台帳から外す（論理削除）**
 *
 * ── ユーザーからの依頼（2026-08-31）────────────────────────────
 *
 * 「合わせて失注やネタ見送りなどゴミになった案件は案件台帳等からも抹消したい
 *   (DBから削除したい)」
 *
 * ご相談のうえ、次のように決めました:
 *   - **論理削除**（`projects.deleted_at`）— 台帳・検索・集計・グラフから完全に
 *     消えるが、行は残るので**間違えても戻せる**
 *   - 対象は **失注（`e_lost`）すべて ＋ 放置ネタ**（`neta` のまま90日動いていない）
 *   - **見積だけなら消す。売上・仕入が付いているものは残す**
 *
 * ── ⚠️ なぜ物理削除（DELETE）にしなかったか ────────────────────
 *
 * ① **売上・請求は法定保存の対象**です。請求書・検収書は電子帳簿保存法で
 *    7年（欠損金があれば10年）保存します。案件の行を消すと外部キーで
 *    ぶら下がっている `revenues` / `purchases` / `estimates` まで道連れになります。
 * ② **失注は取り消せるステージで、しかも機械が付けます**（90日放置の自動見送り・
 *    Excel 取込・MCP）。取り消せる状態を根拠に、取り消せない削除をしてはいけません。
 * ③ 失注案件の見積は**失注分析の唯一の材料**です（何をいくらで出して負けたか）。
 *
 * 論理削除なら台帳からは消え、数字の裏付けは残ります。
 *
 * ── ⚠️ BOX のフォルダを置き去りにしない ────────────────────────
 *
 * 片づけの対象は `deleted_at IS NULL` で絞っています。**先に台帳から外すと、
 * その案件の BOX フォルダは二度と片づけの対象に選ばれません**（現役の場所に
 * 残ったまま、指すものが誰にも見えなくなる）。そこで**外す直前に片づけを試し**、
 * 片づかなかった件数は画面に必ず出します。
 */
import { execute, queryOne, queryAll } from '../../../shared/db/connection';
import { LAST_MOVE_SQL, TIDY_AUTO_LOST_DAYS, ALIVE_EVIDENCE_SQL } from './project-health';
import { syncBoxFoldersForStageSafe } from './box-lost-cleanup.service';

/**
 * ネタを「放置」と見なす日数。**自動見送りと同じ 90 日**を使う
 * （`project-health.ts` の `TIDY_AUTO_LOST_DAYS`）。
 * 別の数字にすると「自動整理には出ないのに台帳からは消える」帯ができる。
 */
export const PURGE_STALE_NETA_DAYS = TIDY_AUTO_LOST_DAYS;

/**
 * **1リクエストで使ってよい時間**（ミリ秒）。
 * 外す直前に BOX を触るので、片づけと同じく**件数ではなく時間**で切る
 * （件数で切って本番で 504 を出した反省・PR #492）。
 */
export const PURGE_BUDGET_MS = 20_000;

/**
 * **お金がぶら下がっているか。**（売上・仕入・按分のいずれか）
 *
 * ご判断「見積だけなら消す」。⚠️ **按分も見ます** — グループ案件では
 * `revenues.project_id` が親を指し、子は `revenue_allocations` にしかいないので、
 * 直接の行だけ見ると**売上を持っている案件を台帳から外せてしまいます**。
 */
export const PURGE_HAS_MONEY_SQL = `(
  EXISTS (SELECT 1 FROM revenues r  WHERE r.project_id  = p.id AND r.deleted_at  IS NULL)
  OR EXISTS (SELECT 1 FROM purchases pu WHERE pu.project_id = p.id AND pu.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM revenue_allocations ra
              JOIN revenues r2 ON r2.id = ra.revenue_id AND r2.deleted_at IS NULL
             WHERE ra.project_id = p.id)
  OR EXISTS (SELECT 1 FROM purchase_allocations pa
              JOIN purchases p2 ON p2.id = pa.purchase_id AND p2.deleted_at IS NULL
             WHERE pa.project_id = p.id)
)`;

/**
 * ゴミの定義（失注すべて ＋ 放置ネタ）。**数えるときと消すときで必ず同じものを使う**
 *
 * ⚠️ **放置ネタには「生存証拠」の除外を必ず入れる**（`ALIVE_EVIDENCE_SQL`）。
 * 自動見送り（`autoLoseStaleNeta`）は**同じ除外をしています**。ここだけ抜けると、
 * **機械が閉じにも来ない案件を、台帳からは消す**という食い違いが起きます。
 * 具体的には次のどれかに当たるネタです:
 *   - **未来の日付までスヌーズしてある**（意図して寝かせている）
 *   - 期限が今日以降の**次の一手**が入っている
 *   - 期日が今日以降の**未完了のタスク**がある
 *   - **本番日（`event_start`）が今日以降**
 * どれも「動いていないだけで生きている」印です。`updated_at` は
 * 100 日前のスヌーズ設定で古いままになり得るので、日数だけでは弾けません。
 *
 * 失注（`e_lost`）側には掛けません — すでに閉じた案件に生存証拠が残っていても、
 * それは片づけ忘れであって「生きている」ことではないためです。
 */
export const PURGE_JUNK_STAGE_SQL = `(
  p.stage = 'e_lost'
  OR (
    p.stage = 'neta'
    AND ${LAST_MOVE_SQL} < NOW() - INTERVAL '${PURGE_STALE_NETA_DAYS} days'
    AND NOT ${ALIVE_EVIDENCE_SQL}
  )
)`;

/**
 * 台帳から外してよい案件。
 * ⚠️ **写さないこと。** 帯の件数とボタンの対象がずれると
 * 「10件と出ているのに押すと3件しか消えない」になる。
 */
export const PURGE_TARGET_SQL = `FROM projects p
   WHERE p.deleted_at IS NULL
     AND ${PURGE_JUNK_STAGE_SQL}
     AND NOT ${PURGE_HAS_MONEY_SQL}`;

/** お金があるので**残す**もの。画面に出す（消えていないことに人は気づけない） */
export const PURGE_KEPT_SQL = `FROM projects p
   WHERE p.deleted_at IS NULL
     AND ${PURGE_JUNK_STAGE_SQL}
     AND ${PURGE_HAS_MONEY_SQL}`;

export interface PurgeCount {
  /** 台帳から外せる件数 */
  total: number;
  /** うち失注 */
  lost: number;
  /** うち放置ネタ */
  staleNeta: number;
  /** 売上・仕入が付いているので残す件数 */
  keptForMoney: number;
  /** 放置と見なす日数（画面に出す。数字を画面に直書きしない） */
  staleDays: number;
}

async function count(sql: string, extra = ''): Promise<number> {
  const row = await queryOne(`SELECT COUNT(*)::int AS c ${sql} ${extra}`) as { c?: number } | null;
  return Number(row?.c ?? 0);
}

export async function countJunkProjects(): Promise<PurgeCount> {
  const [total, lost, staleNeta, keptForMoney] = await Promise.all([
    count(PURGE_TARGET_SQL),
    count(PURGE_TARGET_SQL, `AND p.stage = 'e_lost'`),
    count(PURGE_TARGET_SQL, `AND p.stage = 'neta'`),
    count(PURGE_KEPT_SQL),
  ]);
  return { total, lost, staleNeta, keptForMoney, staleDays: PURGE_STALE_NETA_DAYS };
}

export interface PurgeResult {
  /** 本当に台帳から外した件数 */
  processed: number;
  /** まだ残っている件数 */
  remaining: number;
  /** ⚠️ 外したが **BOX のフォルダを片づけられなかった**件数（現役の場所に残る） */
  boxLeft: number;
  /** 時間切れで切り上げたか（続けて呼べば進む） */
  timedOut: boolean;
}

interface PurgeRow {
  id: string; stage: string;
  box_url_internal: string | null; box_url_external: string | null;
  box_cleanup_state: string | null;
}

/**
 * **ゴミ案件をまとめて台帳から外す。**
 *
 * ⚠️ **BOX を先に片づけてから外します。** 外したあとでは
 * `deleted_at IS NULL` の条件から落ちて、そのフォルダは二度と片づけの対象に
 * なりません（現役の場所に残ったまま、指すものが誰にも見えなくなる）。
 *
 * ⚠️ **BOX が片づかなくても外します。** BOX の安全弁は「迷ったら触らない」ので、
 * 片づくのを待つと**台帳がいつまでも片づきません**。代わりに**片づけられなかった
 * 件数を必ず返し**、画面に出します（黙って置き去りにしない）。
 */
export async function purgeJunkProjects(limit: number, userId: string): Promise<PurgeResult> {
  const rows = await queryAll(
    `SELECT p.id, p.stage, p.box_url_internal, p.box_url_external, p.box_cleanup_state
     ${PURGE_TARGET_SQL} ORDER BY ${LAST_MOVE_SQL} ASC LIMIT ?`,
    [limit],
  ) as unknown as PurgeRow[];

  const started = Date.now();
  let processed = 0;
  let boxLeft = 0;
  let timedOut = false;

  for (const r of rows) {
    if (Date.now() - started > PURGE_BUDGET_MS) { timedOut = true; break; }

    const hadFolder = !r.box_cleanup_state && !!(r.box_url_internal || r.box_url_external);
    if (hadFolder) {
      // 失敗しても外すのは止めない（`...Safe` は投げない）
      await syncBoxFoldersForStageSafe(r.id, 'e_lost');
      const after = await queryOne(
        'SELECT box_cleanup_state FROM projects WHERE id = ?', [r.id],
      ) as { box_cleanup_state: string | null } | null;
      if (!after?.box_cleanup_state) boxLeft += 1;
    }

    await execute(
      'UPDATE projects SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [userId, r.id],
    );
    processed += 1;
  }

  return { processed, remaining: await count(PURGE_TARGET_SQL), boxLeft, timedOut };
}
