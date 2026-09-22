import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { classifyTextCorrection } from '../../../shared/services/ai-coverage';
import {
  recordAiOutput, recordCorrections, findLatestAiOutput, hasCorrections, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { formatActivity, isActivityAiConfigured } from './activity-ai.service';
import {
  needsShort, shortenNextAction, recordShortCorrections, NEXT_ACTION_SHORT_KIND,
} from './next-action-short.service';
import { sanitizeBodyHtml, sanitizeKeyPoints } from '../../../shared/services/html-sanitize';
import {
  normalizeActivityStruct, activityStructLength, type ActivityStruct,
} from '../../../shared/services/activity-struct';
import { assertCustomerCompanyId } from '../../../shared/services/company-directory.service';
import { OPEN_NEXT_ACTION_SQL } from '../../../shared/services/next-action-state';

/** `ai_outputs.kind`。**議事録とは別にする** — 直され方の傾向が別物なので混ぜない */
export const ACTIVITY_FORMAT_KIND = 'activity_format';

/**
 * `ai_outputs.kind`。**取込（MCP `create_activity_log`）で外の AI が書いた中身**。
 *
 * ⚠️ **`activity_format` と混ぜないこと。** 書き手が違います:
 *
 *   `activity_intake` … メール取込のスキルを動かしている Claude（本文を写す仕事）
 *   `activity_format` … サーバーの整形器（写された本文を意味の単位に分ける仕事）
 *
 * 混ぜると「短いのは取り込んだ人のせいか、整えた側のせいか」が分かりません。
 * 実際、着手前は**取込側が1行も記録されておらず**、
 * 「きわめて短いテキストでしか残らない」というご指摘に対して
 * **上流を数字で確かめる手段がありませんでした**（条件1の穴）。
 */
export const ACTIVITY_INTAKE_KIND = 'activity_intake';

/**
 * 取込の「プロンプト版」。**MCP ツールの `.describe()` が、外の AI にとってのプロンプト**です
 * （`mcp/tools/activities.tools.ts`）。だから describe を書き換えたらここを上げます。
 *
 * 上げないと、**contract を直した効果を後から数字で言えません**
 * （`ai_outputs.prompt_version` ごとの無修正採用率で比べる）。
 */
export const ACTIVITY_INTAKE_PROMPT_VERSION = 'mcp-intake-v1';

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

    // 並び順: 既定 = 活動日が新しい順。next_action = 未対応の次回アクション (期限が近い順) を先頭に。
    // **判定は共通の1本**（`OPEN_NEXT_ACTION_SQL`）— 前は式を写していたので、
    // **失注・完了した案件のやることが先頭に浮上していた**（ユーザー報告のゴミ）
    const orderBy = filter.sort === 'next_action'
      ? `ORDER BY (${OPEN_NEXT_ACTION_SQL}) DESC,
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
    // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
    // 「顧客ロールの会社か」を保証しない（レビュー指摘・PR #199 P2 の2巡目・
    // project.service.ts の create() と同じ理由）
    await assertCustomerCompanyId(customer_id);

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

          // **人がリクエストの中で待っている経路**。総予算で見張り、拾い直しは
          // 残り時間があるときだけ走る（`activity-ai.service` の `REQUEST_BUDGET_MS`）
          const s = await formatActivity(original, {
            requestBound: true,
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
              // **網羅量を残す**（条件1）。「短い」という指摘を後から数字で確かめられる
              coverage: s.coverage,
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
  /**
   * 直して保存する。
   *
   * ⚠️ **`humanReview` を渡すのは画面（`activity-logs.routes.ts` の PUT）だけ**です。
   *
   * ここは MCP の `update_activity_log` からも呼ばれます（案件の紐付けを足すだけ、等）。
   * **機械の更新を「人がレビューした」として数えると、無修正採用率が嘘になります** —
   * しかも `ai_corrections` に一度でも行が積まれると、あとから来た
   * **本物の人の修正が記録されなくなります**（同じ出力に二度積まないため。
   * Codex レビューでの指摘・PR #717）。
   *
   * **`userId` の有無で代用しないこと。** いまは MCP が渡していないだけで、
   * `create_activity_log` は `user_id` を必須で受け取っています。
   * 将来 `update_activity_log` にも足された日に、**この判定は黙って壊れます**。
   */
  async update(
    id: string, data: Record<string, unknown>, userId?: string | null,
    opts: { humanReview?: boolean } = {},
  ) {
    const existing = await queryOne(
      `SELECT id, customer_id, ai_output_id, ai_formatted, next_action, next_action_date, next_action_short,
              description, body_html, (body_struct IS NOT NULL) AS has_struct
         FROM activity_logs WHERE id = ? AND deleted_at IS NULL`, [id],
    ) as {
      id: string; customer_id: string | null; ai_output_id: string | null; ai_formatted: boolean;
      next_action: string | null; next_action_date: string | null; next_action_short: string | null;
      description: string | null; body_html: string | null; has_struct: boolean;
    } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');

    const { project_id, customer_id, activity_type, activity_date, subject, description, next_action, next_action_date } = data;
    if (activity_type !== undefined && !(ACTIVITY_TYPES as readonly string[]).includes(String(activity_type))) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `知らない活動種別です（${ACTIVITY_TYPES.join(' / ')} のどれか）`);
    }
    // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
    // 「顧客ロールの会社か」を保証しない（レビュー指摘・PR #199 P2 の2巡目）。
    // **実際に変わったときだけ確かめる**（レビュー指摘・PR #201 P1）— この UPDATE は
    // 毎回全置換で画面は今の customer_id を送り直すので、変化の有無を見ないと
    // あとから顧客ロールを外された会社の記録は無関係な直しまで止まってしまう
    if (customer_id !== existing.customer_id) {
      await assertCustomerCompanyId(customer_id);
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

    /*
     * ── やることを書き換えたら「済み」の印は捨てる ─────────────
     *
     * ⚠️ **これは黙って消える種類の不具合でした。** `update()` は
     * `next_action_done_at` を一切触らないので、**一度片づけた記録に
     * 新しい次回アクションを入れても、どのリストにも二度と出てきません**
     * （どの口も `next_action_done_at IS NULL` で絞るため）。
     * 画面はふつうに保存できたように見えるので、書いた本人にも気づけません。
     *
     * `postponeNextAction` が期限を動かすときに印を落とすのと同じ考え方で、
     * **中身か期限が変わったら未対応に戻す**。機械が閉じた理由
     * （`next_action_auto_closed_reason`）も一緒に捨てる — 人が新しく書いた
     * やることに「失注により終了」と出たら嘘になる。
     */
    const nextActionDateChanged = next_action_date !== undefined
      && String(next_action_date ?? '') !== String(existing.next_action_date ?? '');
    if (nextActionChanged || nextActionDateChanged) {
      sets.push('next_action_done_at=?', 'next_action_auto_closed_reason=?');
      params.push(null, null);
    }

    /*
     * **原文を差し替えたら、そこから作った整形結果は捨てる**（Codex レビューでの指摘・PR #717）。
     *
     * 画面（`ThreadCard`）は `body_struct` があればそちらを出し、待ち行列は
     * **`body_struct IS NULL` の行しか拾いません**（`activity-format.service` の `PENDING_SQL`）。
     * つまり本文だけ差し替えると、**新しい本文はどこにも出ず、古いまとめが残り続けます**。
     * 直したのに画面が変わらないので、直した人には理由が分かりません。
     *
     * ⚠️ **戻してよいのは「もう一度拾ってもらえる行」だけ**です。
     * `body_html` があって AI の印が無い行（人が書いた本文）は待ち行列の条件から外れるので、
     * ここで消すと**いま出ているものまで消えて、二度と戻りません**
     * （`redoFormat` が同じ理由で 400 を返しているのと同じ穴）。
     */
    const descriptionChanged = description !== undefined
      && String(description ?? '').trim() !== String(existing.description ?? '').trim();
    const canRequeue = !existing.body_html || existing.ai_formatted;
    if (descriptionChanged && existing.has_struct && canRequeue) {
      sets.push('body_struct=NULL', 'format_attempted_at=NULL', 'format_error=NULL');
    }

    await execute(
      `UPDATE activity_logs SET ${sets.join(', ')}, updated_at=NOW() WHERE id=?`,
      [...params, id],
    );
    const after = await this.getById(id) as Record<string, unknown>;
    /*
     * **人が画面で直したときだけ差分を残す**（上の `humanReview` の注意書き）。
     *
     * 整形側（`recordActivityCorrections`）にも同じ門を付けています — こちらは
     * 着手前から機械の更新で `(全体) none` を積んでいて、**無修正採用率を
     * 実際より高く見せていました**（Codex の指摘は取込側に対するものですが、
     * 根は同じで、門を1つだけ付けると片方だけ正しい数字になります）。
     */
    if (opts.humanReview) {
      if (existing.ai_formatted) await recordActivityCorrections(id, after, userId ?? null);
      // **取込（MCP）で AI が書いた本文の差分は、整形の有無と関係なく残す**（上の注意書き）
      await recordIntakeCorrections(id, after, userId ?? null);
    }
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
    // **人が押した完了は理由を持たない**（migration 245）。機械が閉じた印が
    // 残っていたら消す — 人が片づけたのに「失注により終了」と出るのは嘘になる
    await execute(
      `UPDATE activity_logs SET next_action_done_at=NOW(),
              next_action_auto_closed_reason=NULL, updated_at=NOW() WHERE id=?`,
      [id],
    );
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
    // 機械が閉じた理由も落とす — 人が期限を入れ直した以上、その行は
    // 「失注により終了」ではなく**その人が抱えているやること**になる
    await execute(
      `UPDATE activity_logs SET next_action_date=?, next_action_done_at=NULL,
              next_action_auto_closed_reason=NULL, updated_at=NOW() WHERE id=?`,
      [date, id],
    );
    return this.getById(id);
  }

  /**
   * 「次にやること」パネル（営業活動記録の帯）。
   *
   * ⚠️ **終わった案件（失注・完了）のやることは出さない**（`OPEN_NEXT_ACTION_SQL`）。
   * 前はここに除外が無く、**失注案件のやることが永久に帯へ並んでいました**
   * — 押して片づけない限り消えないので、本当にやるべきものが埋もれます。
   */
  async getUpcomingActions(userId: string, daysAhead: number = 7) {
    return await queryAll(
      `SELECT a.*, p.code as project_code, p.name as project_name, c.name as customer_name
       FROM activity_logs a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN companies c ON c.id = a.customer_id
       WHERE ${OPEN_NEXT_ACTION_SQL}
         AND a.user_id = ?
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

/**
 * 人が整えた本文を**膨らませたか**（書き足したか）。
 *
 * 構造（`body_struct`）は行ごとの対応が取れない（並びも件数も変わる）ので、
 * **画面に出る文字量**で見ます。2割以上増えていれば「AI が落としたものを
 * 人が足した」= 追記、それ以外は取り違えの直し。
 *
 * 判定が外れても失われるのは**分類の細かさだけ**（件数は必ず残る）なので、
 * 読めない値では `false`（＝今までどおり `fix`）に倒します。
 */
function structGrew(before: unknown, after: unknown): boolean {
  const b = activityStructLength(normalizeActivityStruct(before));
  const a = activityStructLength(normalizeActivityStruct(after));
  return b > 0 && a >= b * 1.2;
}

/**
 * 取込（MCP）で AI が書いたものを、人がどう直したかの差分を作る。**純関数**。
 *
 * ── なぜ `description` を数えるのが要るか ──────────────────────
 *
 * 整形側（`ACTIVITY_FORMAT_KIND`）の差分は `body_struct` などを見ていて、
 * **`description`（元の本文）を1度も見ていません**。ところが取込メールでは
 * **その本文を書いたのが AI**（取込スキルの Claude）です。
 * ここを数えないと、「本文が短い」という**上流の失敗だけが計測の外**に残ります。
 *
 * ── 整形側と二重に数えないための線引き ────────────────────────
 *
 * 数えるのは**取込 AI が書いた4つだけ**です。`body_struct` / `body_html` は
 * 整形器の仕事なので、こちらでは触りません（`kind` が別なので集計は混ざりませんが、
 * 同じ失敗を2つの kind で数えると、どちらを直せばよいか分からなくなる）。
 *
 * ネットワークにも DB にも触らないので素で試せます
 * （`shared/tests/activityIntakeDiff.test.ts`）。
 */
export function intakeDiffs(
  ai: Record<string, unknown>, after: Record<string, unknown>,
): CorrectionInput[] {
  const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  const FIELDS = ['subject', 'description', 'next_action', 'next_action_date'] as const;
  const diffs: CorrectionInput[] = [];

  /*
   * ⚠️ **整形器が埋めた値を、取込 AI の成績に数えない**（Codex レビューでの指摘・PR #717）。
   *
   * `mergeFormatted` は**行の `next_action` が空のときだけ**、本文から読み取った
   * 「次にやること」とその期限を埋めます（`activity-format.service`）。つまり
   * 取込が空で出したあとに値が入っていても、**それは整形器が書いたもの**です。
   *
   * ここを数えると、人が件名だけ直した最初の保存で、**機械が足した値まで
   * 「人が書き足した」として積まれます**。しかも一度積むと
   * `hasCorrections` が真になるので、**あとの本物の修正が永久に記録されません**。
   *
   * だから「次にやること」系は**取込 AI が値を出していたときだけ**比べます。
   * 取込が空だったぶんの取りこぼし（人があとから足した分）は数えられなくなりますが、
   * **整形器の仕事を取込のせいにするより、数えないほうがまし**です。
   *
   * `subject` / `description` は整形器が触らない（件名は上書きしない・本文は
   * 1バイトも触らない）ので、空から埋まったぶんも取込の取りこぼしとして数えます。
   */
  const FORMATTER_FILLS = new Set<string>(['next_action', 'next_action_date']);

  for (const col of FIELDS) {
    const b = norm(ai[col]);
    const a = norm(after[col]);
    if (b === a) continue;
    if (b === '' && FORMATTER_FILLS.has(col)) continue;   // 整形器が埋めた（上の注意書き）
    diffs.push({
      fieldPath: col,
      before: ai[col] ?? null,
      after: after[col] ?? null,
      /*
       * 値 → 空 は丸ごと捨てられた = 不採用。それ以外は
       * **書き足し（AI が落とした）と書き換え（AI が取り違えた）**を分ける。
       * `description` がよく書き足されるなら、直すのは整形器ではなく
       * **取込の contract（本文を要約するな）**のほうです。
       */
      type: a === '' ? 'reject' : classifyTextCorrection(ai[col], after[col]),
    });
  }

  // **1つも直っていない = 正解ラベル。** 無いと「無修正採用率」の分母が壊れる
  if (diffs.length === 0) return [{ fieldPath: '(全体)', type: 'none' }];
  // 直さなかった項目も残す（分母）
  for (const col of FIELDS) {
    if (diffs.some((d) => d.fieldPath === col)) continue;
    diffs.push({ fieldPath: col, type: 'none' });
  }
  return diffs;
}

/**
 * 取込の差分を記録する（条件2）。**best-effort** — 記録に失敗しても保存は壊さない。
 *
 * ⚠️ **`ai_formatted` を条件にしません。** 整形の差分（`recordActivityCorrections`）は
 * 整えた行だけが対象ですが、**取込の本文は整形される前から人に直されます**
 * （待ち行列に入ったまま案件詳細で直す）。条件を付けると、
 * **いちばん早く直された回＝いちばん強い信号**が落ちます。
 */
async function recordIntakeCorrections(
  id: string, after: Record<string, unknown>, userId: string | null,
): Promise<void> {
  const out = await findLatestAiOutput('activity_logs', id, ACTIVITY_INTAKE_KIND);
  if (!out) return;
  if (await hasCorrections(out.id)) return;   // 同じ出力に二度積まない
  await recordCorrections(out.id, intakeDiffs((out.payload ?? {}) as Record<string, unknown>, after), userId);
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
      /*
       * 空 → 値 は「AI が拾えなかったものを人が足した」= 追記。
       * 値 → 空 は丸ごと捨てられた = 不採用。
       * 値 → 別の値 は取り違え = 誤り。**混ぜると直す先が分からない**。
       *
       * ⚠️ **AI の文を残したまま人が書き足した場合も追記です**
       * （`classifyTextCorrection`）。ここを全部 `fix` にしていたので、
       * 「整形が短くて人が足している」が**どの数字にも出ませんでした**。
       */
      type: a === '' ? 'reject' : classifyTextCorrection(ai[aiKey], after[rowKey]),
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
      /*
       * **人が書き足したのか、直したのかを分ける**（上の本文と同じ理由）。
       * 構造は行ごとの対応が取れないので、**画面に出る文字量**で見ます
       * （`activityStructLength`）。2割以上増えていれば、AI が
       * **落としたものを人が足した**＝整形が短すぎたという信号です。
       */
      type: beforeStruct === 'null' ? 'enrich'
        : afterStruct === 'null' ? 'reject'
          : structGrew(ai.body_struct, after.body_struct) ? 'enrich' : 'fix',
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
