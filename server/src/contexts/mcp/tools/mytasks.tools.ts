import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { myTasksService } from '../../tasks/services/my-tasks.service';
import { taskIntakeService, type TaskDraft } from '../../tasks/services/task-intake.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';

// 個人タスク・依頼・投入 (task_intake) の MCP ツール。
//
// 要件: docs/archive/2026/2026-07-25-collaboration-and-personal-agent.md (D3 / D4 / D5 / D9)
//
// 設計の芯:
//   朝会・ミーティング・隣の席で発生した口頭の依頼を、**投入テキスト経由**で
//   ストックに落とす。AI は下書きを出すだけで本登録はせず、人が確認して確定する。
//   投げたテキストは task_intake に全文で残り、後から遡ってレビューできる。

const DUE_AT_DESC =
  '期限 (YYYY-MM-DD HH:mm)。GMO イズムに従い **何月何日何時何分まで** を入れる。' +
  '「金曜まで」のように時刻が不明なときは 18:00 (終業時刻) を補完し due_time_assumed=true を立てる。' +
  '「今週中」「なるべく早く」など日付すら曖昧なときは **推測で埋めず** due_unclear=true にして人に聞く。';

const IMPORTANCE_DESC = '重要度 3=高 / 2=中 / 1=低 (既定 2)。緊急度との掛け算でスコア 1〜9 になる';
const URGENCY_DESC = '緊急度 3=高 / 2=中 / 1=低 (既定 2)。期限が無い場合は 1 として扱われる';

const DRAFT_SHAPE = {
  title: z.string().min(1).describe('やること (簡潔に)'),
  description: z.string().optional(),
  project_id: z.string().optional().describe('案件に紐づくなら案件 ID。個人タスクなら省略'),
  assigned_to: z.string().optional().describe('担当者の users.id (list_users で解決)'),
  requester_id: z.string().optional()
    .describe('依頼者の users.id。これがあると「依頼」になり期限が必須になる'),
  due_at: z.string().optional().describe(DUE_AT_DESC),
  importance: z.number().int().min(1).max(3).optional().describe(IMPORTANCE_DESC),
  urgency: z.number().int().min(1).max(3).optional().describe(URGENCY_DESC),
  due_time_assumed: z.boolean().optional()
    .describe('期限の時刻を AI が補完した場合 true。人に確認させるための印'),
  due_unclear: z.boolean().optional().describe('期限が曖昧で確定できない場合 true'),
  assignee_unclear: z.boolean().optional()
    .describe('「隣の席の人」「営業チーム」など宛先が特定できない場合 true'),
  quote: z.string().optional().describe('根拠になった投入テキストの引用'),
};

