import { Router, type Request } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission, meetsPermissionLevel } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll } from '../../../shared/db/connection';
import { myTasksService } from '../../tasks/services/my-tasks.service';
import { taskIntakeService, type TaskDraft } from '../../tasks/services/task-intake.service';
import { parseIntakeText, type ParseResult } from '../../tasks/services/intake-parser.service';
import {
  parseIntakeWithAi, isIntakeAiConfigured, resolveProvider, isViewableAttachment, intakeAiModel,
  type IntakeAttachment, type ParserProject,
} from '../../tasks/services/intake-ai.service';
import {
  transcribeAudio, isSttConfigured, normalizeAudioName, MAX_AUDIO_BYTES,
} from '../../sales/services/minutes-ai.service';

import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';

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

/**
 * この人は案件（`sales`）を見てよいか。**案件リンクを出すか**と
 * **投入口が案件を触れるか**の両方がここを読む。
 *
 * ⚠️ 以前はここで `user_permissions` を引き直していたが、
 * **認証がすでに読んで `req.user.permissions` に載せている**（`auth.ts`）。
 * 2 か所で答えを出すと、片方だけ直した日から「リンクは出るのに 403」になる。
 */
function canSeeProjects(req: Request): boolean {
  return meetsPermissionLevel(req.user?.role, req.user?.permissions?.sales, 'reader');
}

/**
 * 案件に**書ける**か。ネタ案件・活動記録・議事録はどれも `sales` の表に入る。
 *
 * ⚠️ **投入口は `dailyops` の口**なのに、確定（`commitIntake`）は
 * `projects` / `customers` / `activity_logs` / `project_minutes` に**直接書いていた**。
 * つまり `dailyops` だけの人が、案件を1件も開けないまま案件を作れていた。
 */
function canWriteProjects(req: Request): boolean {
  return meetsPermissionLevel(req.user?.role, req.user?.permissions?.sales, 'editor');
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


/** 宛先解決に使うユーザー一覧 (名前 → users.id) */
async function loadUsers(): Promise<{ id: string; name: string }[]> {
  return (await queryAll(
    `SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY name`
  )) as { id: string; name: string }[];
}

/**
 * 議事録・活動記録の紐づけ先の候補。**動いている案件だけ**を新しい順に出す。
 * 全件渡すと、終わった案件に議事録がぶら下がる（しかも誰も見に行かない）。
 *
 * **案件を見る権限が無い人には空で返します**（呼ぶ側が判定して渡す）。
 * AI に候補を渡さなければ、下書きに案件が出てこないので、
 * **「候補は見えるのに開けない」という食い違いも起きません**。
 */
async function loadProjectCandidates(): Promise<ParserProject[]> {
  return (await queryAll(
    `SELECT id, name, COALESCE(gls_number, code) AS code,
            (SELECT c.name FROM customers c WHERE c.id = p.customer_id) AS customer_name
     FROM projects p
     WHERE deleted_at IS NULL AND stage IN ('neta','d_hold','c_proposal','b_verbal','a_won')
     ORDER BY updated_at DESC
     LIMIT 80`
  )) as unknown as ParserProject[];
}

interface AnalyzeResult {
  parsed: ParseResult;
  users: { id: string; name: string }[];
  projects: ParserProject[];
  model: string;
  promptVersion: string | null;
  aiError: string | null;
}

/**
 * 投入テキスト（＋添付）を解析する。**同期の経路と、録音の裏の経路で同じものを使う。**
 * 2 つ書くと、片方だけ直した日から「打って投げたときと録って投げたときで
 * 行き先の決まり方が違う」が起きます。
 *
 * 解析は ChatGPT API (OpenAI) を主経路、規則ベースをフォールバックにする。
 * API キー未設定・障害・タイムアウトでも **投入口は必ず動く**ようにする
 * (ここが動かないと依頼が口頭のまま消え、この仕組みの目的が失われるため)。
 */
async function analyzeIntake(
  rawText: string,
  userId: string,
  attachments: IntakeAttachment[],
  /**
   * 案件を見てよい人か。**false なら候補を1件も渡さない** —
   * AI に候補を渡さなければ下書きに案件が出ないので、
   * 「候補には出るのに開けない・確定できない」という食い違いが起きない
   */
  withProjects: boolean,
): Promise<AnalyzeResult> {
  const users = await loadUsers();
  const projects = withProjects ? await loadProjectCandidates() : [];
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
      // 費用を見るために残す（`ai_outputs` は「出力」の器なので、ここでは足りない）
      await recordAiUsage({
        kind: 'intake', provider: ai.provider, model: ai.model, actorId: userId,
        inputTokens: ai.usage.inputTokens,
        cachedInputTokens: ai.usage.cachedInputTokens,
        outputTokens: ai.usage.outputTokens,
      });
    } catch (e) {
      // 解析が落ちても投入自体は通す。規則ベースに縮退して人に確認させる
      aiError = (e as Error).message;
      console.warn(
        `[task-intake] AI 解析に失敗したため規則ベースに縮退 (provider=${resolveProvider() ?? 'なし'}): ${aiError}`
      );
      // **失敗も残す。** 課金されることがあるので、外すと総額が合わない
      await recordAiUsage({
        kind: 'intake', provider: resolveProvider(), model: intakeAiModel(),
        actorId: userId, ok: false, errorMessage: aiError,
      });
      parsed = parseIntakeText(rawText, users, { now });
    }
  } else {
    parsed = parseIntakeText(rawText, users, { now });
  }
  return { parsed, users, projects, model, promptVersion, aiError };
}

