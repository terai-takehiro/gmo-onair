import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll } from '../../../shared/db/connection';
import { myTasksService } from '../../tasks/services/my-tasks.service';
import { taskIntakeService, type TaskDraft } from '../../tasks/services/task-intake.service';
import { parseIntakeText, type ParseResult } from '../../tasks/services/intake-parser.service';
import { parseIntakeWithAi, isIntakeAiConfigured, resolveProvider } from '../../tasks/services/intake-ai.service';

// 日常業務アプリ (dailyops) — 「タスク・依頼」メニューの API。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D0 / D4 / D7)
//
// 権限の設計 (要件 D0 の要点):
//   自分に割り当てられた案件タスクは sales 権限が無い人にも見せる必要があるため、
//   service 側で assigned_to / requester_id = 本人 にスコープしており sales 権限は要求しない。
//   ただし返すのは案件名と GLS 番号までで、金額は一切返さない。
//   案件ページへのリンクは、sales 権限が無い人には**そもそも出さない** (押して 403 にしない)
//   ため、can_open_project フラグをレスポンスに載せてクライアントが出し分ける。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

/** ログイン中ユーザーの id */
function me(req: { user?: { id: string } }): string {
  const id = req.user?.id;
  if (!id) throw new AppError(401, 'UNAUTHORIZED', 'ログインが必要です');
  return id;
}

/** sales 権限 (reader 以上) を持つか。案件リンクを出すかの判定に使う */
async function canOpenProject(userId: string): Promise<boolean> {
  const rows = await queryAll(
    `SELECT 1 FROM user_permissions WHERE user_id = ? AND module = 'sales' LIMIT 1`,
    [userId]
  );
  if (rows.length > 0) return true;
  const admin = await queryAll(
    `SELECT 1 FROM users WHERE id = ? AND role = 'system_admin' LIMIT 1`, [userId]
  );
  return admin.length > 0;
}

// ══════════════════════════════════════════════
// 投入 (intake) — すべての依頼はここから入る
// ══════════════════════════════════════════════

/**
 * 投入する。**タスクは作らない**。
 * 投げたテキストを一次資料として保存し、一次解析した下書きを返す。
 * クライアントはこの下書きを確認画面に出し、人が確認してから /commit を呼ぶ。
 *
 * 解析は LLM (OpenAI または Anthropic) を主経路、規則ベースをフォールバックにする。
 * API キー未設定・障害・タイムアウトでも **投入口は必ず動く**ようにする
 * (ここが動かないと依頼が口頭のまま消え、この仕組みの目的が失われるため)。
 */
router.post('/tasks/intake', ...canEdit, async (req, res) => {
  const userId = me(req);
  const rawText = String(req.body?.raw_text ?? '').trim();
  if (!rawText) throw new AppError(400, 'VALIDATION_ERROR', '投入するテキストを入力してください');

  const kind = ['freeform', 'minutes', 'mail', 'chat', 'other'].includes(String(req.body?.kind))
    ? String(req.body.kind) as 'freeform' | 'minutes' | 'mail' | 'chat' | 'other'
    : 'freeform';

  // 宛先解決に使うユーザー一覧 (名前 → users.id)
  const users = (await queryAll(
    `SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY name`
  )) as { id: string; name: string }[];

  const now = new Date();
  let parsed: ParseResult;
  let model = 'rules';
  let promptVersion: string | null = null;
  let aiError: string | null = null;

  if (isIntakeAiConfigured()) {
    try {
      const ai = await parseIntakeWithAi(rawText, users, { now, submitterId: userId });
      parsed = { drafts: ai.drafts, skipped: ai.skipped };
      model = ai.model;
      promptVersion = ai.promptVersion;
    } catch (e) {
      // 解析が落ちても投入自体は通す。規則ベースに縮退して人に確認させる
      aiError = (e as Error).message;
      console.warn(
        `[task-intake] AI 解析に失敗したため規則ベースに縮退 (provider=${resolveProvider() ?? 'なし'}): ${aiError}`
      );
      parsed = parseIntakeText(rawText, users, { now });
    }
  } else {
    parsed = parseIntakeText(rawText, users, { now });
  }

  // 投入者が「依頼した」ものなので、依頼者は投入者本人。
  // 自分自身が担当のものは依頼ではなく個人タスクなので requester_id を付けない。
  const drafts = parsed.drafts.map((d) => ({
    title: d.title,
    assigned_to: d.assigned_to ?? undefined,
    requester_id: d.assigned_to && d.assigned_to !== userId ? userId : undefined,
    due_at: d.due_at ?? undefined,
    importance: d.importance,
    urgency: d.urgency,
    due_time_assumed: d.due_time_assumed,
    due_unclear: d.due_unclear,
    assignee_unclear: d.assignee_unclear,
    quote: d.quote,
  }));

  const intake = await taskIntakeService.createIntake(
    {
      raw_text: rawText, kind, drafts, tool_name: 'ui:intake',
      model, prompt_version: promptVersion,
    },
    userId
  );

  res.status(201).json({
    success: true,
    data: {
      ...intake,
      // 拾わなかった行も返す。「決定事項なのでタスクにしなかった」を人に見せるため
      skipped: parsed.skipped,
      // イズム: 期限が遠いものは短くするよう促す
      far_due_keys: parsed.drafts
        .map((d, i) => (d.due_far ? `d${i + 1}` : null))
        .filter((x): x is string => x !== null),
      users,
      // 開発・運用の切り分け用。AI が落ちて規則ベースに縮退したことが分かる
      parsed_by: model === 'rules' ? 'rules' : 'ai',
      ai_error: aiError,
    },
  });
});

