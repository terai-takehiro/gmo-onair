import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type TxClient } from '../../../shared/db/connection';
import { generateSequenceNumber, generateGlsNumber, peekNextGlsNumber, type GlsCategory } from '../../../shared/services/sequence.service';
import { AppError } from '../../../shared/middleware/errorHandler';
import { normalizeJaText } from '../../../shared/utils/text';
import {
  createProjectFolderTree,
  renameProjectFolderPair,
  type CustomerType,
} from './box-folder.service';
import { extractFolderId } from '../../../shared/services/box';
import { config } from '../../../config';
import { taxBillingSuffix } from '../../../shared/services/tax-category.service';
import { recordProjectCorrections, recordIntakeDecision, recordProjectAccepted } from './project-ai-feedback.service';
import { classificationOf, projectTypeOf, resolveClassification } from './project-classification';
import { assertCustomerCompanyId } from '../../../shared/services/company-directory.service';
import { buildIntegrityCountSql, findCheck, INTEGRITY_CHECKS } from './project-integrity';
import { syncProjectEventDates } from '../../production/services/project-event-dates.service';
import {
  JAPANESE_SORT_KEYS, japaneseCollationAvailable, withJapaneseCollation,
} from './japanese-sort';
/**
 * 健全性（stalled / overdue / snoozed / ok）・停滞しきい値・「最後の動き」の定義は
 * **project-health.ts の1か所だけ**が持つ（docs/core-redesign-plan.md §3-7）。
 * ここに式を書き写すと、一覧・並び順・ダッシュボードが黙ってずれる。
 */
import { healthSql, stalledDaysSql, HEALTH_FILTERS } from './project-health';
import { jstDate } from '../../../shared/utils/jst';
/**
 * 終了ステージに入ったら次回アクションを閉じ、戻ったら開き直す（migration 245）。
 * **ステージ変更の集約点（`recordStageTransition`）から呼ぶ** — 経路ごとに書くと、
 * 新しい経路が増えるたびにゴミの出どころが1つ増える。
 */
import { syncNextActionsForStageSafe } from '../../../shared/services/next-action-state';
/**
 * **失注・見送りの BOX フォルダの片づけも同じ集約点から呼ぶ**（migration 248）。
 * 中身が1つも無ければ削除・あれば `99_失注・見送り` へ引っ越す。失注から戻せば元へ返る。
 * 失敗してもステージ変更は止めない（`...Safe`）。
 */
import {
  syncBoxFoldersForStageSafe, relinkProjectFolders, summarizeSkipReasons, cleanupOrphanFolders,
  type RelinkResult, type SkipReason, type OrphanResult,
} from './box-lost-cleanup.service';
import { isBoxConfigured } from '../../../shared/services/box';

/**
 * **片づけの対象にするゴミ案件。**
 *
 * ⚠️ **台帳から外した（`deleted_at` を入れた）案件も対象に残すこと。**
 * ユーザー報告（2026-08-31）「BOX の削除コマンドが表示されなくなりました。
 * おそらく台帳から削除したからかと思います」— そのとおりでした。
 *
 * 以前はここが `deleted_at IS NULL` で絞っていたため、**台帳から外した瞬間に
 * その案件の BOX フォルダは候補から落ち、以後どの導線からも片づけられません**
 * でした（現役の場所に残ったまま、指すものが誰にも見えなくなる）。
 * #495 の棚卸しに ❌ で書いておきながら塞いでいなかった穴です。
 *
 * ⚠️ **「普通に削除された案件」まで巻き込まない。** 対象は
 *   - 失注（`e_lost`）… 台帳にあってもなくても片づける
 *   - 台帳から外したネタ（`neta` かつ `deleted_at` あり）… まとめて外したぶん
 * の2つだけ。**現役のネタ**や、人が別の理由で消した受注済み案件は触りません
 * （間違えて消した案件の BOX フォルダまで動かすと、戻すときに困ります）。
 */
const LOST_BOX_JUNK_SQL = `stage IN ('e_lost', 'neta')`;

/**
 * 片づけ待ちの案件を選ぶ条件。**件数と対象で必ず同じものを使う**
 * （写すと「10件と出ているのに押すと3件しか進まない」が起きる）。
 */
const LOST_BOX_CLEANUP_TARGET_SQL = `FROM projects
   WHERE ${LOST_BOX_JUNK_SQL} AND box_cleanup_state IS NULL
     AND (box_url_internal IS NOT NULL OR box_url_external IS NOT NULL)`;

/**
 * **BOX の URL が1つも入っていない失注案件。**
 *
 * ⚠️ **これを数えないと帯が出ませんでした**（ユーザー報告「ほとんどのゴミ案件が
 * 処理できていない／そもそも件数が少ない」）。古い案件は URL が空なので上の条件に
 * 当たらず、**フォルダは BOX にあるのに片づけ待ち0件**に見えていました。
 * BOX を見て名前で結び付け直せば片づけられるので、**候補として数えます**。
 */
/**
 * **1リクエストで BOX を触ってよい時間**（ミリ秒）。
 *
 * ⚠️ **件数で区切ると本番で 504 になった。** フォルダ1件につき BOX を十数回
 * 叩くので、20 件で 200〜300 回になり Nginx の 60 秒に当たる。BOX の応答時間は
 * こちらでは決められないので、**件数ではなく時間**を上限にする。
 * 余裕をもって 20 秒（60 秒の3分の1）。残りは押し直せば続きから進む。
 */
const BOX_CLEANUP_BUDGET_MS = 20_000;

const LOST_BOX_UNLINKED_SQL = `FROM projects
   WHERE ${LOST_BOX_JUNK_SQL} AND box_cleanup_state IS NULL
     AND box_url_internal IS NULL AND box_url_external IS NULL`;

/**
 * 引き合いの入口と確信 (migration 165)。**DB の CHECK と同じ集合**にすること。
 * 知らない値をそのまま渡すと CHECK に弾かれ、案件の登録ごと 500 になる。
 * `group`（グループ案件）は migration 182 で足した — お客様がグループ会社のとき
 * 画面が固定表示にし、この値で保存する。
 * `inview`（内覧会）は migration 183。**`web` は問い合わせフォーム**で、
 * 画面のラベルは「WEBフォーム」（値は変えていない）。
 */
const INTAKE_CHANNELS = ['mail', 'phone', 'inview', 'referral', 'web', 'meeting', 'group', 'other'];
const INTAKE_CONFIDENCES = ['high', 'mid', 'low'];

/** 案件登録時に渡された値を 'A' | 'B' に正規化。不正値は null を返す */
function normalizeGlsCategory(value: unknown): GlsCategory | null {
  return value === 'A' || value === 'B' ? value : null;
}

/**
 * 案件のメモを**やり取りの1件**として書く (migration 184)。
 *
 * `projects.notes` の列は無くなりましたが、**引数としては受け取り続けます** —
 * MCP の `create_project` / `update_project` を本番のメール取込スキルが
 * 毎日叩いており、引数を消すと呼び出しごと落ちるためです
 * (`.claude/skills/ai-feedback-loop/references/onair-current-state.md` の
 * 「既存の呼び出しを壊さない」)。
 *
 * `skipIfSame` は更新のときだけ true にします。同じ本文で保存し直すたびに
 * メモが積み上がると、やり取りがメモで埋まって読めなくなります。
 */
export async function addMemoActivity(
  projectId: string,
  customerId: string | null,
  notes: unknown,
  userId: string,
  skipIfSame = false,
): Promise<void> {
  const body = typeof notes === 'string' ? notes.trim() : '';
  if (!body) return;
  if (skipIfSame) {
    const dup = await queryOne(
      `SELECT id FROM activity_logs
        WHERE project_id = ? AND activity_type = 'memo' AND btrim(description) = ? AND deleted_at IS NULL
        LIMIT 1`,
      [projectId, body],
    );
    if (dup) return;
  }
  // 日付は**サーバーの今日**（JST）。メモは日付を持たないので、書かれた日に寄せる
  const today = await queryOne(`SELECT to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS d`) as { d: string };
  await execute(
    `INSERT INTO activity_logs
       (id, project_id, customer_id, user_id, activity_type, subject, description, activity_date, created_by, updated_by)
     VALUES (?, ?, ?, ?, 'memo', 'メモ', ?, ?, ?, ?)`,
    [uuidv4(), projectId, customerId || null, userId, body, today.d, userId, userId],
  );
}

/**
 * BOX フォルダ名のフォーマット: `{idCode}_{案件名}`
 * idCode は GLS 発番済みなら gls_number、未発番なら code (OPP コード)
 */
function buildProjectFolderName(project: { gls_number?: string | null; code: string; name: string }): string {
  const idCode = project.gls_number || project.code;
  return `${idCode}_${project.name}`;
}

/**
 * customer_type を 'internal' | 'external' に正規化 (不正値は 'external' フォールバック)
 */
function normalizeCustomerType(value: unknown): CustomerType {
  return value === 'internal' ? 'internal' : 'external';
}

/**
 * グループ内 / グループ外を**お客様から決める**（migration 192・ご指示）
 *
 * ── 人は案件ごとに選びません ────────────────────────────────
 *
 * 見積の単価（定価 / グループ内価格）はこの値で決まるのに、選び忘れても
 * **画面には何も出ません** — グループ会社の案件に定価が並んでも、気づくのは
 * 見積を送ったあとです。決めるのは**取引先マスターのチェックボックス1か所**に
 * して、案件は保存のたびにそこから引き直します。
 *
 * ── それでも列に持つ理由 ────────────────────────────────────
 *
 * 毎回 `customers` を見に行けば列は要りませんが、**あとから「グループ内の案件が
 * 何件あったか」を数えるとき、取引先マスターの「いまの」印で数えることになり、
 * 案件を取った当時の姿と食い違います**（リード経路の `group` と同じ理由）。
 *
 * ── お客様が分からないときは今の値を保つ ─────────────────────
 *
 * 古い行は `customer_id` が空のことがあります。**どちらとも言えないものを
 * 機械で決めると、決めたことに誰も気づけません**。
 */
async function resolveCustomerType(
  customerId: unknown,
  fallback: unknown,
): Promise<CustomerType> {
  if (typeof customerId !== 'string' || !customerId) return normalizeCustomerType(fallback);
  const row = await queryOne(
    'SELECT is_gmo_group FROM companies WHERE id = ? AND deleted_at IS NULL',
    [customerId],
  ) as { is_gmo_group?: boolean } | null;
  if (!row) return normalizeCustomerType(fallback);
  return row.is_gmo_group === true ? 'internal' : 'external';
}

/**
 * お客様がグループ会社か。**プロジェクト管理（GPM）もこれを呼びます** —
 * 書き写すと、グループの決め方を次に変えた日にどちらかが取り残されます
 * （`addMemoActivity` を共用しているのと同じ理由）。
 */
export async function customerIsGroup(customerId: unknown): Promise<boolean> {
  return (await resolveCustomerType(customerId, 'external')) === 'internal';
}

export interface ProjectFilter {
  search?: string;
  /**
   * ステージ。**カンマ区切りで複数渡せる** (`s_completed,e_lost` = 終了)。
   * v4 の案件一覧はチップで A〜E と「終了」を切り替えるので、
   * 「終了」だけが2つのステージにまたがる。
   */
  stage?: string;
  assignedTo?: string;
  tab?: 'all' | 'yomi' | 'active' | 'completed' | 'lost';
  /**
   * 案件分類。`'A'` = 案件（スタジオ）／ `'B'` = プロジェクト。
   * **発番済かどうかは含まない**（それは `issued`）。
   */
  glsCategory?: 'A' | 'B';
  /** GLS 発番済みのものだけ（確定案件の一覧が使う） */
  issued?: boolean;
  /** 'kessan' = 決算インポートで取り込んだ案件 (notes が [kessan:...] で始まる) のみ */
  source?: 'kessan';
  /** 決算インポートのマーカー (例 '2026-01' / '2025-08〜2026-01') で絞り込み */
  kessanMarker?: string;
  /** AI (MCP) が起票した案件のみ (created_by = mcpActorId) */
  aiCreated?: boolean;
  /** AI 起票案件の確認状態フィルタ ('reviewed'=確認済 / 'unreviewed'=未確認) */
  aiReviewed?: 'reviewed' | 'unreviewed';
  /**
   * 整合性チェックの鍵（案件台帳）。`INTEGRITY_CHECKS` の `key`。
   *
   * **数えるのと同じ式で絞ります**（`project-integrity.ts`）。別に書くと
   * 「12 件」と出したのに開くと 9 行、という食い違いが起き、
   * **どちらが本当か画面からは分かりません**。
   * **知らない鍵は素通ししません** — 絞ったつもりで全件が返ると気づけないため。
   */
  issue?: string;
  /** 開催月 (YYYY-MM)。イベント期間がこの月に重なる案件のみ */
  eventMonth?: string;
  /** 開催期間レンジ (YYYY-MM-DD)。イベント期間がこのレンジに重なる案件のみ */
  eventFrom?: string;
  eventTo?: string;
  /**
   * 健全性で絞る（'stalled' 停滞 / 'overdue' 期限超過 / 'snoozed' スヌーズ中）。
   * 定義は `project-health.ts`。知らない値は素通しさせない（ステージと同じ守り方）。
   */
  health?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/** 一括更新で変更可能なフィールド (申し込み情報等のパラメータ) */
const STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'];

const SORT_COLUMN_MAP: Record<string, string> = {
  code: 'p.gls_number',
  name: 'p.name',
  customer: 'c.name',
  stage: 'p.stage',
  project_type: 'p.project_type',
  expected_amount: 'p.expected_amount',
  event_start: 'p.event_start',
  assigned_to: 'u.name',
  created_at: 'p.created_at',
  // 「見積金額が大きい順」。SELECT 句で組み立てた別名をそのまま使う
  // (`last_move` と同じ理由 — 式を書き写すと並び順と表示が食い違う)
  estimate_amount: 'estimate_amount',
  // 「期限が近い順」= **次のタスクの期限**（返事の期限という概念は列ごと廃止済み）
  next_task_due: 'nt.due_date',
  // 「最後の動き」順。SELECT 句で組み立てた別名をそのまま並べ替えに使う
  // (PostgreSQL は ORDER BY に SELECT の別名を書ける)。**式を書き写さないこと** —
  // 写すと片方だけ直したときに「並び順と表示が食い違う」になる
  last_move: 'last_activity_at',
};

/**
 * v2.9.54+ デフォルトソート式
 * - 提案中 (B口頭 → C提案 → D保留) → 受注済 (S完了 → A受注) → その他 (ネタ → E失注)
 * - v2.9.175+: その他グループ内をネタ → 失注の順に変更 (従来は失注 → ネタ)
 * - 同グループ内はイベント開始日が近い順 (ASC、NULL は最後) → 作成日新しい順
 */
const DEFAULT_SORT_SQL = `
  CASE p.stage
    WHEN 'neta'        THEN 1
    WHEN 'b_verbal'    THEN 2
    WHEN 'c_proposal'  THEN 3
    WHEN 'd_hold'      THEN 4
    WHEN 's_completed' THEN 5
    WHEN 'a_won'       THEN 6
    WHEN 'e_lost'      THEN 7
    ELSE 8
  END ASC,
  p.event_start ASC NULLS LAST,
  p.created_at DESC
`;

/**
 * 「おすすめ順」(v4 案件一覧の既定)。**止まっているものを上げ、次に期限が近い順**。
 *
 * ── なぜ `default` を作り直さず別の鍵にしたか ────────────────
 *
 * `default` は MCP の `list_projects`・Excel の書き出し・確定案件の一覧など、
 * **案件一覧以外からも既定として使われています**。定義を差し替えると、
 * 何も指定していない呼び出し全部の並びが黙って変わります。
 * 一覧の「おすすめ順」は `sort_by=recommended` として別に持ちます。
 *
 * ── 何を「止まっている」と見なすか ──────────────────────────
 *
 * **健全性の単一定義（`project-health.ts`）の 'stalled'** です。以前はここに
 * 「7日」を直書きしていて、バッジ側と別々にずれる形でした。いまはステージ別
 * しきい値・生存証拠・スヌーズをすべて通した「停滞」だけを先頭に上げます
 * （並びの意味は同じ: 止まっているものが先、次に期限が近い順）。
 * 「最後の動き」は一覧が lateral（`mv`）で既に持っているのでそれを渡し、
 * 同じ副問い合わせを二度走らせません。
 */
const RECOMMENDED_SORT_SQL = `
  CASE WHEN (${healthSql('GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at))')}) = 'stalled'
       THEN 0 ELSE 1 END ASC,
  nt.due_date ASC NULLS LAST,
  p.event_start ASC NULLS LAST,
  p.created_at DESC
`;

/**
 * 「次のタスク」— v4 の案件一覧の列 (docs/design/v4/projects.md ③)。
 *
 * **未完了のうち期限がいちばん近い1件**だけを返す。
 * 期限が無いタスクは最後 (`NULLS LAST`) — 期限が付いているほうが先に効くため。
 * 同じ期限なら板の並び順 → 作成順で、画面のかんばんと同じ順になる。
 *
 * 期限は `my-tasks.service.ts` と**同じ式**で採る
 * (`due_at` があればそれ、無ければ `due_date` の 18:00)。
 * ここだけ別の式にすると、同じタスクが「やること」画面と案件一覧で違う順に並ぶ。
 *
 * `due_date::text` にしているのは、`pg` が DATE を JS の Date にしてしまい、
 * JSON にすると UTC に寄って**日付が1日ずれる**ため
 * (`project-tasks.service.ts` も同じ理由で `::text` にしてある)。
 *
 * `assigned_to`（案件の主担当）ではなく**タスクの担当者**を出す。
 * 主担当は責任の所在・集計の軸であり、**実務の割り当てはタスク単位**
 * (client/CLAUDE.md「v4 の設計判断」)。
 */
const NEXT_TASK_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT t.title,
           COALESCE(t.due_date::text, to_char(t.due_at, 'YYYY-MM-DD')) AS due_date,
           tu.name AS assignee_name
    FROM project_tasks t
    LEFT JOIN users tu ON tu.id = t.assigned_to
    WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.is_completed = false
    ORDER BY COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp) ASC NULLS LAST,
             t.sort_order ASC, t.created_at ASC
    LIMIT 1
  ) nt ON TRUE
