import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll } from '../../../shared/db/connection';
import { myTasksService } from '../../tasks/services/my-tasks.service';
import { taskIntakeService, type TaskDraft } from '../../tasks/services/task-intake.service';
import { parseIntakeText, type ParseResult } from '../../tasks/services/intake-parser.service';
import {
  parseIntakeWithAi, isIntakeAiConfigured, resolveProvider, isViewableAttachment,
  type IntakeAttachment, type ParserProject,
} from '../../tasks/services/intake-ai.service';
import { transcribeAudio, isSttConfigured, MAX_AUDIO_BYTES } from '../../sales/services/minutes-ai.service';

import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';

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

// ── 過去の修正傾向 (ループを閉じる部分) ──────────────────
//
// 解析の前に「人が今までどう直したか」を読んでプロンプトに載せる。
// これが無いと記録しているだけで賢くならない (開発の絶対原則の条件4)。
//
// 集計は数本の GROUP BY だが投入ごとに毎回叩く必要はないので短く握る。
// **取得に失敗しても投入は止めない** (傾向は無くても解析はできる)。
const ADVICE_TTL_MS = 5 * 60_000;
const ADVICE_WINDOW_DAYS = 60;
let adviceCache: { at: number; advice: string[] } | null = null;

async function getIntakeAdvice(): Promise<string[]> {
  if (adviceCache && Date.now() - adviceCache.at < ADVICE_TTL_MS) return adviceCache.advice;
  try {
    const digest = await getFeedbackDigest('task_intake', ADVICE_WINDOW_DAYS);
    // データが無いときの「傾向は不明」だけを載せても意味が無いので落とす
    const advice = digest.reviewed_outputs > 0 ? digest.advice : [];
    adviceCache = { at: Date.now(), advice };
    return advice;
  } catch (e) {
    console.warn('[task-intake] 修正傾向の取得に失敗 (解析は続行):', (e as Error).message);
    return [];
  }
}

/** 投入が確定・破棄されたら傾向が変わるのでキャッシュを捨てる */
function invalidateAdviceCache(): void {
  adviceCache = null;
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
 * 添付の受け口。**ディスクには置かない**（`memoryStorage`）。
 * 読み終えたらその場で捨てる — 名刺や見積 PDF を消し忘れの起きる場所に置かない。
 *
 * 上限は 1 件 20MB・合わせて 6 件。音声（`audio`）だけは Whisper の 25MB に合わせる。
 */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const intakeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(MAX_FILE_BYTES, MAX_AUDIO_BYTES), files: 7 },
}).fields([
  { name: 'files', maxCount: 6 },
  { name: 'audio', maxCount: 1 },
]);

/** multer は multipart のファイル名を latin1 で読む。日本語のまま扱えるように戻す */
function fileName(f: Express.Multer.File): string {
  return Buffer.from(f.originalname || 'file', 'latin1').toString('utf8');
}

/**
 * 添付として「そのまま見せられない」種類を文字にする。
 *
 * テキスト系はここで読んで本文に混ぜる（モデルに渡す形を増やさない）。
 * **知らない種類は黙って捨てず、断る** — 添付したのに読まれていない、が一番困る。
 */
function attachmentToText(f: Express.Multer.File, name: string): string {
  const mime = f.mimetype || '';
  const textish = mime.startsWith('text/')
    || mime === 'application/json'
    || /\.(txt|md|csv|tsv|log|json)$/i.test(name);
  if (!textish) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `「${name}」は読み取れない種類です（${mime || '不明'}）。画像・PDF・テキストにしてください`
    );
  }
  return f.buffer.toString('utf8');
}

/**
 * 投入する。**何も登録しない**（下書きを返すだけ）。
 *
 * ── 投入口は 1 つ（v4）─────────────────────────────────────
 *
 * 以前は「ひとこと / 議事録」の切り替えがあり、行き先は**タスクだけ**でした。
 * v4 では**書いても貼っても撮っても録っても同じ口**に入り、
 * **AI が 1 件ずつ行き先を決めます**（タスク / ネタ案件 / 活動記録 / 議事録）。
 * `kind` は受け取っても**使いません**（古い呼び出しを 400 にしないためだけに残す）。
 *
 * ── 添付と録音も同じ 1 回の解析に載せる ────────────────────
 *
 * 別の口を作ると、写真に写っている社名と本文に書かれた依頼が別々の下書きになり、
 * 人がつなぎ直すことになります。音声だけは先に Whisper で文字にしてから混ぜます
 * （画像・PDF はモデルがそのまま読めます）。
 *
 * 解析は ChatGPT API (OpenAI) を主経路、規則ベースをフォールバックにする。
 * API キー未設定・障害・タイムアウトでも **投入口は必ず動く**ようにする
 * (ここが動かないと依頼が口頭のまま消え、この仕組みの目的が失われるため)。
 */