/** 確認済みのタスク案を本登録する */
router.post('/tasks/intake/:id/commit', ...canEdit, async (req, res) => {
  const userId = me(req);
  const tasks = req.body?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '登録するタスクを選んでください');
  }
  const result = await taskIntakeService.commitIntake(
    String(req.params.id), tasks as TaskDraft[], userId
  );
  res.json({ success: true, data: result });
});

/** 下書きを破棄する (原文は残す) */
router.post('/tasks/intake/:id/discard', ...canEdit, async (req, res) => {
  const userId = me(req);
  const intake = await taskIntakeService.discardIntake(
    String(req.params.id), userId, req.body?.note ? String(req.body.note) : null
  );
  res.json({ success: true, data: intake });
});

/** 投入ログ。既定は本人の分だけ (投げたテキストは個人の記録) */
router.get('/tasks/intakes', ...canRead, async (req, res) => {
  const userId = me(req);
  const all = req.query.all === '1' || req.query.all === 'true';
  const rows = await taskIntakeService.list({
    userId: all ? undefined : userId,
    status: req.query.status ? String(req.query.status) as never : undefined,
    kind: req.query.kind ? String(req.query.kind) as never : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ success: true, data: rows });
});

/** 投入 1 件 + そこから生まれたタスク (遡ってレビューする) */
router.get('/tasks/intakes/:id', ...canRead, async (req, res) => {
  const intake = await taskIntakeService.get(String(req.params.id));
  const generated = await taskIntakeService.listGeneratedTasks(String(req.params.id));
  res.json({ success: true, data: { ...intake, generated_tasks: generated } });
});

// ══════════════════════════════════════════════
// 自分のタスクと依頼
// ══════════════════════════════════════════════

/** 自分のタスク (案件タスク + 個人タスクを混ぜて 9 マス / スコア順) */
router.get('/tasks/mine', ...canRead, async (req, res) => {
  const userId = me(req);
  const [tasks, canOpen] = await Promise.all([
    myTasksService.listMyTasks(userId, {
      includeCompleted: req.query.include_completed === '1',
      overdueOnly: req.query.overdue === '1',
      dueToday: req.query.due_today === '1',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }),
    canOpenProject(userId),
  ]);
  res.json({ success: true, data: tasks, meta: { can_open_project: canOpen } });
});

/** 依頼 (受けた / 出した) */
router.get('/tasks/delegations', ...canRead, async (req, res) => {
  const userId = me(req);
  const direction = req.query.direction === 'sent' ? 'sent' : 'received';
  const [rows, canOpen] = await Promise.all([
    myTasksService.listMyDelegations(userId, direction, {
      includeDone: req.query.include_done === '1',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }),
    canOpenProject(userId),
  ]);
  res.json({ success: true, data: rows, meta: { can_open_project: canOpen } });
});

