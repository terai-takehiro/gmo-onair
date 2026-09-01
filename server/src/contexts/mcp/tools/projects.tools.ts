import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { projectService } from '../../sales/services/project.service';
import { queryOne, execute } from '../../../shared/db/connection';
import { ok, runTool, clampLimit, pagination, preview, audit, REQUESTED_BY, currentActorId } from '../helpers';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { PROJECT_DRAFT_KIND } from '../../sales/services/project-ai-feedback.service';

// 案件管理 (sales) の MCP ツール — 既存の projectService を再利用。
// 書き込みは create / update (read-merge-write) / stage 変更 / GLS 発番。
// GLS 発番と失注 (e_lost) は confirm 2段階 (プレビュー→了承→実行)。

const STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'] as const;

// 正は `shared/src/constants/statuses.ts` の `PROJECT_STAGE` (docs/core-redesign-plan.md §3-7)。
// server は shared を import できない (`server/tsconfig.json` の rootDir) ため値を写している —
// ズレたら `shared/tests/stageLabels.test.ts` が落とす。変えるときは shared 側から
const STAGE_LABELS: Record<string, string> = {
  neta: 'ネタ', d_hold: 'D 仮押さえ', c_proposal: 'C 見積提案', b_verbal: 'B 口頭決定',
  a_won: 'A 受注済', s_completed: 'S 完了', e_lost: 'E 失注',
};

/**
 * update の read-merge-write 対象フィールド (project.service.ts update の UPDATE 文と一致させること)。
 *
 * **`notes` だけは列ではありません** (migration 184 で `projects.notes` を落とし、
 * メモはやり取り `activity_logs` の1件になりました)。既存行に `notes` が無いので
 * ラウンドトリップでは `undefined` になり、**明示的に渡したときだけ**
 * メモが1件足されます。これが欲しい挙動です — 案件を保存し直すたびに
 * 同じメモが積み上がると、やり取りがメモで埋まります。
 */
/**
 * `update_project` が実際に書き換える項目。
 *
 * ⚠️ **ここに無い項目は、受け取っても黙って捨てられます**（レビューでの指摘 #81）。
 * 引数としては受け付け、`changed_fields` にも並べ、`updated: true` を返すのに
 * **1文字も入っていません** — AI にも人にも「直った」と見えます。
 *
 * 実際に落ちていたのは **2段分類（`audience` / `project_category`）と
 * 登録の16項目（migration 170）** で、どれも `create_project` では受けている
 * ものです（作るときは入るのに、直すと入らない）。
 * **`projectService.update` が受ける項目を足したら、ここにも足すこと。**
 */
const UPDATE_FIELDS = [
  'name', 'customer_id', 'expected_amount', 'assigned_to', 'project_type',
  'event_start', 'event_end', 'broadcast_type', 'media_platform',
  'application_form', 'notes', 'customer_type',
  'box_url_internal', 'box_url_external', 'gls_category',
  // 2段分類（migration 182）。**`project_type` は両方から導かれる**ので、
  // これが落ちると「作るときは配信、直すとハイブリッド」のような食い違いになる
  'audience', 'project_category',
  // 登録の16項目のうち列を足したぶん（migration 165 / 170）
  'intake_channel', 'intake_confidence',
  'contact_name', 'recurrence', 'attendee_count', 'goal',
  // レギュラー案件（シリーズ）が持つ4つの取り決め（migration 262・regular-series.md §3）
  'recording_cadence', 'recording_per_day_count', 'fixed_studio_note',
  'episode_unit_price', 'billing_cycle',
] as const;