router.post('/tasks/intake', ...canEdit, intakeUpload, async (req, res) => {
  const userId = me(req);
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  const attachedFiles = files.files ?? [];
  const audio = files.audio?.[0];

  let rawText = String(req.body?.raw_text ?? '').trim();

  // ── 添付を読む ──────────────────────────────────────────
  const attachments: IntakeAttachment[] = [];
  const extraTexts: string[] = [];
  for (const f of attachedFiles) {
    const name = fileName(f);
    if (isViewableAttachment(f.mimetype)) {
      attachments.push({ name, mime: f.mimetype, data: f.buffer });
    } else {
      extraTexts.push(`--- 添付「${name}」の中身 ---\n${attachmentToText(f, name)}`);
    }
  }

  // ── 録音は先に文字にする ────────────────────────────────
  let transcript: string | null = null;
  if (audio) {
    if (!isSttConfigured()) {
      throw new AppError(400, 'NOT_CONFIGURED',
        'この環境は文字起こしにつないでいません（OPENAI_API_KEY 未設定）。管理者にご連絡ください');
    }
    const stt = await transcribeAudio(audio.buffer, fileName(audio));
    transcript = stt.text;
  }

  const parts = [rawText, transcript ? `--- 録音の文字起こし ---\n${transcript}` : '', ...extraTexts]
    .filter((s) => s && s.trim());
  rawText = parts.join('\n\n');

  if (!rawText && attachments.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '投入するテキストを入力するか、ファイルを添付してください');
  }
  // 添付だけのときも**原文を空で残さない**（何を投げたのか後から分からなくなる）
  if (!rawText) {
    rawText = attachments.map((a) => `（添付のみ）${a.name}`).join('\n');
  }

  // 宛先解決に使うユーザー一覧 (名前 → users.id)
  const users = (await queryAll(
    `SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY name`
  )) as { id: string; name: string }[];

  /**
   * 議事録・活動記録の紐づけ先の候補。**動いている案件だけ**を新しい順に出す。
   * 全件渡すと、終わった案件に議事録がぶら下がる（しかも誰も見に行かない）。
   */
  const projects = (await queryAll(
    `SELECT id, name, COALESCE(gls_number, code) AS code,
            (SELECT c.name FROM customers c WHERE c.id = p.customer_id) AS customer_name
     FROM projects p
     WHERE deleted_at IS NULL AND stage IN ('neta','d_hold','c_proposal','b_verbal','a_won')
     ORDER BY updated_at DESC
     LIMIT 80`
  )) as unknown as ParserProject[];

  const now = new Date();
  let parsed: ParseResult;
  let model = 'rules';
  let promptVersion: string | null = null;
  let aiError: string | null = null;

  if (isIntakeAiConfigured()) {
    try {
      const advice = await getIntakeAdvice();
      const ai = await parseIntakeWithAi(rawText, users, {
        now, submitterId: userId, advice, projects, attachments,
      });
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
  // **タスク以外には依頼者を付けない**（活動記録や議事録に「依頼」は無い）。
  const drafts = parsed.drafts.map((d) => ({
    dest: d.dest ?? 'task',
    title: d.title,
    assigned_to: d.assigned_to ?? undefined,
    requester_id: d.dest === 'task' && d.assigned_to && d.assigned_to !== userId ? userId : undefined,
    due_at: d.due_at ?? undefined,
    importance: d.importance,
    urgency: d.urgency,
    due_time_assumed: d.due_time_assumed,
    due_unclear: d.due_unclear,
    assignee_unclear: d.assignee_unclear,
    quote: d.quote,
    project_id: d.project_id ?? undefined,
    customer_name: d.customer_name ?? undefined,
    detail: d.detail ?? undefined,
    gls_category: d.gls_category ?? undefined,
    activity_type: d.activity_type ?? undefined,
    next_action: d.next_action ?? undefined,
    next_action_date: d.next_action_date ?? undefined,
    summary: d.summary ?? undefined,
    decisions: d.decisions ?? undefined,
    open_items: d.open_items ?? undefined,
  }));

  const intake = await taskIntakeService.createIntake(
    {
      raw_text: rawText,
      // **`kind` は投入の種類（何から入ったか）だけを表す。** 行き先は draft の `dest`
      kind: audio ? 'other' : 'freeform',
      drafts, tool_name: 'ui:intake',
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
      // 確認画面で案件を選び直せるようにする（AI が読み違えたときの逃げ道）
      projects,
      // 開発・運用の切り分け用。AI が落ちて規則ベースに縮退したことが分かる
      parsed_by: model === 'rules' ? 'rules' : 'ai',
      ai_error: aiError,
    },
  });
});

/**
 * 確認済みの下書きを本登録する。**行き先ごとに入れる先が違う**（service 側で分岐）。
 *
 * 受ける鍵は `rows`。**`tasks` でも受ける** — 名前を変えただけで
 * 古い画面から登録できなくなるのは割に合わない。
 */
router.post('/tasks/intake/:id/commit', ...canEdit, async (req, res) => {
  const userId = me(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : req.body?.tasks;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '登録するものを選んでください');
  }
  const result = await taskIntakeService.commitIntake(
    String(req.params.id), rows as TaskDraft[], userId
  );
  invalidateAdviceCache();
  res.json({ success: true, data: result });
});

/** 下書きを破棄する (原文は残す) */
router.post('/tasks/intake/:id/discard', ...canEdit, async (req, res) => {
  const userId = me(req);
  const intake = await taskIntakeService.discardIntake(
    String(req.params.id), userId, req.body?.note ? String(req.body.note) : null
  );
  invalidateAdviceCache();
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