/** 依頼に返答する (承諾 / 相談 / 辞退)。辞退でも消さず依頼者に差し戻す */
router.post('/tasks/:id/respond', ...canEdit, async (req, res) => {
  const userId = me(req);
  const decision = String(req.body?.decision ?? '');
  if (!['accepted', 'declined', 'consulting'].includes(decision)) {
    throw new AppError(400, 'VALIDATION_ERROR', '返答の種類が不正です');
  }
  const task = await myTasksService.respondToDelegation(
    String(req.params.id), userId, decision as 'accepted' | 'declined' | 'consulting',
    req.body?.note ? String(req.body.note) : null
  );
  res.json({ success: true, data: task });
});

/**
 * タスクを直す (期限・重要度・緊急度・完了)。
 * 担当者本人か依頼者だけが呼べる (service 側でスコープ)。
 */
router.patch('/tasks/:id', ...canEdit, async (req, res) => {
  const userId = me(req);
  const b = req.body ?? {};
  const patch: Parameters<typeof myTasksService.updateMyTask>[2] = {};
  if (b.title !== undefined) patch.title = String(b.title);
  if (b.description !== undefined) patch.description = b.description === null ? null : String(b.description);
  if (b.due_at !== undefined) patch.due_at = b.due_at ? String(b.due_at) : null;
  if (b.importance !== undefined) patch.importance = Number(b.importance);
  if (b.urgency !== undefined) patch.urgency = Number(b.urgency);
  if (b.visibility !== undefined) patch.visibility = b.visibility === 'private' ? 'private' : 'team';
  if (b.is_completed !== undefined) patch.is_completed = Boolean(b.is_completed);
  const task = await myTasksService.updateMyTask(String(req.params.id), userId, patch);
  res.json({ success: true, data: task });
});

/**
 * 差し戻された依頼を依頼者が片づける (自分でやる / 振り直す / 取り下げる)。
 * 辞退・相談されても依頼は消えないので、決着はここでつける (要件 D3)。
 */
router.post('/tasks/:id/resolve', ...canEdit, async (req, res) => {
  const userId = me(req);
  const action = String(req.body?.action ?? '');
  if (!['take_over', 'reassign', 'withdraw'].includes(action)) {
    throw new AppError(400, 'VALIDATION_ERROR', '操作の種類が不正です');
  }
  const task = await myTasksService.resolveDelegation(
    String(req.params.id), userId, action as 'take_over' | 'reassign' | 'withdraw',
    {
      assigned_to: req.body?.assigned_to ? String(req.body.assigned_to) : undefined,
      due_at: req.body?.due_at ? String(req.body.due_at) : undefined,
    }
  );
  res.json({ success: true, data: task });
});

/**
 * チームの負荷。**件数だけ**を返し中身は返さない
 * (private なタスクも件数には入るがタイトルは出さない。要件 D8)。
 */
router.get('/tasks/team', ...canRead, async (_req, res) => {
  const rows = await myTasksService.getTeamLoad();
  res.json({ success: true, data: rows });
});

/** 依頼または個人タスクを 1 件作る (投入を介さない直接作成) */
router.post('/tasks', ...canEdit, async (req, res) => {
  const userId = me(req);
  const b = req.body ?? {};
  const assignedTo = String(b.assigned_to ?? '');
  const task = await myTasksService.createTask({
    title: String(b.title ?? ''),
    description: b.description ? String(b.description) : null,
    project_id: b.project_id ? String(b.project_id) : null,
    assigned_to: assignedTo,
    // 自分以外を担当にしたら依頼になる
    requester_id: assignedTo && assignedTo !== userId ? userId : null,
    due_at: b.due_at ? String(b.due_at) : null,
    importance: b.importance != null ? Number(b.importance) : undefined,
    urgency: b.urgency != null ? Number(b.urgency) : undefined,
    visibility: b.visibility === 'private' ? 'private' : 'team',
    source: b.source ? String(b.source) : 'manual',
  }, userId);
  res.status(201).json({ success: true, data: task });
});

// ══════════════════════════════════════════════
// サマリー (トップページのカード + ヘッダーのベル)
// ══════════════════════════════════════════════

/**
 * 自分の状況を件数で返す。
 * イズム (目標達成10カ条 9-5)「報告は数字で行え」に従い、
 * 「順調です」のような文学的表現ではなく件数だけを返す。
 */
router.get('/tasks/summary', ...canRead, async (req, res) => {
  const userId = me(req);
  const summary = await myTasksService.getMySummary(userId);
  res.json({ success: true, data: summary });
});

export default router;