`;

/**
 * 「最後の動き」— 同じく v4 の案件一覧の列。
 *
 * **`projects.updated_at` だけでは足りない。** この列を見る目的は
 * 「放っておかれていないか」で、案件の行を書き換えなくても
 * タスクを動かしたり活動を記録したりすれば「動いている」。
 * 案件そのもの・タスク・活動記録の**いちばん新しい時刻**を採る。
 *
 * 見積・請求は入れていない (`revenues` は締め処理で一斉に更新されるので、
 * 誰も触っていない案件まで「たった今」になる)。
 */
/**
 * いちばん新しいメモ (migration 184 でメモをやり取りに畳んだ)。
 *
 * ネタの一覧が「案件名 ＋ メモの1行目」を要点として出しているので、
 * **列が無くなったぶんをここで引き直します**。無いと、ネタの段で
 * 何の引き合いだったのかが案件名だけになります。
 */
export const MEMO_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT a.description FROM activity_logs a
      WHERE a.project_id = p.id AND a.activity_type = 'memo' AND a.deleted_at IS NULL
      ORDER BY a.activity_date DESC, a.created_at DESC
      LIMIT 1
  ) memo ON TRUE
`;

const LAST_MOVE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT MAX(x.at) AS last_at FROM (
      SELECT MAX(t.updated_at) AS at FROM project_tasks t
        WHERE t.project_id = p.id AND t.deleted_at IS NULL
      UNION ALL
      SELECT MAX(a.updated_at) AS at FROM activity_logs a
        WHERE a.project_id = p.id AND a.deleted_at IS NULL
    ) x
  ) mv ON TRUE
`;

/**
 * 「見積金額」— v4 の案件一覧の列（列名も「見積金額」）。
 *
 * ── どの版を出すか ──────────────────────────────────────────
 *
 * 見積は**版ごとに1行**で、同じ見積の版どうしは `group_id` で束ねます
 * (migration 138)。ここで出したいのは「いまお客様に出ている金額」なので、
 * **旧版 (`superseded`) と失注 (`rejected`) を外し、いちばん新しい版**を採ります。
 *
 * ── なぜ合計を1本にしないのか ──────────────────────────────
 *
 * 1つの案件に**別々の見積が複数ぶら下がることがあります**（本体と追加分など）。
 * 束ごとに最新版を採ってから足すので、**同じ見積の v1 と v2 が二重に入りません**。
 * `group_id` を無視して SUM すると、版を重ねた案件ほど金額が膨らみます。
 *
 * 金額は `subtotal - discount`（値引きは単価を下げず別建て・`_rules.md`）。
 * **税は乗せません** — 一覧の他の金額（想定金額・確定売上）が税抜なので、
 * ここだけ税込にすると同じ列で単位が変わります。
 */
export const ESTIMATE_AMOUNT_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT SUM(latest.amount)::bigint AS amount FROM (
      SELECT DISTINCT ON (e.group_id) (e.subtotal - e.discount) AS amount
      FROM estimates e
      WHERE e.project_id = p.id
        AND e.deleted_at IS NULL
        AND e.status NOT IN ('superseded', 'rejected')
      ORDER BY e.group_id, e.version DESC
    ) latest
  ) est ON TRUE
`;

/**
 * 確定売上・仕入。**直接の行 ＋ グループ按分**（レビューでの指摘 #127）。
 *
 * ⚠️ **`group_id IS NULL` だけを足さないこと。** 分け合う請求（グループ請求）では
 * `revenues.project_id` が**代表の1件**しか指さず、その案件の取り分は
 * `revenue_allocations` に入ります。直接の行だけ足すと、
 * **代表以外の案件は「売上 0 円」**、代表は**満額**に見えます。
 *
 * 前の版は案件台帳の「確定売上」「仕入」の列がこれで、
 * **分け合う請求の案件だけ黙って少なく出て**いました（`—` に見えることもある）。
 * しかも**それらしい数字**なので、台帳と突き合わせるまで気づけません。
 *
 * ⚠️ **数え方は `getSummary` に合わせてあります**（案件詳細が出す粗利と同じ）。
 * 別々に書くと、**同じ案件が一覧と詳細で違う金額**になります。
 * ⚠️ **按分の側に `status = 'confirmed'` が掛かっていないのは `getSummary` と同じ**です。
 * ここだけ揃えると詳細と食い違うので**この回では変えていません**（別に見るべき論点）。
 */
export const TOTAL_REVENUE_SQL = `(
  COALESCE((SELECT SUM(r.amount) FROM revenues r
             WHERE r.project_id = p.id AND r.status = 'confirmed'
               AND r.deleted_at IS NULL AND r.group_id IS NULL), 0)
+ COALESCE((SELECT SUM(ra.allocated_amount) FROM revenue_allocations ra
             JOIN revenues ar ON ar.id = ra.revenue_id AND ar.deleted_at IS NULL
             WHERE ra.project_id = p.id), 0)
)`;

export const TOTAL_PURCHASE_SQL = `(
  COALESCE((SELECT SUM(pu.amount) FROM purchases pu
             WHERE pu.project_id = p.id AND pu.deleted_at IS NULL AND pu.group_id IS NULL), 0)
+ COALESCE((SELECT SUM(pa.allocated_amount) FROM purchase_allocations pa
             JOIN purchases ap ON ap.id = pa.purchase_id AND ap.deleted_at IS NULL
             WHERE pa.project_id = p.id), 0)
)`;

/**
 * **ステージが変わったときの「履歴・受注日時・失注日時」を1か所に集める**共有関数
 * (docs/project-ledger-phase-c-design.md テーマ2)。
 *
 * `projects.stage` を動かす経路は案件の `changeStage()` 以外にも複数あり
 * (GPM の `update()`・自動整理ジョブ等)、これまでは経路ごとに履歴 INSERT・
 * `won_at`/`lost_at` の書き方がバラバラで、**GPM 経由の見送りは `lost_at` を
 * 一度も書いていなかった**（失注理由分析は GLS-A/B 両方を読むため、GPM の見送りは
 * 永久に `lost_at IS NULL` のまま `updated_at` に付け替えられて集計されていた）。
 * 書き口をここへ集約することで、新しい経路を足すたびに3点セットを書き忘れる
 * 心配が無くなる。
 *
 * **ここが担当するのは3点だけ**（`stage` 列そのものの UPDATE・GLS 発番・
 * AI 確認印などは呼び出し元の責務のまま — `changeStage()` を参照）:
 *   ・`e_lost` へ: `lost_reason` / `lost_reason_note` / `lost_at=NOW()`
 *   ・`a_won` へ: `won_at` を**初回だけ**書く（`COALESCE(won_at, NOW())`）
 *   ・ステージが実際に変わったときだけ `project_stage_changes` に1行残す
 *     （同じステージへの押し直しを「今日また受注した」と数えない）
 */
