import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, recordCorrections, findLatestAiOutput, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { formatActivity, isActivityAiConfigured } from './activity-ai.service';
import { sanitizeBodyHtml, sanitizeKeyPoints } from '../../../shared/services/html-sanitize';

/** `ai_outputs.kind`。**議事録とは別にする** — 直され方の傾向が別物なので混ぜない */
export const ACTIVITY_FORMAT_KIND = 'activity_format';

/** 種類の集合。**DB の CHECK（migration 184）と同じにすること** */
export const ACTIVITY_TYPES = [
  'call', 'email', 'meeting', 'visit', 'proposal', 'demo', 'followup', 'follow_up', 'memo', 'other',
] as const;

/** 整形のプロンプトに渡す種類の名前（AI が「電話の記録なのか議事なのか」を踏まえられる） */
const KIND_LABEL: Record<string, string> = {
  call: '電話', email: 'メール', meeting: '打合せ', visit: '訪問',
  proposal: '提案', demo: 'デモ', followup: '追いかけ', follow_up: '追いかけ',
  memo: '社内のメモ', other: 'その他',
};

export interface ActivityLogFilter {
  projectId?: string;
  customerId?: string;
  userId?: string;
  activityType?: string;
  search?: string;
  /** 'ai' = AI (MCP) 取込のみ / 'human' = 手入力のみ。判定は mcp_audit_log 照合 (OAuth 本人名義でも検出) */
  origin?: 'ai' | 'human';
  /** 並び順: date (既定・活動日が新しい順) / next_action (未完了の次回アクション期限が近い順) */
  sort?: 'date' | 'next_action';
}

/** AI 取込判定の EXISTS 句 (COUNT とデータ取得の両方で共有) */
const AI_ORIGIN_EXISTS = `EXISTS (
  SELECT 1 FROM mcp_audit_log m
  WHERE m.tool_name = 'create_activity_log' AND m.result_summary->>'created_id' = a.id
)`;

