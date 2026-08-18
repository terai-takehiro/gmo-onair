import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, recordCorrections, findLatestAiOutput, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { formatActivity, isActivityAiConfigured } from './activity-ai.service';
import {
  needsShort, shortenNextAction, recordShortCorrections, NEXT_ACTION_SHORT_KIND,
} from './next-action-short.service';
import { sanitizeBodyHtml, sanitizeKeyPoints } from '../../../shared/services/html-sanitize';
import { normalizeActivityStruct, type ActivityStruct } from '../../../shared/services/activity-struct';

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
       LEFT JOIN companies c ON c.id = a.customer_id
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
       LEFT JOIN companies c ON c.id = a.customer_id
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
       LEFT JOIN companies c ON c.id = a.customer_id
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

    // **`body_html` / `key_points` は v1 の欄。** 整形器はもう作りませんが、
    // API から直接渡す経路（外の道具・過去の取込）を 400 で止めないので残します
    const bodyHtml = sanitizeBodyHtml(data.body_html);
    const keyPoints = sanitizeKeyPoints(data.key_points);
    let bodyStruct: ActivityStruct | null = normalizeActivityStruct(data.body_struct);
    let aiFormatted = false;
    let aiOutputId: string | null = null;
    let action = typeof next_action === 'string' ? next_action : null;
    let actionDate = typeof next_action_date === 'string' ? next_action_date : null;
    let formatError: string | null = null;
    /** 短い一文の記録（条件1）。**行を作ってから入れる** ので、いったん持っておく */
    let pendingShort: { source: string; short: string; model: string; promptVersion: string } | null = null;

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
          // **構造が組み立てられなかったら失敗として扱う。** 件名だけ差し替えて
          // 本文を残さないと、画面には整形前より薄いものが出る
          if (!s.struct) throw new Error('整えた本文が空でした');
          subject = s.subject;
          bodyStruct = s.struct;
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
              subject: s.subject, body_struct: s.struct,
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

    /*
     * **人が待っている画面のときだけ、短い一文もここで作る**（migration 190）。
     * 「次にやること」が長いと案件詳細の帯で文字が切れるので、AI に1行に収まる
     * 一文を作らせます（`next-action-short.service`）。
     *
     * ⚠️ **無人の取込（MCP / メール）では作りません。** ここは `wantFormat`（画面の
     * 「整えて記録する」）の中だけで、**すでに整形で待たせている同じ待ち時間に収めます**。
     * 取込に AI の待ちを足すと、最短1時間おきの無人バッチが遅くなり、
     * 落ちたときに**記録そのものが入らなくなります**（毎晩の定時実行が拾います）。
     *
     * **失敗しても記録は残す。** 短い一文が無いだけで、画面は規則で作った見出しに落ちます
     */
    let shortAction: string | null = null;
    let shortError: string | null = null;
    if (wantFormat && needsShort(action)) {
      try {
        const r = await shortenNextAction(String(action));
        shortAction = r.short;
        if (!shortAction) throw new Error('短い一文になりませんでした');
        pendingShort = { source: String(action), short: shortAction, model: r.model, promptVersion: r.promptVersion };
      } catch (e) {
        // **印を立てる。** 立てないと毎晩の定時実行が同じ行を呼び直して課金される
        shortError = ((e as Error).message || '短くできませんでした').slice(0, 500);
        console.error('[na-short] create failed:', shortError);
      }
    }

    const id = uuidv4();
    await execute(
      `INSERT INTO activity_logs
         (id, project_id, customer_id, user_id, activity_type, activity_date, subject, description,
          body_html, key_points, body_struct, ai_formatted, ai_output_id, next_action, next_action_date,
          next_action_short, next_action_short_error, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)`,
      [id, project_id || null, customer_id || null, userId, activity_type, activity_date,
       subject, original || (typeof description === 'string' ? description : null),
       bodyHtml, JSON.stringify(keyPoints),
       bodyStruct ? JSON.stringify(bodyStruct) : null,
       aiFormatted, aiOutputId,
       action || null, actionDate || null,
       shortAction, shortError, userId],
    );
    if (pendingShort) {
      // **材料と出力の全文を残す**（条件1）。行ができてから入れるので `target_id` が埋まる
      await recordAiOutput({
        kind: NEXT_ACTION_SHORT_KIND,
        targetTable: 'activity_logs',
        targetId: id,
        payload: { next_action: pendingShort.source, next_action_short: pendingShort.short },
        toolName: 'activity.next_action_short',
        model: pendingShort.model,
        promptVersion: pendingShort.promptVersion,
        actorId: userId ?? null,
      }).catch(() => { /* 記録の失敗で業務を止めない */ });
    }
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
      `SELECT id, ai_output_id, ai_formatted, next_action, next_action_short
         FROM activity_logs WHERE id = ? AND deleted_at IS NULL`, [id],
    ) as {
      id: string; ai_output_id: string | null; ai_formatted: boolean;
      next_action: string | null; next_action_short: string | null;
    } | undefined;
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
    if (data.body_struct !== undefined) {
      const s = normalizeActivityStruct(data.body_struct);
      sets.push('body_struct=?::jsonb');
      params.push(s ? JSON.stringify(s) : null);
    }

    /*
     * ── 短い一文（migration 190）の扱い ──────────────────────
     *
     * ⚠️ **材料が変わったら、短い一文は必ず捨てる。** `next_action` を直したのに
     * 前の要約が残ると、**帯には古いやることが出たまま**になります
     * （画面を見ても中身と食い違っていることに気づけません）。
     * 捨てれば毎晩の定時実行が作り直します。
     *
     * **人が短い一文自体を直したときはその値を採り**、`ai_corrections` に差分を残します
     * （条件2）。人が直した文を定時実行が上書きしないよう、印（`_error`）も消します。
     */
    const nextActionChanged = next_action !== undefined
      && String(next_action ?? '').trim() !== String(existing.next_action ?? '').trim();
    const shortEdited = data.next_action_short !== undefined;
    if (shortEdited) {
      const s = String(data.next_action_short ?? '').trim();
      sets.push('next_action_short=?', 'next_action_short_error=?');
      params.push(s || null, null);
    } else if (nextActionChanged) {
      sets.push('next_action_short=?', 'next_action_short_error=?');
      params.push(null, null);
    }

    await execute(
      `UPDATE activity_logs SET ${sets.join(', ')}, updated_at=NOW() WHERE id=?`,
      [...params, id],
    );
    const after = await this.getById(id) as Record<string, unknown>;
    if (existing.ai_formatted) await recordActivityCorrections(id, after, userId ?? null);
    // **AI が作った一文を人が直した**ときだけ差分を残す（材料を変えて消えた回は誤りではない）
    if (shortEdited) {
      await recordShortCorrections(id, (after.next_action_short as string | null) ?? null, userId ?? null)
        .catch(() => { /* 記録の失敗で保存を止めない */ });
    }
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
       LEFT JOIN companies c ON c.id = a.customer_id
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
/**
 * 鍵の並びを揃えて JSON 文字列にする（比較のためだけに使う）。
 *
 * **JSONB は鍵を並べ替えて保存します**（書いた並びと読み出す並びが違う）。
 * いまは比べる両側とも JSONB 経由なので並びは揃いますが、
 * **そこに寄りかかった比較は、片側が JS のオブジェクトのまま来た日に黙って壊れます**
 * — 中身が同じでも別物と判定され、差分が全部「人が直した」になります。
 */
export function stableJson(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = walk(o[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(walk(v));
}

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
  // 本文の構造（migration 188）も丸ごと1項目。**鍵の並びを揃えてから比べる**。
  //
  // いまは両側とも JSONB を読んだもので、**JSONB は鍵を並べ替えて保存する**
  // （`{v, subtitle, turns, lead}` → `{v, lead, turns, subtitle}`。実測）ため
  // 並びは揃っています。ただし**それに寄りかかると、片側を JS の
  // オブジェクトのまま渡す経路が1つ増えた日に、1文字も直していない行が
  // 全部「直した」に数えられます**（無修正採用率が意味を失う）。
  // 並びに依存しない比較にしておくこと。
  const beforeStruct = stableJson(ai.body_struct ?? null);
  const afterStruct = stableJson(after.body_struct ?? null);
  if (beforeStruct !== afterStruct) {
    diffs.push({
      fieldPath: 'body_struct',
      before: ai.body_struct ?? null,
      after: after.body_struct ?? null,
      type: beforeStruct === 'null' ? 'enrich' : afterStruct === 'null' ? 'reject' : 'fix',
    });
  }

  const all = ['subject', 'body_html', 'body_struct', 'next_action', 'next_action_date', 'key_points'];
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
