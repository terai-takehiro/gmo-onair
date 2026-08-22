/**
 * 制作資料（進行台本・スケジュール表）の MCP ツール — 段10 / 05-mcp.md。
 *
 * **制作資料のツールだけは OAuth actor 専用。** 静的 API キーは `requireProductionActor()`
 * が全ツールの先頭で 403 にする（read ツールには `gate.ts` の権限ゲートが掛からないため、
 * ここで止めるしかない。§3-1）。
 *
 * **書き込みは「提案まで」。** `propose_qsheet_draft` は `qsheet_ai_proposals` に1行置くだけで、
 * 台本そのもの（Yjs の `data`）はサーバーから一切書き換えない（§6・利用者判断: 会話内での
 * 取り込みは第1版では求めない）。取り込みツールは意図的に出していない。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ok, runTool, audit, REQUESTED_BY } from '../helpers';
import { requireProductionActor } from './production.access';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne } from '../../../shared/db/connection';
import { MINI_APPS, type MiniAppKey } from '../../../shared/production/miniapps';
import { QSHEET_BLOCK_TYPES } from '../../../shared/qsheet/blockTypes';
import { getJourneyForProject, getJourneyForDocument } from '../../qsheet/services/journey.service';
import { canAccessDoc, canAccessProposal } from '../../qsheet/access';
import { listProductionDocs } from '../../qsheet/services/production/doc-list.service';
import { fetchDocForRead, getQsheetOutline, getQsheetRows } from '../../qsheet/services/production/qsheet-read.service';
import { getDaySchedule } from '../../qsheet/services/production/schedule-read.service';
import { findSimilarQsheets } from '../../qsheet/services/production/similar.service';
import { createQsheetIdempotent, createOutlineOrLineProposal } from '../../qsheet/services/production/mcp-write.service';
import { discardProposal } from '../../qsheet/ai/apply.service';

const DOC_APP_KEYS = MINI_APPS.filter((a) => a.kind === 'document').map((a) => a.key) as [MiniAppKey, ...MiniAppKey[]];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerProductionTools(server: McpServer): void {
  // ── read ────────────────────────────────────────────────
  server.registerTool(
    'list_production_docs',
    {
      title: '制作資料の一覧（進行台本・スケジュール表）',
      description:
        '進行台本（app=sheet）とスケジュール表（app=schedule）を横断で検索する。' +
        '見える範囲（作成者本人／共有先／system_admin）だけを返し、共有されていない資料は件数にも含めない。' +
        '制作資料のツールは ONAiR ログイン連携（OAuth）が必須（共有APIキーでは 403）。',
      inputSchema: {
        project_id: z.string().optional().describe('案件 id（GLS番号ではない）'),
        gls_number: z.string().optional().describe('GLS番号（GLS-A012）。project_id の代わりに使える'),
        date: z.string().regex(DATE_RE).optional(),
        app: z.enum(DOC_APP_KEYS).optional().describe('省略＝両方'),
        q: z.string().max(100).optional().describe('資料名・資料番号の部分一致'),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      const result = await listProductionDocs(actor, {
        projectId: args.project_id,
        glsNumber: args.gls_number,
        date: args.date,
        // DOC_APP_KEYS は MINI_APPS の document 種別だけを列挙したものなので実行時は必ず 'sheet'|'schedule'
        app: args.app as 'sheet' | 'schedule' | undefined,
        q: args.q,
        limit: Math.min(100, Math.max(1, args.limit ?? 20)),
        page: Math.max(1, args.page ?? 1),
      });
      return ok(result);
    }),
  );

  server.registerTool(
    'get_production_journey',
    {
      title: '制作のジャーニー（今どこまで出来ているか）',
      description:
        '案件（project_id）または資料単体（document_id）のジャーニーを返す。' +
        '`tone`（blank/touched/recent）は完成度ではなく「触られたか」。遅れている・進んでいる' +
        'といった評価をユーザーに返さないこと。資料の中身（台詞など）は含まない。',
      inputSchema: {
        project_id: z.string().optional(),
        document_id: z.string().optional().describe('案件に紐づかない資料単体のとき'),
        from: z.string().regex(DATE_RE).optional(),
        to: z.string().regex(DATE_RE).optional(),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      if (!args.project_id && !args.document_id) {
        throw new AppError(400, 'BAD_REQUEST', 'project_id か document_id のどちらかを指定してください');
      }
      const result = args.project_id
        ? await getJourneyForProject(args.project_id, actor)
        : await getJourneyForDocument(args.document_id!, actor);
      if (!result) throw new AppError(404, 'NOT_FOUND', '見つかりません');
      const days = result.days.filter((d) => {
        if (!d.date) return true; // 日が決まっていない束は範囲指定に関わらず含める
        if (args.from && d.date < args.from) return false;
        if (args.to && d.date > args.to) return false;
        return true;
      });
      return ok({ days });
    }),
  );

  server.registerTool(
    'get_qsheet',
    {
      title: '進行台本の中身',
      description:
        '台本全文は既定で返さない（数百KBになり得るため）。既定 mode=outline はロールの一覧と尺だけ、' +
        'section はその1構成だけ、full は400行まで（超えたら section 指定を促すエラーを返す）。' +
        'include_text=false（既定）では台詞は文字数だけを返す。列（セル）は blk.<type>#<n> という' +
        '参照キーで返る（同じ型の列が2本ある場合の区別に使う）。',
      inputSchema: {
        document_id: z.string(),
        mode: z.enum(['outline', 'section', 'full']).optional().describe('既定 outline'),
        section_id: z.string().optional().describe('mode=section のとき必須'),
        include_text: z.boolean().optional().describe('台詞などの本文を含める。既定 false'),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      const doc = await fetchDocForRead(args.document_id);
      if (!doc || !(await canAccessDoc(actor, args.document_id, doc.created_by))) {
        throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
      }
      const mode = args.mode ?? 'outline';
      if (mode === 'outline') return ok(await getQsheetOutline(doc));
      const sections = await getQsheetRows(doc, {
        mode: mode as 'section' | 'full',
        sectionId: args.section_id,
        includeText: !!args.include_text,
      });
      return ok({ sections });
    }),
  );

  server.registerTool(
    'get_day_schedule',
    {
      title: '当日のスケジュール表（枠）',
      description:
        'schedule_id、または project_id + date（省略可）で当日の枠を返す。' +
        'kind=onair の長さと台本のロールの尺の合計がつり合っているかを見るのに使う。' +
        '尺を自動で書き戻してはいけない。',
      inputSchema: {
        schedule_id: z.string().optional(),
        project_id: z.string().optional(),
        date: z.string().regex(DATE_RE).optional().describe('project_id と併用'),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      const result = await getDaySchedule(actor, { scheduleId: args.schedule_id, projectId: args.project_id, date: args.date });
      return ok(result);
    }),
  );

  server.registerTool(
    'find_similar_qsheets',
    {
      title: '似た過去回の台本を探す',
      description:
        '過去の似た回の骨格（ロール名・尺・列構成）を返す。本文は返さない。' +
        '見える範囲（共有されている台本）だけを対象にするため、共有が少ないと空になることがある。' +
        'is_reference=false（見本にしない印）の台本は対象外。既定 limit=3・最大5。',
      inputSchema: {
        document_id: z.string().optional().describe('この台本に似た回を探す（いちばん精度が高い）'),
        project_id: z.string().optional().describe('document_id が無いとき'),
        exclude_document_id: z.string().optional(),
        limit: z.number().int().min(1).max(5).optional(),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      if (args.document_id) {
        const doc = await queryOne('SELECT created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [args.document_id]);
        if (!doc || !(await canAccessDoc(actor, args.document_id, (doc.created_by as string) ?? null))) {
          throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
        }
      }
      const results = await findSimilarQsheets(actor, {
        documentId: args.document_id,
        projectId: args.project_id,
        excludeDocumentId: args.exclude_document_id,
        limit: args.limit ?? 3,
      });
      return ok({ results });
    }),
  );

  // ── write ───────────────────────────────────────────────
  server.registerTool(
    'create_qsheet',
    {
      title: '空の進行台本を作る',
      description:
        '中身は空（sections=[]）で作る。骨格は propose_qsheet_draft で提案する。' +
        'idempotency_key を渡すと同じ意図で二度呼んでも1本しか作らない（例 mcp:<project_id>:<YYYY-MM-DD>:qsheet）。' +
        '制作資料（qsheet）の editor 以上が必要。',
      inputSchema: {
        title: z.string().max(500),
        project_id: z.string().optional(),
        episode_id: z.string().optional(),
        broadcast_date: z.string().regex(DATE_RE).optional(),
        block_types: z.array(z.enum(QSHEET_BLOCK_TYPES)).optional()
          .describe('既定の列。省略時は scenario / video / audio の3列'),
        idempotency_key: z.string().max(200).optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const result = await createQsheetIdempotent(actor, {
        title: args.title,
        projectId: args.project_id,
        episodeId: args.episode_id,
        broadcastDate: args.broadcast_date,
        blockTypes: args.block_types,
        idempotencyKey: args.idempotency_key,
      });
      audit(
        'create_qsheet',
        args,
        { created_id: result.document.id, doc_no: result.document.docNo, idempotent: !result.created },
        args.requested_by,
      );
      return ok(result);
    }),
  );

  server.registerTool(
    'propose_qsheet_draft',
    {
      title: 'AI 提案を1件置く（台本そのものは変わらない）',
      description:
        '台本への書き込みはしない。qsheet_ai_proposals に提案を1件作るだけで、' +
        '取り込みは編集画面の「AIの提案」から人が行う。' +
        'kind=script_outline_draft は payload={ budget_sec, sections:[{ key, label, duration_sec, ' +
        'rows:[{ key, label, duration_sec, speaker, hint? }] }] }（台詞は書かない・骨格のみ）。' +
        'kind=script_line_draft は payload={ lines:[{ row_id, name, text, is_q_word? }] }（既存行の' +
        '台詞を埋める。row_id はその台本に実在するものだけ有効）。HTML タグは使わない（落とされる）。' +
        '生成前に get_ai_feedback_digest(kind=同じ値) を必ず一度読み、read_feedback_digest に読んだかを' +
        '記録すること。制作資料（qsheet）の editor 以上が必要。',
      inputSchema: {
        document_id: z.string(),
        kind: z.enum(['script_outline_draft', 'script_line_draft']),
        payload: z.record(z.unknown()),
        context: z.object({
          based_on_document_ids: z.array(z.string()).max(5).optional(),
          schedule_id: z.string().optional(),
          onair_window_min: z.number().int().optional(),
          note: z.string().max(1000).optional(),
        }).optional(),
        read_feedback_digest: z.boolean().optional(),
        model: z.string().max(100).optional(),
        prompt_version: z.string().max(50).optional(),
        idempotency_key: z.string().max(200).optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const result = await createOutlineOrLineProposal(actor, {
        documentId: args.document_id,
        kind: args.kind,
        payload: args.payload,
        context: args.context,
        readFeedbackDigest: args.read_feedback_digest,
        model: args.model,
        promptVersion: args.prompt_version,
        idempotencyKey: args.idempotency_key,
        requestedBy: args.requested_by,
      });
      audit(
        'propose_qsheet_draft',
        args,
        {
          created_id: result.proposal?.id,
          document_id: args.document_id,
          kind: args.kind,
          rows: result.proposal?.summary.rows,
          idempotent: !result.created,
        },
        args.requested_by,
      );
      return ok(result);
    }),
  );

  server.registerTool(
    'discard_qsheet_proposal',
    {
      title: '提案を見送る',
      description:
        '提案を使わないと決めたことを記録する（04 の POST /proposals/:id/discard と同じ）。' +
        '見送りが記録されないと「拾いすぎ」が測れないため、使わない提案も必ず呼ぶこと。' +
        '制作資料（qsheet）の editor 以上が必要。',
      inputSchema: {
        proposal_id: z.string(),
        reason: z.string().max(500).optional().describe('なぜ使わないか（短くてよい）'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await queryOne('SELECT id, document_id, schedule_id, state FROM qsheet_ai_proposals WHERE id = ?', [args.proposal_id]);
      if (!row || !(await canAccessProposal(actor, { document_id: (row.document_id as string) ?? null, schedule_id: (row.schedule_id as string) ?? null }))) {
        throw new AppError(404, 'NOT_FOUND', '提案が見つかりません');
      }
      await discardProposal(args.proposal_id, args.reason ?? null, actor.id);
      audit('discard_qsheet_proposal', args, { proposal_id: args.proposal_id }, args.requested_by);
      return ok({ discarded: true, proposal_id: args.proposal_id });
    }),
  );
}
