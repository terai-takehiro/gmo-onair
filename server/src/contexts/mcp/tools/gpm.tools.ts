import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  templateService, projectService, openItemService, phaseService, memberService, gpmTaskService,
  GPM_KINDS, STAGES, OPEN_ITEM_STATUSES, OPEN_ITEM_TO_KINDS, PHASE_STATES,
  MEMBER_SIDES, MEMBER_TIERS, assertGpmProjectId, isGpmProjectId, assertGpmMinutesId,
} from '../../gpm/services/gpm.service';
import {
  GPM_PROJECT_DRAFT_KIND, GPM_TASK_DRAFT_KIND,
} from '../../gpm/services/gpm-ai-feedback.service';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
/**
 * 見積・議事録・BOX フォルダは**案件と同じ道具**を再利用する（`gpm/index.ts` と同じ判断・
 * 同じコメント）。写すと、様式・プロンプト・行き先表を直した日から
 * プロジェクトの見積/議事録だけ古いままになる。
 */
import { estimateService, type Estimate } from '../../sales/services/estimate.service';
import { gpmEstimateSummary } from '../../gpm/services/gpm-estimate.service';
import { listMinutes, getMinutes, updateMinutes, deleteMinutes } from '../../sales/services/minutes.service';
import { createGpmFolderTree, GPM_FOLDER_PREVIEW } from '../../gpm/services/gpm-box-folder.service';
import { listProjectFolder } from '../../sales/services/project-box-files.service';
import { queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { ok, runTool, clampLimit, audit, preview, REQUESTED_BY, currentActorId } from '../helpers';

// プロジェクト管理 (GPM = GLS-B の案件を工程で管理する) の MCP ツール。
//
// HTTP 側 (`/api/v1/internal/gpm/*`) と**同じサービス層**を呼ぶ (`gpm.service.ts`)。
// GLS-B かどうかの確認 (`assertProject` / `assertGpmTask`) はサービスの中にあるので、
// この口から案件 (GLS-A) の行を触ることはできない。
//
// ⚠️ タスクは案件と同じ `project_tasks` の行。ガント用の細かい編集
// (start_date / progress / is_milestone / work_state / sort_order) は
// **この口 (create_gpm_task / update_gpm_task) がそのまま受ける**
// (GPM の画面にガント・かんばんが載った回で整備した。GLS-B かの確認
// = assertGpmTask を必ず通るのはこちらの口)。
// タスク間の依存関係 (先行→後続の矢印) だけは案件タスク側の
// add_task_dependency / remove_task_dependency / list_task_dependencies が
// GLS-B のタスクにもそのまま使える。

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 一覧の絞り込み: 束ねた5つ (planning/active/delivered/done/lost) と素の8段の両方を受ける */
const LIST_STAGES = [
  'all', 'planning', 'active', 'delivered', 'done', 'lost',
  'neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost',
] as const;

export function registerGpmTools(server: McpServer): void {
  // ══ 読み取り ═══════════════════════════════════════════════

  server.registerTool(
    'list_gpm_projects',
    {
      title: 'プロジェクト一覧 (GPM)',
      description:
        'プロジェクト管理 (GLS-B: 自社構築・グループ受託) のプロジェクトを一覧する。' +
        '各行に工程の進み具合 (phase_count/phase_done)・現在の工程・未確認事項の残数・' +
        '次のタスクと期限・最新見積の金額/版/状態・健全性 (health: overdue/stalled/snoozed/ok) が付く。' +
        '案件 (GLS-A) は list_projects を使うこと。',
      inputSchema: {
        stage: z.enum(LIST_STAGES).optional()
          .describe('絞り込み。planning=準備中(受注前4段) / active=進行中(a_won) / delivered=実施済・財務処理中(r_delivered) / done=完了 / lost=失注。素のステージ名 (neta 等) も可'),
        kind: z.enum(GPM_KINDS).optional().describe('self_build=自社構築 / group_order=グループ受託'),
        q: z.string().max(100).optional().describe('プロジェクト名・依頼元名・GLS番号の部分一致'),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => runTool(async () => {
      const rows = await projectService.list({ stage: args.stage, kind: args.kind, q: args.q });
      return ok({ total: rows.length, projects: rows.slice(0, clampLimit(args.limit, 50)) });
    }),
  );

  server.registerTool(
    'get_gpm_project',
    {
      title: 'プロジェクト詳細 (GPM)',
      description:
        'プロジェクト1件の詳細。工程 (phases: 配下タスクの数と完了数つき)・' +
        '未確認事項 (open_items)・体制 (members) が付く。' +
        'タスクの中身は list_gpm_tasks を project_id で絞って読む。',
      inputSchema: { id: z.string().min(1).describe('プロジェクト ID (projects.id)') },
    },
    async (args) => runTool(async () => {
      const row = await projectService.getById(args.id);
      if (!row) return ok({ error: 'プロジェクトが見つかりません', code: 'NOT_FOUND' });
      return ok(row);
    }),
  );

  server.registerTool(
    'list_gpm_tasks',
    {
      title: 'プロジェクトのタスク一覧 (GPM 横断)',
      description:
        'プロジェクト (GLS-B) のタスクを横断で一覧する。工程 (phase_label) と' +
        'プロジェクト名、ガント用の start_date / progress / is_milestone が付く。' +
        'visibility=private のタスクは担当者/作成者本人 (OAuth 連携時) にだけ出る。' +
        '案件 (GLS-A) のタスクは list_tasks を使うこと。',
      inputSchema: {
        status: z.enum(['all', 'open', 'done', 'overdue']).default('open')
          .describe('open=未完了 / done=完了 / overdue=期限超過 / all=全部'),
        project_id: z.string().optional().describe('プロジェクト ID で絞り込み'),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => runTool(async () => {
      const rows = await gpmTaskService.listAll({
        status: args.status, project_id: args.project_id, viewer_id: currentActorId(),
      });
      return ok({ total: rows.length, tasks: rows.slice(0, clampLimit(args.limit, 50)) });
    }),
  );

  server.registerTool(
    'list_gpm_open_items',
    {
      title: '未確認事項の一覧 (GPM)',
      description:
        'プロジェクトをまたいで未確認事項 (誰かの判断・回答待ち) を一覧する。' +
        '既定では未解決 (waiting/checking) のみ。to_kind は誰に訊いているか ' +
        '(client=発注者 / pm=PM会社 / vendor=業者 / internal=社内)。',
      inputSchema: {
        status: z.enum(['all', 'waiting', 'checking', 'resolved']).optional()
          .describe('waiting=回答待ち / checking=確認中 / resolved=解決済み / all=全部。未指定は未解決のみ'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await openItemService.listAll({ status: args.status });
      return ok(rows);
    }),
  );

  server.registerTool(
    'list_gpm_templates',
    {
      title: '標準工程テンプレート一覧 (GPM)',
      description:
        'プロジェクトの標準工程テンプレートを一覧する (工程と配下タスクの雛形・日数・役割つき)。' +
        'used_count はこのテンプレートから作られた進行中プロジェクトの数。' +
        'create_gpm_project の gpm_template_id に渡すとその工程が日付付きで展開される。',
      inputSchema: {},
    },
    async () => runTool(async () => ok(await templateService.list())),
  );

  // ══ プロジェクト ═══════════════════════════════════════════

  server.registerTool(
    'create_gpm_project',
    {
      title: 'プロジェクト作成 (GPM)',
      description:
        'プロジェクト (GLS-B) を作成する。gpm_template_id を渡すと標準工程が展開され、' +
        'started_on があれば工程とタスクに日付が付く (前の工程の終わりの翌日が次の始まり)。' +
        'customer_id 未指定は自社 (自社構築) 扱い。stage の既定は a_won (受注済み)。' +
        'GLS 番号はここでは採らない (受注ステージへの変更時に自動発番)。' +
        'notes はやり取りのメモ1件として残る (列ではない)。',
      inputSchema: {
        name: z.string().min(1).max(200).describe('プロジェクト名'),
        gpm_kind: z.enum(GPM_KINDS).default('self_build').describe('self_build=自社構築 / group_order=グループ受託'),
        customer_id: z.string().optional().describe('依頼元 (companies.id・list_customers で解決)。未指定は自社'),
        stage: z.enum(STAGES).optional().describe('既定 a_won。案件管理と同じ8段'),
        // 必須にしてある (create_project と同じ)。画面は「未指定なら自分」に落とせるが、
        // 静的キー経由の MCP は実行者が users の行ではないので、既定に頼ると FK で落ちる
        assigned_to: z.string().min(1).describe('担当者の users.id (list_users で解決・必須)'),
        pm_company: z.string().max(200).optional().describe('PM会社名'),
        started_on: z.string().regex(YMD).optional().describe('開始日 YYYY-MM-DD'),
        ends_on: z.string().regex(YMD).optional().describe('終了予定日 YYYY-MM-DD'),
        gpm_template_id: z.string().optional().describe('標準工程テンプレート ID (list_gpm_templates で解決)'),
        notes: z.string().max(4000).optional().describe('メモ (やり取りの1件として記録)'),
        prompt_version: z.string().max(50).optional()
          .describe('起票に使ったプロンプト/スキルの版 (AI 改善の効果測定に使う。分かる場合は渡す)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await projectService.create(
        {
          name: args.name, gpm_kind: args.gpm_kind, customer_id: args.customer_id,
          stage: args.stage, assigned_to: args.assigned_to, pm_company: args.pm_company,
          started_on: args.started_on, ends_on: args.ends_on,
          gpm_template_id: args.gpm_template_id, notes: args.notes,
        },
        currentActorId(),
      );
      // フィードバックループ (会社方針「AI を使い捨てにしない」の条件1)。
      // mcp_audit_log は 1000 文字で切る監査用なので、教師データはここに全文で残す。
      // 人が画面/MCP から直すと gpm-ai-feedback.service が差分を自動記録する (7日窓)
      await recordAiOutput({
        kind: GPM_PROJECT_DRAFT_KIND,
        targetTable: 'projects',
        targetId: String(row.id),
        payload: {
          name: args.name, gpm_kind: args.gpm_kind, customer_id: args.customer_id ?? null,
          stage: args.stage ?? null, assigned_to: args.assigned_to ?? null,
          pm_company: args.pm_company ?? null, started_on: args.started_on ?? null,
          ends_on: args.ends_on ?? null, gpm_template_id: args.gpm_template_id ?? null,
          notes: args.notes ?? null,
        },
        toolName: 'create_gpm_project',
        promptVersion: args.prompt_version ?? null,
        actorId: currentActorId(),
        requestedBy: args.requested_by ?? null,
      });
      audit('create_gpm_project', args, { created_id: row.id, name: args.name }, args.requested_by);
      return ok({ created: true, project: row });
    }),
  );

  server.registerTool(
    'update_gpm_project',
    {
      title: 'プロジェクト更新 (GPM)',
      description:
        'プロジェクトを部分更新する (渡したフィールドだけ変更)。' +
        'stage を変えると履歴 (project_stage_changes) に残り、a_won にすると GLS-B 番号を自動発番する ' +
        '(採れないときは gls_error が返るが更新自体は成功)。' +
        'pm_company / started_on / ends_on は null で「空にする」。' +
        'notes は同じ本文なら二重に記録しない。gpm_template_id は作成後に変更できない。',
      inputSchema: {
        id: z.string().min(1).describe('プロジェクト ID'),
        name: z.string().min(1).max(200).optional(),
        gpm_kind: z.enum(GPM_KINDS).optional(),
        customer_id: z.string().optional().describe('依頼元 (companies.id)'),
        stage: z.enum(STAGES).optional(),
        assigned_to: z.string().optional().describe('担当者の users.id'),
        pm_company: z.string().max(200).nullable().optional(),
        started_on: z.string().regex(YMD).nullable().optional(),
        ends_on: z.string().regex(YMD).nullable().optional(),
        notes: z.string().max(4000).optional().describe('メモを1件追記 (やり取りに残る)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const input: Record<string, unknown> = {};
      for (const f of ['name', 'gpm_kind', 'customer_id', 'stage', 'assigned_to',
        'pm_company', 'started_on', 'ends_on', 'notes'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      const row = await projectService.update(args.id, input, currentActorId());
      const changedFields = Object.keys(input);
      audit('update_gpm_project', args, { updated_id: args.id, changed_fields: changedFields }, args.requested_by);
      return ok({ updated: true, changed_fields: changedFields, project: row });
    }),
  );

  server.registerTool(
    'delete_gpm_project',
    {
      title: 'プロジェクト削除 (GPM・要確認)',
      description:
        'プロジェクトを削除する (soft delete)。一覧・詳細から消え、配下の工程・タスク・' +
        '未確認事項も見えなくなる。まず confirm なしで呼んでプレビューを取り、' +
        'ユーザーの明示的な了承を得てから confirm: true で再実行すること。',
      inputSchema: {
        id: z.string().min(1).describe('プロジェクト ID'),
        confirm: z.boolean().default(false),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await projectService.getById(args.id);
      if (!row) return ok({ error: 'プロジェクトが見つかりません', code: 'NOT_FOUND' });
      if (!args.confirm) {
        const phases = Array.isArray(row.phases) ? row.phases.length : 0;
        const openItems = Array.isArray(row.open_items) ? row.open_items.length : 0;
        return preview(
          `プロジェクト「${row.name}」を削除`,
          [
            `工程 ${phases} 件・未確認事項 ${openItems} 件も画面から見えなくなります`,
            row.gls_number ? `GLS番号 ${row.gls_number} が付いています (発番済み)` : 'GLS番号は未発番です',
          ],
          '削除は画面から元に戻せません',
        );
      }
      await projectService.remove(args.id);
      audit('delete_gpm_project', args, { deleted_id: args.id, name: row.name }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  // ══ 工程 ═══════════════════════════════════════════════════

  server.registerTool(
    'create_gpm_phase',
    {
      title: '工程を追加 (GPM)',
      description:
        'プロジェクトに工程を追加する (いちばん後ろに付く。位置は move_gpm_phase で動かす)。' +
        'state: todo=未着手 / doing=進行中 / blocked=停滞 / done=完了。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        label: z.string().min(1).max(100).describe('工程名'),
        state: z.enum(PHASE_STATES).optional().describe('既定 todo'),
        started_on: z.string().regex(YMD).optional(),
        ends_on: z.string().regex(YMD).optional(),
        role: z.string().max(100).optional().describe('担当の役割 (文字列)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await phaseService.create(args.project_id, {
        label: args.label, state: args.state, started_on: args.started_on,
        ends_on: args.ends_on, role: args.role,
      });
      audit('create_gpm_phase', args, { created_id: row.id, project_id: args.project_id, label: args.label }, args.requested_by);
      return ok({ created: true, phase: row });
    }),
  );

  server.registerTool(
    'update_gpm_phase',
    {
      title: '工程を更新 (GPM)',
      description:
        '工程を部分更新する (渡したフィールドだけ変更)。started_on / ends_on / role は null で「空にする」。' +
        'ガント相当の日程は started_on / ends_on で動かす。',
      inputSchema: {
        id: z.string().min(1).describe('工程 ID (get_gpm_project の phases[].id)'),
        label: z.string().min(1).max(100).optional(),
        state: z.enum(PHASE_STATES).optional(),
        started_on: z.string().regex(YMD).nullable().optional(),
        ends_on: z.string().regex(YMD).nullable().optional(),
        role: z.string().max(100).nullable().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const input: Record<string, unknown> = {};
      for (const f of ['label', 'state', 'started_on', 'ends_on', 'role'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      const row = await phaseService.update(args.id, input);
      audit('update_gpm_phase', args, { updated_id: args.id, changed_fields: Object.keys(input) }, args.requested_by);
      return ok({ updated: true, changed_fields: Object.keys(input), phase: row });
    }),
  );

  server.registerTool(
    'move_gpm_phase',
    {
      title: '工程の並びを動かす (GPM)',
      description: '工程を1つ上/下の工程と入れ替える。端では何もしない (moved: false)。',
      inputSchema: {
        id: z.string().min(1).describe('工程 ID'),
        dir: z.enum(['up', 'down']).describe('up=1つ前へ / down=1つ後ろへ'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const rows = await phaseService.move(args.id, args.dir);
      audit('move_gpm_phase', args, { moved_id: args.id, dir: args.dir, swapped: rows.length > 0 }, args.requested_by);
      return ok({ moved: rows.length > 0, phases: rows });
    }),
  );

  server.registerTool(
    'delete_gpm_phase',
    {
      title: '工程を削除 (GPM)',
      description:
        '工程を削除する。**配下のタスクは消えない** — 工程から外れて「工程なし」の束に残る ' +
        '(detached に外れた件数が返る)。タスクごと消したいときは delete_gpm_task を先に使う。',
      inputSchema: {
        id: z.string().min(1).describe('工程 ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const result = await phaseService.remove(args.id);
      audit('delete_gpm_phase', args, { deleted_id: args.id, detached: result.detached }, args.requested_by);
      return ok({ deleted: true, id: args.id, detached: result.detached });
    }),
  );

  // ══ タスク ═════════════════════════════════════════════════

  server.registerTool(
    'create_gpm_task',
    {
      title: 'プロジェクトにタスクを追加 (GPM)',
      description:
        'プロジェクト (GLS-B) にタスクを追加する。gpm_phase_id で工程に付ける (任意・' +
        'get_gpm_project の phases[].id)。期限は 18:00 の時刻付きで入り、「自分のタスク」にも出る。' +
        'ガント用の start_date (バーの左端)・progress (進捗%)・is_milestone (◆) もここで付けられる。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        due_date: z.string().regex(YMD).optional().describe('期限日 YYYY-MM-DD (18:00 として入る。ガントのバーの右端)'),
        start_date: z.string().regex(YMD).optional().describe('開始日 YYYY-MM-DD (ガントのバーの左端。未指定は期限日だけの1日バー)'),
        progress: z.number().int().min(0).max(100).optional().describe('進捗% (0-100・既定 0)'),
        is_milestone: z.boolean().optional().describe('マイルストーン (◆・単一日の節目) にする'),
        assigned_to: z.string().optional().describe('担当者の users.id (list_users で解決)'),
        gpm_phase_id: z.string().optional().describe('付ける工程の ID (同じプロジェクトのものだけ)'),
        prompt_version: z.string().max(50).optional()
          .describe('起票に使ったプロンプト/スキルの版 (AI 改善の効果測定に使う。分かる場合は渡す)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await gpmTaskService.create(
        args.project_id,
        {
          title: args.title, description: args.description, due_date: args.due_date,
          start_date: args.start_date, progress: args.progress, is_milestone: args.is_milestone,
          assigned_to: args.assigned_to, gpm_phase_id: args.gpm_phase_id,
        },
        currentActorId(),
      );
      // フィードバックループ (条件1)。人が直すと gpm-ai-feedback.service が差分を残す
      await recordAiOutput({
        kind: GPM_TASK_DRAFT_KIND,
        targetTable: 'project_tasks',
        targetId: String(row.id),
        payload: {
          project_id: args.project_id, title: args.title, description: args.description ?? null,
          due_date: args.due_date ?? null, start_date: args.start_date ?? null,
          progress: args.progress ?? null, is_milestone: args.is_milestone ?? null,
          assigned_to: args.assigned_to ?? null,
          gpm_phase_id: args.gpm_phase_id ?? null,
        },
        toolName: 'create_gpm_task',
        promptVersion: args.prompt_version ?? null,
        actorId: currentActorId(),
        requestedBy: args.requested_by ?? null,
      });
      audit('create_gpm_task', args, { created_id: row.id, project_id: args.project_id, title: args.title }, args.requested_by);
      return ok({ created: true, task: row });
    }),
  );

  server.registerTool(
    'update_gpm_task',
    {
      title: 'プロジェクトのタスクを更新 (GPM)',
      description:
        'プロジェクト (GLS-B) のタスクを部分更新する (渡したフィールドだけ変更)。' +
        'due_date / start_date / assigned_to / gpm_phase_id / description は null で「空にする」。' +
        'completed で完了/未完了を切り替える。ガント用の細かい編集もここで行う: ' +
        'start_date (バーの左端) / due_date (右端) / progress (進捗%) / is_milestone (◆) / ' +
        'work_state (止まり方) / sort_order (同じ工程内の並び)。',
      inputSchema: {
        id: z.string().min(1).describe('タスク ID'),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).nullable().optional(),
        due_date: z.string().regex(YMD).nullable().optional().describe('期限日 (ガントのバーの右端) / null で解除'),
        start_date: z.string().regex(YMD).nullable().optional().describe('開始日 (ガントのバーの左端) / null で解除'),
        progress: z.number().int().min(0).max(100).nullable().optional().describe('進捗% (0-100) / null で 0 に戻す'),
        is_milestone: z.boolean().optional().describe('マイルストーン (◆) かどうか'),
        work_state: z.enum(['todo', 'doing', 'waiting']).optional()
          .describe('止まり方 (todo=これから / doing=作業中 / waiting=待ち)。完了は completed で'),
        sort_order: z.number().int().optional().describe('同じ工程内の並び順 (小さいほど上)'),
        assigned_to: z.string().nullable().optional().describe('users.id / null で担当解除'),
        gpm_phase_id: z.string().nullable().optional().describe('付け替える工程 ID / null で工程から外す'),
        completed: z.boolean().optional().describe('完了状態の変更'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const input: Record<string, unknown> = {};
      for (const f of ['title', 'description', 'due_date', 'start_date', 'progress', 'is_milestone',
        'work_state', 'sort_order', 'assigned_to', 'gpm_phase_id'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      if (args.completed !== undefined) input.is_completed = args.completed;
      const row = await gpmTaskService.update(args.id, input, currentActorId());
      const changedFields = Object.keys(input);
      audit('update_gpm_task', args, { updated_id: args.id, changed_fields: changedFields }, args.requested_by);
      return ok({ updated: true, changed_fields: changedFields, task: row });
    }),
  );

  server.registerTool(
    'delete_gpm_task',
    {
      title: 'プロジェクトのタスクを削除 (GPM)',
      description: 'プロジェクト (GLS-B) のタスクを削除する (soft delete)。終わったタスクは消さずに completed にすること。',
      inputSchema: {
        id: z.string().min(1).describe('タスク ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await gpmTaskService.remove(args.id, currentActorId());
      audit('delete_gpm_task', args, { deleted_id: args.id }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  // ══ 未確認事項 ═════════════════════════════════════════════

  server.registerTool(
    'create_gpm_open_item',
    {
      title: '未確認事項を追加 (GPM)',
      description:
        'プロジェクトに未確認事項 (誰かの判断・回答待ち) を追加する。' +
        '「自分がやること」はタスク (create_gpm_task)、「相手の回答待ち」はこちら。' +
        'blocks には止まっている作業を書く。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        question: z.string().min(1).max(1000).describe('何を訊いているのか'),
        to_kind: z.enum(OPEN_ITEM_TO_KINDS).optional().describe('誰に (既定 client=発注者)'),
        to_name: z.string().max(100).optional().describe('相手の名前 (文字列)'),
        blocks: z.string().max(500).optional().describe('これが決まらないと止まる作業'),
        due_date: z.string().regex(YMD).optional().describe('回答の期限'),
        phase_id: z.string().optional().describe('関わる工程 ID (任意)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await openItemService.create(
        args.project_id,
        {
          question: args.question, to_kind: args.to_kind, to_name: args.to_name,
          blocks: args.blocks, due_date: args.due_date, phase_id: args.phase_id,
        },
        currentActorId(),
      );
      audit('create_gpm_open_item', args, { created_id: row.id, project_id: args.project_id }, args.requested_by);
      return ok({ created: true, open_item: row });
    }),
  );

  server.registerTool(
    'update_gpm_open_item',
    {
      title: '未確認事項を更新 (GPM)',
      description:
        '未確認事項を部分更新する (渡したフィールドだけ変更)。status を resolved にすると' +
        '解決日時と解決者が入り、戻すと消える。to_name / blocks / due_date は null で「空にする」。',
      inputSchema: {
        id: z.string().min(1).describe('未確認事項 ID'),
        question: z.string().min(1).max(1000).optional(),
        to_kind: z.enum(OPEN_ITEM_TO_KINDS).optional(),
        to_name: z.string().max(100).nullable().optional(),
        blocks: z.string().max(500).nullable().optional(),
        due_date: z.string().regex(YMD).nullable().optional(),
        status: z.enum(OPEN_ITEM_STATUSES).optional().describe('waiting / checking / resolved'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const input: Record<string, unknown> = {};
      for (const f of ['question', 'to_kind', 'to_name', 'blocks', 'due_date', 'status'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      const row = await openItemService.update(args.id, input, currentActorId());
      audit('update_gpm_open_item', args, { updated_id: args.id, changed_fields: Object.keys(input) }, args.requested_by);
      return ok({ updated: true, changed_fields: Object.keys(input), open_item: row });
    }),
  );

  server.registerTool(
    'delete_gpm_open_item',
    {
      title: '未確認事項を削除 (GPM)',
      description: '未確認事項を削除する (soft delete)。解決したものは消さずに status: resolved にすること。',
      inputSchema: {
        id: z.string().min(1).describe('未確認事項 ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await openItemService.remove(args.id);
      audit('delete_gpm_open_item', args, { deleted_id: args.id }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  // ══ 体制 (組織図のメンバー) ═════════════════════════════════

  server.registerTool(
    'add_gpm_member',
    {
      title: '体制にメンバーを追加 (GPM)',
      description:
        'プロジェクトの体制 (組織図) にメンバーを追加する。発注者・PM会社・業者など**社外の人も名前で登録できる** ' +
        '(案件の担当メンバー add_project_member とは別の表)。' +
        'group_label が同じ人は組織図で1つの箱にまとまる。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        name: z.string().min(1).max(100).describe('名前'),
        side: z.enum(MEMBER_SIDES).optional().describe('internal=社内 / client=発注者 / pm=PM会社 / vendor=業者 (既定 internal)'),
        tier: z.enum(MEMBER_TIERS).optional().describe('組織図の段 top / lead / unit (既定 unit)'),
        user_id: z.string().optional().describe('社内の人なら users.id (任意)'),
        org: z.string().max(100).optional().describe('所属 (会社名など)'),
        role: z.string().max(100).optional().describe('役割'),
        email: z.string().max(200).optional(),
        group_label: z.string().max(100).optional().describe('組織図の箱の名前'),
        badge: z.string().max(50).optional().describe('箱に出す札 (任意)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await memberService.add(args.project_id, {
        name: args.name, side: args.side, tier: args.tier, user_id: args.user_id,
        org: args.org, role: args.role, email: args.email,
        group_label: args.group_label, badge: args.badge,
      });
      audit('add_gpm_member', args, { created_id: row.id, project_id: args.project_id, name: args.name }, args.requested_by);
      return ok({ added: true, member: row });
    }),
  );

  server.registerTool(
    'update_gpm_member',
    {
      title: '体制のメンバーを更新 (GPM)',
      description: '体制のメンバーを部分更新する (渡したフィールドだけ変更。渡さない項目は保たれる)。',
      inputSchema: {
        id: z.string().min(1).describe('メンバー ID (get_gpm_project の members[].id)'),
        name: z.string().min(1).max(100).optional(),
        side: z.enum(MEMBER_SIDES).optional(),
        tier: z.enum(MEMBER_TIERS).optional(),
        user_id: z.string().nullable().optional(),
        org: z.string().max(100).nullable().optional(),
        role: z.string().max(100).nullable().optional(),
        email: z.string().max(200).nullable().optional(),
        group_label: z.string().max(100).nullable().optional(),
        badge: z.string().max(50).nullable().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const input: Record<string, unknown> = {};
      for (const f of ['name', 'side', 'tier', 'user_id', 'org', 'role', 'email', 'group_label', 'badge'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      const row = await memberService.update(args.id, input);
      audit('update_gpm_member', args, { updated_id: args.id, changed_fields: Object.keys(input) }, args.requested_by);
      return ok({ updated: true, changed_fields: Object.keys(input), member: row });
    }),
  );

  server.registerTool(
    'remove_gpm_member',
    {
      title: '体制からメンバーを外す (GPM)',
      description: '体制 (組織図) からメンバーを1人外す (物理削除・履歴は残らない)。箱の最後の1人が消えると箱も消える。',
      inputSchema: {
        id: z.string().min(1).describe('メンバー ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await memberService.remove(args.id);
      audit('remove_gpm_member', args, { removed_id: args.id }, args.requested_by);
      return ok({ removed: true, id: args.id });
    }),
  );

  server.registerTool(
    'reorder_gpm_members',
    {
      title: '体制のメンバーを並び替え (GPM)',
      description:
        '組織図のメンバーの並び順 (sort_order) を一括更新する。並びは段 (tier) の中の位置。' +
        '段をまたぐ移動は update_gpm_member の tier で行う。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        items: z.array(z.object({
          id: z.string().min(1),
          sort_order: z.number().int(),
        })).min(1).describe('{id, sort_order} の配列 (小さいほど上)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await memberService.reorder(args.project_id, args.items);
      audit('reorder_gpm_members', args, { project_id: args.project_id, count: args.items.length }, args.requested_by);
      return ok({ reordered: true, count: args.items.length });
    }),
  );

  // ══ 標準工程テンプレート ═══════════════════════════════════

  const TEMPLATE_PHASES = z.array(z.object({
    label: z.string().min(1).max(100).describe('工程名'),
    days: z.number().int().min(1).max(365).optional().describe('日数 (既定 5)'),
    role: z.string().max(100).optional().describe('担当の役割'),
    tasks: z.array(z.object({
      label: z.string().min(1).max(200).describe('タスク名'),
      days: z.number().int().min(1).max(365).optional().describe('日数 (既定 1)'),
      role: z.string().max(100).optional(),
      is_required: z.boolean().optional(),
    })).optional(),
  })).max(50);

  server.registerTool(
    'create_gpm_template',
    {
      title: '標準工程テンプレートを作成 (GPM)',
      description:
        'プロジェクトの標準工程テンプレートを作成する。phases に工程と配下タスクの雛形を' +
        '順番どおりに渡す。作成後のプロジェクトには影響しない (写して使うため)。',
      inputSchema: {
        name: z.string().min(1).max(100).describe('テンプレート名'),
        key: z.string().max(50).optional().describe('識別キー (未指定は自動)'),
        icon: z.string().max(50).optional(),
        description: z.string().max(500).optional(),
        sort_order: z.number().int().optional(),
        phases: TEMPLATE_PHASES.optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await templateService.create(
        {
          name: args.name, key: args.key, icon: args.icon,
          description: args.description, sort_order: args.sort_order, phases: args.phases,
        },
        currentActorId(),
      );
      audit('create_gpm_template', args, { created_id: row.id, name: args.name }, args.requested_by);
      return ok({ created: true, template: row });
    }),
  );

  server.registerTool(
    'update_gpm_template',
    {
      title: '標準工程テンプレートを更新 (GPM)',
      description:
        'テンプレートを更新する。⚠️ phases を渡すと**工程一式がまるごと置き換わる** — ' +
        '一部だけ直すときも list_gpm_templates で現状を読み、全体を組み立てて渡すこと。' +
        '展開済みのプロジェクトには影響しない。',
      inputSchema: {
        id: z.string().min(1).describe('テンプレート ID'),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().max(50).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        sort_order: z.number().int().optional(),
        phases: TEMPLATE_PHASES.optional().describe('渡すと全置換'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const input: Record<string, unknown> = {};
      for (const f of ['name', 'icon', 'description', 'sort_order', 'phases'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      const row = await templateService.update(args.id, input, currentActorId());
      audit('update_gpm_template', args, { updated_id: args.id, changed_fields: Object.keys(input) }, args.requested_by);
      return ok({ updated: true, changed_fields: Object.keys(input), template: row });
    }),
  );

  server.registerTool(
    'delete_gpm_template',
    {
      title: '標準工程テンプレートを削除 (GPM・要確認)',
      description:
        'テンプレートを削除する (最初から入っている is_system は消せない)。' +
        '展開済みのプロジェクトには影響しないが、次に作る人が同じ工程を組み直すことになる。' +
        'まず confirm なしで呼んでプレビューを取り、了承を得てから confirm: true で再実行すること。',
      inputSchema: {
        id: z.string().min(1).describe('テンプレート ID'),
        confirm: z.boolean().default(false),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await templateService.getById(args.id);
      if (!row) return ok({ error: 'テンプレートが見つかりません', code: 'NOT_FOUND' });
      if (!args.confirm) {
        return preview(
          `標準工程テンプレート「${row.name}」を削除`,
          [`このテンプレートから作られた進行中プロジェクト: ${row.used_count ?? 0} 件 (影響はしない)`],
          '削除は画面から元に戻せません',
        );
      }
      await templateService.remove(args.id);
      audit('delete_gpm_template', args, { deleted_id: args.id, name: row.name }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  // ══ 見積 (⑥ 見積・請求) ═══════════════════════════════════
  // `estimates` を案件と共用する (`gpm/index.ts` と同じ理由)。この口は
  // **プロジェクト (GLS-B) の見積しか触らせない** (isGpmProjectId で確かめる)。
  // PDF 発行 (バイナリ) は screen 専用のままにする — MCP は JSON の read/write に絞る。

  const SUBMIT_TO = ['self', 'client', 'pm'] as const;

  async function assertGpmEstimate(id: string): Promise<Estimate> {
    const row = await estimateService.getById(id);
    if (!row || !(await isGpmProjectId(row.project_id))) {
      throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    }
    return row;
  }

  server.registerTool(
    'list_gpm_estimates',
    {
      title: 'プロジェクトの見積一覧 (GPM)',
      description:
        'プロジェクトの見積を新しい版から一覧する (版はまとめず全部・既定はアーカイブ除く)。' +
        '承認できるかは approve_gpm_estimate を呼んで判定する (見て判断しない)。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        include_archived: z.boolean().default(false),
      },
    },
    async (args) => runTool(async () => {
      await assertGpmProjectId(args.project_id);
      return ok(await estimateService.listByProject(args.project_id, args.include_archived));
    }),
  );

  server.registerTool(
    'get_gpm_estimate_summary',
    {
      title: 'プロジェクト見積のまとめ (GPM)',
      description: '全プロジェクト横断の見積サマリー (未提出・提出済み・検収待ちの件数と金額)。ダッシュボードのKPI用。',
      inputSchema: {},
    },
    async () => runTool(async () => ok(await gpmEstimateSummary())),
  );

  server.registerTool(
    'get_gpm_estimate',
    {
      title: 'プロジェクトの見積詳細 (GPM)',
      description: '見積1本を明細つきで取得する。',
      inputSchema: { id: z.string().min(1).describe('見積 ID') },
    },
    // `assertGpmEstimate` が投げる AppError(404) はそのまま runTool に処理させる —
    // 素の catch で握ると、DB 接続断のような無関係な失敗まで「見積が見つかりません」
    // に化けて runTool の isError も付かず、呼び出し側が失敗に気づけなくなる
    async (args) => runTool(async () => ok(await assertGpmEstimate(args.id))),
  );

  server.registerTool(
    'create_gpm_estimate',
    {
      title: 'プロジェクトの見積を作成 (GPM)',
      description:
        'プロジェクトに見積 (v1) を作る。submit_to (提出先) は必須 — ' +
        '自社への社内見積か PM会社への見積かで中身が変わるため。明細は update_gpm_estimate_items で追加する。',
      inputSchema: {
        project_id: z.string().min(1).describe('プロジェクト ID'),
        submit_to: z.enum(SUBMIT_TO).describe('self=自社 / client=依頼元 / pm=PM会社'),
        title: z.string().max(200).optional(),
        tax_category: z.string().max(20).optional().describe('既定 tax10'),
        valid_until: z.string().regex(YMD).optional().describe('見積の有効期限'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await estimateService.createForGpm(
        args.project_id,
        { title: args.title, submit_to: args.submit_to, tax_category: args.tax_category, valid_until: args.valid_until },
        currentActorId(),
      );
      audit('create_gpm_estimate', args, { created_id: row.id, project_id: args.project_id }, args.requested_by);
      return ok({ created: true, estimate: row });
    }),
  );

  server.registerTool(
    'update_gpm_estimate_items',
    {
      title: '見積の明細を置き換える (GPM)',
      description:
        '見積の明細をまとめて置き換える (**全置換**・下書き=draftの版だけ)。合計はサーバーが出し直す。' +
        '数量・単価は整数に丸められる。item_date_end は item_date 以降でなければならない。',
      inputSchema: {
        id: z.string().min(1).describe('見積 ID'),
        items: z.array(z.object({
          description: z.string().max(500).optional(),
          quantity: z.number().optional(),
          unit: z.string().max(20).optional(),
          unit_price: z.number().optional(),
          cost: z.number().optional().describe('原価 (任意)'),
          category: z.string().max(50).optional(),
          item_notes: z.string().max(500).optional(),
          pricing_item_id: z.string().optional().describe('料金表の品目 ID (list_pricing で解決・任意)'),
          item_date: z.string().regex(YMD).optional(),
          item_date_end: z.string().regex(YMD).optional(),
        })).max(200).describe('置き換える明細一式 (順序どおりに並ぶ)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await assertGpmEstimate(args.id);
      const row = await estimateService.replaceItems(args.id, args.items);
      audit('update_gpm_estimate_items', args, { updated_id: args.id, item_count: args.items.length }, args.requested_by);
      return ok({ updated: true, estimate: row });
    }),
  );

  server.registerTool(
    'approve_gpm_estimate',
    {
      title: '見積の値引きを承認 (GPM)',
      description:
        '値引きが上限を超えて承認待ち (approval_state=pending) の見積を承認する。' +
        '承認できるのは、見積を作った人の役割に決められた承認者 (または system_admin) だけ — ' +
        '資格が無ければエラーになる (画面と同じ判定をサーバーが持つ)。',
      inputSchema: {
        id: z.string().min(1).describe('見積 ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await assertGpmEstimate(args.id);
      const row = await estimateService.approve(args.id, currentActorId());
      audit('approve_gpm_estimate', args, { approved_id: args.id }, args.requested_by);
      return ok({ approved: true, estimate: row });
    }),
  );

  server.registerTool(
    'archive_gpm_estimate',
    {
      title: '見積をアーカイブ (GPM)',
      description: '見積を一覧から隠す (状態は変えない・送付済み/受注済みの記録はそのまま残る)。何度呼んでも安全。',
      inputSchema: { id: z.string().min(1).describe('見積 ID'), ...REQUESTED_BY },
    },
    async (args) => runTool(async () => {
      await assertGpmEstimate(args.id);
      const row = await estimateService.archive(args.id, currentActorId());
      audit('archive_gpm_estimate', args, { archived_id: args.id }, args.requested_by);
      return ok({ archived: true, estimate: row });
    }),
  );

  server.registerTool(
    'unarchive_gpm_estimate',
    {
      title: '見積のアーカイブを解く (GPM)',
      description: 'アーカイブした見積を一覧に戻す。',
      inputSchema: { id: z.string().min(1).describe('見積 ID'), ...REQUESTED_BY },
    },
    async (args) => runTool(async () => {
      await assertGpmEstimate(args.id);
      const row = await estimateService.unarchive(args.id, currentActorId());
      audit('unarchive_gpm_estimate', args, { unarchived_id: args.id }, args.requested_by);
      return ok({ unarchived: true, estimate: row });
    }),
  );

  // ══ 議事録 ═════════════════════════════════════════════════
  // 音声の録音・文字起こし開始 (multipart) は screen 専用のままにする —
  // MCP は JSON の read/write に絞り、バイナリのアップロードは持ち込まない。

  server.registerTool(
    'list_gpm_minutes',
    {
      title: 'プロジェクトの議事録一覧 (GPM)',
      description: 'プロジェクトの議事録を一覧する (本文は積まない・重いため get_gpm_minutes で)。',
      inputSchema: { project_id: z.string().min(1).describe('プロジェクト ID') },
    },
    async (args) => runTool(async () => {
      await assertGpmProjectId(args.project_id);
      return ok(await listMinutes(args.project_id));
    }),
  );

  server.registerTool(
    'get_gpm_minutes',
    {
      title: '議事録の詳細 (GPM・文字起こし全文つき)',
      description: '議事録1件を文字起こし全文つきで取得する。',
      inputSchema: { id: z.string().min(1).describe('議事録 ID') },
    },
    async (args) => runTool(async () => {
      await assertGpmMinutesId(args.id);
      return ok(await getMinutes(args.id));
    }),
  );

  server.registerTool(
    'update_gpm_minutes',
    {
      title: '議事録を直す・確定する (GPM)',
      description:
        '議事録の内容を直す。confirm: true で確定する — **確定した時点でサーバーが自動で' +
        'AI出力との差分を比較して記録する**(会社方針「AIを使い捨てにしない」の条件2。人には差分の入力をさせない)。' +
        '決定事項は quote (引用) が無いものは決定にしない (取引先との合意の記録のため)。',
      inputSchema: {
        id: z.string().min(1).describe('議事録 ID'),
        title: z.string().max(200).optional(),
        summary: z.string().max(4000).optional(),
        attendees: z.string().max(500).nullable().optional(),
        met_on: z.string().regex(YMD).nullable().optional(),
        next_meeting: z.string().max(500).nullable().optional(),
        decisions: z.array(z.object({
          text: z.string().min(1).max(500),
          quote: z.string().max(1000).optional().describe('決定の根拠となる引用 (推奨)'),
        })).optional(),
        open_items: z.array(z.object({
          text: z.string().min(1).max(500),
          owner: z.string().max(100).optional(),
          due: z.string().regex(YMD).optional(),
        })).optional(),
        confirm: z.boolean().optional().describe('true で確定する'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await assertGpmMinutesId(args.id);
      const input: Record<string, unknown> = {};
      for (const f of ['title', 'summary', 'attendees', 'met_on', 'next_meeting', 'decisions', 'open_items', 'confirm'] as const) {
        if ((args as Record<string, unknown>)[f] !== undefined) input[f] = (args as Record<string, unknown>)[f];
      }
      const row = await updateMinutes(args.id, input, currentActorId());
      audit('update_gpm_minutes', args, { updated_id: args.id, confirmed: !!args.confirm }, args.requested_by);
      return ok({ updated: true, minutes: row });
    }),
  );

  server.registerTool(
    'delete_gpm_minutes',
    {
      title: '議事録を削除 (GPM)',
      description: '議事録を削除する (soft delete)。取引先との合意の記録なので、慎重に。',
      inputSchema: { id: z.string().min(1).describe('議事録 ID'), ...REQUESTED_BY },
    },
    async (args) => runTool(async () => {
      await assertGpmMinutesId(args.id);
      await deleteMinutes(args.id, currentActorId());
      audit('delete_gpm_minutes', args, { deleted_id: args.id }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  // ══ BOX フォルダ・書類 ═════════════════════════════════════
  // ファイルの中身のアップロードは multipart/バイナリなので MCP には持ち込まない
  // (フォルダを作る・中を見るのは JSON だけで完結するのでここまで)。

  server.registerTool(
    'create_gpm_box_folder',
    {
      title: 'BOX フォルダを作る (GPM)',
      description:
        'プロジェクトの BOX フォルダ (社内限り・社外共有の2系統) を作る。' +
        '押したときだけ作られ、プロジェクト作成時には自動で作られない。既に持っていれば409エラー。',
      inputSchema: {
        id: z.string().min(1).describe('プロジェクト ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const row = await queryOne(
        `SELECT name, box_url_internal, box_url_external FROM projects
          WHERE id = ? AND gls_category = 'B' AND deleted_at IS NULL`,
        [args.id],
      ) as { name: string; box_url_internal: string | null; box_url_external: string | null } | null;
      if (!row) return ok({ error: 'プロジェクトが見つかりません', code: 'NOT_FOUND' });
      if (row.box_url_internal || row.box_url_external) {
        return ok({ error: 'このプロジェクトの BOX フォルダはすでに作られています', code: 'ALREADY_EXISTS' });
      }
      const made = await createGpmFolderTree(row.name);
      if (!made.internal && !made.external) {
        return ok({ error: 'BOX にフォルダを作れませんでした。時間をおいて試してください', code: 'BOX_UNAVAILABLE' });
      }
      await execute(
        'UPDATE projects SET box_url_internal = ?, box_url_external = ?, updated_at = NOW() WHERE id = ?',
        [made.internal?.folderUrl ?? null, made.external?.folderUrl ?? null, args.id],
      );
      audit('create_gpm_box_folder', args, { project_id: args.id }, args.requested_by);
      return ok({ created: true, project_id: args.id });
    }),
  );

  server.registerTool(
    'get_gpm_box_folder_preview',
    {
      title: 'BOX フォルダ構成のプレビュー (GPM)',
      description: 'create_gpm_box_folder が作るフォルダ構成 (社内限り/社外共有の下の階層) を確認する。',
      inputSchema: {},
    },
    async () => runTool(async () => ok(GPM_FOLDER_PREVIEW)),
  );

  server.registerTool(
    'list_gpm_box_files',
    {
      title: 'BOX 書類の一覧 (GPM)',
      description:
        'プロジェクトの BOX フォルダの中身を一覧する。scope=internal (社内限り) / external (社外共有・既定)。' +
        'BOX が落ちているときも空リスト+reasonで返す (アップロードは画面から行う)。',
      inputSchema: {
        id: z.string().min(1).describe('プロジェクト ID'),
        scope: z.enum(['internal', 'external']).default('external'),
      },
    },
    async (args) => runTool(async () => {
      // **`listProjectFolder` は GLS-B かを確かめない**（案件の BOX ファイル一覧と共用のため）。
      // ここで確かめないと、`id` に案件 (GLS-A) の id を渡すと**その案件の BOX の中身
      // （取引先の書類）が読み取りゲート無しの read ツールから見えてしまう**
      // （create_gpm_box_folder は自前の SQL で gls_category='B' を見ているが、
      // 読み取り側は listProjectFolder に素通ししていたため漏れていた）
      await assertGpmProjectId(args.id);
      const { items, total, truncated, reason } = await listProjectFolder(
        args.id, args.scope, 'プロジェクトが見つかりません',
      );
      return ok({ items, total, truncated, ...(reason ? { reason } : {}) });
    }),
  );
}
