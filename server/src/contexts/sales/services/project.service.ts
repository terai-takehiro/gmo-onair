import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateSequenceNumber, generateGlsNumber, peekNextGlsNumber, type GlsCategory } from '../../../shared/services/sequence.service';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  createProjectFolderTree,
  renameProjectFolderPair,
  type CustomerType,
} from './box-folder.service';
import { extractFolderId } from '../../../shared/services/box';
import { config } from '../../../config';
import { taxBillingSuffix } from '../../../shared/services/tax-category.service';
import { recordProjectCorrections, recordIntakeDecision } from './project-ai-feedback.service';
import { resolveClassification } from './project-classification';

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
    'SELECT is_gmo_group FROM customers WHERE id = ? AND deleted_at IS NULL',
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
  tag?: string;
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
  /** 開催月 (YYYY-MM)。イベント期間がこの月に重なる案件のみ */
  eventMonth?: string;
  /** 開催期間レンジ (YYYY-MM-DD)。イベント期間がこのレンジに重なる案件のみ */
  eventFrom?: string;
  eventTo?: string;
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
  // 「期限が近い順」= **次のタスクの期限**。返事の期限 (`reply_due`) ではない
  // (v4 の案件作成フォームから返事の期限を外したので、新しい案件には入らない)
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
 * 画面の「止まっている」バッジ (`projectList/stages.ts` の `STALE_DAYS`) と
 * **同じ7日**です。ここだけ別の日数にすると、バッジが付いていない行が
 * 先頭に来る（またはその逆）ことになり、並び順の理由が読めなくなります。
 * 終わった案件 (完了・失注) は動かないのが正しいので上げません。
 */