/**
 * 下書きを画面・DB に渡す形に整える。
 *
 * 投入者が「依頼した」ものなので、依頼者は投入者本人。
 * 自分自身が担当のものは依頼ではなく個人タスクなので requester_id を付けない。
 * **タスク以外には依頼者を付けない**（活動記録や議事録に「依頼」は無い）。
 */
function toDrafts(parsed: ParseResult, userId: string) {
  return parsed.drafts.map((d) => ({
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
}

/** イズム: 期限が遠いものは短くするよう促す */
function farDueKeys(parsed: ParseResult): string[] {
  return parsed.drafts.map((d, i) => (d.due_far ? `d${i + 1}` : null)).filter((x): x is string => x !== null);
}

/**
 * 録音を裏で文字にして解析まで進める（migration 180）。
 *
 * **ここは誰も待っていません。** 投げっぱなしなので、
 * **失敗しても必ず行に残す** — 残さないと `transcribing` のまま宙に浮きます。
 */
async function runIntakeTranscription(
  intakeId: string,
  p: {
    audio: Buffer;
    filename: string;
    typedText: string;
    extraTexts: string[];
    attachments: IntakeAttachment[];
    userId: string;
    /** 投げた人が案件を見てよいか（`req` はここには来ないので投げるときに決める） */
    withProjects: boolean;
  },
): Promise<void> {
  try {
    // **上限を渡さない。** 議事録と同じ既定 (10 分) で、長い録音も通す。
    // リクエストの中ではないので nginx の 60 秒とは関係がない
    const stt = await transcribeAudio(p.audio, p.filename);
    await recordAiUsage({
      kind: 'stt', provider: 'openai', model: stt.model,
      audioSeconds: stt.durationSec ?? 0, actorId: p.userId,
    });
    const rawText = [p.typedText, `--- 録音の文字起こし ---\n${stt.text}`, ...p.extraTexts]
      .filter((s) => s && s.trim())
      .join('\n\n');

    const a = await analyzeIntake(rawText, p.userId, p.attachments, p.withProjects);
    await taskIntakeService.finishTranscribing(
      intakeId,
      { raw_text: rawText, drafts: toDrafts(a.parsed, p.userId), model: a.model, prompt_version: a.promptVersion },
      p.userId,
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.warn(`[task-intake] 録音の文字起こしに失敗 (intake=${intakeId}): ${msg}`);
    await taskIntakeService.failTranscribing(intakeId, msg).catch((e2) => {
      // ここまで落ちると行が `transcribing` のまま残るが、読むときに
      // 経過時間で失敗として見せるので画面は止まらない
      console.error('[task-intake] 失敗の記録にも失敗:', (e2 as Error).message);
    });
  }
}

/**
 * 録音中の**下読み**（`POST /tasks/intake/preview-transcribe`）
 *
 * ── 何のためにあるか ────────────────────────────────────────
 *
 * 録音は「押したあと、本当に録れているのか」が分からない操作です。
 * 赤い点と経過時間だけでは、**マイクが別の機器を向いていても同じ見た目**になります。
 * 20 秒ごとの短い断片をその場で文字にして 3〜4 行だけ出すと、
 * **自分の声が拾えているかがその場で分かります**。
 *
 * ── ここで作った文字は「使い捨て」──────────────────────────
 *
 * **最終的な文字起こしは、止めたあとに録音まるごとを 1 回で通したもの**です。
 * 下読みは 20 秒で切っているので**切れ目で単語が割れます**。議事録は
 * 取引先との合意の記録なので、割れた文字をそのまま本文にはしません。
 * ⚠️ そのぶん Whisper を 2 回通します（下読み ＋ 本番）。費用が気になる場合は
 * 下読みの間隔を延ばすか、この口を止めてください（録音自体は止まりません）。
 *
 * ── 何も残さない ────────────────────────────────────────────
 *
 * DB にも `ai_outputs` にも書きません。**AI の出力として記録するのは
 * 本番の文字起こしだけ**です（下読みを混ぜると、同じ録音が 2 回
 * 教師データに入って無修正採用率がぶれます）。
 */
const previewUpload = multer({
  storage: multer.memoryStorage(),
  // 20 秒の断片は 32kbps で 80KB ほど。**大きいものはここで断る**
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
}).single('audio');

/** 下読みは押した人を待たせるので短く諦める（録音は止めない） */
const PREVIEW_STT_TIMEOUT_MS = 20_000;

router.post('/tasks/intake/preview-transcribe', ...canEdit, previewUpload, async (req, res) => {
  me(req);
  if (!isSttConfigured()) {
    // **200 で返す。** 下読みが出ないだけで録音は続けられるので、
    // 画面をエラーにしない（赤い帯を出すと録音を止めてしまう人がいる）
    res.json({ success: true, data: { text: '', reason: 'NOT_CONFIGURED' } });
    return;
  }
  const file = req.file;
  if (!file) throw new AppError(400, 'VALIDATION_ERROR', '音声が添付されていません');

  try {
    const stt = await transcribeAudio(
      file.buffer,
      normalizeAudioName(fileName(file), file.mimetype),
      { timeoutMs: PREVIEW_STT_TIMEOUT_MS },
    );
    await recordAiUsage({
      kind: 'stt_preview', provider: 'openai', model: stt.model,
      audioSeconds: stt.durationSec ?? 0, actorId: req.user?.id ?? null,
    });
    res.json({ success: true, data: { text: stt.text } });
  } catch (e) {
    await recordAiUsage({
      kind: 'stt_preview', provider: 'openai', model: null,
      ok: false, errorMessage: (e as Error).message, actorId: req.user?.id ?? null,
    });
    // **失敗しても 200。** 下読みが 1 回抜けただけで録音を止めない
    res.json({ success: true, data: { text: '', reason: (e as Error).message } });
  }
});

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

  // ── 録音は裏で文字にする ────────────────────────────────
  //
  // **リクエストの中で待たない。** nginx の `/api/` は `proxy_read_timeout` を
  // 書いていないので**既定の 60 秒で切れます**。待つ形にすると 3 分程度の録音しか
  // 投げられず、打合せには短すぎます（いちど画面側で 3 分に制限しましたが、
  // それでは意味がないというご指摘をいただいて作り直しました）。
  //
  // 議事録（`/projects/:id/minutes`）と同じく、**行を先に作って 202 を返し**、
  // 文字起こしと解析は裏で進めます。画面はその行を読みに来ます。
  if (audio) {
    if (!isSttConfigured()) {
      throw new AppError(400, 'NOT_CONFIGURED',
        'この環境は文字起こしにつないでいません（OPENAI_API_KEY 未設定）。管理者にご連絡ください');
    }
    const intake = await taskIntakeService.createTranscribingIntake(rawText, userId);
    // **await しない。** ここで待つと 60 秒で切れる（この形にした理由そのもの）
    void runIntakeTranscription(intake.id, {
      audio: audio.buffer,
      // 中身と名前が食い違っていたら直す（Safari は mp4 を返すのに `.webm` で飛んでくる）
      filename: normalizeAudioName(fileName(audio), audio.mimetype),
      typedText: rawText,
      extraTexts,
      attachments,
      userId,
      // **裏で走るので `req` が無い。** 投げた時点の権限をここで決めて持たせる
      withProjects: canSeeProjects(req),
    });
    res.status(202).json({
      success: true,
      data: { ...intake, users: [], projects: [], parsed_by: null, skipped: [], far_due_keys: [] },
    });
    return;
  }

  const parts = [rawText, ...extraTexts].filter((s) => s && s.trim());
  rawText = parts.join('\n\n');

  if (!rawText && attachments.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '投入するテキストを入力するか、ファイルを添付してください');
  }
  // 添付だけのときも**原文を空で残さない**（何を投げたのか後から分からなくなる）
  if (!rawText) {
    rawText = attachments.map((a) => `（添付のみ）${a.name}`).join('\n');
  }

  const { parsed, users, projects, model, promptVersion, aiError } =
    await analyzeIntake(rawText, userId, attachments, canSeeProjects(req));
  const drafts = toDrafts(parsed, userId);

  const intake = await taskIntakeService.createIntake(
    {
      raw_text: rawText,
      // **`kind` は投入の種類（何から入ったか）だけを表す。** 行き先は draft の `dest`
      kind: 'freeform',
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
      far_due_keys: farDueKeys(parsed),
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
    String(req.params.id), rows as TaskDraft[], userId, canWriteProjects(req),
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

/**
 * 投入 1 件 + そこから生まれたタスク (遡ってレビューする)。
 *
 * **録音の待ち受けもここを読みます**（`status='transcribing'` の間だけ画面が繰り返し叩く）。
 * 下書きが出来ていたら、確認画面に必要な**担当者と案件の候補も一緒に返します** —
 * 別の口に取りに行かせると、その 1 本だけ落ちたときに確認画面が空の選択肢で出ます。
 */
router.get('/tasks/intakes/:id', ...canRead, async (req, res) => {
  const intake = await taskIntakeService.get(String(req.params.id));
  const generated = await taskIntakeService.listGeneratedTasks(String(req.params.id));
  const needsPickers = intake.status === 'pending' && (intake.drafts?.length ?? 0) > 0;
  res.json({
    success: true,
    data: {
      ...intake,
      generated_tasks: generated,
      users: needsPickers ? await loadUsers() : [],
      projects: needsPickers && canSeeProjects(req) ? await loadProjectCandidates() : [],
    },
  });
});

// ══════════════════════════════════════════════
// 自分のタスクと依頼
// ══════════════════════════════════════════════

/** 自分のタスク (案件タスク + 個人タスクを混ぜて 9 マス / スコア順) */
router.get('/tasks/mine', ...canRead, async (req, res) => {
  const userId = me(req);
  const tasks = await myTasksService.listMyTasks(userId, {
    includeCompleted: req.query.include_completed === '1',
    overdueOnly: req.query.overdue === '1',
    dueToday: req.query.due_today === '1',
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  const canOpen = canSeeProjects(req);
  res.json({ success: true, data: tasks, meta: { can_open_project: canOpen } });
});

/** 依頼 (受けた / 出した) */
router.get('/tasks/delegations', ...canRead, async (req, res) => {
  const userId = me(req);
  const direction = req.query.direction === 'sent' ? 'sent' : 'received';
  const rows = await myTasksService.listMyDelegations(userId, direction, {
    includeDone: req.query.include_done === '1',
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  const canOpen = canSeeProjects(req);
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
