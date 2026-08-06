import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateSequenceNumber, generateGlsNumber, type GlsCategory } from '../../../shared/services/sequence.service';
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

/** 案件登録時に渡された値を 'A' | 'B' に正規化。不正値は null を返す */
function normalizeGlsCategory(value: unknown): GlsCategory | null {
  return value === 'A' || value === 'B' ? value : null;
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
  glsCategory?: 'A' | 'B';
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
    // 決算インポート分のみ (notes が [kessan: で始まる)。LIKE の [ は Postgres では通常文字
    if (filter.source === 'kessan') {
      where += ` AND p.notes LIKE '[kessan:%'`;
    }
    if (filter.kessanMarker) {
      where += ` AND p.notes LIKE ?`;
      params.push(`[kessan:${filter.kessanMarker}]%`);
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
    // v2.8.113+: gls_category カラム (DB) を真実とする。発番済の旧データは migration 086 でバックフィル済
    if (filter.glsCategory === 'A') {
      where += ` AND p.gls_number IS NOT NULL AND p.gls_category = 'A'`;
    } else if (filter.glsCategory === 'B') {
      where += ` AND p.gls_number IS NOT NULL AND p.gls_category = 'B'`;
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
    } else {
      const sortCol = SORT_COLUMN_MAP[filter.sortBy] || 'p.created_at';
      const sortDir = filter.sortDir === 'asc' ? 'ASC' : 'DESC';
      // event_start を選んだときは NULL を最後に置く
      const nullsClause = filter.sortBy === 'event_start' ? ` NULLS ${sortDir === 'ASC' ? 'LAST' : 'FIRST'}` : '';
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
       COALESCE((SELECT SUM(pu.amount) FROM purchases pu WHERE pu.project_id = p.id AND pu.deleted_at IS NULL AND pu.group_id IS NULL), 0) as total_purchase
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.assigned_to
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
   * notes の `[kessan:XXX]` の XXX を抽出して集計。
   */
  async getKessanMarkers() {
    return await queryAll(
      `SELECT m.marker, COUNT(*)::int AS count
       FROM (
         SELECT substring(notes from '\\[kessan:([^\\]]+)\\]') AS marker
         FROM projects
         WHERE deleted_at IS NULL AND notes LIKE '[kessan:%'
       ) m
       WHERE m.marker IS NOT NULL
       GROUP BY m.marker
       ORDER BY m.marker DESC`
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
            event_start, event_end, dates, gls_category } = data;
    if (!name || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件名と顧客は必須です');
    const glsCategory = normalizeGlsCategory(gls_category);
    if (!glsCategory) throw new AppError(400, 'VALIDATION_ERROR', '案件分類（スタジオ / ビジネス）を選択してください');

    const id = uuidv4();
    const code = await generateSequenceNumber('opp_code', 'OPP');
    const cType = normalizeCustomerType(customer_type);

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

    await execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, gls_category, expected_amount, assigned_to,
                             event_start, event_end,
                             notes, customer_type, box_url_internal, box_url_external,
                             application_form, logo_permission, created_by)
       VALUES (?, ?, ?, ?, 'neta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, customer_id, project_type || 'other', glsCategory, expected_amount || 0, assigned_to || userId,
       finalEventStart, finalEventEnd,
       notes || null, cType, box_url_internal || null, box_url_external || null,
       application_form ? 1 : 0, logo_permission ? 1 : 0, userId]
    );

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

    const { name, customer_id, expected_amount, assigned_to, project_type, project_type_other,
            event_start, event_end, broadcast_type, media_platform, tags,
            application_form, logo_permission, notes, customer_type, box_url_internal, box_url_external,
            dates, gls_category } = data;
    const cType = normalizeCustomerType(customer_type);
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
         project_type=?, project_type_other=?, event_start=?, event_end=?,
         broadcast_type=?, media_platform=?, tags=?,
         application_form=?, logo_permission=?, notes=?, customer_type=?,
         box_url_internal=?, box_url_external=?, gls_category=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [name, customer_id, expected_amount || 0, assigned_to,
         project_type || 'other', project_type_other || null,
         finalEventStart, finalEventEnd,
         broadcast_type || null, media_platform || null, tags || '',
         application_form ? 1 : 0, logo_permission ? 1 : 0, notes || null, cType,
         box_url_internal || null, box_url_external || null, reqCategory,
         userId, id]
      );
    } else {
      await execute(
        `UPDATE projects SET name=?, customer_id=?, expected_amount=?, assigned_to=?,
         project_type=?, project_type_other=?, event_start=?, event_end=?,
         broadcast_type=?, media_platform=?, tags=?,
         application_form=?, logo_permission=?, notes=?, customer_type=?,
         box_url_internal=?, box_url_external=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [name, customer_id, expected_amount || 0, assigned_to,
         project_type || 'other', project_type_other || null,
         finalEventStart, finalEventEnd,
         broadcast_type || null, media_platform || null, tags || '',
         application_form ? 1 : 0, logo_permission ? 1 : 0, notes || null, cType,
         box_url_internal || null, box_url_external || null,
         userId, id]
      );
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

    if (stage === 'e_lost') {
      await execute(
        `UPDATE projects SET stage=?, lost_reason=?, lost_reason_note=?, lessons_learned=?, lost_at=NOW(), updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, data.lost_reason || null, data.lost_reason_note || null, data.lessons_learned || null, userId, id]
      );
      // AI が起票したネタを人が見送った = **拾いすぎ**の手がかり。
      // 受注/失注そのものはステージから読めるので記録しないが、
      // 「AI 出力が業務にならなかった」は不採用として残す
      await recordIntakeDecision(id, 'dropped', userId, (data.lost_reason_note as string) || (data.lost_reason as string) || null);
    } else {
      await execute(
        `UPDATE projects SET stage=?, updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, userId, id]
      );
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

    return this.getById(id);
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
    const { broadcast_type, media_platform } = data;

    await execute(
      `UPDATE projects SET gls_number=?, broadcast_type=?, media_platform=?,
       stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
       updated_at=NOW(), updated_by=? WHERE id=?`,
      [glsNumber, broadcast_type || null, media_platform || null, userId, id]
    );

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