export class ActivityLogService {
  async list(filter: ActivityLogFilter, page: number, limit: number, offset: number) {
    let where = 'WHERE a.deleted_at IS NULL';
    const params: unknown[] = [];
    if (filter.projectId) { where += ' AND a.project_id = ?'; params.push(filter.projectId); }
    if (filter.customerId) { where += ' AND a.customer_id = ?'; params.push(filter.customerId); }
    if (filter.userId) { where += ' AND a.user_id = ?'; params.push(filter.userId); }
    if (filter.activityType) { where += ' AND a.activity_type = ?'; params.push(filter.activityType); }
    // 検索は件名・詳細に加えて 案件名・顧客名 も対象 (「あの会社とのやり取り」を探せるように)
    if (filter.search) {
      where += ' AND (a.subject ILIKE ? OR a.description ILIKE ? OR p.name ILIKE ? OR c.name ILIKE ?)';
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.origin === 'ai') { where += ` AND ${AI_ORIGIN_EXISTS}`; }
    else if (filter.origin === 'human') { where += ` AND NOT ${AI_ORIGIN_EXISTS}`; }

    // 並び順: 既定 = 活動日が新しい順。next_action = 未完了の次回アクション (期限が近い順) を先頭に
    const orderBy = filter.sort === 'next_action'
      ? `ORDER BY (a.next_action IS NOT NULL AND a.next_action_done_at IS NULL AND a.next_action_date IS NOT NULL) DESC,
                  a.next_action_date ASC NULLS LAST, a.activity_date DESC, a.created_at DESC`
      : 'ORDER BY a.activity_date DESC, a.created_at DESC';

    // COUNT も検索が p/c を参照するため同じ JOIN を張る
    const total = ((await queryOne(
      `SELECT COUNT(*) as c FROM activity_logs a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       ${where}`, params)) as any).c;
    // v2.9.178+: AI 起票 (MCP create_activity_log) を mcp_audit_log から逆引きして
    // is_ai_created / ai_requested_by (指示者) を付与 (migration 117 の expression index が効く)
    const rows = await queryAll(
      `SELECT a.*, u.name as user_name,
              p.code as project_code, p.name as project_name, p.gls_number as project_gls,
              c.name as customer_name,
              (ai.audit_id IS NOT NULL) as is_ai_created,
              ai.requested_by as ai_requested_by
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN LATERAL (
         SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
         WHERE m.tool_name = 'create_activity_log' AND m.result_summary->>'created_id' = a.id
         ORDER BY m.created_at ASC
         LIMIT 1
       ) ai ON TRUE
       ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total, page, limit };
  }

  async getById(id: string) {
    const row = await queryOne(
      `SELECT a.*, u.name as user_name,
              p.code as project_code, p.name as project_name,
              c.name as customer_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    return row;
  }

  /**
   * 記録を1件作る。
   *
   * ── `format: true` で「整えて記録する」──────────────────────
   *
   * 案件詳細のやり取りタブは、**件名を訊かずに自由入力1つ**で受けます。
   * その代わり保存時に AI が 見出し・整えた本文・要点・次にやること を作ります。
   *
   * **原文は必ず `description` に残します。** 整形が的外れなときに人が戻せますし、
   * 整形プロンプトを直したあと**同じ原文でやり直せます**
   * （議事録が `transcript` を残しているのと同じ）。
   *
   * **整形に失敗しても記録は残します。** ここで 500 を返すと、
   * 打った文がまるごと消えます — 記録が残らないほうが、形が整っていないより困る。
   */
  async create(data: Record<string, unknown>, userId: string) {
    const { project_id, customer_id, activity_type, activity_date, description, next_action, next_action_date } = data;
    let { subject } = data;
    const wantFormat = data.format === true;
    if (!activity_type || !activity_date) {
      throw new AppError(400, 'VALIDATION_ERROR', '活動種別と日付は必須です');
    }
    // **知らない種類は DB の CHECK に当たる前に断る。** 当たると 500 になり、
    // 画面には理由が出ません（実 DB に当てて確かめた）
    if (!(ACTIVITY_TYPES as readonly string[]).includes(String(activity_type))) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `知らない活動種別です（${ACTIVITY_TYPES.join(' / ')} のどれか）`);
    }
    // 整形するときは件名を訊かない（AI が作る）。しない経路は今までどおり必須
    if (!wantFormat && !subject) {
      throw new AppError(400, 'VALIDATION_ERROR', '活動種別、日付、件名は必須です');
    }
    const original = typeof description === 'string' ? description.trim() : '';
    if (wantFormat && !original) {
      throw new AppError(400, 'VALIDATION_ERROR', '整えるための本文が空です');
    }

    let bodyHtml = sanitizeBodyHtml(data.body_html);
    let keyPoints = sanitizeKeyPoints(data.key_points);
    let aiFormatted = false;
    let aiOutputId: string | null = null;
    let action = typeof next_action === 'string' ? next_action : null;
    let actionDate = typeof next_action_date === 'string' ? next_action_date : null;
    let formatError: string | null = null;

    if (wantFormat) {
      if (!isActivityAiConfigured()) {
        // **押してから「使えません」を出さない**のが本筋だが、設定が途中で外れることもある。
        // そのときも記録は残し、整えられなかったことだけ返す
        formatError = 'この環境は AI につないでいないので、整えずにそのまま記録しました';
        subject = subject || original.split('\n')[0]?.slice(0, 60) || 'やり取りの記録';
      } else {
        try {
          // 過去に人がどう直したかを整形プロンプトに載せる (条件4)。
          // **失敗しても整形は続ける** — 助言が無いだけで、整形はできる
          let advice: string[] = [];
          try {
            advice = (await getFeedbackDigest(ACTIVITY_FORMAT_KIND, 90)).advice ?? [];
          } catch { /* 助言が取れなくても続ける */ }

          const s = await formatActivity(original, {
            activityDate: activity_date as string,
            kindLabel: KIND_LABEL[String(activity_type)] ?? null,
            advice,
          });
          subject = s.subject;
          bodyHtml = s.bodyHtml;
          keyPoints = s.keyPoints;
          // **人が入れた次にやることを AI で上書きしない。** 書いてあるほうが正
          action = action || s.nextAction;
          actionDate = actionDate || s.nextActionDate;
          aiFormatted = true;

          // AI が出したものの**全文**を残す (条件1)。
          // ここが後で「人がどこを直したか」の before になる
          aiOutputId = await recordAiOutput({
            kind: ACTIVITY_FORMAT_KIND,
            targetTable: 'activity_logs',
            targetId: null,   // 行を作る前なので、作ってから埋める
            payload: {
              original,
              subject: s.subject, body_html: s.bodyHtml, key_points: s.keyPoints,
              next_action: s.nextAction, next_action_date: s.nextActionDate,
            },
            toolName: 'activity.format',
            model: s.model,
            promptVersion: s.promptVersion,
            actorId: userId,
          });
        } catch (e) {
          formatError = (e as Error).message || '整えられませんでした';
          console.error('[activity] format failed:', formatError);
          subject = subject || original.split('\n')[0]?.slice(0, 60) || 'やり取りの記録';
        }
      }
    }

