import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { formatActivity, isActivityAiConfigured } from './activity-ai.service';
import {
  needsShort, shortenNextAction, recordShortCorrections, NEXT_ACTION_SHORT_KIND,
} from './next-action-short.service';
import { sanitizeBodyHtml, sanitizeKeyPoints } from '../../../shared/services/html-sanitize';
import { normalizeActivityStruct, type ActivityStruct } from '../../../shared/services/activity-struct';
import { assertCustomerCompanyId } from '../../../shared/services/company-directory.service';
import { OPEN_NEXT_ACTION_SQL } from '../../../shared/services/next-action-state';
import {
  ACTIVITY_FORMAT_KIND, ACTIVITY_INTAKE_KIND,
  normalizeDeleteReason, recordActivityCorrections, recordIntakeCorrections,
  recordExplicitReject, recordPostponeCorrection,
} from './activity-corrections.service';

/*
 * **既存の import 元を1つも書き換えないための再輸出。**
 * 正は `activity-corrections.service.ts`（差分を積む側）で、ここは業務の口。
 * MCP・整形・案件別の一覧・月次レビューは今までどおりここから読めます。
 */
export {
  ACTIVITY_FORMAT_KIND, ACTIVITY_INTAKE_KIND, ACTIVITY_INTAKE_PROMPT_VERSION,
  NEXT_ACTION_DELETE_REASONS, normalizeDeleteReason, intakeDiffs, stableJson,
  type NextActionDeleteReason,
} from './activity-corrections.service';

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

/** `update()` の追加の引数 */
export interface ActivityUpdateOpts {
  /**
   * **画面（`activity-logs.routes.ts` の PUT）だけ**が渡す。
   * 機械の更新を「人がレビューした」と数えると無修正採用率が嘘になる（下の注意書き）。
   */
  humanReview?: boolean;
  /**
   * 次のアクションを削除したときの理由（任意）。`NEXT_ACTION_DELETE_REASONS` の
   * コード、またはコード ` / ` 自由記入。**削除でない保存では無視される**。
   */
  nextActionDeleteReason?: string | null;
}