const RECOMMENDED_SORT_SQL = `
  CASE WHEN p.stage NOT IN ('s_completed', 'e_lost')
        AND GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at)) < NOW() - INTERVAL '7 days'
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
 * 案件担当者ではなく**タスクの担当者**を出す。v4 は
 * 「案件担当者という概念を持たない。誰が何をするかはタスク単位で表す」
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
    if (filter.tag) {
      where += ` AND (',' || p.tags || ',') LIKE ?`;
      params.push(`%,${filter.tag},%`);
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
      orderBy = `${sortCol} ${sortDir}${nullsClause}`;
    }

    const total = ((await queryOne(`SELECT COUNT(*) as c FROM projects p LEFT JOIN customers c ON c.id = p.customer_id ${where}`, params)) as any).c;
    // is_ai_created は created_by=mcpActor (静的キー) OR 監査ログ照合 (OAuth 本人名義でも検出)。
    // SELECT 句の ? が最初のプレースホルダになるため params の先頭に mcpActorId を置く。
    const rows = await queryAll(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name,
       (SELECT COUNT(*) FROM project_dates pd WHERE pd.project_id = p.id) as dates_count,
       COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.project_id = p.id AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.group_id IS NULL), 0) as total_revenue,
       COALESCE((SELECT SUM(pu.amount) FROM purchases pu WHERE pu.project_id = p.id AND pu.deleted_at IS NULL AND pu.group_id IS NULL), 0) as total_purchase,
       (p.created_by = ? OR ai.audit_id IS NOT NULL) as is_ai_created,
       ai.requested_by as ai_requested_by,
       nt.title as next_task_title, nt.due_date as next_task_due, nt.assignee_name as next_task_assignee,
       COALESCE(est.amount, 0) as estimate_amount,
       memo.description as memo_excerpt,
       GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at)) as last_activity_at
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
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
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
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
       COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.project_id = p.id AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.group_id IS NULL), 0) as total_revenue,
       COALESCE((SELECT SUM(pu.amount) FROM purchases pu WHERE pu.project_id = p.id AND pu.deleted_at IS NULL AND pu.group_id IS NULL), 0) as total_purchase,
       memo.description as memo_excerpt,
       -- 案件詳細の「事実の帯」が**見積金額**を出す（モックの指定）。
       -- 一覧と**同じ計算**を使う（写すと、同じ案件が画面によって違う額になる）
       COALESCE(est.amount, 0) as estimate_amount
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
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
    if (typeof set.project_type === 'string' && set.project_type) {
      setClauses.push('project_type = ?'); params.push(set.project_type);
    }
    if (typeof set.stage === 'string' && STAGES.includes(set.stage)) {
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
    if (set.logo_permission !== undefined) {
      setClauses.push('logo_permission = ?'); params.push(set.logo_permission ? 1 : 0);
    }
    // タグ: mode='replace' で置換 / 'append' で末尾追加 (空なら付与のみ)
    if (typeof set.tags === 'string' && (set.tagsMode === 'replace' || set.tagsMode === 'append')) {
      const tag = (set.tags as string).trim();
      if (set.tagsMode === 'replace') {
        setClauses.push('tags = ?'); params.push(tag);
      } else if (tag) {
        setClauses.push(`tags = CASE WHEN COALESCE(tags, '') = '' THEN ? ELSE tags || ',' || ? END`);
        params.push(tag, tag);
      }
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
    return { updated: ids.length };
  }

  /**
   * 新規作成（ヨミ段階: 最低限の入力でOK）
   */
  async create(data: Record<string, unknown>, userId: string) {
    const { name, customer_id, expected_amount, assigned_to, project_type, notes, customer_type,
            box_url_internal, box_url_external, application_form, logo_permission,
            event_start, event_end, dates, gls_category,
            intake_channel, intake_confidence,
            // 登録モーダルの16項目のうち、列を足したぶん (migration 170)
            contact_name, recurrence, attendee_count, goal, reply_due, wants,
            audience, project_category,
            stage, first_task } = data;
    if (!name || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件名と顧客は必須です');
    const glsCategory = normalizeGlsCategory(gls_category);
    if (!glsCategory) throw new AppError(400, 'VALIDATION_ERROR', '案件分類（スタジオ / ビジネス）を選択してください');

    const id = uuidv4();
    const code = await generateSequenceNumber('opp_code', 'OPP');
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
     * **受注以降では作れません。** GLS 番号を採る流れ（確認ダイアログ付き）を
     * 飛ばしてしまうためです。作ってからステージを上げてもらいます。
     */
    const initialStage = STAGES.includes(String(stage)) ? String(stage) : 'neta';
    const safeStage = ['a_won', 's_completed', 'e_lost'].includes(initialStage) ? 'neta' : initialStage;

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
    const cls = resolveClassification(audience, project_category, project_type);

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
     */
    const idem = typeof data.idempotency_key === 'string' && data.idempotency_key.trim()
      ? data.idempotency_key.trim() : null;
    if (idem) {
      const dup = await queryOne(
        'SELECT id FROM projects WHERE idempotency_key = ? AND deleted_at IS NULL', [idem],
      ) as { id: string } | null;
      if (dup) return await this.getById(dup.id);
    }
    try {
      await execute(
        `INSERT INTO projects (id, code, name, customer_id, stage, project_type, audience, project_category,
                               gls_category, expected_amount, assigned_to,
                               event_start, event_end,
                               customer_type, box_url_internal, box_url_external,
                               application_form, logo_permission, intake_channel, intake_confidence,
                               contact_name, recurrence, attendee_count, goal, reply_due, wants,
                               idempotency_key, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, name, customer_id, safeStage, cls.project_type, cls.audience, cls.project_category,
         glsCategory, expected_amount || 0, assigned_to || userId,
         finalEventStart, finalEventEnd,
         cType, box_url_internal || null, box_url_external || null,
         application_form ? 1 : 0, logo_permission ? 1 : 0, channel, confidence,
         contact_name || null, recur, scale, goal || null, reply_due || null, wants || null,
         idem, userId]
      );
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
     */
    await addMemoActivity(id, customer_id as string, notes, userId);

    // **最初のステージも履歴に残す** (migration 164)。
    // 1件目が無いと「ネタでいた期間」が測れず、停滞理由が「いつから」を言えない
    await execute(
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
      await execute(
        `INSERT INTO project_tasks (id, project_id, title, assigned_to, due_at, is_completed, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, false, 1, ?)`,
        [uuidv4(), id, task.title.trim(), task.assigned_to || assigned_to || userId, dueAt, userId],
      );
    }

    // project_dates にINSERT
    for (let i = 0; i < datesToInsert.length; i++) {
      const d = datesToInsert[i];
      await execute(
        `INSERT INTO project_dates (id, project_id, date, label, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), id, d.date, d.label || null, i + 1]
      );
    }

    // BOX フォルダ自動作成 (両親フォルダに並行作成。OPP コード命名で、GLS 発番時にリネームされる)
    // 既に box_url_internal / box_url_external が手動入力されている場合は、未入力側だけ補填
    try {
      const folders = await createProjectFolderTree(code, String(name));
      const updates: string[] = [];
      const params: unknown[] = [];
      if (!box_url_internal && folders.internal) {
        updates.push('box_url_internal = ?');
        params.push(folders.internal.folderUrl);
      }
      if (!box_url_external && folders.external) {
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

    const { name, customer_id, expected_amount, project_type, project_type_other,
            event_start, event_end, broadcast_type, media_platform, tags,
            application_form, logo_permission, notes, box_url_internal, box_url_external,
            dates, gls_category, intake_channel } = data;
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
     * v4 は「案件担当者という概念を持たない」（誰がやるかはタスク単位）方針ですが、
     * **列は NOT NULL のまま**です。NULL 許容にすると一覧の絞り込み・`getById` の
     * LEFT JOIN・MCP の `list_projects`・週報・営業レビューの集計が
     * 「担当者なし」を想定していないので、そちらの影響のほうが大きい。
     * ここでは**渡されなければ今の値を保つ**にとどめます。
     */
    const assigned_to = (data.assigned_to === undefined || data.assigned_to === null || data.assigned_to === '')
      ? existing.assigned_to
      : data.assigned_to;
    /**
     * **画面に無い項目は今の値を保つ。**
     *
     * v4 のモックはタグと「案件種類（その他）」の入力欄を落としました。
     * この UPDATE は送られた値でそのまま上書きするので、欄を消しただけだと
     * **保存のたびに既存の値が空になります**（本番データが黙って消える）。
     * 列は残したまま、**未指定なら今の値を保つ**形にしてから欄を外しました。
     * 明示的に空文字を送ったときは消せます（＝人が消したいときは消える）。
     */
    const tagsValue = tags === undefined ? ((existing.tags as string | null) ?? '') : (tags || '');

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
    const replyDue = keep(data.reply_due, existing.reply_due);
    const wantsValue = keep(data.wants, existing.wants);
    const projectTypeOther = project_type_other === undefined
      ? ((existing.project_type_other as string | null) ?? null)
      : (project_type_other || null);

    /**
     * 客入れの有無 × 案件分類（migration 182）。**渡されなければ今の値を保つ。**
     *
     * 直す画面（`ProjectFormPage`）にはまだ2段の欄が無いので、保つ形にしていないと
     * **保存するたびに分類が消えます**（タグ・登録16項目と同じ壊れ方）。
     * `project_type` は2段から導きます — 2段が入っている案件で旧分類だけ送られても、
     * 導いた値が勝つので**分類と種類がずれた行はできません**。
     */
    const askedAudience = data.audience === undefined ? existing.audience : data.audience;
    const askedCategory = data.project_category === undefined ? existing.project_category : data.project_category;
    const cls = resolveClassification(
      askedAudience, askedCategory,
      project_type === undefined ? existing.project_type : project_type,
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
    const cType = await resolveCustomerType(targetCustomer, existing.customer_type);
    // gls_category は PUT /projects/:id では「発番前のヨミ段階での修正」のみ受け付ける。
    // 発番後の A↔B 切替は採番し直し + 派生物のリネームが必要なため、専用の
    // changeGlsCategory() を使う (リクエスト経路は PATCH /projects/:id/gls-category)。
    const reqCategory = normalizeGlsCategory(gls_category);
    const allowCategoryUpdate = reqCategory && !(existing as { gls_number?: string | null }).gls_number;

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
         project_type=?, audience=?, project_category=?, project_type_other=?, event_start=?, event_end=?,
         broadcast_type=?, media_platform=?, tags=?,
         contact_name=?, recurrence=?, attendee_count=?, goal=?, reply_due=?, wants=?,
         intake_channel=?,
         application_form=?, logo_permission=?, customer_type=?,
         box_url_internal=?, box_url_external=?, gls_category=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [name, customer_id, expected_amount || 0, assigned_to,
         cls.project_type, cls.audience, cls.project_category, projectTypeOther,
         finalEventStart, finalEventEnd,
         broadcast_type || null, media_platform || null, tagsValue,
         contactName, recurrenceValue, attendeeFinal, goalValue, replyDue, wantsValue,
         channelValue,
         application_form ? 1 : 0, logo_permission ? 1 : 0, cType,
         box_url_internal || null, box_url_external || null, reqCategory,
         userId, id]
      );
    } else {
      await execute(
        `UPDATE projects SET name=?, customer_id=?, expected_amount=?, assigned_to=?,
         project_type=?, audience=?, project_category=?, project_type_other=?, event_start=?, event_end=?,
         broadcast_type=?, media_platform=?, tags=?,
         contact_name=?, recurrence=?, attendee_count=?, goal=?, reply_due=?, wants=?,
         intake_channel=?,
         application_form=?, logo_permission=?, customer_type=?,
         box_url_internal=?, box_url_external=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [name, customer_id, expected_amount || 0, assigned_to,
         cls.project_type, cls.audience, cls.project_category, projectTypeOther,
         finalEventStart, finalEventEnd,
         broadcast_type || null, media_platform || null, tagsValue,
         contactName, recurrenceValue, attendeeFinal, goalValue, replyDue, wantsValue,
         channelValue,
         application_form ? 1 : 0, logo_permission ? 1 : 0, cType,
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

    if (stage === 'e_lost') {
      await execute(
        `UPDATE projects SET stage=?, lost_reason=?, lost_reason_note=?, lessons_learned=?, lost_at=NOW(), updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, data.lost_reason || null, data.lost_reason_note || null, data.lessons_learned || null, userId, id]
      );
      // AI が起票したネタを人が見送った = **拾いすぎ**の手がかり。
      // 受注/失注そのものはステージから読めるので記録しないが、
      // 「AI 出力が業務にならなかった」は不採用として残す
      await recordIntakeDecision(id, 'dropped', userId, (data.lost_reason_note as string) || (data.lost_reason as string) || null);
    } else if (stage === 'a_won') {
      // **受注の時刻を残す** — 失注に `lost_at` があるのに受注に無かった。
      // 一度受注した案件を戻してまた受注にしたときは**最初の受注日を保つ**
      // (`won_at IS NULL` のときだけ入れる)。受注した月が後ろにずれると
      // 「今月の受注」が二重に立つ
      await execute(
        `UPDATE projects SET stage=?, won_at=COALESCE(won_at, NOW()), updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, userId, id]
      );
    } else {
      await execute(
        `UPDATE projects SET stage=?, updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, userId, id]
      );
    }

    if (stageChanged) {
      await execute(
        `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), id, project.stage ?? null, stage, userId],
      );
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
      }
    }

    const result = await this.getById(id);
    // 採れなかった理由を**そのまま返す**。黙って番号なしで受注になると、
    // 請求のときに「番号が無い」と気づいて手戻りになる
    return glsError ? { ...(result as Record<string, unknown>), gls_error: glsError } : result;
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
   */
  async issueGls(id: string, data: Record<string, unknown>, userId: string) {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', '既にGLS番号が発番済みです');

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
   *   - projects.previous_gls_numbers に旧番号を履歴として push
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

    // projects: gls_number / gls_category 更新 + 履歴 push
    await execute(
      `UPDATE projects
       SET gls_number=?, gls_category=?,
           previous_gls_numbers = COALESCE(previous_gls_numbers, '[]'::jsonb) || ?::jsonb,
           updated_at=NOW(), updated_by=?
       WHERE id=?`,
      [newGlsNumber, newCategory, JSON.stringify([{
        gls_number: oldGlsNumber,
        category: currentCategory,
        changed_at: new Date().toISOString(),
        changed_by: userId,
      }]), userId, id]
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
   * - 発番済みなら: gls_number を新 GLS に差し替え、旧番号を previous_gls_numbers に push、
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

    // 1. projects: gls_number 差し替え + 旧番号を履歴に push + 分類/番組種別/媒体を継承 + ステージ昇格
    await execute(
      `UPDATE projects
       SET gls_number=?, gls_category=?,
           broadcast_type=COALESCE(broadcast_type, ?), media_platform=COALESCE(media_platform, ?),
           previous_gls_numbers = COALESCE(previous_gls_numbers, '[]'::jsonb) || ?::jsonb,
           stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
           updated_at=NOW(), updated_by=?
       WHERE id=?`,
      [newGls, target.gls_category, target.broadcast_type || null, target.media_platform || null,
       JSON.stringify([{ gls_number: oldGls, category: project.gls_category, changed_at: new Date().toISOString(), changed_by: userId, reason: 'relink-episode' }]),
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
   * GLS番号付き案件一覧（リンク先選択用）
   */
  async getGlsProjects() {
    return await queryAll(
      `SELECT p.id, p.gls_number, p.name, c.name as customer_name
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.gls_number IS NOT NULL AND p.deleted_at IS NULL
       ORDER BY p.gls_number DESC`
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

  /**
   * タグ一覧（全案件から使用中のタグを抽出）
   */
  async getTags() {
    const rows = await queryAll("SELECT tags FROM projects WHERE deleted_at IS NULL AND tags != '' AND tags IS NOT NULL");
    const tagSet = new Set<string>();
    for (const row of rows) {
      const tags = (row.tags as string).split(',').map(t => t.trim()).filter(Boolean);
      tags.forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  }

  async delete(id: string, userId: string) {
    await execute(`UPDATE projects SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [userId, id]);
  }
}

export const projectService = new ProjectService();