    const id = uuidv4();
    await execute(
      `INSERT INTO activity_logs
         (id, project_id, customer_id, user_id, activity_type, activity_date, subject, description,
          body_html, key_points, ai_formatted, ai_output_id, next_action, next_action_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)`,
      [id, project_id || null, customer_id || null, userId, activity_type, activity_date,
       subject, original || (typeof description === 'string' ? description : null),
       bodyHtml, JSON.stringify(keyPoints), aiFormatted, aiOutputId,
       action || null, actionDate || null, userId],
    );
    if (aiOutputId) {
      // 行ができたので、AI 出力から**その行を指せる**ようにする
      // （指せないと、人が直したときに before を引けない = 条件2 が閉じない）
      await execute('UPDATE ai_outputs SET target_id = ? WHERE id = ?', [id, aiOutputId])
        .catch(() => { /* 記録の失敗で業務を止めない */ });
    }
    const row = await this.getById(id) as Record<string, unknown>;
    if (formatError) row.format_error = formatError;
    return row;
  }

  /**
   * 直して保存する。
   *
   * AI が整えた行を人が直したときは、**サーバーが自動で before/after を比べ**、
   * `ai_corrections` に入れます（条件2）。**人には何も入力させません。**
   */
  async update(id: string, data: Record<string, unknown>, userId?: string | null) {
    const existing = await queryOne(
      'SELECT id, ai_output_id, ai_formatted FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id],
    ) as { id: string; ai_output_id: string | null; ai_formatted: boolean } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');

    const { project_id, customer_id, activity_type, activity_date, subject, description, next_action, next_action_date } = data;
    if (activity_type !== undefined && !(ACTIVITY_TYPES as readonly string[]).includes(String(activity_type))) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `知らない活動種別です（${ACTIVITY_TYPES.join(' / ')} のどれか）`);
    }
    // **本文と要点は渡されたときだけ触る。** 欄を持たない古い画面から保存されるだけで
    // AI が整えた本文が消えると、直した人にも気づけない（タグ・登録16項目と同じ壊れ方）
    const sets = [
      'project_id=?', 'customer_id=?', 'activity_type=?', 'activity_date=?',
      'subject=?', 'description=?', 'next_action=?', 'next_action_date=?',
    ];
    const params: unknown[] = [
      project_id || null, customer_id || null, activity_type, activity_date,
      subject, description || null, next_action || null, next_action_date || null,
    ];
    if (data.body_html !== undefined) { sets.push('body_html=?'); params.push(sanitizeBodyHtml(data.body_html)); }
    if (data.key_points !== undefined) { sets.push('key_points=?::jsonb'); params.push(JSON.stringify(sanitizeKeyPoints(data.key_points))); }

    await execute(
      `UPDATE activity_logs SET ${sets.join(', ')}, updated_at=NOW() WHERE id=?`,
      [...params, id],
    );
    const after = await this.getById(id) as Record<string, unknown>;
    if (existing.ai_formatted) await recordActivityCorrections(id, after, userId ?? null);
    return after;
  }

  async delete(id: string) {
    await execute(`UPDATE activity_logs SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL`, [id]);
  }

  /** 次回アクションを完了にする (営業ダッシュボードのワンタップ操作用) */
  async completeNextAction(id: string) {
    const existing = await queryOne('SELECT id, next_action FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    if (!(existing as any).next_action) throw new AppError(400, 'VALIDATION_ERROR', '次回アクションが設定されていません');
    await execute(`UPDATE activity_logs SET next_action_done_at=NOW(), updated_at=NOW() WHERE id=?`, [id]);
    return this.getById(id);
  }

  /** 次回アクションの期限を延期する (営業ダッシュボードのワンタップ操作用) */
  async postponeNextAction(id: string, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'VALIDATION_ERROR', '延期先の日付 (YYYY-MM-DD) を指定してください');
    }
    const existing = await queryOne('SELECT id, next_action FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    if (!(existing as any).next_action) throw new AppError(400, 'VALIDATION_ERROR', '次回アクションが設定されていません');
    await execute(`UPDATE activity_logs SET next_action_date=?, next_action_done_at=NULL, updated_at=NOW() WHERE id=?`, [date, id]);
    return this.getById(id);
  }

  async getUpcomingActions(userId: string, daysAhead: number = 7) {
    return await queryAll(
      `SELECT a.*, p.code as project_code, p.name as project_name, c.name as customer_name
       FROM activity_logs a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.deleted_at IS NULL
         AND a.user_id = ?
         AND a.next_action IS NOT NULL
         AND a.next_action_date IS NOT NULL
         AND a.next_action_done_at IS NULL
         AND a.next_action_date <= (CURRENT_DATE + (? || ' days')::interval)::text
       ORDER BY a.next_action_date ASC`,
      [userId, daysAhead]
    );
  }
}