export interface ActivityLogFilter {
  projectId?: string;
  customerId?: string;
  userId?: string;
  /** 案件の担当者（`projects.assigned_to`）。`userId`（記録者）とは別。案件にひも付かない記録は落ちる */
  ownerId?: string;
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
    if (filter.ownerId) { where += ' AND p.assigned_to = ?'; params.push(filter.ownerId); }
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
    /*
     * 実施日（`event_start` / `event_day_count`）も返す（統合時に追加）。
     * 時系列の行にも案件別と同じ「10/24 ほか2日」を出すためで、
     * **数え方は activity-by-project.service.ts と同じ**
     * （project_dates ＋ projects.event_start / event_end の**重複を除いた数**）。
     * 2か所で違う数え方をすると、同じ案件が案件別では「ほか2日」・
     * 時系列では「ほか3日」と出て、どちらが正しいか誰にも言えなくなる。
     *
     * あわせて `ai_generated`（AI が「次のアクション」を立てた行か）も返す。
     * **判定は by-project と同じ1本**（整形 or 取込の出力に `next_action` が入っているか）。
     * 画面はこの値で AI の印を出し、**印が付いている行の削除だけ**が
     * 「時効なし」の否定の経路を通る（設計監査の要件16）。
     * `ai_formatted` / `ai_output_id` では、取込 AI が立てただけの行に印が出なかった。
     *
     * ⚠️ SQL は**テンプレートリテラル**なので、この中にバッククォートを書かないこと
     * （文字列がそこで終わり、eslint が Parsing error を出す）。説明はここに書く。
     */
    const rows = await queryAll(
      `SELECT a.*, u.name as user_name,
              p.code as project_code, p.name as project_name, p.gls_number as project_gls,
              c.name as customer_name,
              -- 実施日（下の ed。数え方は activity-by-project.service.ts と同じ）
              COALESCE(ed.day_count, 0) AS event_day_count,
              COALESCE(ed.first_day, NULLIF(btrim(p.event_start), '')) AS event_start,
              -- AI が「次のアクション」を立てた行か（判定は by-project と同じ1本）
              EXISTS (
                SELECT 1 FROM ai_outputs o
                 WHERE o.target_table = 'activity_logs' AND o.target_id = a.id
                   AND o.kind IN ('${ACTIVITY_FORMAT_KIND}', '${ACTIVITY_INTAKE_KIND}')
                   AND COALESCE(o.payload_snapshot->>'next_action', '') <> ''
              ) AS ai_generated,
              (ai.audit_id IS NOT NULL) as is_ai_created,
              ai.requested_by as ai_requested_by
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN companies c ON c.id = a.customer_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS day_count, MIN(d) AS first_day
           FROM (
             SELECT pd.date AS d FROM project_dates pd
              WHERE pd.project_id = p.id AND NULLIF(btrim(pd.date), '') IS NOT NULL
             UNION
             SELECT btrim(p.event_start) WHERE NULLIF(btrim(p.event_start), '') IS NOT NULL
             UNION
             SELECT btrim(p.event_end)   WHERE NULLIF(btrim(p.event_end), '') IS NOT NULL
           ) days
       ) ed ON TRUE
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
    opts: ActivityUpdateOpts = {},
  ) {
    const existing = await queryOne(
      `SELECT id, customer_id, ai_output_id, ai_formatted, next_action, next_action_date, next_action_short,
              description, body_html, body_edited_at, (body_struct IS NOT NULL) AS has_struct
         FROM activity_logs WHERE id = ? AND deleted_at IS NULL`, [id],
    ) as {
      id: string; customer_id: string | null; ai_output_id: string | null; ai_formatted: boolean;
      next_action: string | null; next_action_date: string | null; next_action_short: string | null;
      description: string | null; body_html: string | null; body_edited_at: Date | null;
      has_struct: boolean;
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
    /*
     * ── 手動で編集した本文を、毎晩の自動整形に消させない（migration 304）──
     *
     * 待ち行列（`activity-format.service` の `PENDING_SQL`）は
     * `body_struct IS NULL AND format_error IS NULL AND (body_html IS NULL OR ai_formatted)`
     * で拾います。画面の手動編集は **`body_html` を書いて `body_struct` を捨てる**
     * 形（AI の構造をやめて人の文章にする）なので、印を立てないと
     * **翌朝 3:00 に AI の構造で上書きされ、人が直した労力がそのまま消えます**。
     *
     * ⚠️ **印を立てるのは画面からの保存（`humanReview`）だけ**です。MCP の
     * `update_activity_log` は機械の更新で、これで止めると**取込の行が
     * 二度と整形されなくなります**（`humanReview` を付ける門と同じ理由）。
     *
     * **空文字が来たら印を消します** — 手で書いた本文を消すのは
     * 「AI の整形に戻す」という意思表示で、待ち行列に戻す道がこれしかありません。
     *
     * ⚠️ **この2列を『差分』の代わりにしないこと。** 何がどう間違っていたかは
     * 1バイトも入っていません。手動編集の中身は必ず下の
     * `recordBodyStructRejection` が `body_struct` の `reject` として積みます
     * （before に AI が作った構造の全文）。
     */
    const bodyManuallyEdited = data.body_html !== undefined && !!opts.humanReview;
    if (bodyManuallyEdited) {
      if (String(data.body_html ?? '').trim()) {
        sets.push('body_edited_at=NOW()', 'body_edited_by=?');
        params.push(userId ?? null);
      } else {
        sets.push('body_edited_at=NULL', 'body_edited_by=NULL');
      }
    }
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
    /*
     * ⚠️ **`body_struct` を明示的に渡されたときは、ここで2本目を積まないこと。**
     * 積むと `UPDATE ... SET body_struct=?, ..., body_struct=NULL` になり、
     * PostgreSQL が `multiple assignments to same column` で **500 を返します**
     * （実 DB に当てて確かめた）。本文の手動編集は
     * 「`body_html` を書く ＋ `body_struct: null` を送る」形なので、
     * **原文も一緒に直した回がちょうどこの組み合わせ**になります。
     * 渡された値のほうが新しい意思なので、そちらを優先します。
     */
    if (descriptionChanged && existing.has_struct && canRequeue && data.body_struct === undefined) {
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
    /*
     * **次のアクションを消したか**（`next_action: ''` が来て、元は値があった）。
     *
     * ⚠️ **これは呼び出し側に自己申告させません。** `opts` に「削除です」と
     * 書かせると、機械の更新から時効なしの経路に入れてしまえます。
     * **元の値と来た値を突き合わせてサーバーが決める**（`humanReview` と同じ作法）。
     */
    const nextActionDeleted = next_action !== undefined
      && String(next_action ?? '').trim() === ''
      && String(existing.next_action ?? '').trim() !== '';

    if (opts.humanReview) {
      /*
       * 差分を積む順番に意味があります。**時効なしの否定を最後に積む** —
       * `replaceCorrections` は同じ `output_id` × `field_path` を置き換えるので、
       * 先に積んだ7日窓ぶんの行を、理由（`note`）を持つ最終的な `reject` が上書きします。
       */
      if (existing.ai_formatted) await recordActivityCorrections(id, after, userId ?? null);
      // **取込（MCP）で AI が書いた本文の差分は、整形の有無と関係なく残す**（上の注意書き）
      await recordIntakeCorrections(id, after, userId ?? null, nextActionDeleted);

      /*
       * ① 次のアクションの削除 = **この製品で回収できるいちばん強い否定信号**。
       *    「AI が立てたやることが不要だった」が空のままだと、整形プロンプトは
       *    『やることを拾いすぎる』のを永久に直せません。
       *
       *    上の2本では取りこぼします — `recordActivityCorrections` は
       *    `ai_formatted` が真の行しか通さず（取込だけの行で落ちる）、
       *    どちらも7日窓なので**期限超過の行ではほぼ確実に落ちます**。
       *    だから**整形・取込の両方を時効なしで引き直して**必ず1行積みます。
       */
      if (nextActionDeleted) {
        await recordExplicitReject(
          id, 'next_action', [ACTIVITY_FORMAT_KIND, ACTIVITY_INTAKE_KIND],
          userId ?? null, normalizeDeleteReason(opts.nextActionDeleteReason),
        );
      }
      /*
       * ② 本文を手で書き直して AI の構造を捨てた = 構造そのものの否定。
       *    `redoFormat`（「整え直す」）が時効なしで `body_struct` の `reject` を
       *    積むのと**まったく同じ操作**なので、同じ扱いにします
       *    （人が押した「違う」に時効は無い）。
       *    これが無いと migration 304 の2列は「人が触った」フラグだけになり、
       *    **何がどう間違っていたかを1バイトも残さない**未達パターンに落ちます。
       */
      if (bodyManuallyEdited && existing.has_struct
          && data.body_struct !== undefined && normalizeActivityStruct(data.body_struct) === null) {
        await recordExplicitReject(id, 'body_struct', [ACTIVITY_FORMAT_KIND], userId ?? null, null);
      }
    }
    // **AI が作った一文を人が直した**ときだけ差分を残す（材料を変えて消えた回は誤りではない）
    //
    // ⚠️ **次のアクションを削除したときは、ここに `reject` を積まないこと**（意図的）。
    // 削除は「やること自体が不要だった」という整形器・取込への否定であって、
    // 「28字への短縮が下手だった」という否定ではありません。一緒に数えると
    // `next_action_short` の無修正採用率が**短縮の出来と無関係に下がり**、
    // 直す先を取り違えます。いまのコードは `nextActionChanged` で短い一文を
    // NULL に落とすだけ（`shortEdited` が偽なので呼ばれない）— **この挙動が正解**なので変えない。
    if (shortEdited) {
      await recordShortCorrections(id, (after.next_action_short as string | null) ?? null, userId ?? null)
        .catch(() => { /* 記録の失敗で保存を止めない */ });
    }
    return after;
  }

  async delete(id: string) {
    await execute(`UPDATE activity_logs SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL`, [id]);
  }

  /**
   * 次回アクションを完了にする (営業ダッシュボードのワンタップ操作用)。
   *
   * ⚠️ **ここでは `ai_corrections` に1行も積みません。これは意図的な判断です。**
   *
   * 完了は「AI が立てたやることが正しかった」証拠で、削除・延期とは**逆向きの信号**です。
   * 案件別の一覧では削除ボタンの隣に並ぶので、まとめて `reject` にしたくなりますが、
   * そうすると **AI が当たるほど無修正採用率が下がる**という逆さまの数字になります
   * （会社方針スキルの「正常な業務更新を誤りと数える」の変種）。
   *
   * 完了は**成果（条件3）の側**で数えます —
   * `ai-feedback.service.ts` が `next_action_done_at` と `next_action_date` を
   * 読み取り時に突き合わせ、「片づいた件数」「期限内に片づいた割合」を出します
   * （`ai_outcomes` に行は足しません。書き忘れた日から数字が嘘になるため）。
   *
   * **あとから誰かが「完了も記録しよう」と足さないこと。**
   */
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

  /**
   * 次回アクションの期限を延期する (営業ダッシュボードのワンタップ操作用)。
   *
   * ── 延期は「期限の読み取り」固有の誤りの信号（条件2）────────────
   *
   * 延期されたということは、AI が置いた期限が**近すぎた／根拠が無かった**ということです。
   * これは本文の良し悪しとは**直す場所が違います**（整形プロンプトの
   * 「期限の読み取り」の部分）。だから `next_action_date` の `fix` として積み、
   * 本文の `fix` と混ぜません。
   *
   * ⚠️ **時効なしで引きます。** 延期が押されるのはたいてい期限が近づいた／過ぎた
   * あとで、7日窓では**まず引っかかりません**（削除と同じ理由）。
   * ⚠️ **同じ行が何度も延期される**ので、`output_id` × `field_path` × 種別の
   * 重複は `replaceCorrections` が潰します（最後の1回だけが残る）。
   */
  async postponeNextAction(id: string, date: string, actorId: string | null = null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'VALIDATION_ERROR', '延期先の日付 (YYYY-MM-DD) を指定してください');
    }
    const existing = await queryOne(
      'SELECT id, next_action, next_action_date FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id],
    ) as { id: string; next_action: string | null; next_action_date: string | null } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    if (!existing.next_action) throw new AppError(400, 'VALIDATION_ERROR', '次回アクションが設定されていません');
    // 機械が閉じた理由も落とす — 人が期限を入れ直した以上、その行は
    // 「失注により終了」ではなく**その人が抱えているやること**になる
    await execute(
      `UPDATE activity_logs SET next_action_date=?, next_action_done_at=NULL,
              next_action_auto_closed_reason=NULL, updated_at=NOW() WHERE id=?`,
      [date, id],
    );
    // **記録の失敗で業務を止めない**（この製品の他の後処理と同じ）
    await recordPostponeCorrection(id, existing.next_action_date, date, actorId)
      .catch(() => { /* noop */ });
    return this.getById(id);
  }

  /**
   * 「次にやること」パネル（営業活動記録の帯）。
   *
   * ⚠️ **終わった案件（失注・完了）のやることは出さない**（`OPEN_NEXT_ACTION_SQL`）。
   * 前はここに除外が無く、**失注案件のやることが永久に帯へ並んでいました**
   * — 押して片づけない限り消えないので、本当にやるべきものが埋もれます。
   */
  /**
   * @param userId  記録者（`activity_logs.user_id`）。画面の `?user=`、未指定なら呼んだ本人
   * @param ownerId 案件の担当者（`projects.assigned_to`）。画面の `?owner=`。
   *   指定すると案件に紐づかない記録は出ない（一覧の `owner_id` と同じ意味）
   */
  async getUpcomingActions(userId: string, daysAhead: number = 7, ownerId?: string) {
    const params: unknown[] = [userId, daysAhead];
    let ownerSql = '';
    if (ownerId) { ownerSql = ' AND p.assigned_to = ?'; params.push(ownerId); }
    return await queryAll(
      `SELECT a.*, p.code as project_code, p.name as project_name, c.name as customer_name
       FROM activity_logs a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN companies c ON c.id = a.customer_id
       WHERE ${OPEN_NEXT_ACTION_SQL}
         AND a.user_id = ?
         AND a.next_action_date <= (CURRENT_DATE + (? || ' days')::interval)::text${ownerSql}
       ORDER BY a.next_action_date ASC`,
      params
    );
  }
}

export const activityLogService = new ActivityLogService();