/** 一覧の返却行を要約列に絞る (p.* は列が多くコンテキストを圧迫するため) */
function trimProjectRow(row: any) {
  return {
    id: row.id,
    code: row.code,
    gls_number: row.gls_number,
    gls_category: row.gls_category,
    name: row.name,
    customer_name: row.customer_name,
    stage: row.stage,
    project_type: row.project_type,
    expected_amount: row.expected_amount,
    event_start: row.event_start,
    event_end: row.event_end,
    assigned_to_name: row.assigned_to_name,
    total_revenue: row.total_revenue,
    total_purchase: row.total_purchase,
    created_at: row.created_at,
  };
}

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      title: '案件一覧',
      description:
        // ラベルの正は shared/src/constants/statuses.ts（s_completed は「S 完了」。旧「案件終了」は使わない）
        '案件 (プロジェクト) を検索・一覧する。stage: neta=ネタ, d_hold=仮押さえ, c_proposal=見積提案, b_verbal=口頭決定, a_won=受注済, s_completed=完了, e_lost=失注。' +
        'tab: yomi=GLS未発番のヨミ案件, active=GLS発番済で進行中, completed=完了, lost=失注。' +
        'search 指定時は開催期間フィルタ (event_month/event_from/event_to) は無視され全期間から検索される。',
      inputSchema: {
        search: z.string().max(100).optional().describe('案件名 / 案件コード / GLS番号 / 顧客名の部分一致検索'),
        stage: z.enum(STAGES).optional(),
        tab: z.enum(['all', 'yomi', 'active', 'completed', 'lost']).optional(),
        gls_category: z.enum(['A', 'B']).optional().describe('A=案件（スタジオ） / B=プロジェクト（プロジェクト管理）'),
        event_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('開催月 (YYYY-MM)。イベント期間がこの月に重なる案件'),
        event_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('開催期間レンジ開始 (YYYY-MM-DD)。event_to とセットで指定'),
        event_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        sort_by: z.string().optional().describe('並び替えキー (未指定 = おすすめ順: 進行中優先 + イベント日近い順)'),
        sort_dir: z.enum(['asc', 'desc']).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async (args) => runTool(async () => {
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;
      const { rows, total } = await projectService.list(
        {
          search: args.search,
          stage: args.stage,
          tab: args.tab,
          glsCategory: args.gls_category,
          eventMonth: args.event_month,
          eventFrom: args.event_from,
          eventTo: args.event_to,
          sortBy: args.sort_by,
          sortDir: args.sort_dir,
        },
        page, limit, (page - 1) * limit,
      );
      return ok({ data: (rows as any[]).map(trimProjectRow), pagination: pagination(page, limit, Number(total)) });
    }),
  );

  server.registerTool(
    'get_project',
    {
      title: '案件詳細',
      description: '案件の詳細情報 (全フィールド + 仮スケジュール日程) と収支サマリー (売上 / 仕入 / 粗利 / 粗利率) を取得する。',
      inputSchema: {
        id: z.string().min(1).describe('案件 ID (list_projects で取得)'),
      },
    },
    async (args) => runTool(async () => {
      const [project, summary] = await Promise.all([
        projectService.getById(args.id),
        projectService.getSummary(args.id),
      ]);
      return ok({ ...(project as Record<string, unknown>), summary });
    }),
  );

  server.registerTool(
    'create_project',
    {
      title: '案件登録 (ヨミ)',
      description:
        '新規案件を**必ずヨミ (stage=neta) として**登録する（stage は渡しても無視する）。' +
        '段を進めるのは人の仕事で、受付（案件作成）はネタ行きだけを並べる。' +
        'customer_id は必須 — 先に list_customers で検索し、無ければ create_customer で作成する。' +
        'assigned_to は担当者の users.id (必須) — list_users で名前から解決する。' +
        'gls_category: A=案件（スタジオ） / B=プロジェクト（プロジェクト管理・工事や構築）。' +
        '副作用: BOX に案件フォルダが自動作成される。' +
        '**メール自動取込では idempotency_key を必ず渡すこと** — 同じキーの案件が既にあれば新規作成せず既存を返す (無人バッチの二重登録防止)。' +
        'message_id (由来メールの Message-ID) と source_channel (info@ / sales@cc / 電話 等) も分かれば渡す。' +
        '**intake_channel と intake_confidence も必ず渡すこと** — 受付の一覧が「どこから来た引き合いか」と' +
        '「案件になりそうか」を列に出す。分からないときは渡さない (推測で埋めない)。',
      inputSchema: {
        name: z.string().min(1).describe('案件名'),
        customer_id: z.string().min(1).describe('顧客 ID (list_customers で解決)'),
        gls_category: z.enum(['A', 'B']).describe('案件分類 A=スタジオ / B=ビジネス'),
        assigned_to: z.string().min(1).describe('担当者の users.id (list_users で名前→id を解決。必須)'),
        expected_amount: z.number().int().min(0).optional().describe('想定金額 (円・税抜)'),
        project_type: z.string().optional(),
        audience: z.enum(['with_audience', 'no_audience']).optional()
          .describe('客入れの有無。**分からなければ渡さない**（推測しない）'),
        project_category: z.enum(['broadcast', 'recording', 'event']).optional()
          .describe('案件分類 broadcast=配信/生放送 / recording=収録 / event=イベント（会場のみ）。'
            + '**audience と2つ揃って初めて標準工程が決まる**。分からなければ渡さない'),
        customer_type: z.enum(['internal', 'external']).optional()
          .describe('⚠️ **渡しても無視されます**（migration 192）。グループ内 / グループ外は '
            + '取引先マスターの印（companies.is_gmo_group）から自動で決まります。'
            + 'グループ会社なのに external になるときは、案件ではなく取引先マスターを直してください'),
        event_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('開催開始日 (YYYY-MM-DD)'),
        event_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dates: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().optional() }))
          .optional().describe('複数日程 (飛び日対応)。指定すると event_start/end は MIN/MAX に自動同期'),
        notes: z.string().optional()
          .describe('備考 (問合せ経緯など)。**やり取りに「メモ」として1件残ります**（案件の列ではありません）'),
        idempotency_key: z.string().max(200).optional()
          .describe('冪等キー (メール取込は必須推奨。意図単位で一意に。例 "email:<Message-ID>:project")。同じキーが既存なら再作成しない'),
        message_id: z.string().max(500).optional().describe('由来メールの Message-ID (紐付け・検索用)'),
        source_channel: z.string().max(100).optional().describe('流入チャネル (info@ / sales@cc / phone 等)'),
        // Phase 2（prompt_version の全 kind 展開）。**任意のまま増やすだけ** — 毎時動く
        // メール取込スキルの後方互換が制約なので、必須にしない・既存引数は変えない
        prompt_version: z.string().max(100).optional()
          .describe('起票に使ったプロンプトの版 (例 mail-intake-v3)。渡すと get_ai_feedback_digest の by_model で版ごとの無修正採用率を比較できる。任意'),
        intake_channel: z.enum(['mail', 'phone', 'inview', 'referral', 'web', 'meeting', 'other']).optional()
          .describe('引き合いの入口（リード経路）。ネタの一覧に列で出る。'
            + 'inview=定期内覧会の来場から / web=問い合わせフォーム（画面では「WEBフォーム」）。'
            + '**分からなければ渡さない**（推測しない）。'
            + 'グループ会社かどうかは取引先マスターが決めるので `group` は渡せない'),
        contact_name: z.string().max(200).optional().describe('この案件の窓口（例「宮田 里香 様（広報部）」）。会社の代表窓口とは別'),
        recurrence: z.enum(['single', 'regular']).optional()
          .describe('単発 single / レギュラー regular（回を持つ）。既定は single'),
        recording_cadence: z.enum(['weekly', 'biweekly', 'monthly_nth_weekday', 'none']).optional()
          .describe('レギュラー案件の収録の頻度（回を作るたびに聞かれては困る値・案件に1度だけ）。'
            + 'weekly=毎週 / biweekly=隔週 / monthly_nth_weekday=毎月第N◯曜日 / none=なし（日付を手で並べる）。'
            + 'recurrence=regular のときだけ意味を持つ'),
        recording_per_day_count: z.number().int().min(1).optional().describe('1日あたりの本数（基本◯本撮り）'),
        fixed_studio_note: z.string().max(200).optional().describe('固定セットの自由記述（例: 用賀 SKY STUDIO・3カメラ）'),
        episode_unit_price: z.number().int().min(0).optional()
          .describe('回の単価（円・今の値）。⚠️ 履歴ではない — 改定しても過去の回の金額は動かない'),
        billing_cycle: z.enum(['monthly_close', 'per_recording_date', 'contract_lump_sum']).optional()
          .describe('請求サイクル。monthly_close=月末締め（既定） / per_recording_date=収録日ごと / contract_lump_sum=契約一括'),
        attendee_count: z.number().int().min(0).optional().describe('規模（何名か）。**数で渡す** — 「150名」ではなく 150'),
        goal: z.string().max(500).optional().describe('やりたいこと。**お客様の言葉のまま**（要約しない）'),
        reply_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe('返事の期限 (YYYY-MM-DD)。相手を待たせている目安。**書かれていなければ渡さない**'),
        wants: z.string().max(200).optional().describe('求められているもの（見積 / 資料 / 相場感 など）'),
        stage: z.enum(['neta', 'd_hold', 'c_proposal', 'b_verbal']).optional()
          .describe('⚠️ **渡しても無視されます。AI が起こす案件は必ずネタ (neta) です。**'
            + '段を進めるのは人の仕事なので、`change_project_stage` を人が押してから動きます。'
            + '（引数を残してあるのは、渡している既存の呼び出しを 400 で落とさないためだけです）'),
        intake_confidence: z.enum(['high', 'mid', 'low']).optional()
          .describe('案件になりそうか。high=会社も日程も予算も読めた / mid=どれか欠ける / low=名刺程度。'
            + '**根拠が無ければ渡さない** — 受付はこの値で読む順を決めるので、当てずっぽうは害になる'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      // 冪等ガード: idempotency_key が既存なら BOX フォルダ等の副作用を起こさず既存を返す
      if (args.idempotency_key) {
        const dup = await queryOne(
          'SELECT * FROM projects WHERE idempotency_key = ? AND deleted_at IS NULL',
          [args.idempotency_key],
        ) as any;
        if (dup) {
          audit('create_project', args, { existing_id: dup.id, code: dup.code, idempotent: true }, args.requested_by);
          return ok({ created: false, existing: true, project: dup, note: '同じ idempotency_key の案件が既にあるため再作成していません' });
        }
      }

      const row = await projectService.create(
        {
          name: args.name,
          customer_id: args.customer_id,
          gls_category: args.gls_category,
          assigned_to: args.assigned_to,
          expected_amount: args.expected_amount,
          project_type: args.project_type,
          customer_type: args.customer_type,
          event_start: args.event_start,
          event_end: args.event_end,
          dates: args.dates,
          notes: args.notes,
          intake_channel: args.intake_channel,
          audience: args.audience,
          project_category: args.project_category,
          intake_confidence: args.intake_confidence,
          contact_name: args.contact_name,
          recurrence: args.recurrence,
          recording_cadence: args.recording_cadence,
          recording_per_day_count: args.recording_per_day_count,
          fixed_studio_note: args.fixed_studio_note,
          episode_unit_price: args.episode_unit_price,
          billing_cycle: args.billing_cycle,
          attendee_count: args.attendee_count,
          goal: args.goal,
          // reply_due / wants は列を落とした（案件台帳の項目整理 Phase A）ので渡さない。
          // 引数自体は下の inputSchema に残す — 本番のメール取込スキルが渡す呼び出しを
          // 400 で落とさないため（受け取るが使わない、確立パターン）。
          /*
           * ⚠️ **AI が起こす案件は必ずネタ。`args.stage` は受け取るが使わない**（ご判断）。
           *
           * 受付（案件作成の「自動で届いたもの」）は **ネタ行きだけ**を並べます
           * （`AI_INBOX_SQL`）。ここで仮押さえ以降を渡せると、その案件は
           * **受付を素通りして案件一覧に直接現れます** — つまり
           * **誰の目にも触れないまま進行中の案件が増えます**。
           * 段を進めるのは人の仕事なので、`change_project_stage` を人が押してから動かします。
           *
           * **引数は消しません**（`notes` と同じ理由）。本番のメール取込スキルが
           * 毎日この口を叩いており、**引数を消すと渡している呼び出しが 400 で落ちます**。
           * 受け取って無視するのが安全側です。
           */
          stage: 'neta',
        },
        currentActorId(),
      ) as any;

      // 取込メタ (idempotency_key) を後付けで保存 (service は未対応のため UPDATE)。
      // message_id / source_channel は列を落とした（案件台帳の項目整理 Phase A・読み手ゼロ）。
      // 実体は下の recordAiOutput が ai_outputs.message_id / ai_outputs.source_channel に残す。
      if (args.idempotency_key) {
        await execute(
          `UPDATE projects SET idempotency_key = COALESCE(?, idempotency_key)
           WHERE id = ?`,
          [args.idempotency_key ?? null, row.id],
        );
      }
      // フィードバックループ (会社方針「AI を使い捨てにしない」の条件1)。
      // **`mcp_audit_log` では足りない** — あちらは `args` を 1000 文字で切り詰める監査用で、
      // 教師データにならない。ここには**起票した内容の全文**を残し、
      // 受付 (v4 ②) で人が直したときの before にする (`project-ai-feedback.service`)。
      await recordAiOutput({
        kind: PROJECT_DRAFT_KIND,
        targetTable: 'projects',
        targetId: row.id,
        payload: {
          name: args.name, customer_id: args.customer_id, gls_category: args.gls_category,
          assigned_to: args.assigned_to, expected_amount: args.expected_amount ?? null,
          project_type: args.project_type ?? null, customer_type: args.customer_type ?? null,
          event_start: args.event_start ?? null, event_end: args.event_end ?? null,
          dates: args.dates ?? null, notes: args.notes ?? null,
        },
        toolName: 'create_project',
        promptVersion: args.prompt_version ?? null,
        actorId: currentActorId(),
        requestedBy: args.requested_by ?? null,
        sourceChannel: args.source_channel ?? null,
        messageId: args.message_id ?? null,
      });

      audit('create_project', args, { created_id: row.id, code: row.code, name: row.name }, args.requested_by);
      return ok({ created: true, project: { ...row, idempotency_key: args.idempotency_key ?? null, message_id: args.message_id ?? null, source_channel: args.source_channel ?? null } });
    }),
  );

  server.registerTool(
    'update_project',
    {
      title: '案件更新',
      description:
        '案件を部分更新する。渡したフィールドだけが変更される (サーバー側で既存値とマージ)。' +
        '日程を変更する場合のみ dates を全量で渡す (全置換)。gls_category は GLS 発番前のみ変更可。' +
        'ステージ変更は change_project_stage を使うこと (このツールでは変更できない)。',
      inputSchema: {
        id: z.string().min(1).describe('案件 ID'),
        name: z.string().min(1).optional(),
        customer_id: z.string().optional(),
        expected_amount: z.number().int().min(0).optional(),
        assigned_to: z.string().optional().describe('担当者の users.id (list_users で解決)'),
        project_type: z.string().optional(),
        audience: z.enum(['with_audience', 'no_audience']).optional()
          .describe('客入れの有無。**分からなければ渡さない**（推測しない）'),
        project_category: z.enum(['broadcast', 'recording', 'event']).optional()
          .describe('案件分類 broadcast=配信/生放送 / recording=収録 / event=イベント（会場のみ）。'
            + '**audience と2つ揃って初めて標準工程が決まる**。分からなければ渡さない'),
        project_type_other: z.string().nullable().optional(),
        event_start: z.string().nullable().optional().describe('YYYY-MM-DD。null で解除'),
        event_end: z.string().nullable().optional(),
        broadcast_type: z.string().nullable().optional(),
        media_platform: z.string().nullable().optional(),
        application_form: z.boolean().optional().describe('申込書受領フラグ'),
        notes: z.string().nullable().optional()
          .describe('備考。**やり取りに「メモ」として1件足します**（案件の列ではありません）。'
            + '同じ本文が既にあるときは足しません'),
        customer_type: z.enum(['internal', 'external']).optional()
          .describe('⚠️ **渡しても無視されます** — 取引先マスターの印から自動で決まります（migration 192）'),
        gls_category: z.enum(['A', 'B']).optional().describe('GLS 発番前のみ変更可'),
        dates: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().optional() }))
          .optional().describe('渡した場合のみ日程を全置換 (event_start/end も自動同期)'),
        recurrence: z.enum(['single', 'regular']).optional().describe('単発 single / レギュラー regular（回を持つ）'),
        recording_cadence: z.enum(['weekly', 'biweekly', 'monthly_nth_weekday', 'none']).nullable().optional()
          .describe('レギュラー案件の収録の頻度（案件に1度だけの取り決め）。null で解除。'
            + 'weekly=毎週 / biweekly=隔週 / monthly_nth_weekday=毎月第N◯曜日 / none=なし（日付を手で並べる）'),
        recording_per_day_count: z.number().int().min(1).nullable().optional().describe('1日あたりの本数。null で解除'),
        fixed_studio_note: z.string().max(200).nullable().optional().describe('固定セットの自由記述。null で解除'),
        episode_unit_price: z.number().int().min(0).nullable().optional()
          .describe('回の単価（円・今の値）。null で解除。⚠️ 改定しても過去の回の金額は動かない'),
        billing_cycle: z.enum(['monthly_close', 'per_recording_date', 'contract_lump_sum']).optional()
          .describe('請求サイクル。monthly_close=月末締め / per_recording_date=収録日ごと / contract_lump_sum=契約一括'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const existing = await projectService.getById(args.id) as Record<string, unknown>;

      // 発番後の gls_category 変更は service が黙って無視するため、明示的にエラーにする
      if (args.gls_category !== undefined && existing.gls_number &&
          args.gls_category !== existing.gls_category) {
        return ok({
          updated: false,
          error: 'GLS 発番済みのため gls_category はこのツールでは変更できません (採番し直しが必要なため、UI の「別GLSへ紐づけ / 分類を変更」から実施してください)',
        });
      }

      // read-merge-write: 渡されたフィールドだけ上書きし、未指定は既存値をラウンドトリップ
      // (projectService.update は全上書き仕様のため、省略フィールドが null 化される事故を防ぐ)
      const payload: Record<string, unknown> = {};
      for (const f of UPDATE_FIELDS) {
        const argVal = (args as Record<string, unknown>)[f];
        payload[f] = argVal !== undefined ? argVal : existing[f];
      }
      if (args.dates !== undefined) payload.dates = args.dates; // 明示指定時のみ全置換

      const row = await projectService.update(args.id, payload, currentActorId()) as any;
      /*
       * ⚠️ **「渡した項目」ではなく「実際に書き換えた項目」を返す。**
       * 前の版は `args` の鍵をそのまま並べていたので、**捨てた項目まで
       * 「変えました」と報告して**いました（AI はそれを見て次に進みます）。
       */
      const applied = new Set<string>(UPDATE_FIELDS);
      const changedFields = Object.keys(args)
        .filter((k) => !['id', 'requested_by'].includes(k))
        .filter((k) => applied.has(k) || k === 'dates');
      const ignored = Object.keys(args)
        .filter((k) => !['id', 'requested_by', 'dates'].includes(k))
        .filter((k) => !applied.has(k));
      audit('update_project', args, { updated_id: row.id, changed_fields: changedFields }, args.requested_by);
      return ok({
        updated: true,
        changed_fields: changedFields,
        // **捨てた項目は黙らない**（次に何を直せばよいかが分かる）
        ...(ignored.length ? { ignored_fields: ignored } : {}),
        project: row,
      });
    }),
  );

  server.registerTool(
    'change_project_stage',
    {
      title: '案件ステージ変更',
      description:
        '案件のステージを変更する。stage コードの意味は list_projects の説明を参照。' +
        'e_lost (失注) は重要操作のため、必ず confirm なしで一度実行してプレビューを取得し、' +
        'ユーザーの明示的な了承を得てから confirm: true で再実行すること (承認なしの confirm: true は禁止)。' +
        'd_hold への変更時、開催日が設定済みで予約が無ければ仮押さえ予約がカレンダーに自動作成される。',
      inputSchema: {
        id: z.string().min(1).describe('案件 ID'),
        stage: z.enum(STAGES),
        confirm: z.boolean().default(false).describe('e_lost のときのみ必要。プレビュー確認後に true'),
        lost_reason: z.string().optional().describe('失注理由 (e_lost のとき推奨)'),
        lost_reason_note: z.string().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const existing = await projectService.getById(args.id) as any;

      if (args.stage === 'e_lost' && !args.confirm) {
        return preview(
          `案件「${existing.name}」を失注 (E) にする`,
          [
            `現在のステージ: ${STAGE_LABELS[existing.stage] ?? existing.stage}`,
            `想定金額: ¥${Number(existing.expected_amount ?? 0).toLocaleString()}`,
            `記録される失注理由: ${args.lost_reason ?? '(未指定)'}${args.lost_reason_note ? ` / ${args.lost_reason_note}` : ''}`,
            'lost_at が記録され、一覧の失注タブへ移動する',
          ],
          '失注登録後もステージを戻すことは可能だが、失注日時・理由の記録が残る',
        );
      }

      const row = await projectService.changeStage(
        args.id, args.stage,
        { lost_reason: args.lost_reason, lost_reason_note: args.lost_reason_note },
        currentActorId(),
      ) as any;
      audit('change_project_stage', args, { id: row.id, from: existing.stage, to: args.stage }, args.requested_by);
      const note = args.stage === 'd_hold' && existing.event_start
        ? '開催日設定済みのため、予約が未登録なら仮押さえ予約がカレンダーに自動作成されています'
        : undefined;
      return ok({ updated: true, from: existing.stage, to: args.stage, ...(note ? { note } : {}), project: row });
    }),
  );

  server.registerTool(
    'issue_gls',
    {
      title: 'GLS 発番',
      description:
        '案件に GLS 番号を発番する (重要操作・取り消し不可)。必ず confirm なしで一度実行してプレビューを取得し、' +
        'ユーザーの明示的な了承を得てから confirm: true で再実行すること (承認なしの confirm: true は禁止)。' +
        '副作用: ステージ自動昇格 (neta/d_hold/c_proposal → b_verbal)、概算見積の確定売上への変換、BOX フォルダのリネーム。',
      inputSchema: {
        id: z.string().min(1).describe('案件 ID'),
        confirm: z.boolean().default(false).describe('プレビューをユーザーに確認してもらってから true'),
        broadcast_type: z.string().optional().describe('番組種別 (任意)'),
        media_platform: z.string().optional().describe('配信媒体 (任意)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const project = await projectService.getById(args.id) as any;
      // service と同じ前提チェックをプレビュー段階で行う (confirm 後に初めてエラーになる事故を防ぐ)
      if (project.gls_number) {
        return ok({ executed: false, error: `既に GLS 番号が発番済みです (${project.gls_number})` });
      }
      if (project.gls_category !== 'A' && project.gls_category !== 'B') {
        return ok({ executed: false, error: '案件分類 (gls_category) が未設定です。先に update_project で A/B を設定してください' });
      }

      const estRow = await queryOne(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount), 0) AS total FROM revenues
         WHERE project_id = ? AND status = 'estimate' AND deleted_at IS NULL`,
        [args.id],
      ) as any;

      if (!args.confirm) {
        const willPromote = ['neta', 'd_hold', 'c_proposal'].includes(project.stage);
        return preview(
          `案件「${project.name}」に GLS 番号を発番する`,
          [
            `発番系列: GLS-${project.gls_category} (${project.gls_category === 'A' ? 'スタジオ' : 'ビジネス'})`,
            willPromote
              ? `ステージ: ${STAGE_LABELS[project.stage] ?? project.stage} → B 口頭決定 に自動昇格`
              : `ステージ: ${STAGE_LABELS[project.stage] ?? project.stage} (変更なし)`,
            Number(estRow?.c ?? 0) > 0
              ? `概算見積 ${estRow.c} 件 (合計 ¥${Number(estRow.total).toLocaleString()}) が確定売上に変換され、請求キーが再生成される`
              : '変換対象の概算見積はなし',
            'BOX フォルダ名が OPP コード → GLS 番号 にリネームされる',
          ],
          'GLS 発番は取り消せません (分類変更は再採番になります)',
        );
      }

      const row = await projectService.issueGls(
        args.id,
        { broadcast_type: args.broadcast_type, media_platform: args.media_platform },
        currentActorId(),
      ) as any;
      audit('issue_gls', args, { id: row.id, gls_number: row.gls_number, stage: row.stage }, args.requested_by);
      return ok({ executed: true, gls_number: row.gls_number, stage: row.stage, project: row });
    }),
  );
}
