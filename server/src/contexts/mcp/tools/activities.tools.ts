import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  activityLogService, ACTIVITY_INTAKE_KIND, ACTIVITY_INTAKE_PROMPT_VERSION,
} from '../../sales/services/activity-log.service';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { MAX_ACTIVITY_CHARS } from '../../sales/services/activity-ai.service';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { ok, runTool, clampLimit, pagination, audit, REQUESTED_BY } from '../helpers';
/**
 * 「未対応の次回アクション」の判定は **1本だけ**（migration 245）。
 * MCP が画面と違う集合を返すと、AI の言う「対応漏れ」が人の見ている数と食い違う。
 */
import { OPEN_NEXT_ACTION_SQL } from '../../../shared/services/next-action-state';

// 営業活動記録 (activity_logs) の MCP ツール — activityLogService を再利用。
// activity_type の選択肢は UI (ActivityLogPage) と同一 (migration 115 で DB CHECK も整合済み)。

/**
 * 種類。**DB の CHECK（migration 184）と画面の選択肢と同じ集合**にすること。
 * 3か所のどれか1つが古いと、そこからは登録できるのに別の口で弾かれます。
 * `memo` は相手とのやり取りではない社内の書き置き（migration 184 でメモを畳んだ先）。
 */
const ACTIVITY_TYPES = ['call', 'email', 'visit', 'meeting', 'proposal', 'demo', 'follow_up', 'memo', 'other'] as const;