/**
 * 人がどこを直したかを残す（条件2）。
 *
 * ── before は「**AI が出したもの**」。直前の行の状態ではない ──────
 *
 * 議事録で実測して分かったのと同じ落とし穴です。「保存する直前の行」と比べると、
 * **一度保存してからもう一度直した分がすべて『無修正』になります**。
 * 比べる相手は `ai_outputs.payload_snapshot` = AI が出した中身そのもの。
 *
 * ── 7日窓 ────────────────────────────────────────────────────
 *
 * `findLatestAiOutput` の既定（7日）に乗ります。3か月後に次のアクションを
 * 書き換えたのは AI の誤りではなく、ふつうの業務更新です。
 */
async function recordActivityCorrections(
  id: string, after: Record<string, unknown>, userId: string | null,
): Promise<void> {
  const out = await findLatestAiOutput('activity_logs', id, ACTIVITY_FORMAT_KIND);
  if (!out) return;
  const ai = (out.payload ?? {}) as Record<string, unknown>;

  const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  const diffs: CorrectionInput[] = [];
  const fields: [string, string][] = [
    ['subject', 'subject'],
    ['body_html', 'body_html'],
    ['next_action', 'next_action'],
    ['next_action_date', 'next_action_date'],
  ];
  for (const [aiKey, rowKey] of fields) {
    const b = norm(ai[aiKey]);
    const a = norm(after[rowKey]);
    if (b === a) continue;
    diffs.push({
      fieldPath: rowKey,
      before: ai[aiKey] ?? null,
      after: after[rowKey] ?? null,
      // 空 → 値 は「AI が拾えなかったものを人が足した」= 追記。
      // 値 → 別の値 は取り違え = 誤り。**混ぜると直す先が分からない**
      type: b === '' ? 'enrich' : a === '' ? 'reject' : 'fix',
    });
  }
  // 要点は行ごとの対応が取れない（並びが変わる）ので、丸ごと1項目として扱う
  const beforePoints = JSON.stringify(ai.key_points ?? []);
  const afterPoints = JSON.stringify(after.key_points ?? []);
  if (beforePoints !== afterPoints) {
    diffs.push({
      fieldPath: 'key_points',
      before: ai.key_points ?? null,
      after: after.key_points ?? null,
      type: beforePoints === '[]' ? 'enrich' : 'fix',
    });
  }

  const all = ['subject', 'body_html', 'next_action', 'next_action_date', 'key_points'];
  if (diffs.length === 0) {
    // **無修正で通した**ことを残す。これが正解ラベルで、
    // 無いと「無修正採用率」の分母が壊れる
    await recordCorrections(out.id, [{ fieldPath: '(全体)', type: 'none' }], userId);
    return;
  }
  // 直さなかった項目も残す（分母）
  for (const col of all) {
    if (diffs.some((d) => d.fieldPath === col)) continue;
    diffs.push({ fieldPath: col, type: 'none' });
  }
  await recordCorrections(out.id, diffs, userId);
}

export const activityLogService = new ActivityLogService();