export async function recordStageTransition(
  id: string,
  fromStage: string | null | undefined,
  toStage: string,
  userId: string,
  lostFields?: { lost_reason?: unknown; lost_reason_note?: unknown },
): Promise<void> {
  if (toStage === 'e_lost') {
    await execute(
      `UPDATE projects SET lost_reason=?, lost_reason_note=?, lost_at=NOW() WHERE id=?`,
      [lostFields?.lost_reason ?? null, lostFields?.lost_reason_note ?? null, id],
    );
  } else if (toStage === 'a_won') {
    // 一度受注した案件を戻してまた受注にしたときは**最初の受注日を保つ**
    // (`won_at IS NULL` のときだけ入れる)。受注した月が後ろにずれると
    // 「今月の受注」が二重に立つ
    await execute(
      `UPDATE projects SET won_at=COALESCE(won_at, NOW()) WHERE id=?`,
      [id],
    );
  }
  // **同じステージへの押し直しは記録しない。** 記録すると
  // 「1日に3回 受注になった」ことになり、今月の受注が水増しされる。
  if (fromStage !== toStage) {
    await execute(
      `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), id, fromStage ?? null, toStage, userId],
    );
  }

  /*
   * **終わった案件の「次回アクション」は機械が閉じる**（migration 245）。
   *
   * ユーザー報告:「失注になった案件については無条件で完了扱いにして
   * リストから落として欲しい」「これらがゴミとして溜まりまくっている」。
   * 終了系（`e_lost` / `s_completed`）から**戻したときは開き直す**ので可逆で、
   * **人が自分で「完了」を押したものには触らない**（`syncNextActionsForStage`）。
   *
   * ⚠️ ここを通らない機械の経路（`project-health.ts` の自動見送り・繰り上げ完了）
   * からも同じ関数を呼ぶこと。片方だけだとゴミが残りつづける。
   *
   * **失敗しても呼び出し元のステージ変更は止めない**（`...Safe`）— やることが
   * 少し残るより、**失注にできないほうが業務は確実に止まる**。
   */
  await syncNextActionsForStageSafe(id, toStage);

  /*
   * ── 失注・見送りになった案件の BOX フォルダを現役の場所から片づける ──
   *
   * ⚠️ **無条件には消しません。** 見積書・請求書・検収書の原本は BOX にしか
   * 無いので、**中身が1つでもあれば `99_失注・見送り` へ引っ越すだけ**にし、
   * 空のものだけ本当に消します（詳しい理由は `box-lost-cleanup.service.ts` の頭注）。
   * ここも `...Safe` — BOX が詰まった日に失注にできなくなるほうが困ります。
   */
  await syncBoxFoldersForStageSafe(id, toStage);
}

/**
 * `create()` に渡せる内部向けオプション（テーマ4 PR1・docs/project-ledger-phase-c-design.md）。
 *
 * **画面 / MCP はどのフィールドも渡さない。** 渡さなければ今までの `create()` と
 * 完全に同じ挙動になる（安全弁も採番も従来どおり）。ここに載っているのは
 * Excel取込・決算取込のような**バッチ経路専用**の抜け道で、通常の登録画面が
 * 誤って渡すと安全弁が効かなくなる。
 */
export interface CreateProjectOptions {
  /** 呼び出し元が既に開いているトランザクションに参加する。省略時は create() 自身が withTransaction を開く */
  tx?: TxClient;
  /**
   * true なら終了系ステージ（受注/完了/失注）への直接作成を禁じる安全弁を外す。既定 false。
   * 決算取込（`a_won` 直書きが前提）・Excel取込（過去データ移行で `s_completed`/`e_lost`
   * 直接指定が仕様）専用 — 画面 / MCP からは絶対に渡さない
   */
  allowTerminalStage?: boolean;
  /** 指定があれば `generateSequenceNumber` を呼ばずこの値を code に使う（Excel/決算の移行用） */
  externalCode?: string;
  /** 指定があれば `gls_number` に直接書く（Excel/決算の旧番号移行用） */
  externalGlsNumber?: string;
  /** true なら BOX フォルダ自動作成をスキップする（バッチ取込のたびに数十〜数百フォルダが自動生成されるのを防ぐ） */
  skipBoxFolder?: boolean;
}

/**
 * `create()` の本体（テーマ4 PR1・docs/project-ledger-phase-c-design.md）。
 * 顧客確認・採番・分類導出・本体INSERT・最初のステージ履歴・最初のタスク・
 * 仮スケジュールを、渡された1つの `tx` の中で行う。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * 旧 `create()` は `execute`/`queryOne` がプール直結で、Excel取込・決算取込のような
 * 「複数行・複数テーブルにまたがる1つの BEGIN...COMMIT」に単純には挟み込めなかった。
 * `tx` を明示的に受け取る形にして、**呼び出し元の外側のトランザクションに参加できる**
 * ようにする（`create()` 自身が呼ぶときは自分で `withTransaction` を開いて渡す）。
 *
 * ── ここに入れていないもの ──────────────────────────────────
 *
 * **メモ (`addMemoActivity`) と BOX フォルダ作成はここに入れない**（トランザクションの
 * 外・公開 `create()` 側の責務）。BOX 作成は外部 API 呼び出しで、トランザクションの中に
 * 入れると DB のロックを抱えたまま待つことになるうえ、失敗してもロールバックしたくない
 * （案件自体は残したい）。`gpm.service.ts` の `create()` と同じ判断。
 * `idempotency_key` の二重押下ガード（事前チェック・一意索引違反時の復旧）も、
 * 同じ理由で呼び出し元（公開 `create()`）側に残す — Postgres は明示トランザクション内で
 * 一意索引違反が起きるとその取引全体が abort 状態になり、同じ `tx` で後続の
 * クエリを打てなくなるため（取引の外・新しい接続でなら安全に確かめ直せる）。
 *
 * `{ id }` だけを返す — 呼び出し元（`create()`）が全体の姿を必要とするときは
 * トランザクションの外で `getById(id)` を呼ぶ。
 */
export async function createCore(
  tx: TxClient,
  data: Record<string, unknown>,
  userId: string,
  opts: CreateProjectOptions = {},
): Promise<{ id: string }> {
  const { name: rawName, customer_id, expected_amount, assigned_to, project_type, customer_type,
          box_url_internal, box_url_external, application_form,
          event_start, event_end, dates, gls_category,
          intake_channel, intake_confidence,
          broadcast_type, media_platform,
          // 登録モーダルの16項目のうち、列を足したぶん (migration 170)
          contact_name, recurrence, attendee_count, goal,
          audience, project_category,
          stage, first_task } = data;
  if (!rawName || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件名と顧客は必須です');
  // **半角カナ等の表記ゆれを保存時に正規化。** Box の OCR / AI起票など外部由来の
  // テキストがそのまま案件名になり、請求一覧等で化けて見える不具合の対策（NFKC）
  const name = typeof rawName === 'string' ? normalizeJaText(rawName) : rawName;
  const glsCategory = normalizeGlsCategory(gls_category);
  if (!glsCategory) throw new AppError(400, 'VALIDATION_ERROR', '案件分類（スタジオ / ビジネス）を選択してください');
  // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
  // 「顧客ロールの会社か」を保証しない。直接 API / MCP から仕入先・販管費
  // 支払先の company_id を渡せてしまうのを防ぐ（レビュー指摘・PR #199 P2 の2巡目）
  await assertCustomerCompanyId(customer_id);

  const id = uuidv4();
  const code = opts.externalCode || await generateSequenceNumber('opp_code', 'OPP');
  // **グループ区分はお客様が決める**（migration 192）。渡された値は、お客様が
  // 見つからないときの控えとしてだけ使う（`resolveCustomerType` の理由）
  const cType = await resolveCustomerType(customer_id, customer_type);

  // dates 配列がある場合は MIN/MAX を event_start/event_end に同期
  let finalEventStart: string | null = (event_start as string) || null;
  let finalEventEnd: string | null = (event_end as string) || null;
  let datesToInsert: Array<{ date: string; label?: string | null }> = [];
  if (Array.isArray(dates)) {
    datesToInsert = (dates as Array<{ date: string; label?: string | null }>)
      .filter((d) => d && typeof d.date === 'string' && d.date.length > 0);
    if (datesToInsert.length > 0) {
      const sorted = [...datesToInsert].map((d) => d.date).sort();
      finalEventStart = sorted[0];
      finalEventEnd = sorted[sorted.length - 1];
    }
  }

  // 入口と確信 (migration 165)。**知らない値は入れない** — DB の CHECK が弾くので、
  // 弾かれると案件の登録そのものが 500 になる。ここで NULL に落とす
  const channel = INTAKE_CHANNELS.includes(intake_channel as string) ? intake_channel : null;
  const confidence = INTAKE_CONFIDENCES.includes(intake_confidence as string) ? intake_confidence : null;

  /**
   * **ステージを選べるようにした** (v4 の登録モーダル)。
   *
   * 「もう仮押さえまで進んでいる引き合いを登録する」が普通に起きるのに、
   * これまでは必ず `neta` から始めて、作ってから押し直すことになっていました。
   * **知らない値は `neta` に落とす** — 素通しさせるとどの一覧にも出ない案件ができます。
   *
   * **受注以降では作れません**（既定）。GLS 番号を採る流れ（確認ダイアログ付き）を
   * 飛ばしてしまうためです。作ってからステージを上げてもらいます。
   * `opts.allowTerminalStage` が true のときだけこの安全弁を外す —
   * 決算取込（`a_won` 直書きが前提）・Excel取込（過去データ移行で `s_completed`/`e_lost`
   * 直接指定が仕様）はこの安全弁と正面衝突するため（テーマ4）。
   */
  const initialStage = STAGES.includes(String(stage)) ? String(stage) : 'neta';
  const safeStage = (!opts.allowTerminalStage && ['a_won', 's_completed', 'e_lost'].includes(initialStage))
    ? 'neta' : initialStage;

  const recur = recurrence === 'regular' ? 'regular' : 'single';
  /**
   * **無観客の案件には来場人数を持たせない** (migration 182)。
   * 画面が欄を出さないので値は来ませんが、MCP や旧フォームから来ることがあります。
   * 入ってしまうと「無観客なのに 150 名」の行ができ、規模別の集計が狂います。
   */
  const rawScale = Number.isFinite(Number(attendee_count)) && Number(attendee_count) > 0
    ? Math.floor(Number(attendee_count)) : null;
  const scale = audience === 'no_audience' ? null : rawScale;

  /**
   * 客入れの有無 × 案件分類（migration 182）。**旧 `project_type` はここで導く。**
   * 画面から両方送らせると、片方だけ更新された行ができます
   * （`project-classification.ts` の冒頭）。
   */
  // **GLS-B は2段を持たない**（`project-classification.ts`）。作る画面は必ず
  // GLS-A だが、MCP の `create_project` は両方を受け取れるのでここでも渡す
  const cls = resolveClassification(audience, project_category, project_type, glsCategory);

  await tx.execute(
    `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, project_type, audience, project_category,
                           gls_category, expected_amount, assigned_to,
                           event_start, event_end, broadcast_type, media_platform,
                           customer_type, box_url_internal, box_url_external,
                           application_form, intake_channel, intake_confidence,
                           contact_name, recurrence, attendee_count, goal,
                           idempotency_key, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, code, opts.externalGlsNumber || null, name, customer_id, safeStage, cls.project_type, cls.audience, cls.project_category,
     glsCategory, expected_amount || 0, assigned_to || userId,
     finalEventStart, finalEventEnd, broadcast_type || null, media_platform || null,
     cType, box_url_internal || null, box_url_external || null,
     application_form ? 1 : 0, channel, confidence,
     contact_name || null, recur, scale, goal || null,
     (typeof data.idempotency_key === 'string' && data.idempotency_key.trim()) ? data.idempotency_key.trim() : null,
     userId]
  );

  // **最初のステージも履歴に残す** (migration 164)。
  // 1件目が無いと「ネタでいた期間」が測れず、停滞理由が「いつから」を言えない
  await tx.execute(
    `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
     VALUES (?, ?, NULL, ?, ?)`,
    [uuidv4(), id, safeStage, userId],
  );

  /**
   * 最初のタスク（登録モーダルの16項目め）。
   *
   * **入れなくても作れます。** 入れたときだけ1件作ります。
   * 期限は `docs/wording.md` の決めどおり**時刻まで**持ちます
   * （日付だけ渡されたら 18:00 を補い、補ったことは画面が出す）。
   */
  const task = first_task as { title?: string; assigned_to?: string; due_at?: string; due_date?: string } | undefined;
  if (task && typeof task.title === 'string' && task.title.trim()) {
    const dueAt = task.due_at || (task.due_date ? `${task.due_date}T18:00:00` : null);
    await tx.execute(
      `INSERT INTO project_tasks (id, project_id, title, assigned_to, due_at, is_completed, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, false, 1, ?)`,
      [uuidv4(), id, task.title.trim(), task.assigned_to || assigned_to || userId, dueAt, userId],
    );
  }

  // project_dates にINSERT
  for (let i = 0; i < datesToInsert.length; i++) {
    const d = datesToInsert[i];
    await tx.execute(
      `INSERT INTO project_dates (id, project_id, date, label, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), id, d.date, d.label || null, i + 1]
    );
  }

  return { id };
}

export class ProjectService {
  /**
   * 統合一覧: タブ（ヨミ/進行中/完了/失注）+ フィルタ
   */
  async list(filter: ProjectFilter, page: number, limit: number, offset: number) {
    let where = 'WHERE p.deleted_at IS NULL';
    const params: unknown[] = [];

    // タブフィルタ
    if (filter.tab === 'yomi') {
      where += ` AND p.gls_number IS NULL AND p.stage NOT IN ('e_lost')`;
    } else if (filter.tab === 'active') {
      where += ` AND p.gls_number IS NOT NULL AND p.stage NOT IN ('s_completed', 'e_lost')`;
    } else if (filter.tab === 'completed') {
      where += ` AND p.stage = 's_completed'`;
    } else if (filter.tab === 'lost') {
      where += ` AND p.stage = 'e_lost'`;
    }

    // 個別フィルタ
    if (filter.search) {
      where += ` AND (p.name ILIKE ? OR p.code ILIKE ? OR p.gls_number ILIKE ? OR c.name ILIKE ? OR c.short_name ILIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.assignedTo) {
      where += ` AND p.assigned_to = ?`;
      params.push(filter.assignedTo);
    }
    // 決算インポート分のみ。**印は `kessan_marker` の列が持つ**（migration 184）。
    // 以前は `notes` の先頭の `[kessan:2026-03]` という文字列を読んでいたが、
    // メモをやり取りへ畳んだので `notes` の列そのものが無い。
    // 列にしたことで、人が `[kessan:` で始まるメモを書いても誤判定しなくなった
    if (filter.source === 'kessan') {
      where += ` AND p.kessan_marker IS NOT NULL`;
    }
    if (filter.kessanMarker) {
      where += ` AND p.kessan_marker = ?`;
      params.push(filter.kessanMarker);
    }
    // AI (MCP) 起票フィルタ。判定は created_by=mcpActor (静的キー) OR mcp_audit_log 照合
    // (OAuth 経由は created_by が本人名義になるため、監査ログの created_id 一致でも検出する)
    if (filter.aiCreated) {
      where += ` AND (p.created_by = ? OR EXISTS (
        SELECT 1 FROM mcp_audit_log m
        WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id
      ))`;
      params.push(config.mcpActorId);
    }
    if (filter.aiReviewed === 'reviewed') {
      where += ` AND p.ai_reviewed_at IS NOT NULL`;
    } else if (filter.aiReviewed === 'unreviewed') {
      where += ` AND p.ai_reviewed_at IS NULL`;
    }
    /**
     * 整合性チェック（案件台帳）。**数えるのと同じ式**を使う
     * （`project-integrity.ts` の `sql`）。写すと件数と行数が食い違う。
     * **知らない鍵は当たらない条件に落とす** — 素通しすると
     * 「絞ったのに全件が返っている」ことに気づけない（ステージと同じ守り方）。
     */
    if (filter.issue) {
      const check = findCheck(filter.issue);
      where += check ? ` AND (${check.sql})` : ' AND FALSE';
    }
    /**
     * 案件分類。v2.8.113+ は `gls_category` カラム (DB) を真実とする
     * (発番済の旧データは migration 086 でバックフィル済)。
     *
     * **migration 179 から、この絞り込みは「発番済か」を含まない。**
     * 以前は `gls_number IS NOT NULL` を一緒に付けていた (確定案件ページ専用だったため) が、
     * 案件管理の一覧が **GLS-A だけを出す**ようになり、ヨミ段階の A も要るようになった。
     * 「発番済だけ」は `issued` で別に指定する — 1つの絞り込みに2つの意味を持たせると、
     * 片方が欲しいだけの画面が**もう片方も黙って掛けられる**。
     */
    if (filter.glsCategory === 'A' || filter.glsCategory === 'B') {
      where += ` AND p.gls_category = ?`;
      params.push(filter.glsCategory);
    }
    if (filter.issued) {
      where += ` AND p.gls_number IS NOT NULL`;
    }
    // 開催月 (YYYY-MM): イベント期間 [event_start, event_end] が対象月に重なる案件
    // event_start/event_end は TEXT (YYYY-MM-DD) なので文字列比較でレンジ判定する
    // ※ 検索キーワードが指定されているときは期間フィルタを適用しない —
    //   既定表示 (今月〜半年先) のまま過去案件を名前/GLS で検索しても
    //   ヒットせず「案件が消えた」ように見えていたため、検索は常に全期間から探す。
    if (!filter.search && filter.eventMonth && /^\d{4}-\d{2}$/.test(filter.eventMonth)) {
      const [y, m] = filter.eventMonth.split('-').map(Number);
      const monthStart = `${filter.eventMonth}-01`;
      const nextMonthStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      // 開催日が無い案件 (ビジネス系など studio 日程を持たない案件) は日付で絞れないため
      // 期間フィルタでも常に含める (従来は event_start IS NOT NULL で除外していたため、
      // 確定済みのビジネス案件が全体一覧から消えていた)。
      where += ` AND (p.event_start IS NULL OR NULLIF(p.event_start, '') IS NULL OR (p.event_start < ? AND COALESCE(NULLIF(p.event_end, ''), p.event_start) >= ?))`;
      params.push(nextMonthStart, monthStart);
    }
    // 開催期間レンジ (YYYY-MM-DD): イベント期間 [event_start, event_end] がレンジに重なる案件
    // (検索時は期間フィルタを適用しない — 上記と同じ理由)
    if (!filter.search && filter.eventFrom && filter.eventTo && /^\d{4}-\d{2}-\d{2}$/.test(filter.eventFrom) && /^\d{4}-\d{2}-\d{2}$/.test(filter.eventTo)) {
      // 開催日が無い案件は日付で絞れないため常に含める (上記と同じ理由)
      where += ` AND (p.event_start IS NULL OR NULLIF(p.event_start, '') IS NULL OR (p.event_start <= ? AND COALESCE(NULLIF(p.event_end, ''), p.event_start) >= ?))`;
      params.push(filter.eventTo, filter.eventFrom);
    }
    /*
     * 健全性で絞る（'stalled' / 'overdue' / 'snoozed'）。式は SELECT 句に出すものと
     * **同じ1つ**（`project-health.ts`）— 別に書くとバッジと絞り込みが食い違う。
     * ここは件数（total / stage_counts）の問い合わせにも使われるので、
     * lateral（mv）に頼らない素の式で書く。**知らない値は当たらない条件に落とす**
     * （素通しすると「絞ったのに全件」に気づけない — ステージと同じ守り方）。
     * ステージより前に足すので、チップの件数（stage_counts）とも両立する。
     */
    if (filter.health) {
      if ((HEALTH_FILTERS as readonly string[]).includes(filter.health)) {
        where += ` AND (${healthSql()}) = ?`;
        params.push(filter.health);
      } else {
        where += ' AND FALSE';
      }
    }

    /*
     * ステージだけは**最後に足す**。
     *
     * v4 の案件一覧はステージのチップに件数を出します
     * (「D 仮押さえ 0」と見えていれば押さずに済む)。その件数は
     * **ステージ以外の絞り込みを全部かけたうえで、ステージだけ外して**
     * 数えたものでなければ意味がありません
     * (検索語を入れているのに全件の内訳が出ると、押した先が 0 件になる)。
     * だから「ステージ抜きの where」を1つ取っておきます。
     */
    const whereWithoutStage = where;
    const paramsWithoutStage = [...params];
    // カンマ区切りで複数受ける (「終了」= s_completed + e_lost)。
    const asked = (filter.stage ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const stages = asked.filter((s) => STAGES.includes(s));
    if (asked.length > 0) {
      // **知らないステージ名は素通ししない。** 素通しすると絞り込みを指定したのに
      // 全件が返り、「絞り込みが効いていない」ことに気づけない
      // (`IN ()` は構文誤りになるので、当たらない条件を明示的に置く)
      where += stages.length > 0
        ? ` AND p.stage IN (${stages.map(() => '?').join(',')})`
        : ' AND FALSE';
      params.push(...stages);
    }

    // v2.8.1+: sortBy='default' (または未指定) のときは「完了/失注は最後 + イベント日近い順」
    let orderBy: string;
    if (!filter.sortBy || filter.sortBy === 'default') {
      orderBy = DEFAULT_SORT_SQL;
    } else if (filter.sortBy === 'recommended') {
      orderBy = RECOMMENDED_SORT_SQL;
    } else {
      const sortCol = SORT_COLUMN_MAP[filter.sortBy] || 'p.created_at';
      const sortDir = filter.sortDir === 'asc' ? 'ASC' : 'DESC';
      // **日付の列は NULL を最後に置く。** 「実施日が近い順」「期限が近い順」で
      // 未定のものが先頭に固まると、いちばん近いものが画面外に押し出される
      const nullsClause = filter.sortBy === 'event_start' || filter.sortBy === 'next_task_due'
        ? ` NULLS ${sortDir === 'ASC' ? 'LAST' : 'FIRST'}` : '';
      /**
       * **名前は五十音で並べる**（`japanese-sort.ts`）。この DB の照合順序は
       * 文字コード順なので、素で並べると**ひらがなが全部先・カタカナが全部後**に
       * 固まり、「あ行を探しているのにカタカナの会社が画面の下」になる。
       * ⚠️ **漢字は読みを持っていないので五十音にはならない**（画面にそう書いてある）。
       * `ja-x-icu` の無い環境では素の順に落とす（500 にしない）。
       */
      const jaCol = JAPANESE_SORT_KEYS.has(filter.sortBy)
        ? withJapaneseCollation(sortCol, await japaneseCollationAvailable())
        : sortCol;
      orderBy = `${jaCol} ${sortDir}${nullsClause}`;
    }

    const total = ((await queryOne(`SELECT COUNT(*) as c FROM projects p LEFT JOIN companies c ON c.id = p.customer_id ${where}`, params)) as any).c;
    // is_ai_created は created_by=mcpActor (静的キー) OR 監査ログ照合 (OAuth 本人名義でも検出)。
    // SELECT 句の ? が最初のプレースホルダになるため params の先頭に mcpActorId を置く。
    const rows = await queryAll(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name,
       ${TOTAL_REVENUE_SQL} as total_revenue,
       ${TOTAL_PURCHASE_SQL} as total_purchase,
       (p.created_by = ? OR ai.audit_id IS NOT NULL) as is_ai_created,
       ai.requested_by as ai_requested_by,
       nt.title as next_task_title, nt.due_date as next_task_due, nt.assignee_name as next_task_assignee,
       COALESCE(est.amount, 0) as estimate_amount,
       memo.description as memo_excerpt,
       GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at)) as last_activity_at,
       -- 健全性と放置日数 (project-health.ts の単一定義)。「最後の動き」は上と同じ mv を渡す。
       -- snooze_until は DATE を ::text にする (pg が JS Date にして UTC で1日ずれるため。due_date と同じ理由)
       ${healthSql('GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at))')} as health,
       ${stalledDaysSql('GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at))')} as stalled_days,
       p.snooze_until::text as snooze_until
       FROM projects p
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.assigned_to
       LEFT JOIN LATERAL (
         SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
         WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id
         ORDER BY m.created_at ASC LIMIT 1
       ) ai ON TRUE
       ${NEXT_TASK_LATERAL}
       ${LAST_MOVE_LATERAL}
       ${ESTIMATE_AMOUNT_LATERAL}
       ${MEMO_LATERAL}
       ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [config.mcpActorId, ...params, limit, offset]
    );
    /*
     * ステージ別の件数。**画面のチップに出す数**なので、
     * ページングは掛けず (LIMIT 無し)、ステージ以外の絞り込みだけを掛ける。
     * 「終了」のようにステージをまたぐまとまりは画面側で足す
     * (ここでまとめてしまうと、別の画面が別のまとめ方をしたときに使えない)。
     */
    const stageCountRows = await queryAll(
      `SELECT p.stage, COUNT(*)::int AS n
       FROM projects p LEFT JOIN companies c ON c.id = p.customer_id
       ${whereWithoutStage} GROUP BY p.stage`,
      paramsWithoutStage
    ) as { stage: string; n: number }[];
    const stageCounts: Record<string, number> = {};
    for (const s of STAGES) stageCounts[s] = 0;   // 0 件のステージも鍵を残す (チップを消さない)
    for (const r of stageCountRows) stageCounts[r.stage] = r.n;

    return { rows, total, page, limit, stageCounts };
  }

  async getById(id: string) {
    const row = await queryOne(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name,
       ${TOTAL_REVENUE_SQL} as total_revenue,
       ${TOTAL_PURCHASE_SQL} as total_purchase,
       memo.description as memo_excerpt,
       -- 案件詳細の「事実の帯」が**見積金額**を出す（モックの指定）。
       -- 一覧と**同じ計算**を使う（写すと、同じ案件が画面によって違う額になる）
       COALESCE(est.amount, 0) as estimate_amount,
       -- 健全性 (project-health.ts) とスヌーズ。一覧と同じ定義・同じ ::text (日付ずれ対策)
       ${healthSql()} as health,
       p.snooze_until::text as snooze_until
       FROM projects p
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.assigned_to
       ${MEMO_LATERAL}
       ${ESTIMATE_AMOUNT_LATERAL}
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    // 仮スケジュール（複数日程）を付与
    const dates = await queryAll(
      `SELECT id, date, label, sort_order FROM project_dates WHERE project_id = ? ORDER BY sort_order ASC, date ASC`,
      [id]
    );
    (row as Record<string, unknown>).dates = dates;
    return row;
  }

  /**
   * 決算インポートのマーカー一覧 (取込バッチ) を件数つきで返す。
   * 印は `projects.kessan_marker` の列 (migration 184)。
   */
  async getKessanMarkers() {
    return await queryAll(
      `SELECT kessan_marker AS marker, COUNT(*)::int AS count
       FROM projects
       WHERE deleted_at IS NULL AND kessan_marker IS NOT NULL
       GROUP BY kessan_marker
       ORDER BY kessan_marker DESC`
    );
  }

  /**
   * 整合性チェックの件数（案件台帳の「確かめる」）。
   *
   * **1回の SQL で全部数えます**（`buildIntegrityCountSql`）。チェックごとに
   * 問い合わせると、増えるほど画面が遅くなり、しかも**数え終わった順に
   * 数字が入れ替わって読み間違えます**。
   *
   * 返すのは規則そのもの（名前・なぜ困るか・どう直すか）＋件数です —
   * **画面に規則を書き写さない**ため（写すと片方だけ直った日から、
   * 画面の説明と実際に数えているものが食い違います）。
   */
  async getIntegrity() {
    const row = (await queryOne(buildIntegrityCountSql())) as Record<string, number>;
    return {
      total: Number(row?._total ?? 0),
      checks: INTEGRITY_CHECKS.map((c) => ({
        key: c.key, label: c.label, why: c.why, how: c.how,
        count: Number(row?.[c.key] ?? 0),
      })),
    };
  }

  /**
   * 一括更新: 指定した案件 ID 群に対し、渡されたフィールドだけをまとめて更新する。
   * 申し込み情報等のパラメータ (顧客 / 担当 / 分類 / 種別 / ステージ / 開催日 / 申込フラグ / タグ) に対応。
   * gls_category はここでは列を直接更新する (発番済 GLS の採番し直しは行わない = 決算取込の GLS を保持)。
   */
  async bulkUpdate(ids: string[], set: Record<string, unknown>, userId: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '対象の案件が選択されていません');
    }
    if (ids.length > 2000) {
      throw new AppError(400, 'VALIDATION_ERROR', '一度に更新できる案件は 2000 件までです');
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (typeof set.customer_id === 'string' && set.customer_id) {
      setClauses.push('customer_id = ?'); params.push(set.customer_id);
    }
    if (typeof set.assigned_to === 'string' && set.assigned_to) {
      setClauses.push('assigned_to = ?'); params.push(set.assigned_to);
    }
    if (set.gls_category === 'A' || set.gls_category === 'B') {
      setClauses.push('gls_category = ?'); params.push(set.gls_category);
    }
    /**
     * **2段分類（客入れの有無 × 案件分類）と旧 `project_type` を必ず一緒に書く**
     * （案件台帳の一括編集で足した・migration 182）。
     *
     * ⚠️ ここは長いあいだ **`project_type` だけを直接書いて**いました。旧種類は
     * **2段から導くのがこの製品の決めごと**（`project-classification.ts`）なので、
     * 片方だけ書くと**分類と種類がずれた行**ができます。ずれると
     * **一覧（種類で見る画面）と詳細（2段で見る画面）で違う分類が出て**、
     * しかも画面を見ても「どちらが正しいのか」が分かりません。
     *
     * 受け方は2通り。**どちらで来ても3つの列が揃います**:
     *
     *   ① 2段で来る（案件台帳）… `project_type` を導いて3つとも書く
     *   ② 旧種類で来る（旧 GLS 取込の画面）… 2段を**逆に埋め戻して**3つとも書く
     *
     * **片方だけの2段は受け付けません。** 通すと `resolveClassification` が
     * 導けずに黙って捨て、押した人には「選んだのに入っていない」としか見えません。
     */
    const asked2 = set.audience !== undefined || set.project_category !== undefined;
    if (asked2) {
      const derived = projectTypeOf(set.audience, set.project_category);
      if (!derived) {
        throw new AppError(
          400, 'VALIDATION_ERROR',
          '案件分類は「客入れの有無」と「配信/収録/イベント」の2つをそろえて指定してください',
        );
      }
      setClauses.push('audience = ?'); params.push(set.audience);
      setClauses.push('project_category = ?'); params.push(set.project_category);
      setClauses.push('project_type = ?'); params.push(derived);
      // 無観客にしたら来場人数は落とす（`create` / `update` と同じ理由）
      if (set.audience === 'no_audience') setClauses.push('attendee_count = NULL');
    } else if (typeof set.project_type === 'string' && set.project_type) {
      // 旧い呼び出し（GLS 取込の画面）。**400 で止めない** — 名前を変えただけで
      // 古い画面から一括編集できなくなるのは割に合わない
      setClauses.push('project_type = ?'); params.push(set.project_type);
      const back = classificationOf(set.project_type);
      setClauses.push('audience = ?'); params.push(back?.audience ?? null);
      setClauses.push('project_category = ?'); params.push(back?.project_category ?? null);
      /*
       * ⚠️ **こちらの道でも来場人数を落とす**（レビューでの指摘 #127）。
       *
       * 旧種類から2段を埋め戻すとき、`live_broadcast` / `recording` は
       * **`no_audience` になります**。上の2段の道（679行）と `create` / `update` は
       * そのとき来場人数を落としますが、**この道だけ残していました**。
       * 結果、**「無観客なのに来場人数 150 名」**の行ができます — これは
       * 整合性の確認が名指ししている食い違いそのもの（`attendee_no_audience`）で、
       * **画面から直すためにここを通った人が、通るたびに作っていた**ことになります。
       */
      if (back?.audience === 'no_audience') setClauses.push('attendee_count = NULL');
    }
    if (typeof set.stage === 'string' && STAGES.includes(set.stage)) {
      /**
       * **受注・失注への一括変更は禁じる**（テーマ2 PR3・docs/project-ledger-phase-c-design.md）。
       *
       * `a_won`/`e_lost` は `recordStageTransition()`（履歴・`won_at`/`lost_at`）・
       * GLS自動発番・失注理由の入力を伴う特別なステージで、案件詳細の `changeStage()`
       * を通さずここで直接動かすと、それらを一切経由せず**履歴の無い受注・`lost_at` の
       * 無い失注**ができてしまう。画面は `stage` を送らないよう自主規制しているだけで、
       * API を直接叩けば素通りしていた（実害はまだ無いが恒久的に穴を塞ぐ）。
       */
      if (set.stage === 'a_won' || set.stage === 'e_lost') {
        throw new AppError(400, 'VALIDATION_ERROR', '受注・失注への一括変更はできません（案件詳細から1件ずつ）');
      }
      setClauses.push('stage = ?'); params.push(set.stage);
    }
    if (set.event_start !== undefined) {
      setClauses.push('event_start = ?'); params.push((set.event_start as string) || null);
    }
    if (set.event_end !== undefined) {
      setClauses.push('event_end = ?'); params.push((set.event_end as string) || null);
    }
    if (set.application_form !== undefined) {
      setClauses.push('application_form = ?'); params.push(set.application_form ? 1 : 0);
    }

    if (setClauses.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '変更する項目が指定されていません');
    }

    setClauses.push('updated_at = NOW()');
    setClauses.push('updated_by = ?'); params.push(userId);

    const placeholders = ids.map(() => '?').join(', ');
    params.push(...ids);

    await execute(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      params
    );

    /*
     * **一括で完了にした分の次回アクションも閉じる**（migration 245）。
     *
     * ⚠️ この道は `recordStageTransition()` を通らない。`a_won`/`e_lost` は上で
     * 弾いているが **`s_completed` は通す**ので、ここだけ後片づけが抜けると
     * 「一括で完了にした案件のやることだけ残る」という**画面から理由の分からない
     * ゴミ**ができる（1件ずつ完了にしたときは消えるので、余計に読めない）。
     *
     * 終了ステージ以外へ一括で戻したときは `syncNextActionsForStage` が
     * 開き直す側に回る（機械が閉じたものだけ）ので、そのまま全ステージで呼ぶ。
     */
    const bulkStage = typeof set.stage === 'string' && STAGES.includes(set.stage) ? set.stage : null;
    if (bulkStage) {
      for (const id of ids) {
        await syncNextActionsForStageSafe(id, bulkStage);
        // 一括で指定できるのは `s_completed` まで（受注・失注はここで 400）なので、
        // ここを通るのは実質「失注から戻した」側だけ。呼んでおかないと
        // **一括で終了を外した案件のフォルダが置き場に取り残される**
        await syncBoxFoldersForStageSafe(id, bulkStage);
      }
    }
    return { updated: ids.length };
  }

  /**
   * 新規作成（ヨミ段階: 最低限の入力でOK）。
   *
   * 本体は `createCore()`（テーマ4 PR1・docs/project-ledger-phase-c-design.md）。
   * ここは薄いラッパー: `opts` を渡さない通常の呼び出し（画面 / MCP `create_project`）は
   * これまでと**完全に同じ**挙動になる — `opts.tx` が無ければ自分で `withTransaction` を
   * 開いて `createCore` に渡し、トランザクションの**外**でメモ・BOX フォルダ作成を行う
   * （`gpm.service.ts` の `create()` と同じ判断: 外部 API 呼び出しをトランザクションの
   * 中に入れない）。
   */
  async create(data: Record<string, unknown>, userId: string, opts: CreateProjectOptions = {}) {
    /*
     * **同じ意図で2回作らせない**（レビューでの指摘 #62）。
     *
     * 引き合いから案件にするとき、画面は `inquiry:<id>:project` を渡します。
     * `projects.idempotency_key` には一意索引があるので（migration 126）、
     * **2回目は DB が拒否します**。
     *
     * ⚠️ **画面の `disabled` だけでは足りません。** react-query の `isPending` は
     * 描き直しが1回入ってから効くので、**同じ瞬間に2回押すと2回とも通ります**
     * （スマホでは通信が返るまで無反応に見えるので、二度押しが普通に起きます）。
     * しかも出来てしまうと、**印を書き戻せるのは片方だけ**なので、
     * もう1件は未仕分けのまま残り、翌日また案件になります。
     *
     * **ぶつかったら、そのとき出来ている案件を返します**（エラーにしない）。
     * 押した人にとっては「案件が1件できた」で正しく、
     * エラーを出すと**出来ているのに失敗したと思って、もう一度作ります**。
     *
     * この事前チェック・衝突時の復旧はどちらも `createCore` の**外**（`tx` の外）で行う
     * — 一意索引違反は明示トランザクション内で起きると取引全体を abort 状態にし、
     * 同じ `tx` では復旧のための SELECT すら打てなくなるため。
     */
    const idem = typeof data.idempotency_key === 'string' && data.idempotency_key.trim()
      ? data.idempotency_key.trim() : null;
    if (idem) {
      const dup = await queryOne(
        'SELECT id FROM projects WHERE idempotency_key = ? AND deleted_at IS NULL', [idem],
      ) as { id: string } | null;
      if (dup) return await this.getById(dup.id);
    }

    let id: string;
    try {
      const core = opts.tx
        ? await createCore(opts.tx, data, userId, opts)
        : await withTransaction((tx) => createCore(tx, data, userId, opts));
      id = core.id;
    } catch (e) {
      // 同時に押されたときは一意索引が止める。**先に出来たほうを返す**
      const already = idem
        ? await queryOne('SELECT id FROM projects WHERE idempotency_key = ? AND deleted_at IS NULL', [idem]) as { id: string } | null
        : null;
      if (already) return await this.getById(already.id);
      throw e;
    }

    /**
     * **メモはやり取りに書く** (migration 184)。`projects.notes` の列は無くなりました。
     *
     * `notes` の引数そのものは**受け取り続けます** — MCP の `create_project` を
     * 本番のメール取込スキルが毎日叩いており、引数を消すと次の実行から
     * 「備考が入らない」ではなく**呼び出しごと落ちます**。受け取ったものは
     * `activity_type='memo'` の1件として、他のやり取りと同じ時系列に並べます。
     *
     * **トランザクションの外で書く** — ここで失敗しても案件自体は残したい
     * （`gpm.service.ts` の `create()` と同じ判断）。
     */
    await addMemoActivity(id, data.customer_id as string, data.notes, userId);

    // BOX フォルダ自動作成 (両親フォルダに並行作成。OPP コード命名で、GLS 発番時にリネームされる)
    // 既に box_url_internal / box_url_external が手動入力されている場合は、未入力側だけ補填。
    // `opts.skipBoxFolder` が true のときはスキップする — バッチ取込のたびに数十〜数百フォルダが
    // 自動生成される暴発を防ぐため（テーマ4）
    if (!opts.skipBoxFolder) {
      try {
        // `code`/`name` は createCore がトランザクション内で決めた値（採番済みの code・
        // 正規化済みの名前）を、確定した行から読み直す（クロージャで持ち越さない）
        const created = await queryOne(
          'SELECT code, name, box_url_internal, box_url_external FROM projects WHERE id = ?', [id],
        ) as { code: string; name: string; box_url_internal: string | null; box_url_external: string | null };
        const folders = await createProjectFolderTree(created.code, String(created.name));
        const updates: string[] = [];
        const params: unknown[] = [];
        if (!created.box_url_internal && folders.internal) {
          updates.push('box_url_internal = ?');
          params.push(folders.internal.folderUrl);
        }
        if (!created.box_url_external && folders.external) {
          updates.push('box_url_external = ?');
          params.push(folders.external.folderUrl);
        }
        if (updates.length > 0) {
          params.push(id);
          await execute(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, params);
        }
      } catch (err) {
        console.warn('[create] BOX folder creation failed (non-blocking):', (err as Error).message);
      }
    }

    return this.getById(id);
  }

  /**
   * 更新（ヨミ段階でも案件段階でも同じAPI）
   */
  async update(id: string, data: Record<string, unknown>, userId: string) {
    // **全列を取る。** AI 起票の案件はここで取った「保存前の姿」と保存後を比べて
    // 人がどこを直したかを残す (`project-ai-feedback.service`)。
    // 必要な列だけ並べる形だと、突き合わせる項目を足すたびにここも直すことになり、
    // 片方を忘れると**その項目だけ黙って差分が取れなくなる**
    const existing = await queryOne(
      'SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL',
      [id],
    ) as Record<string, unknown> | null;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const { name: rawName, customer_id, expected_amount, project_type,
            event_start, event_end, broadcast_type, media_platform,
            application_form, notes, box_url_internal, box_url_external,
            dates, gls_category, intake_channel } = data;
    // **半角カナ等の表記ゆれを保存時に正規化。** `create` と同じ理由（NFKC）
    const name = typeof rawName === 'string' ? normalizeJaText(rawName) : rawName;
    // ⚠️ `customer_type` は**受け取っても使いません**（migration 192）。
    // グループ内 / グループ外はお客様から導くので、渡された値は無視されます
    // （MCP の `update_project` の説明にもそう書いてあります）
    /**
     * **主担当は空にできない。** `projects.assigned_to` は NOT NULL の外部キーなので、
     * 空文字や未指定をそのまま渡すと FK 違反で 500 になります。
     *
     * 画面の担当者選択（`SearchableSelect`）は値があると × を出し、押すと空文字を送ります。
     * 押した人には「保存できませんでした」としか出ず、原因が分かりませんでした
     * （実測: 空にして保存すると 500）。
     *
     * v4 は主担当を持つが実務の割り当てはタスク単位（client/CLAUDE.md「v4 の設計判断」）、
     * かつ**列は NOT NULL のまま**です。NULL 許容にすると一覧の絞り込み・`getById` の
     * LEFT JOIN・MCP の `list_projects`・週報・営業レビューの集計が
     * 「担当者なし」を想定していないので、そちらの影響のほうが大きい。
     * ここでは**渡されなければ今の値を保つ**にとどめます。
     */
    const assigned_to = (data.assigned_to === undefined || data.assigned_to === null || data.assigned_to === '')
      ? existing.assigned_to
      : data.assigned_to;
    /**
     * **登録の16項目（migration 170）も「渡さなければ今の値を保つ」。**
     *
     * 直す画面（`ProjectFormPage`）にはこれらの欄がまだ無いので、
     * 保つ形にしていないと**保存するたびに全部空になります**
     * （タグで実際に起きたのと同じ壊れ方）。
     */
    const keep = <T,>(v: unknown, cur: T): unknown => (v === undefined ? cur : (v === '' ? null : v));
    const contactName = keep(data.contact_name, existing.contact_name);
    const recurrenceValue = data.recurrence === undefined
      ? existing.recurrence
      : (data.recurrence === 'regular' ? 'regular' : 'single');
    const attendeeCount = data.attendee_count === undefined
      ? existing.attendee_count
      : (Number(data.attendee_count) > 0 ? Math.floor(Number(data.attendee_count)) : null);
    const goalValue = keep(data.goal, existing.goal);

    /**
     * 客入れの有無 × 案件分類（migration 182）。**渡されなければ今の値を保つ。**
     *
     * 直す画面（`ProjectFormPage`）にはまだ2段の欄が無いので、保つ形にしていないと
     * **保存するたびに分類が消えます**（タグ・登録16項目と同じ壊れ方）。
     * `project_type` は2段から導きます — 2段が入っている案件で旧分類だけ送られても、
     * 導いた値が勝つので**分類と種類がずれた行はできません**。
     */
    // gls_category は PUT /projects/:id では「発番前のヨミ段階での修正」のみ受け付ける。
    // 発番後の A↔B 切替は採番し直し + 派生物のリネームが必要なため、専用の
    // changeGlsCategory() を使う (リクエスト経路は PATCH /projects/:id/gls-category)。
    const reqCategory = normalizeGlsCategory(gls_category);
    const allowCategoryUpdate = reqCategory && !(existing as { gls_number?: string | null }).gls_number;

    const askedAudience = data.audience === undefined ? existing.audience : data.audience;
    const askedCategory = data.project_category === undefined ? existing.project_category : data.project_category;
    /**
     * ⚠️ **GLS-B（工事・構築）には2段分類を付けません**（レビューでの指摘 #99）。
     *
     * `project-classification.ts` は「GLS-B は2段を持たない・NULL のままにする」と
     * 決めていますが、**書く側で守っていませんでした**。2段が来ると
     * `resolveClassification` が `project_type` を導くので、
     * **工事のプロジェクトが `hybrid_event`（ハイブリッド）になり**、
     * 標準工程の型・Excel・集計が放送の案件として扱います。
     * 画面の欄を消しただけでは足りません — MCP・古いタブ・直接叩きから通ります。
     *
     * **落とすのは2段だけ**（旧 `project_type` は落としません）。GLS-B の
     * `gmo_project` / `consulting` / `other` は正しい値なので、
     * ここで消すと**分類そのものを失います**。
     */
    const effectiveGls = (allowCategoryUpdate ? reqCategory : null)
      ?? (existing as { gls_category?: string | null }).gls_category;
    const cls = resolveClassification(
      askedAudience, askedCategory,
      project_type === undefined ? existing.project_type : project_type,
      // **この保存で変わる区分を渡す。** 既存の値だけを見ると、
      // 同じ保存で A から B にした案件に2段が入る（発番前は切り替えられる）
      effectiveGls,
    );
    // 無観客にしたら来場人数は落とす（create と同じ理由）
    const attendeeFinal = cls.audience === 'no_audience' ? null : attendeeCount;

    /**
     * **リード経路も「渡さなければ今の値を保つ」** (migration 165 の列)。
     *
     * これまで `update()` はこの列を1度も書いていませんでした。作るときだけ入り、
     * **あとから直す道がどこにも無かった**（直す画面に欄が無かったので気づけない）。
     * `project-ai-feedback.service` の突き合わせ項目には最初から入っているので、
     * 人が経路を直しても差分は必ず「無修正」になっていました。
     *
     * **知らない値は NULL に落とす** — DB の CHECK が弾くと保存ごと 500 になります
     * （`create` と同じ守り方）。空文字は「分からない」＝ NULL です。
     */
    const channelValue = intake_channel === undefined
      ? existing.intake_channel
      : (INTAKE_CHANNELS.includes(intake_channel as string) ? intake_channel : null);
    /**
     * **確信バッジも「渡さなければ今の値を保つ」**（`intake_channel` と同型）。
     *
     * MCP `update_project` は `intake_confidence` を UPDATE_FIELDS に載せて
     * 「更新した」と返すのに、この関数が一度も書いていなかった（silent drop）。
     * **知らない値は NULL に落とす** — `create` と同じ守り方。
     */
    const confidenceValue = data.intake_confidence === undefined
      ? existing.intake_confidence
      : (INTAKE_CONFIDENCES.includes(data.intake_confidence as string) ? data.intake_confidence : null);

    /**
     * **グループ区分はお客様から引き直す**（migration 192・ご指示）。
     *
     * 以前はここで「渡されなければ今の値を保つ」としていました。欄を持たない
     * 呼び出しから保存されるだけで**グループ内の案件が黙って社外に戻る**のを
     * 防ぐためでしたが、いまは**人が選ぶ値ではない**ので、保つ必要がありません
     * （お客様が変われば区分も変わるべきで、保つと**お客様を差し替えたときだけ
     * 古い区分が残ります**）。
     *
     * お客様が見つからない古い行では**今の値を保ちます**
     * （`resolveCustomerType` の控えに `existing.customer_type` を渡す）。
     */
    const targetCustomer = customer_id === undefined ? existing.customer_id : customer_id;
    // **実際に変わったときだけ確かめる**（レビュー指摘・PR #199 P2 の2巡目 → #201 P1 で
    // 「渡されただけで再検証」の穴を修正）。直す画面（`ProjectFormPage`）は他の項目を
    // 直すときも今の customer_id を送り直すので、`customer_id !== undefined` だけで
    // 判定すると、あとから顧客ロールを外された会社の案件は**無関係な直し**まで
    // 400 で止まってしまう
    if (customer_id !== undefined && customer_id !== existing.customer_id) {
      await assertCustomerCompanyId(customer_id);
    }
    const cType = await resolveCustomerType(targetCustomer, existing.customer_type);

    // dates 配列が来ている場合は project_dates を全削除→再INSERT。
    // 同時に event_start = MIN(date), event_end = MAX(date) を自動同期
    let finalEventStart: string | null = (event_start as string) || null;
    let finalEventEnd: string | null = (event_end as string) || null;
    if (Array.isArray(dates)) {
      await execute(`DELETE FROM project_dates WHERE project_id = ?`, [id]);
      const validDates = (dates as Array<{ date: string; label?: string | null }>)
        .filter((d) => d && typeof d.date === 'string' && d.date.length > 0);
      for (let i = 0; i < validDates.length; i++) {
        const d = validDates[i];
        await execute(
          `INSERT INTO project_dates (id, project_id, date, label, sort_order) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), id, d.date, d.label || null, i + 1]
        );
      }
      if (validDates.length > 0) {
        const sorted = [...validDates].map((d) => d.date).sort();
        finalEventStart = sorted[0];
        finalEventEnd = sorted[sorted.length - 1];
      } else {
        finalEventStart = null;
        finalEventEnd = null;
      }
    }

    if (allowCategoryUpdate) {
      await execute(
        `UPDATE projects SET name=?, customer_id=?, expected_amount=?, assigned_to=?,
         project_type=?, audience=?, project_category=?, event_start=?, event_end=?,
         broadcast_type=?, media_platform=?,
         contact_name=?, recurrence=?, attendee_count=?, goal=?,
         intake_channel=?, intake_confidence=?,
         application_form=?, customer_type=?,
         box_url_internal=?, box_url_external=?, gls_category=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [name, customer_id, expected_amount || 0, assigned_to,
         cls.project_type, cls.audience, cls.project_category,
         finalEventStart, finalEventEnd,
         broadcast_type || null, media_platform || null,
         contactName, recurrenceValue, attendeeFinal, goalValue,
         channelValue, confidenceValue,
         application_form ? 1 : 0, cType,
         box_url_internal || null, box_url_external || null, reqCategory,
         userId, id]
      );
    } else {
      await execute(
        `UPDATE projects SET name=?, customer_id=?, expected_amount=?, assigned_to=?,
         project_type=?, audience=?, project_category=?, event_start=?, event_end=?,
         broadcast_type=?, media_platform=?,
         contact_name=?, recurrence=?, attendee_count=?, goal=?,
         intake_channel=?, intake_confidence=?,
         application_form=?, customer_type=?,
         box_url_internal=?, box_url_external=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [name, customer_id, expected_amount || 0, assigned_to,
         cls.project_type, cls.audience, cls.project_category,
         finalEventStart, finalEventEnd,
         broadcast_type || null, media_platform || null,
         contactName, recurrenceValue, attendeeFinal, goalValue,
         channelValue, confidenceValue,
         application_form ? 1 : 0, cType,
         box_url_internal || null, box_url_external || null,
         userId, id]
      );
    }

    /**
     * **メモが渡されたらやり取りに1件足す** (migration 184)。
     *
     * 直す画面はメモ欄を持たなくなったので、ここに来るのは
     * MCP の `update_project`（「備考を足しておいて」）だけです。
     * **同じ本文なら足しません** — 案件を保存し直すたびに同じメモが
     * 積み上がると、やり取りがメモで埋まります。
     */
    if (typeof notes === 'string' && notes.trim()) {
      await addMemoActivity(id, (customer_id as string) ?? (existing.customer_id as string), notes, userId, true);
    }

    // 想定金額が「変更された」場合のみ、確定売上の代表レコードにも反映する。
    // ただし明細 (revenue_items) を持つ売上は amount = SUM(items) が正のため対象外にする。
    // ※変更検知なしで毎回上書きすると、別の確定売上を作った後 (= projects.expected_amount が
    //   その売上額で上書きされた後) に案件を保存しただけで、最古売上の金額が現在のフォーム値に
    //   化ける不具合になる。明細ありの売上を上書きすると amount と SUM(items) も乖離する。
    const prevExpected = Number((existing as { expected_amount?: unknown }).expected_amount ?? 0);
    const nextExpected = Number(expected_amount);
    if (expected_amount !== undefined && Number.isFinite(nextExpected) && nextExpected > 0 && nextExpected !== prevExpected) {
      await execute(
        `UPDATE revenues SET amount = ?, updated_at = NOW()
         WHERE id = (
           SELECT r.id FROM revenues r
           WHERE r.project_id = ? AND r.status = 'confirmed' AND r.group_id IS NULL AND r.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM revenue_items ri WHERE ri.revenue_id = r.id)
           ORDER BY r.created_at ASC LIMIT 1
         )`,
        [expected_amount, id]
      );
    }

    // 案件名変更を BOX 両フォルダ (社内限り / 社外共有可) に並行反映 (非ブロッキング)
    if (typeof name === 'string' && name && name !== existing.name) {
      try {
        const internalFolderId = extractFolderId(existing.box_url_internal as string | null);
        const externalFolderId = extractFolderId(existing.box_url_external as string | null);
        if (internalFolderId || externalFolderId) {
          const newFolderName = buildProjectFolderName({
            gls_number: existing.gls_number as string | null,
            code: existing.code as string,
            name,
          });
          await renameProjectFolderPair(internalFolderId, externalFolderId, newFolderName);
        }
      } catch (err) {
        console.warn('[update] BOX folder rename failed (non-blocking):', (err as Error).message);
      }
    }

    const saved = await this.getById(id) as Record<string, unknown>;
    // AI が起票した案件を人が直したら、**どこを直したか**を残す (会社方針の条件2)。
    // 起票から7日以内の更新だけを見る — 窓を切らないと数ヶ月後の通常の業務更新まで
    // 「AI の誤り」として数えられ、修正率が意味のない数字になる
    await recordProjectCorrections(id, existing, saved, userId);
    return saved;
  }

  /**
   * スヌーズ（`PATCH /projects/:id/snooze`・docs/core-redesign-plan.md §3-1）。
   *
   * 「待ち」は独立の状態ではなく**未来日付＋期限切れ時の自動再浮上**で表す。
   * だから**未来の日付しか受け付けない** — 今日以前を許すと「掛けた瞬間から
   * 効いていないスヌーズ」ができ、無期限を許すと「お待たせ中」の轍を踏む。
   * `null` で解除。期日が来たときの解除処理は**要らない**（判定側が
   * `snooze_until >= CURRENT_DATE` で見るだけなので、過ぎれば勝手に普通に戻る）。
   * どのステージからでも掛けられる（終端に掛けても健全性は常に ok のまま）。
   */
  async setSnooze(id: string, until: unknown, userId: string) {
    const project = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [id],
    );
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    if (until === null || until === undefined || until === '') {
      await execute(
        `UPDATE projects SET snooze_until = NULL, updated_at = NOW(), updated_by = ? WHERE id = ?`,
        [userId, id],
      );
      return await this.getById(id);
    }

    // 形と実在の両方を見る（'2026-02-30' は DATE のキャストで 500 になるため手前で弾く）
    if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'スヌーズの期日は YYYY-MM-DD で指定してください');
    }
    const [y, m, d] = until.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new AppError(400, 'VALIDATION_ERROR', '実在しない日付です');
    }
    // **日本の壁時計の「今日」と比べる**（サーバーは UTC で動く。jst.ts の理由）
    if (until <= jstDate()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'スヌーズの期日は明日以降の日付にしてください（過去や今日には掛けられません）');
    }
    await execute(
      `UPDATE projects SET snooze_until = ?, updated_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
      [until, userId, id],
    );
    return await this.getById(id);
  }

  /**
   * ステージ変更（ステージだけ変える。他の処理は含めない）
   */
  async changeStage(id: string, stage: string, data: Record<string, unknown>, userId: string) {
    if (!stage) throw new AppError(400, 'VALIDATION_ERROR', 'stageは必須です');

    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    /**
     * **ステージが変わった記録を残す** (migration 164)。
     *
     * `projects.updated_at` では代われない — 案件名を直しただけでも動くので、
     * 「今月 受注になった案件」を数えられず、止まっている理由も言えない。
     *
     * **同じステージへの押し直しは記録しない。** 記録すると
     * 「1日に3回 受注になった」ことになり、今月の受注が水増しされる。
     */
    const stageChanged = project.stage !== stage;

    // **履歴・受注日時 (won_at)・失注日時 (lost_at) の3点セットは共有関数に集約**
    // （`recordStageTransition` — テーマ2 PR1・docs/project-ledger-phase-c-design.md）。
    // ここが担当するのは `stage` 列そのもの・GLS発番・AI確認印など、この関数だけの責務のまま
    await recordStageTransition(id, project.stage, stage, userId, {
      lost_reason: data.lost_reason,
      lost_reason_note: data.lost_reason_note,
    });

    await execute(
      `UPDATE projects SET stage=?, updated_at=NOW(), updated_by=? WHERE id=?`,
      [stage, userId, id]
    );

    if (stage === 'e_lost') {
      // AI が起票したネタを人が見送った = **拾いすぎ**の手がかり。
      // 受注/失注そのものはステージから読めるので記録しないが、
      // 「AI 出力が業務にならなかった」は不採用として残す
      await recordIntakeDecision(id, 'dropped', userId, (data.lost_reason_note as string) || (data.lost_reason as string) || null);
    }

    if (stageChanged) {
      await this.markAiReviewedByStageDecision(id, stage, userId);
    }

    /**
     * **受注 (`a_won`) にしたら GLS 番号を自動で採る**（v4・モックの決めごと）。
     *
     * これまでは `POST /projects/:id/issue-gls` を人が明示的に叩く形でした。
     * モックは「受注が決まったときに自動で採る」と決めているのでそちらに合わせます。
     *
     * **押し間違いで番号が焼けるのを止める仕掛けは画面側**にあります
     * （`GET /projects/:id/next-gls` で採る番号を見せてから確認する）。
     * ここでは 2 つだけ守ります:
     *
     *  ・**すでに番号があれば採らない**（`issueGls` が 400 を返すので手前で弾く）。
     *    受注 → 口頭決定 → 受注 と往復しても番号は変わりません
     *  ・**分類が無いときは受注そのものは通す。** ここで例外にすると、
     *    古い案件（分類が入っていない）を受注にできなくなります。
     *    採れなかったことは `gls_error` で返し、画面がそう出します
     */
    let glsError: string | null = null;
    if (stage === 'a_won' && !project.gls_number) {
      try {
        await this.issueGls(id, {}, userId);
      } catch (err) {
        glsError = err instanceof AppError ? err.message : 'GLS番号を採れませんでした';
        console.warn('[changeStage] GLS auto-issue failed:', id, glsError);
      }
    }

    // d_hold 遷移時、案件に日程が入っていれば仮押さえ予約を自動生成。
    // 重複防止: この案件に既に予約 (種別問わず: 本番/リハ/仮押さえ/手動登録) があれば作らない。
    // (旧実装は booking_type='hold' のみ照合していたため、新規作成時に作られた本番予約と
    //  仮押さえ予約が二重登録されていた)
    if (stage === 'd_hold' && project.event_start) {
      const existing = await queryOne(
        `SELECT id FROM studio_bookings WHERE project_id = ? AND deleted_at IS NULL LIMIT 1`,
        [id]
      );
      if (!existing) {
        const bookingId = uuidv4();
        const eventEnd = project.event_end || project.event_start;
        await execute(
          `INSERT INTO studio_bookings (id, title, booking_type, project_id, all_day, start_time, end_time, status, notes, created_by)
           VALUES (?, ?, 'hold', ?, 1, ?, ?, 'tentative', '案件ステージ移行で自動生成', ?)`,
          [bookingId, `${project.name} 仮押さえ`, id, project.event_start, eventEnd, userId]
        );
        /*
         * **実施日を引き直す**（`production/services/project-event-dates.service.ts`）。
         * ここで作った仮押さえは**実施日を決める予約**なので、以後この案件の
         * 日程は予約が正になり、直す画面から「スタジオの日程」が消えます。
         * 引き直しておかないと、終了日が空の案件が「2026/08/13 〜 —」のまま
         * **どこからも直せなく**なります（作った予約は開始＝終了なので、
         * ここでの引き直しは終了日を開始日に揃えるだけです）。
         */
        await syncProjectEventDates(id, userId);
      }
    }

    const result = await this.getById(id);
    // 採れなかった理由を**そのまま返す**。黙って番号なしで受注になると、
    // 請求のときに「番号が無い」と気づいて手戻りになる
    return glsError ? { ...(result as Record<string, unknown>), gls_error: glsError } : result;
  }

  /**
   * **人がステージを動かしたら、AI 起票の「未確認」を外す。**
   *
   * ── なぜ要るか ──────────────────────────────────────────────
   *
   * 受付（案件作成）の3つの決め方のうち、`ai_reviewed_at` を書いていたのは
   * **「ネタのまま残す」だけ**でした。つまり
   *
   *   ・**見送りにする** … `stage = e_lost` にするだけ → 受付に残る
   *   ・**案件にする**   … `stage = d_hold` にするだけ → 受付に残る
   *
   * で、**決めたのに受付から消えません**。押した人には「見送りにしても
   * 全く反応しない」としか見えず、しかもエラーは出ないので報告もされません。
   * 受注・完了まで進めた案件が「自動で届いたもの」に並んだままでした（実測）。
   *
   * ステージを動かすのは**中身を読まないとできない操作**なので、
   * ここを「人が確かめた」の印にします。
   *
   * ── 数え方を壊さないための3つの守り ──────────────────────────
   *
   * ① **AI 自身が動かしたときは印を付けない**（`mcpActorId`）。メール取込の
   *    スキルは毎日ステージを動かすので、付けると**誰も見ていないものが
   *    確認済みになり、受付から静かに消えます**
   * ② **AI 起票の案件だけ**（`created_by` が AI か、監査ログに `create_project` がある）。
   *    条件は受信箱の一覧（`AI_INBOX_SQL`）と同じもの
   * ③ **見送りは「無修正で採用」に数えない。** 見送りは AI 出力の**不採用**で、
   *    `changeStage` が別途 `recordIntakeDecision(…'dropped')` を残します。
   *    ここで `recordProjectAccepted` を呼ぶと**拾いすぎた回が正解に数えられます**
   */
  private async markAiReviewedByStageDecision(id: string, stage: string, userId: string) {
    if (userId === config.mcpActorId) return;
    // **`RETURNING` で「本当に印が付いたか」を受け取る。** `execute` は件数を返さないので、
    // 見ずに次へ進むと **AI 起票でない案件のステージを動かすたびに「無修正で採用」が
    // 1件積まれ**、受入率が実態より高く出る
    const marked = await queryOne(
      `UPDATE projects SET ai_reviewed_at = NOW(), updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL AND ai_reviewed_at IS NULL
         AND (created_by = ? OR EXISTS (
           SELECT 1 FROM mcp_audit_log m
           WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = projects.id
         ))
       RETURNING id`,
      [id, config.mcpActorId],
    );
    // 印が付かなかった（AI 起票ではない／すでに確認済み）ときは何も残さない
    if (!marked) return;
    // 見送りは `recordIntakeDecision` が不採用として残す。ここでは採用側だけ数える
    if (stage !== 'e_lost') await recordProjectAccepted(id, userId);
  }

  /**
   * 次に出る GLS 番号を**採らずに**見る。受注に上げる前の確認に使う。
   * 分類が無い案件は `null` を返す（画面は「先に分類を選んでください」と出す）。
   */
  async peekGls(id: string) {
    const project = await queryOne(
      'SELECT gls_number, gls_category FROM projects WHERE id = ? AND deleted_at IS NULL', [id],
    ) as { gls_number: string | null; gls_category: string | null } | null;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) {
      return { already: true, gls_number: project.gls_number, next: null, category: project.gls_category };
    }
    const category = normalizeGlsCategory(project.gls_category);
    return {
      already: false,
      gls_number: null,
      next: category ? await peekNextGlsNumber(category) : null,
      category,
    };
  }

  /**
   * GLS発番（口頭決定以降で呼ぶ。案件に GLS番号を付与する）
   *
   * ⚠️ **ステージを実際にここで確かめる**（v4.1.8・矛盾修正）。
   *
   * このメソッドには2つの入口がある:
   *   ・`changeStage` … 受注 (`a_won`) に上げた瞬間に**自動で**呼ぶ（このときは
   *     もう `stage='a_won'` に更新済みなので、下のガードは必ず通る）
   *   ・`POST /:id/issue-gls`（画面の「GLS 発番」ボタン）… 「口頭決定のうちに
   *     先に番号が要る」ときのための**手動**の入口
   *
   * 以前は手動の入口にステージの縛りが無く、**問合せ（`neta`）の案件からでも
   * 番号を焼けた**。v4 は「受注が固まるまで番号を焼かない」（欠番を増やさない）
   * のが前提なので、口頭決定より手前からは弾く
   */
  async issueGls(id: string, data: Record<string, unknown>, userId: string) {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', '既にGLS番号が発番済みです');
    if (['neta', 'd_hold', 'c_proposal'].includes(project.stage as string)) {
      throw new AppError(400, 'VALIDATION_ERROR', '口頭決定（B）以降の案件だけ、先にGLS番号を発番できます。');
    }

    // v2.8.113+: project.gls_category を見る (登録時に必須化済)
    const category = normalizeGlsCategory(project.gls_category);
    if (!category) {
      throw new AppError(400, 'VALIDATION_ERROR', '案件分類（スタジオ / ビジネス）が未設定です。先に案件編集で分類を選択してください。');
    }
    const glsNumber = await generateGlsNumber(category);

    /*
     * ⚠️ **渡されなかった項目は触らない**（レビューでの指摘 #57）。
     *
     * ここは2つの入口から呼ばれます:
     *   ・発番ダイアログ … 放送種別・媒体を**人が選んで**渡す（空を選べば消す）
     *   ・受注への昇格 … `changeStage` が **`{}` で呼ぶ**（選ぶ画面が無い）
     *
     * 以前は常に `broadcast_type=?, media_platform=?` を書いていたので、
     * **受注にした瞬間に、案件登録のときに入れた放送種別・媒体が消えて**いました。
     * 消えたことは画面に出ません（欄が空になるだけで、誰も理由を知らない）。
     *
     * **値が渡されたときだけ書く。** ダイアログは常に両方を送るので、
     * そちらの「空にする」（`null`）は今までどおり効きます。
     * ⚠️ `'key' in data` で見ないこと — MCP は指定が無くても
     * `{ broadcast_type: undefined }` の形で渡すので、また消えます。
     */
    const sets = ['gls_number=?'];
    const params: unknown[] = [glsNumber];
    if (data.broadcast_type !== undefined) { sets.push('broadcast_type=?'); params.push(data.broadcast_type || null); }
    if (data.media_platform !== undefined) { sets.push('media_platform=?'); params.push(data.media_platform || null); }

    await execute(
      `UPDATE projects SET ${sets.join(', ')},
       stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
       updated_at=NOW(), updated_by=? WHERE id=?`,
      [...params, userId, id]
    );

    // **この SQL はステージも上げる。** 上げたときは履歴に残す (migration 164) —
    // 残さないと「口頭決定になったのはいつか」が抜け、停滞理由が言えなくなる
    if (['neta', 'd_hold', 'c_proposal'].includes(project.stage as string)) {
      await execute(
        `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
         VALUES (?, ?, ?, 'b_verbal', ?)`,
        [uuidv4(), id, project.stage, userId],
      );
    }

    // 概算見積を確定売上に変換
    await this.migrateEstimates(id, glsNumber);

    // BOX 両フォルダ (社内限り / 社外共有可) の ID 部分を OPP コード → GLS 番号 にリネーム。
    // 片方が未作成の場合 (初回作成失敗 / BOX 後付け有効化) は新規作成でフォールバック。
    // いずれも失敗しても GLS 発番自体はブロックしない。
    try {
      const internalFolderId = extractFolderId(project.box_url_internal as string | null);
      const externalFolderId = extractFolderId(project.box_url_external as string | null);
      const newFolderName = buildProjectFolderName({
        gls_number: glsNumber,
        code: project.code as string,
        name: project.name as string,
      });

      if (internalFolderId || externalFolderId) {
        await renameProjectFolderPair(internalFolderId, externalFolderId, newFolderName);
      }

      // 未作成の側を補填 (両方未作成のケースも含む)
      if (!internalFolderId || !externalFolderId) {
        const folders = await createProjectFolderTree(glsNumber, project.name as string);
        const updates: string[] = [];
        const params: unknown[] = [];
        if (!internalFolderId && folders.internal) {
          updates.push('box_url_internal = ?');
          params.push(folders.internal.folderUrl);
        }
        if (!externalFolderId && folders.external) {
          updates.push('box_url_external = ?');
          params.push(folders.external.folderUrl);
        }
        if (updates.length > 0) {
          params.push(id);
          await execute(`UPDATE projects SET ${updates.join(', ')}, updated_at=NOW() WHERE id=?`, params);
        }
      }
    } catch (err) {
      console.warn('[issueGls] BOX folder sync failed:', (err as Error).message);
    }

    return this.getById(id);
  }

  /**
   * 案件分類 (gls_category) を A↔B 切替する。
   *
   * - GLS 未発番の案件: gls_category カラムだけ更新
   * - GLS 発番済の案件: 新カテゴリ側 sequence から **採番し直し**、
   *   - projects.gls_number / gls_category を更新
   *   - 同 project の episodes.episode_code を `{旧GLS}-NNN` → `{新GLS}-NNN` に書換
   *   - qsheet_documents.episode_code も同様に書換
   *   - BOX 両フォルダ (社内限り / 社外共有可) を `{新GLS}_{案件名}` にリネーム
   *
   * 既発行 PDF (見積書 / 請求書) の filename は revenue 単位で生成時の billing_key に
   * 依存するが、v2.8.107 で PDF 生成時に live gls_number で組み立て直す実装になっているため、
   * 以降に再ダウンロードされる PDF は自動的に新 GLS 番号を反映する。既に手元にある
   * 過去 PDF は当然変更されない。
   */
  async changeGlsCategory(id: string, newCategory: GlsCategory, userId: string) {
    if (newCategory !== 'A' && newCategory !== 'B') {
      throw new AppError(400, 'VALIDATION_ERROR', '不正な分類です');
    }
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const currentCategory = normalizeGlsCategory(project.gls_category);
    if (currentCategory === newCategory) {
      return this.getById(id);
    }

    // ヨミ段階: フィールド更新のみ
    if (!project.gls_number) {
      await execute(
        `UPDATE projects SET gls_category=?, updated_at=NOW(), updated_by=? WHERE id=?`,
        [newCategory, userId, id]
      );
      return this.getById(id);
    }

    // 発番済: 採番し直し + 派生物のカスケード更新
    const oldGlsNumber = project.gls_number as string;
    const newGlsNumber = await generateGlsNumber(newCategory);

    // projects: gls_number / gls_category 更新
    // （旧番号の履歴は `previous_gls_numbers` に push していたが、読み手ゼロのため
    //   列ごと削除した。監査は `project_stage_changes`/`ai_outputs` で足りる —
    //   docs/project-ledger-simplification-plan.md §4 Phase A）
    await execute(
      `UPDATE projects
       SET gls_number=?, gls_category=?,
           updated_at=NOW(), updated_by=?
       WHERE id=?`,
      [newGlsNumber, newCategory, userId, id]
    );

    // episodes.episode_code: '{old}-NNN' → '{new}-NNN'
    // episode_code は UNIQUE 制約があるため、衝突回避は新 GLS 番号がグローバルに新規採番された
    // 番号であることに依存 (採番済 sequence は同期的に increment されるので衝突しない)
    await execute(
      `UPDATE episodes
       SET episode_code = REPLACE(episode_code, ?, ?), updated_at = NOW()
       WHERE project_id = ? AND deleted_at IS NULL AND episode_code LIKE ?`,
      [oldGlsNumber, newGlsNumber, id, `${oldGlsNumber}%`]
    );

    // qsheet_documents.episode_code 同期 (denormalized 列)
    await execute(
      `UPDATE qsheet_documents
       SET episode_code = REPLACE(episode_code, ?, ?), updated_at = NOW()
       WHERE project_id = ? AND episode_code LIKE ?`,
      [oldGlsNumber, newGlsNumber, id, `${oldGlsNumber}%`]
    );

    // BOX 両フォルダのリネーム (非ブロッキング)
    try {
      const internalFolderId = extractFolderId(project.box_url_internal as string | null);
      const externalFolderId = extractFolderId(project.box_url_external as string | null);
      if (internalFolderId || externalFolderId) {
        const newFolderName = buildProjectFolderName({
          gls_number: newGlsNumber,
          code: project.code as string,
          name: project.name as string,
        });
        await renameProjectFolderPair(internalFolderId, externalFolderId, newFolderName);
      }
    } catch (err) {
      console.warn('[changeGlsCategory] BOX folder rename failed (non-blocking):', (err as Error).message);
    }

    return this.getById(id);
  }

  /**
   * 既存案件向けの BOX フォルダ手動作成 (両親フォルダ対応)。
   * - BOX 未設定 → 503
   * - 両 URL すでに揃っている → { already: true } (idempotent)
   * - 片方だけある場合は無い側のみ補填
   * - GLS 未発番なら OPP コード、発番済みなら GLS 番号で命名
   */
  /**
   * 片づけ待ちの失注案件。**件数と対象を同じ式から引く**（数と中身が食い違わないように）。
   *
   * `boxConfigured` も返す — **繋いでいないときに「N件あります」だけ出すと、
   * 押しても減らない帯**になり、人は理由が分からないまま押し続けます。
   */
  async countLostBoxFoldersToClean(): Promise<{
    remaining: number; unlinked: number; boxConfigured: boolean; skipped: SkipReason[];
  }> {
    const row = await queryOne(`SELECT COUNT(*)::int AS c ${LOST_BOX_CLEANUP_TARGET_SQL}`) as { c?: number } | null;
    // **URL が空のぶんも数える**（BOX を見て名前で結び付け直せば片づけられる）
    const un = await queryOne(`SELECT COUNT(*)::int AS c ${LOST_BOX_UNLINKED_SQL}`) as { c?: number } | null;
    return {
      remaining: Number(row?.c ?? 0), unlinked: Number(un?.c ?? 0), boxConfigured: isBoxConfigured(),
      skipped: await this.lostBoxSkipReasons(),
    };
  }

  /**
   * **触らなかった理由**を集めて数える。
   *
   * ⚠️ **理由は最初から DB にありました**（`box_cleanup_note`）。書いていたのに
   * 画面へ出していなかったので、押した人には「置き場所か名前か中身か」の
   * どれなのかが分からず、**次の一手を決められませんでした**
   * （ユーザー報告「このように出て結局処理されない」）。
   */
  private async lostBoxSkipReasons(): Promise<SkipReason[]> {
    const rows = await queryAll(
      `SELECT box_cleanup_note ${LOST_BOX_CLEANUP_TARGET_SQL} AND box_cleanup_note IS NOT NULL LIMIT 500`,
    ) as { box_cleanup_note: string | null }[];
    return summarizeSkipReasons(rows.map((r) => r.box_cleanup_note));
  }

  /**
   * **溜まっている失注・見送り案件の BOX フォルダをまとめて片づける。**
   *
   * migration 248 は既存分を遡らない（本番の BOX で数百フォルダが一斉に動くのを
   * 人が知らないうちに起こさないため）ので、溜まっているぶんはここから。
   *
   * ⚠️ **1回の件数を必ず切ります。** BOX は1フォルダにつき数回叩くので、
   * 数百件を一度にやると詰まります。押し直せば続きから進みます
   * （片づけたものは `box_cleanup_state` が入るのでもう選ばれない）。
   *
   * @returns **本当に片づいた件数**と、残っている件数（**残数を返さないと「終わったのか」が分からない**）
   */
  async cleanupLostBoxFolders(
    limit: number,
    /**
     * **BOX を見て紐づけを直すだけ**（片づけはしない）。まとめて処分の1回目に呼ぶ。
     *
     * 古い失注案件は `box_url_*` が空で、フォルダは BOX にあるのにアプリが
     * どれか知らないため、片づけの対象に入っていなかった。
     *
     * ⚠️ **片づけと同じリクエストでやらないこと。** 親フォルダの一覧だけでも
     * BOX を数回叩くので、片づけと足すと1リクエストが長くなりすぎる。
     */
    relink = false,
    /**
     * **どの案件にも結び付かない空フォルダを片づけるだけ**の往復。
     * 名寄せ・案件ごとの片づけとは別に呼ぶ（1往復を長くしすぎない）。
     */
    orphans = false,
  ): Promise<{
    processed: number; remaining: number; boxConfigured: boolean;
    relinked?: RelinkResult; timedOut?: boolean; skipped?: SkipReason[];
    orphaned?: OrphanResult;
  }> {
    if (orphans) {
      const orphaned = await cleanupOrphanFolders();
      const left = await queryOne(`SELECT COUNT(*)::int AS c ${LOST_BOX_CLEANUP_TARGET_SQL}`) as { c?: number } | null;
      return {
        processed: orphaned.deleted, remaining: Number(left?.c ?? 0),
        boxConfigured: isBoxConfigured(), timedOut: orphaned.timedOut, orphaned,
      };
    }

    if (relink) {
      const relinked = await relinkProjectFolders();
      const left0 = await queryOne(`SELECT COUNT(*)::int AS c ${LOST_BOX_CLEANUP_TARGET_SQL}`) as { c?: number } | null;
      return { processed: 0, remaining: Number(left0?.c ?? 0), boxConfigured: isBoxConfigured(), relinked };
    }

    const targetSql = LOST_BOX_CLEANUP_TARGET_SQL;
    const rows = await queryAll(`SELECT id ${targetSql} ORDER BY lost_at ASC NULLS LAST LIMIT ?`, [limit]) as { id: string }[];

    /*
     * ── ⚠️ **時間で区切る**（本番で 504 を出した反省）─────────────
     *
     * フォルダ1件につき BOX を「読む → 中身を数える → 動かす」で十数回叩く。
     * 1リクエストで 20 件やると **200〜300 回**の呼び出しになり、
     * **Nginx の 60 秒で切られて 0 件のまま失敗**した（利用者の実機で発生）。
     * しかも切られたのは応答だけで**サーバー側は動き続ける**ので、
     * 押した人には「何件進んだのか」が分からない。
     *
     * 件数ではなく**時間**で切る。これなら BOX が遅い日でも必ず応答が返り、
     * 進んだぶんは記録に残る（続きは押し直せば進む）。
     */
    const started = Date.now();
    let timedOut = false;
    const ids: string[] = [];
    for (const r of rows) {
      if (Date.now() - started > BOX_CLEANUP_BUDGET_MS) { timedOut = true; break; }
      ids.push(r.id);
      await syncBoxFoldersForStageSafe(r.id, 'e_lost');
    }

    /*
     * ⚠️ **「見た件数」ではなく「本当に片づいた件数」を返す。**
     * BOX に繋いでいない・安全弁で見送った・BOX が断った、のどれでも
     * `syncBoxFoldersForStageSafe` は静かに何もしません。見た件数を返すと
     * **「3件片づけました」と出るのに残りが3件のまま**という、押した人が
     * 何を信じてよいか分からない画面になります（`countHonesty` の戒め）。
     * 片づいた印（`box_cleanup_state`）が付いた行だけを数え直します。
     */
    let processed = 0;
    if (ids.length > 0) {
      const done = await queryOne(
        `SELECT COUNT(*)::int AS c FROM projects
          WHERE id IN (${ids.map(() => '?').join(', ')}) AND box_cleanup_state IS NOT NULL`,
        ids,
      ) as { c?: number } | null;
      processed = Number(done?.c ?? 0);
    }
    const left = await queryOne(`SELECT COUNT(*)::int AS c ${targetSql}`) as { c?: number } | null;
    return {
      processed, remaining: Number(left?.c ?? 0), boxConfigured: isBoxConfigured(), timedOut,
      // **触らなかった理由を必ず返す。** 「0件でした」だけでは次の一手が決まらない
      skipped: await this.lostBoxSkipReasons(),
    };
  }

  async createBoxFolder(
    id: string,
  ): Promise<{ urlInternal: string | null; urlExternal: string | null; already: boolean }> {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const existingInternal = project.box_url_internal as string | null;
    const existingExternal = project.box_url_external as string | null;

    if (existingInternal && existingExternal) {
      return { urlInternal: existingInternal, urlExternal: existingExternal, already: true };
    }

    // BOX 設定状況をチェック (createProjectFolderTree も同じチェックをするが、
    // 早めに 503 を返したいため明示的に)
    const { isBoxConfigured } = await import('../../../shared/services/box');
    if (!isBoxConfigured()) {
      throw new AppError(503, 'BOX_NOT_CONFIGURED', 'BOX 連携が未設定です');
    }

    const idCode = (project.gls_number as string | null) || (project.code as string);
    const folders = await createProjectFolderTree(idCode, project.name as string);

    const newInternal = existingInternal || (folders.internal?.folderUrl ?? null);
    const newExternal = existingExternal || (folders.external?.folderUrl ?? null);

    if (!newInternal && !newExternal) {
      throw new AppError(502, 'BOX_FOLDER_CREATE_FAILED', 'BOX フォルダ作成に失敗しました (親フォルダ ID 未設定の可能性)');
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (!existingInternal && folders.internal) {
      updates.push('box_url_internal = ?');
      params.push(folders.internal.folderUrl);
    }
    if (!existingExternal && folders.external) {
      updates.push('box_url_external = ?');
      params.push(folders.external.folderUrl);
    }
    if (updates.length > 0) {
      params.push(id);
      await execute(`UPDATE projects SET ${updates.join(', ')}, updated_at=NOW() WHERE id=?`, params);
    }

    return { urlInternal: newInternal, urlExternal: newExternal, already: false };
  }

  /**
   * 既存GLS案件へのリンク（エピソード追加）
   */
  async linkToExistingGls(id: string, targetProjectId: string, userId: string) {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', '既にGLS番号が発番済みです');

    const target = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [targetProjectId]) as any;
    if (!target || !target.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'リンク先にGLS番号がありません');

    await execute(
      `UPDATE projects SET gls_number=?, gls_category=?, broadcast_type=?, media_platform=?,
       stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
       updated_at=NOW(), updated_by=? WHERE id=?`,
      [target.gls_number, target.gls_category, target.broadcast_type || null, target.media_platform || null, userId, id]
    );

    // 概算見積を確定売上に変換
    await this.migrateEstimates(id, target.gls_number);

    return this.getById(id);
  }

  /**
   * 発番済みの案件を「別の既存 GLS のエピソード」として紐づけ直す。
   * - GLS 未発番なら従来の linkToExistingGls にフォールバック (概算見積→確定売上)
   * - 発番済みなら: gls_number を新 GLS に差し替え、
   *   episodes.episode_code / qsheet_documents.episode_code を新 GLS で **再採番** (UNIQUE 衝突回避のため
   *   新 GLS の現在の最大エピソード番号の続きに振る)、BOX フォルダ名をリネーム、概算見積を確定売上に変換。
   */
  async relinkExistingGls(id: string, targetProjectId: string, userId: string) {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (id === targetProjectId) throw new AppError(400, 'VALIDATION_ERROR', '自分自身には紐づけできません');

    const target = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [targetProjectId]) as any;
    if (!target || !target.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'リンク先にGLS番号がありません');

    // GLS 未発番ならヨミ段階のリンクと同じ
    if (!project.gls_number) {
      return this.linkToExistingGls(id, targetProjectId, userId);
    }

    const oldGls = project.gls_number as string;
    const newGls = target.gls_number as string;
    if (oldGls === newGls) throw new AppError(400, 'VALIDATION_ERROR', '既に同じGLS番号に紐づいています');

    // 1. projects: gls_number 差し替え + 分類/番組種別/媒体を継承 + ステージ昇格
    // （旧番号の履歴は `previous_gls_numbers` に push していたが、読み手ゼロのため
    //   列ごと削除した。監査は `project_stage_changes`/`ai_outputs` で足りる —
    //   docs/project-ledger-simplification-plan.md §4 Phase A）
    await execute(
      `UPDATE projects
       SET gls_number=?, gls_category=?,
           broadcast_type=COALESCE(broadcast_type, ?), media_platform=COALESCE(media_platform, ?),
           stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
           updated_at=NOW(), updated_by=?
       WHERE id=?`,
      [newGls, target.gls_category, target.broadcast_type || null, target.media_platform || null,
       userId, id]
    );

    // 2. episode_code 再採番 (新 GLS の最大番号の続きに振り直して UNIQUE 衝突を回避)
    const eps = await queryAll(
      `SELECT id, episode_code, episode_number FROM episodes WHERE project_id=? AND deleted_at IS NULL ORDER BY episode_number ASC, created_at ASC`,
      [id]
    ) as any[];
    if (eps.length > 0) {
      const base = ((await queryOne(
        `SELECT COALESCE(MAX(episode_number), 0) as m FROM episodes WHERE episode_code LIKE ? AND deleted_at IS NULL`,
        [`${newGls}-%`]
      )) as any).m as number;
      for (let i = 0; i < eps.length; i++) {
        const ep = eps[i];
        const newNum = base + i + 1;
        const newCode = `${newGls}-${String(newNum).padStart(3, '0')}`;
        await execute('UPDATE episodes SET episode_code=?, episode_number=?, updated_at=NOW() WHERE id=?', [newCode, newNum, ep.id]);
        await execute('UPDATE qsheet_documents SET episode_code=?, updated_at=NOW() WHERE project_id=? AND episode_code=?', [newCode, id, ep.episode_code]);
      }
    } else {
      // episodes 行が無い場合でも qsheet_documents が旧 GLS プレフィックスを持つことがある
      await execute(
        `UPDATE qsheet_documents SET episode_code = REPLACE(episode_code, ?, ?), updated_at=NOW() WHERE project_id=? AND episode_code LIKE ?`,
        [oldGls, newGls, id, `${oldGls}%`]
      );
    }

    // 3. BOX 両フォルダのリネーム (非ブロッキング)
    try {
      const internalFolderId = extractFolderId(project.box_url_internal as string | null);
      const externalFolderId = extractFolderId(project.box_url_external as string | null);
      if (internalFolderId || externalFolderId) {
        await renameProjectFolderPair(internalFolderId, externalFolderId, buildProjectFolderName({
          gls_number: newGls, code: project.code as string, name: project.name as string,
        }));
      }
    } catch (err) {
      console.warn('[relinkGls] BOX folder rename failed:', (err as Error).message);
    }

    // 4. 概算見積を確定売上に変換 (残っていれば)
    await this.migrateEstimates(id, newGls);

    return this.getById(id);
  }

  /**
   * GLS番号付き案件一覧（**GLS番号そのものへ紐づける**選択用 — 回の追加・付け替え・
   * 費用を分け合うグループ）。ここは `gls_number` が無いと成立しない操作なので
   * `gls_number IS NOT NULL` のままでよい。**仕入・売上など「受注確定した案件に
   * 実務を記録したい」画面はこちらを使わないこと**（`getWonProjects` を使う）
   */
  async getGlsProjects() {
    return await queryAll(
      `SELECT p.id, p.gls_number, p.name, c.name as customer_name
       FROM projects p LEFT JOIN companies c ON c.id = p.customer_id
       WHERE p.gls_number IS NOT NULL AND p.deleted_at IS NULL
       ORDER BY p.gls_number DESC`
    );
  }

  /**
   * 受注確定済み案件一覧（仕入・売上・精算PDF取込レビュー・予算詳細・書類引き渡し
   * の案件プルダウン用・v4.1.8 新設）。
   *
   * ⚠️ **`gls_number IS NOT NULL` ではなく `stage` で絞る。** 受注 (`a_won`) は
   * 原則 GLS 番号が自動で付くが、案件分類が未設定の古いデータでは例外的に
   * 番号だけ付かないことがある（`changeStage` の `gls_error`）。そこで前者を
   * 基準にすると、**受注済みなのに番号が無いだけで仕入・売上が一切記録できない**
   * という実務上の詰みが起きる。受注確度は `stage` が正で、`gls_number` の
   * 有無は別軸の情報（採番の進み具合）として画面側で見せるだけにする
   */
  async getWonProjects() {
    return await queryAll(
      `SELECT p.id, p.gls_number, p.name, c.name as customer_name
       FROM projects p LEFT JOIN companies c ON c.id = p.customer_id
       WHERE p.stage IN ('a_won', 's_completed') AND p.deleted_at IS NULL
       ORDER BY p.gls_number DESC NULLS LAST, p.created_at DESC`
    );
  }

  /**
   * 概算見積→確定売上に変換（billing_key再生成＋ステータス変更）
   */
  private async migrateEstimates(projectId: string, glsNumber: string) {
    const estimates = await queryAll(
      `SELECT id, tax_category FROM revenues
       WHERE project_id = ? AND status = 'estimate' AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [projectId]
    ) as any[];
    if (estimates.length === 0) return;

    // 既存の確定売上数をカウント（同一GLS番号の全プロジェクト横断）。
    // deleted_at でフィルタすると削除後に連番が再利用され billing_key が重複するため、
    // ソフトデリート分も含めて数える (連番は飛んでも一意性を優先)。
    const existingConfirmed = ((await queryOne(
      `SELECT COUNT(*) as c FROM revenues r
       JOIN projects p ON p.id = r.project_id
       WHERE p.gls_number = ? AND r.status = 'confirmed'`,
      [glsNumber]
    )) as any).c;

    for (let i = 0; i < estimates.length; i++) {
      const est = estimates[i];
      const seq = existingConfirmed + i + 1;
      const seqNum = String(seq).padStart(3, '0');
      const taxSuffix = taxBillingSuffix(est.tax_category);
      const newBillingKey = `${glsNumber}-${seqNum}-${taxSuffix}`;
      await execute(
        `UPDATE revenues SET status = 'confirmed', billing_key = ?, updated_at = NOW() WHERE id = ?`,
        [newBillingKey, est.id]
      );
    }
  }

  /**
   * 案件サマリー（売上/仕入/粗利）
   */
  async getSummary(id: string) {
    const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    // 直接売上（group_id なし）+ グループ按分された売上
    // 明細行がある場合は revenue_items の合計を使う（revenues.amount との乖離を防ぐ）
    const directRev = await queryOne(
      `SELECT COALESCE(SUM(
         CASE WHEN ri.items_sum IS NOT NULL THEN ri.items_sum ELSE r.amount END
       ), 0) as total
       FROM revenues r
       LEFT JOIN (
         SELECT revenue_id, SUM(amount) as items_sum
         FROM revenue_items
         GROUP BY revenue_id
       ) ri ON ri.revenue_id = r.id
       WHERE r.project_id = ? AND r.group_id IS NULL AND r.deleted_at IS NULL`,
      [id]
    );
    const allocatedRev = await queryOne('SELECT COALESCE(SUM(ra.allocated_amount), 0) as total FROM revenue_allocations ra JOIN revenues r ON r.id = ra.revenue_id AND r.deleted_at IS NULL WHERE ra.project_id = ?', [id]);
    // 直接仕入（group_id なし）+ グループ按分された金額
    const directPur = await queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE project_id = ? AND group_id IS NULL AND deleted_at IS NULL', [id]);
    const allocatedPur = await queryOne('SELECT COALESCE(SUM(pa.allocated_amount), 0) as total FROM purchase_allocations pa JOIN purchases pu ON pu.id = pa.purchase_id AND pu.deleted_at IS NULL WHERE pa.project_id = ?', [id]);
    const totalRevenue = (Number(directRev?.total) || 0) + (Number(allocatedRev?.total) || 0);
    const totalPurchase = (Number(directPur?.total) || 0) + (Number(allocatedPur?.total) || 0);
    const grossProfit = totalRevenue - totalPurchase;
    const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
    return { total_revenue: totalRevenue, total_purchase: totalPurchase, gross_profit: grossProfit, gross_margin: grossMargin };
  }

  async delete(id: string, userId: string) {
    await execute(`UPDATE projects SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [userId, id]);
  }
}

export const projectService = new ProjectService();