export function registerActivityTools(server: McpServer): void {
  server.registerTool(
    'list_activity_logs',
    {
      title: '営業活動記録一覧',
      description:
        '営業活動記録を一覧する。activity_type: call=電話, email=メール, visit=訪問, meeting=打合せ, proposal=提案, demo=デモ, follow_up=フォロー, other=その他。' +
        'upcoming: true にすると「次回アクションが days 日以内に予定されている記録」だけを返す (期限リマインド用)。' +
        'upcoming は失注・完了した案件のアクションを含まない (案件が終われば自動で完了扱いになる)。',
      inputSchema: {
        project_id: z.string().optional(),
        customer_id: z.string().optional(),
        user_id: z.string().optional().describe('担当者の users.id で絞り込み'),
        activity_type: z.enum(ACTIVITY_TYPES).optional(),
        search: z.string().max(100).optional().describe('件名 / 内容の部分一致'),
        upcoming: z.boolean().default(false).describe('true で次回アクション予定のみ (days 日以内)'),
        days: z.number().int().min(1).max(90).default(7).describe('upcoming の対象日数'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async (args) => runTool(async () => {
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;

      if (args.upcoming) {
        // getUpcomingActions は userId 必須のため、任意ユーザー対応の同形クエリをここで実行。
        //
        // ⚠️ **判定は共通の1本**（`OPEN_NEXT_ACTION_SQL`）。前はここが式を写していて、
        // しかも **projects を JOIN すらしていなかった**ので、
        // **失注・完了した案件のやることを AI に「期限が近い」と渡していた**
        // （AI がそれを見て催促を書けば、終わった話を客に送ることになる）。
        let where = `WHERE ${OPEN_NEXT_ACTION_SQL}
                     AND a.next_action_date <= (CURRENT_DATE + (? || ' days')::interval)::text`;
        const params: unknown[] = [args.days ?? 7];
        if (args.user_id) { where += ' AND a.user_id = ?'; params.push(args.user_id); }
        if (args.project_id) { where += ' AND a.project_id = ?'; params.push(args.project_id); }
        const rows = await queryAll(
          `SELECT a.*, u.name as user_name, p.code as project_code, p.name as project_name, c.name as customer_name
           FROM activity_logs a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN projects p ON p.id = a.project_id
           LEFT JOIN companies c ON c.id = a.customer_id
           ${where} ORDER BY a.next_action_date ASC LIMIT ?`,
          [...params, limit],
        );
        return ok({ data: rows, upcoming_days: args.days ?? 7 });
      }

      const { rows, total } = await activityLogService.list(
        {
          projectId: args.project_id,
          customerId: args.customer_id,
          userId: args.user_id,
          activityType: args.activity_type,
          search: args.search,
        },
        page, limit, (page - 1) * limit,
      );
      return ok({ data: rows, pagination: pagination(page, limit, Number(total)) });
    }),
  );

  server.registerTool(
    'list_overdue_actions',
    {
      title: '期限超過の次回アクション一覧',
      description:
        '進行中案件で、次回アクションの予定日が今日より前かつ未完了 (対応漏れ) のものを期限が古い順に返す。' +
        '定期リマインド / エスカレーション用途 (例: 毎朝このツールを叩いて Slack に「対応漏れ N件」を投稿する)。' +
        '各行に days_overdue (超過日数)・案件 (gls_number/project_name)・担当者 (assigned_to_name)・顧客名 を含む。' +
        'user_id を渡すとその担当者分だけに絞れる。' +
        'total は絞り込み条件に合う実数 (limit で頭打ちにならない)、returned は実際に返した行数。' +
        '失注・完了した案件のアクションは含まない (案件が終われば自動で完了扱いになる)。',
      inputSchema: {
        user_id: z.string().optional().describe('担当者の users.id で絞り込み (未指定なら全担当者)'),
        limit: z.number().int().min(1).max(200).default(100),
      },
    },
    async (args) => runTool(async () => {
      // 判定は共通の1本（`OPEN_NEXT_ACTION_SQL`・migration 245）。ここは前から
      // 終了案件を除いていたが、写しである限り**片方だけ直る**ので式ごと共有する
      let where = `WHERE ${OPEN_NEXT_ACTION_SQL}
                   AND p.deleted_at IS NULL
                   AND a.next_action_date < CURRENT_DATE::text`;
      const params: unknown[] = [];
      if (args.user_id) { where += ' AND a.user_id = ?'; params.push(args.user_id); }
      const from =
        `FROM activity_logs a
         JOIN projects p ON p.id = a.project_id
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN companies c ON c.id = p.customer_id
         ${where}`;
      const rows = await queryAll(
        `SELECT a.id AS activity_id, a.next_action, a.next_action_date,
                (CURRENT_DATE - a.next_action_date::date) AS days_overdue,
                a.project_id, p.code AS project_code, p.gls_number, p.name AS project_name, p.stage,
                a.user_id, u.name AS assigned_to_name, c.name AS customer_name
         ${from}
         ORDER BY a.next_action_date ASC LIMIT ?`,
        [...params, clampLimit(args.limit, 100)],
      );
      /*
       * ⚠️ **一覧と件数は同じ「FROM 〜 WHERE」から組む。**
       * `total: rows.length` は `LIMIT` に当たった瞬間から**実数と別のもの**になる
       * （既定 100 なら「対応漏れ 137 件」が永久に「100 件」と報告される）。
       * しかも**エラーは出ず、増えるほどズレが広がる**ので誰も報告できない
       * — 画面側で同じ嘘を直したときのメモが `dashboard.routes.ts` の
       * `NEXT_MOVES_CORE` の頭にある。**AI が読む数字なので害はより直接的**で、
       * 「対応漏れは100件で頭打ち」という誤った現状認識のまま報告が回る。
       */
      const totalRow = await queryOne(`SELECT COUNT(*)::int AS c ${from}`, params) as { c?: number } | undefined;
      return ok({ total: Number(totalRow?.c ?? 0), returned: rows.length, overdue_actions: rows });
    }),
  );

  server.registerTool(
    'create_activity_log',
    {
      title: '営業活動記録の登録',
      description:
        '営業活動 (商談・電話・メール等) を記録する。user_id は活動した営業担当の users.id (必須 — list_users で解決)。' +
        'メール/議事録取込フロー: list_customers →(無ければ create_customer)→ list_projects で案件特定 →(無ければ create_project)→ 本ツール。' +
        '次のアクションが決まっている場合は next_action / next_action_date を必ず記録する。' +
        '**メール自動取込では idempotency_key を必ず渡すこと** — 同じキーの記録が既にあれば再作成せず既存を返す (無人バッチの二重登録防止)。' +
        'message_id (由来メールの Message-ID) / source_channel (info@ 等) も分かれば渡す。同じメールから案件と活動記録を両方起票するときは ' +
        'idempotency_key を意図別に (例 "email:<Message-ID>:project" と "email:<Message-ID>:activity") 分けること。' +
        '**長い本文を複数の記録に分けるときは、キーにも通し番号を付けること** ' +
        '(例 ":activity:1" / ":activity:2") — 同じキーのままだと2件目以降が既存扱いで黙って捨てられる。' +
        '**description は要約せず本文をそのまま渡すこと** — 読める形に整えるのはサーバー側の整形器で、' +
        'ここで縮めると二重に縮んで画面に数行しか残らない (subject だけは短い言い切りでよい)。',
      inputSchema: {
        user_id: z.string().min(1).describe('活動した担当者の users.id (必須)'),
        activity_type: z.enum(ACTIVITY_TYPES),
        activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('活動日 (YYYY-MM-DD)'),
        subject: z.string().min(1).describe('件名'),
        project_id: z.string().optional().describe('関連する案件 ID (任意)'),
        customer_id: z.string().optional().describe('関連する顧客 ID (任意)'),
        /*
         * ⚠️ **上限は describe に書くだけでなく、ここで止めます**（Codex レビューでの指摘）。
         *
         * 止めないと、長すぎる本文でも**記録は作られてしまい**、あとから整形器が
         * `MAX_ACTIVITY_CHARS` で断って `format_error` を立てます。
         * つまり**整わない記録が静かに1件増えるだけ**で、呼んだ側は
         * 「分けて記録する」という正しい動きを取れません。
         *
         * **数字を書き写さない** — 整形器の上限（`MAX_ACTIVITY_CHARS`）そのものを使います。
         * 書き写すと、片方を動かした日にもう片方が黙って食い違います。
         */
        description: z.string().max(
          MAX_ACTIVITY_CHARS,
          `本文が長すぎます（上限 ${MAX_ACTIVITY_CHARS.toLocaleString()} 字）。要約せず、記録を分けてください`,
        ).optional().describe(
          '活動内容の本文。**要約しないこと。** メール取込なら、署名・引用返信・'
          + '定型文・フッターを除いた本文を**そのまま**入れる（往復があるなら往復のまま）。'
          + '読める形（状態・事実・誰の発言か）に分けるのは**サーバー側の整形器の仕事**で、'
          + 'ここで縮めると**縮んだものをさらに縮める**ことになり、画面には数行しか残らない。'
          + `上限 ${MAX_ACTIVITY_CHARS.toLocaleString()} 字（超えるとエラーになります。要約せず、記録を分けること。`
          + '**分けるときは idempotency_key にも通し番号を付ける** — 同じキーだと2件目が捨てられます）',
        ),
        next_action: z.string().optional().describe('次回アクション'),
        next_action_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('次回アクション予定日'),
        idempotency_key: z.string().max(200).optional()
          .describe(
            '冪等キー (メール取込は必須推奨。意図単位で一意に。例 "email:<Message-ID>:activity")。'
            + '同じキーが既存なら再作成しない。'
            + '⚠️ **長い本文を分けて記録するときは、キーにも通し番号を付けること** '
            + '(例 "email:<Message-ID>:activity:1" / ":2")。'
            + '同じキーのままだと**2件目以降が既存扱いで黙って捨てられます**',
          ),
        message_id: z.string().max(500).optional().describe('由来メールの Message-ID (紐付け・検索用)'),
        source_channel: z.string().max(100).optional().describe('流入チャネル (info@ / sales@cc / phone 等)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      // 冪等ガード: idempotency_key が既存なら再作成せず既存を返す
      if (args.idempotency_key) {
        const dup = await queryOne(
          'SELECT * FROM activity_logs WHERE idempotency_key = ? AND deleted_at IS NULL',
          [args.idempotency_key],
        ) as any;
        if (dup) {
          audit('create_activity_log', args, { existing_id: dup.id, idempotent: true }, args.requested_by);
          return ok({ created: false, existing: true, activity_log: dup, note: '同じ idempotency_key の活動記録が既にあるため再作成していません' });
        }
      }

      // activity_logs.user_id は users への FK のため、実在ユーザー id を service の userId として渡す
      const row = await activityLogService.create(
        {
          project_id: args.project_id,
          customer_id: args.customer_id,
          activity_type: args.activity_type,
          activity_date: args.activity_date,
          subject: args.subject,
          description: args.description,
          next_action: args.next_action,
          next_action_date: args.next_action_date,
        },
        args.user_id,
      ) as any;

      // 取込メタを後付けで保存 (service は未対応のため UPDATE)
      if (args.idempotency_key || args.message_id || args.source_channel) {
        await execute(
          `UPDATE activity_logs SET idempotency_key = COALESCE(?, idempotency_key),
                                    message_id = COALESCE(?, message_id),
                                    source_channel = COALESCE(?, source_channel)
           WHERE id = ?`,
          [args.idempotency_key ?? null, args.message_id ?? null, args.source_channel ?? null, row.id],
        );
      }
      /*
       * **外の AI が書いたものを全文で残す**（会社方針「AIを使い捨てにしない」条件1）。
       *
       * ⚠️ **`mcp_audit_log` では代わりになりません。** あちらは args を 1,000 字で
       * 切り詰めるので、**長い本文ほど中身が消えます**（`ai-output.service` の冒頭）。
       * 取込の失敗はまさに「本文が短い／落ちている」なので、切り詰めた記録では
       * **確かめたいことがちょうど見えません**。
       *
       * `model` は入れられません（どの Claude がこのスキルを動かしたかはサーバーから
       * 分からない）。代わりに **contract の版**（`.describe()` の版）を持ちます —
       * 直した効果は `prompt_version` ごとの無修正採用率で比べます。
       *
       * **best-effort。** 記録に失敗しても取込そのものは成功させる。
       */
      await recordAiOutput({
        kind: ACTIVITY_INTAKE_KIND,
        targetTable: 'activity_logs',
        targetId: row.id,
        payload: {
          subject: args.subject,
          description: args.description ?? null,
          next_action: args.next_action ?? null,
          next_action_date: args.next_action_date ?? null,
          activity_type: args.activity_type,
          activity_date: args.activity_date,
          // **本文の長さを添える**。整形側の `coverage.inputChars` と突き合わせると、
          // 「短いのは取り込んだ本文か、整えた結果か」がその場で分かる
          description_chars: typeof args.description === 'string' ? args.description.length : 0,
        },
        toolName: 'create_activity_log',
        promptVersion: ACTIVITY_INTAKE_PROMPT_VERSION,
        requestedBy: args.requested_by,
        messageId: args.message_id ?? null,
        sourceChannel: args.source_channel ?? null,
      });

      audit('create_activity_log', args, { created_id: row.id, subject: args.subject }, args.requested_by);
      return ok({ created: true, activity_log: { ...row, idempotency_key: args.idempotency_key ?? null, message_id: args.message_id ?? null, source_channel: args.source_channel ?? null } });
    }),
  );

  server.registerTool(
    'update_activity_log',
    {
      title: '営業活動記録の更新',
      description: '営業活動記録を部分更新する。渡したフィールドだけが変更される (サーバー側で既存値とマージ)。',
      inputSchema: {
        id: z.string().min(1),
        activity_type: z.enum(ACTIVITY_TYPES).optional(),
        activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        subject: z.string().min(1).optional(),
        project_id: z.string().nullable().optional(),
        customer_id: z.string().nullable().optional(),
        description: z.string().nullable().optional()
          .describe('本文。**原文を縮めて上書きしないこと** — ここは「打った文をみる」で'
            + '読み返される元の記録。縮めると元に戻せない。'
            + 'ここを差し替えると**整形結果（body_struct）は捨てられ、待ち行列で作り直されます**'
            + '（作り直しは裏で走るので、直後は原文のまま見えます）。'
            + 'ただし人が書いた本文の行（body_html があり AI の印が無い）は、'
            + '待ち行列の対象外なので整形結果を残します'),
        next_action: z.string().nullable().optional().describe('null で「次回アクション完了 (解除)」'),
        next_action_date: z.string().nullable().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      // service の update は全上書きのため read-merge-write
      const existing = await activityLogService.getById(args.id) as any;
      const fields = ['project_id', 'customer_id', 'activity_type', 'activity_date', 'subject',
                      'description', 'next_action', 'next_action_date'] as const;
      const merged: Record<string, unknown> = {};
      for (const f of fields) {
        const argVal = (args as Record<string, unknown>)[f];
        merged[f] = argVal !== undefined ? argVal : existing[f];
      }
      const row = await activityLogService.update(args.id, merged) as any;
      const changedFields = Object.keys(args).filter((k) => !['id', 'requested_by'].includes(k));
      audit('update_activity_log', args, { updated_id: args.id, changed_fields: changedFields }, args.requested_by);
      return ok({ updated: true, changed_fields: changedFields, activity_log: row });
    }),
  );
}