export function registerMyTaskTools(server: McpServer): void {
  // ══════════════════════════════════════════════
  // 投入 (intake)
  // ══════════════════════════════════════════════
  server.registerTool(
    'create_task_intake',
    {
      title: '投入を記録してタスク案を下書きする',
      description:
        '朝会・ミーティング・口頭で出た依頼や、議事録のテキストを投入して**下書きのタスク案を作る**。' +
        '\n\n**重要: このツールはタスクを本登録しない。** 人が確認して commit_task_intake を呼ぶまで、' +
        '受け手には一切見えない。AI の誤読がそのまま相手に飛ぶのを防ぐための 2 段階。' +
        '\n\nraw_text には**投げられた原文をそのまま**渡す (要約しない)。後から遡ってレビューする' +
        '一次資料になるため、切り詰めてはいけない。' +
        '\n\ndrafts には解析したタスク案を入れる。宛先が特定できない・期限が曖昧なものも' +
        '**捨てずに含める** (捨てると依頼そのものが消えて元の課題に戻る)。' +
        'その場合は assignee_unclear / due_unclear を立てれば、確認画面で人に聞く形になる。' +
        '\n\n議事録では「決まったこと」と「やること」が混ざる。**やること (命令形・依頼形・' +
        '期限のある文) だけを drafts にし**、決定事項は raw_text に残るので drafts に入れない。',
      inputSchema: {
        raw_text: z.string().min(1).describe('投げられた原文 (要約せずそのまま)'),
        kind: z.enum(['freeform', 'minutes', 'mail', 'chat', 'other']).default('freeform')
          .describe('freeform=自由入力 / minutes=議事録 / mail=メール / chat=チャット'),
        drafts: z.array(z.object(DRAFT_SHAPE)).default([])
          .describe('解析したタスク案。曖昧なものも印を立てて含める'),
        note: z.string().optional(),
        // Phase 2（prompt_version の全 kind 展開）。**任意のまま増やすだけ** — 毎時動く
        // メール取込スキルの後方互換が制約なので、必須にしない・既存引数は変えない
        prompt_version: z.string().max(100).optional()
          .describe('解析に使ったプロンプトの版 (例 intake-v2)。渡すと get_ai_feedback_digest の by_model で版ごとの成績を比較できる。任意'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const intake = await taskIntakeService.createIntake(
        {
          raw_text: args.raw_text,
          kind: args.kind,
          drafts: args.drafts as Omit<TaskDraft, 'draft_key'>[],
          note: args.note ?? null,
          requested_by: args.requested_by ?? null,
          tool_name: 'create_task_intake',
          // サービス側は最初から受け口を持っていた（「これが無いとプロンプト改善の
          // 前後を比較できない」）のに、MCP からは渡す口が無かった — ここで繋ぐ
          prompt_version: args.prompt_version ?? null,
        },
        currentActorId()
      );
      audit('create_task_intake', args,
        { created_id: intake.id, kind: intake.kind, draft_count: intake.drafts?.length ?? 0 },
        args.requested_by);
      return ok({
        ...intake,
        next_step:
          '内容を人に確認してもらい、採用するものだけ commit_task_intake に渡してください。' +
          'suggested_default が false のものは宛先か期限が足りないので、先に確認が必要です。',
      });
    })
  );

  server.registerTool(
    'commit_task_intake',
    {
      title: '確認済みのタスク案を本登録する',
      description:
        'create_task_intake で作った下書きのうち、**人が確認・修正して採用したものだけ**を登録する。' +
        '\n\n各タスクには create_task_intake が返した draft_key を必ず付けて渡す。' +
        'これで「AI が出した案」と「人が確定した内容」の差分が記録され、AI の精度が上がっていく。' +
        'draft_key を省略すると差分が取れず学習に使えない。' +
        '\n\n渡さなかった案は「不採用」として記録される (捨てたことも学習材料になる)。' +
        '\n\n依頼 (requester_id あり) は**期限が必須**。無いとエラーになる。',
      inputSchema: {
        intake_id: z.string().min(1),
        tasks: z.array(z.object({
          draft_key: z.string().min(1).describe('create_task_intake が返した draft_key'),
          ...DRAFT_SHAPE,
        })).min(1).describe('採用するタスク (人が修正した最終形)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const result = await taskIntakeService.commitIntake(
        args.intake_id,
        args.tasks as TaskDraft[],
        currentActorId(),
        // MCP は**案件を作る道具（`create_project` ほか）をすでに持っている**別経路で、
        // 鍵で認証している。ここだけ止めても意味が無いので通す
        // （画面の投入口は `sales` の編集権限を見る）
        true,
      );
      audit('commit_task_intake', args,
        { intake_id: args.intake_id, created_count: result.created_ids.length,
          created_ids: result.created_ids },
        args.requested_by);
      return ok(result);
    })
  );

  server.registerTool(
    'discard_task_intake',
    {
      title: '投入の下書きを破棄する',
      description:
        'タスク案が全部不要だった場合に破棄する。**投げた原文は残る** (投げた事実は消さない)。' +
        '全件が不採用として記録され、AI が「何を拾うべきでなかったか」を学べる。',
      inputSchema: {
        intake_id: z.string().min(1),
        note: z.string().optional().describe('破棄した理由 (あると AI の改善に効く)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const intake = await taskIntakeService.discardIntake(
        args.intake_id, currentActorId(), args.note ?? null);
      audit('discard_task_intake', args, { intake_id: args.intake_id }, args.requested_by);
      return ok(intake);
    })
  );

  server.registerTool(
    'list_task_intakes',
    {
      title: '投入ログ一覧',
      description:
        '過去に投げたテキストを一覧する。**後から遡ってレビューするための入口**。' +
        'status=pending で「確認待ち (宙に浮いている投入)」だけを取れる — ' +
        '投入したのに登録し忘れているものを催促するのに使う。' +
        'status=failed は**文字起こしが失敗した投入**（サーバーが途中で再起動して' +
        '止まったものを含む）。録音が消えたように見えている人を拾える。',
      inputSchema: {
        user_id: z.string().optional().describe('投入者で絞り込み (省略すると全員)'),
        // **録音の2つも渡せるようにする**（レビューでの指摘 #77）。
        // 止まった行は `pending` でも `committed` でもないので、
        // ここに無いと**どの絞り込みでも取り出せない**
        status: z.enum(['pending', 'committed', 'discarded', 'transcribing', 'failed']).optional(),
        kind: z.enum(['freeform', 'minutes', 'mail', 'chat', 'other']).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async (args) => runTool(async () =>
      ok(await taskIntakeService.list({
        userId: args.user_id, status: args.status, kind: args.kind, limit: args.limit,
      })))
  );

  server.registerTool(
    'get_task_intake',
    {
      title: '投入 1 件の詳細',
      description: '投げた原文・AI の下書き・そこから生まれたタスクをまとめて返す。',
      inputSchema: { intake_id: z.string().min(1) },
    },
    async (args) => runTool(async () => {
      const intake = await taskIntakeService.get(args.intake_id);
      const tasks = await taskIntakeService.listGeneratedTasks(args.intake_id);
      return ok({ ...intake, generated_tasks: tasks });
    })
  );

  // ══════════════════════════════════════════════
  // 依頼と個人タスク
  // ══════════════════════════════════════════════
  server.registerTool(
    'create_delegation',
    {
      title: '依頼または個人タスクを 1 件作る',
      description:
        '依頼や個人タスクを直接 1 件作る (投入テキストを介さない場合)。' +
        '\n\n- requester_id を渡すと「依頼」になり、**期限 (due_at) が必須**。' +
        '「いつまでに」の無い依頼は指示として成立していないため。' +
        '\n- project_id を省略すると案件に紐づかない個人タスクになる。' +
        '\n- 複数件をまとめて起票する場合や、元の会話を残したい場合は' +
        ' create_task_intake → commit_task_intake を使うこと (原文が一次資料として残る)。',
      inputSchema: {
        title: z.string().min(1),
        assigned_to: z.string().min(1).describe('担当者の users.id (list_users で解決)'),
        description: z.string().optional(),
        project_id: z.string().optional().describe('案件に紐づくなら案件 ID'),
        requester_id: z.string().optional()
          .describe('依頼者の users.id。指定すると依頼になり期限が必須'),
        due_at: z.string().optional().describe(DUE_AT_DESC),
        importance: z.number().int().min(1).max(3).optional().describe(IMPORTANCE_DESC),
        urgency: z.number().int().min(1).max(3).optional().describe(URGENCY_DESC),
        visibility: z.enum(['team', 'private']).default('team')
          .describe('private は本人のみ (チーム一覧では件数だけ数えて中身を隠す)'),
        source: z.string().optional().describe('verbal / meeting / mail / chat など'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const task = await myTasksService.createTask({
        title: args.title,
        description: args.description ?? null,
        project_id: args.project_id ?? null,
        assigned_to: args.assigned_to,
        requester_id: args.requester_id ?? null,
        due_at: args.due_at ?? null,
        importance: args.importance,
        urgency: args.urgency,
        visibility: args.visibility,
        source: args.source ?? null,
      }, currentActorId());
      audit('create_delegation', args,
        { created_id: task.id, title: task.title, assigned_to: task.assigned_to,
          is_delegation: !!task.requester_id },
        args.requested_by);
      return ok(task);
    })
  );

  server.registerTool(
    'respond_to_delegation',
    {
      title: '受けた依頼に返答する (承諾 / 相談 / 辞退)',
      description:
        '自分が受けた依頼に返答する。' +
        '\n\n**辞退・相談を選んでもタスクは消えない。** 依頼者の「出した依頼」に差し戻しとして' +
        '残り、依頼者が引き取るか振り直すか取り下げるまで残る。' +
        '消してしまうと「頼んだのに忘れられた」という元の課題に戻るため。',
      inputSchema: {
        task_id: z.string().min(1),
        user_id: z.string().min(1).describe('返答する人の users.id (自分が受けた依頼のみ返答可)'),
        decision: z.enum(['accepted', 'declined', 'consulting'])
          .describe('accepted=承諾 / declined=辞退 / consulting=相談したい'),
        note: z.string().optional().describe('理由やコメント (記録として description に残る)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const task = await myTasksService.respondToDelegation(
        args.task_id, args.user_id, args.decision, args.note ?? null);
      audit('respond_to_delegation', args,
        { task_id: args.task_id, decision: args.decision }, args.requested_by);
      return ok(task);
    })
  );

  server.registerTool(
    'list_my_tasks',
    {
      title: '自分のタスク一覧 (9 マス / スコア順)',
      description:
        '指定ユーザーのタスクを、案件タスクと個人タスクを**混ぜて**返す。' +
        '\n\n並び順は重要度 × 緊急度のスコア (1〜9) の降順 → 期限が近い順 → 重要度が高い順。' +
        'priority_cell は 9 マスのどのマスか (例 "3x1" = 重要 高 × 緊急 低 = 予定を取って守る)。' +
        '\n\n**同じスコアでも打ち手が真逆になる点に注意**: スコア 3 は「重要 高 × 緊急 低 ' +
        '(3x1) = 予定を取って守る」と「重要 低 × 緊急 高 (1x3) = 任せる・即片づけ」の 2 マスがある。' +
        '\n\n期限が無いタスクは緊急度 1 として扱われるため自然に下に沈む。',
      inputSchema: {
        user_id: z.string().min(1).describe('対象ユーザーの users.id'),
        include_completed: z.boolean().default(false),
        overdue_only: z.boolean().default(false).describe('期限超過のみ'),
        due_today: z.boolean().default(false).describe('今日が期限のもの (超過含む)'),
        limit: z.number().int().min(1).max(500).default(200),
      },
    },
    async (args) => runTool(async () =>
      ok(await myTasksService.listMyTasks(args.user_id, {
        includeCompleted: args.include_completed,
        overdueOnly: args.overdue_only,
        dueToday: args.due_today,
        limit: args.limit,
      })))
  );

  server.registerTool(
    'list_my_delegations',
    {
      title: '依頼の一覧 (受けた / 出した)',
      description:
        'direction=received で自分が受けた依頼、sent で自分が出した依頼を返す。' +
        '未承諾のものが先頭に来る。辞退・相談中のものも含まれる (差し戻しとして残るため)。' +
        '\n\n出した依頼で delegation_status が requested のまま日数が経っているものは、' +
        '相手が反応していないので催促の判断材料になる。',
      inputSchema: {
        user_id: z.string().min(1),
        direction: z.enum(['received', 'sent']).default('received'),
        include_done: z.boolean().default(false).describe('完了済みも含める'),
        limit: z.number().int().min(1).max(500).default(200),
      },
    },
    async (args) => runTool(async () =>
      ok(await myTasksService.listMyDelegations(args.user_id, args.direction, {
        includeDone: args.include_done, limit: args.limit,
      })))
  );

  server.registerTool(
    'get_my_task_summary',
    {
      title: '自分のタスク状況サマリー',
      description:
        '朝のブリーフや通知に使う件数のまとめを返す。' +
        '\n- pending_intakes: **投入したのに登録し忘れているもの** (宙に浮いている)' +
        '\n- unanswered_delegations: 受けたのに返答していない依頼' +
        '\n- overdue: 期限超過 / due_today: 今日が期限' +
        '\n- no_due_date: 期限が入っていないもの (イズム的に要修正)',
      inputSchema: { user_id: z.string().min(1) },
    },
    async (args) => runTool(async () => ok(await myTasksService.getMySummary(args.user_id)))
  );
}
