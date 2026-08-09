// 投入テキストの受け皿 — 「投げたものを一次資料として残す」ための service。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D4 / D5 / D9)
//
// 流れ:
//   1. createIntake  … 投げた生テキスト + AI が解析したタスク案 (下書き) を保存。
//                       この時点では **本登録しない**。ai_outputs にも記録する。
//   2. commitIntake  … 人が確認・修正したものだけを本登録。
//                       下書きと確定内容の差分を ai_corrections に積む。
//   3. discardIntake … 全部要らなかった場合。テキストは残す (捨てるのは下書きだけ)。
//
// 差分の突合は **配列 index ではなく draft_key** で行う。
// index だと 1 件外すだけで以降すべてが「変更」と数えられ、修正率が実態とかけ離れる。

import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput,
  recordCorrections,
  diffByKey,
  type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { normalizeDest, type IntakeDest } from './intake-parser.service';

export type IntakeKind = 'freeform' | 'minutes' | 'mail' | 'chat' | 'other';
export type IntakeStatus = 'pending' | 'committed' | 'discarded' | 'transcribing' | 'failed';

/**
 * 文字起こしが「止まっている」と見なすまでの時間 (migration 180)。
 *
 * コンテナが途中で再起動すると、誰も終わらせないまま `transcribing` が残ります。
 * **DB は書き換えず**、読むときに経過時間で失敗として見せます
 * （`minutes.service` と同じ扱い。書き換えると、生き返った処理と競合する）。
 */
export const TRANSCRIBE_STALE_MS = 30 * 60_000;

/**
 * 行き先ごとの日本語。**画面とサーバーで同じ言葉を使う**ため、
 * エラー文にもここを使う（画面には「タスク」と出ているのに
 * 「やること」と返すと、どの行のことか分からなくなる）。
 */
export const DEST_LABEL: Record<IntakeDest, string> = {
  task: 'タスク',
  neta: '案件（ネタ）',
  log: '活動記録',
  minutes: '議事録',
};

/** AI が出したタスク案 1 件 */
export interface TaskDraft {
  /** 行き先。**無いときは `task`**（旧い呼び出しは全部タスクだった） */
  dest?: IntakeDest;
  /** 差分突合用の安定キー (サーバーが d1, d2, … で振る) */
  draft_key: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  assigned_to?: string | null;
  /** 依頼なら依頼者 (通常は投入者本人) */
  requester_id?: string | null;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  /**
   * AI が期限の時刻を補完したか。
   * 「金曜まで」のように日付しか書かれていなかった場合に true。
   * **黙って補完すると曖昧なまま確定したことになりイズムに反する**ため、
   * UI はこの印を見せて人に確認させる (要件 D9)。
   */
  due_time_assumed?: boolean;
  /** 期限が曖昧・不明 (「今週中」「なるべく早く」) */
  due_unclear?: boolean;
  /** 宛先が特定できなかった (「隣の席の人」「営業チーム」) */
  assignee_unclear?: boolean;
  /** 根拠となった投入テキストの引用 */
  quote?: string | null;
  /** 確認画面の既定チェック状態 (宛先・期限が揃っていれば ON) */
  suggested_default?: boolean;

  // ── 行き先ごとの中身。**空 = 読み取れなかった**（推測で埋めない） ──
  /** お客様（会社）の名前。`neta` は commit のときに find-or-create する */
  customer_name?: string | null;
  /** 本文。`neta` の要望 / `log` の詳細 */
  detail?: string | null;
  /** `neta` の分類 A=スタジオ / B=ビジネス */
  gls_category?: 'A' | 'B' | null;
  /** `log` の種別 */
  activity_type?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  /** `minutes` の中身 */
  summary?: string | null;
  decisions?: { text: string; quote: string }[];
  open_items?: { text: string; owner: string; due: string }[];
}

/** commit の結果。**行き先ごとに何件入ったか**を画面に返す */
export interface CommitResult {
  intake: TaskIntake;
  created_ids: string[];
  created: { dest: IntakeDest; id: string; title: string }[];
}

export interface TaskIntake {
  id: string;
  raw_text: string;
  kind: IntakeKind;
  status: IntakeStatus;
  drafts: TaskDraft[] | null;
  ai_output_id: string | null;
  committed_at: string | null;
  discarded_at: string | null;
  note: string | null;
  /** 文字起こし・解析に失敗した理由 (migration 180)。**画面に出す** */
  error_message: string | null;
  transcribed_at: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  /** この投入から生まれたタスク件数 */
  task_count?: number;
}

const SELECT_INTAKE = `
  SELECT i.id, i.raw_text, i.kind, i.status, i.drafts, i.ai_output_id,
         i.committed_at, i.discarded_at, i.note,
         i.error_message, i.transcribed_at,
         i.created_at, i.created_by, u.name AS created_by_name,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.source_ref = i.id AND t.deleted_at IS NULL) AS task_count
  FROM task_intake i
  LEFT JOIN users u ON u.id = i.created_by
`;

/**
 * 既定チェック ON にしてよいか。**足りないものがある行は OFF** にして人に聞く (要件 D4)。
 * 行き先ごとに「揃っている」の意味が違う。
 */
function computeDefault(d: TaskDraft): boolean {
  switch (normalizeDest(d.dest)) {
    case 'task':
      if (d.assignee_unclear || !d.assigned_to) return false;
      if (d.due_unclear || !d.due_at) return false;
      return true;
    case 'neta':
      // お客様と分類が読めていないと案件が作れない
      return !!d.customer_name?.trim() && (d.gls_category === 'A' || d.gls_category === 'B');
    case 'log':
      return !!d.title?.trim();
    case 'minutes':
      // 議事録は案件にぶら下がる。案件が読めていないと入れる場所が無い
      return !!d.project_id;
    default:
      return false;
  }
}

/** AI から受け取った案に draft_key と既定チェックを振る */
function normalizeDrafts(input: Omit<TaskDraft, 'draft_key'>[]): TaskDraft[] {
  return (input ?? []).map((d, i) => {
    const draft: TaskDraft = { ...d, dest: normalizeDest(d.dest), draft_key: `d${i + 1}` };
    draft.suggested_default = computeDefault(draft);
    return draft;
  });
}

/**
 * 差分を取る対象。振り分け結果そのものなので、ここが教師データになる (要件 第6章)。
 *
 * **`dest` を先頭に入れているのがこの版の要点。** 投入口を1本にして
 * 行き先まで AI に決めさせた以上、「ネタ案件に振ったのを人がタスクに直した」が
 * いちばん価値のある教師データになる。ここを外すと、
 * **一番よく間違える項目だけが記録に残らない**。
 */
const DIFF_FIELDS = [
  'dest',
  'title', 'assigned_to', 'project_id', 'due_at', 'importance', 'urgency',
  'customer_name', 'gls_category', 'activity_type', 'next_action', 'next_action_date',
  'summary',
];

/**
 * 「文字起こし中のまま止まった行」を**読むときだけ**失敗として見せる。
 *
 * コンテナが再起動すると誰も終わらせないまま `transcribing` が残ります。
 * **DB は書き換えません** — 書き換えると、生き返った処理が
 * `pending` に戻したときに競合します（`minutes.service` と同じ扱い）。
 */
function withStaleCheck(row: TaskIntake): TaskIntake {
  if (row.status !== 'transcribing') return row;
  const started = new Date(String(row.created_at).replace(' ', 'T')).getTime();
  if (Number.isNaN(started) || Date.now() - started < TRANSCRIBE_STALE_MS) return row;
  return {
    ...row,
    status: 'failed',
    error_message: row.error_message
      ?? '文字起こしが終わらないまま止まっています（サーバーが途中で再起動した可能性があります）。もう一度投げ直してください',
  };
}

/** `withTransaction` が渡してくる口。ここで要るのは 2 つだけ */
type Tx = { execute(sql: string, params?: unknown[]): Promise<void>; queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined> };

/**
 * OPP コードを採る。**`sequence.service` を写していない**（同じ SQL）—
 * あちらはプールから別の接続を取るので、このトランザクションの中で
 * 呼ぶと採番だけがロールバックされずに残る（番号が飛ぶ）。
 */
async function nextOppCode(tx: Tx): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const row = await tx.queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES ('opp_code', 'OPP', ?, 1)
     ON CONFLICT (seq_name) DO UPDATE SET
       counter = CASE WHEN sequences.year_month = EXCLUDED.year_month THEN sequences.counter + 1 ELSE 1 END,
       year_month = EXCLUDED.year_month
     RETURNING counter`,
    [ym]
  );
  return `OPP-${ym}-${String(Number(row?.counter ?? 1)).padStart(4, '0')}`;
}

/**
 * お客様を名前で引く。**作らない。**
 *
 * 突合は前後の空白を落とすだけの完全一致。ゆるく当てると
 * 「GMO」で別会社に紐づくほうが、紐づかないより悪い（気づけない）。
 */
async function findCustomerId(tx: Tx, name: string): Promise<string | null> {
  const row = await tx.queryOne(
    `SELECT id FROM customers WHERE deleted_at IS NULL AND btrim(name) = btrim(?) ORDER BY created_at LIMIT 1`,
    [name]
  );
  return row ? String(row.id) : null;
}

/**
 * お客様を名前で引き、無ければ作る（ネタ案件だけ）。
 *
 * **ネタ案件でだけ作るのは要件のとおり。** 新しい引き合いは新しい会社から来るので、
 * ここで作れないと「まず取引先を登録してください」と言うことになり、
 * 投入口の意味（1 か所に放り込むだけ）が消える。
 * 活動記録では作らない — 済んだやり取りの記録から会社を増やすと、
 * 綴り違いの重複が台帳に溜まる。
 */
async function findOrCreateCustomer(tx: Tx, name: string, userId: string): Promise<string> {
  const found = await findCustomerId(tx, name);
  if (found) return found;
  const id = uuidv4();
  await tx.execute(
    `INSERT INTO customers (id, name, created_by) VALUES (?, ?, ?)`,
    [id, name, userId]
  );
  return id;
}

export const taskIntakeService = {
  /**
   * 投入を記録する。**タスクは作らない** (status='pending' の下書きのまま)。
   * 生テキストは切り詰めずに保存する。
   */
  async createIntake(
    data: {
      raw_text: string;
      kind?: IntakeKind;
      drafts?: Omit<TaskDraft, 'draft_key'>[];
      note?: string | null;
      requested_by?: string | null;
      tool_name?: string | null;
      /** 解析に使ったモデル (規則ベースなら 'rules')。改善効果の測定に使う */
      model?: string | null;
      /** プロンプト版。これが無いとプロンプト改善の前後を比較できない */
      prompt_version?: string | null;
    },
    userId: string
  ): Promise<TaskIntake> {
    if (!data.raw_text?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '投入するテキストが空です');

    const id = uuidv4();
    const drafts = normalizeDrafts(data.drafts ?? []);

    // AI の出力として記録 (入力は task_intake.raw_text 側に残る)
    const aiOutputId = await recordAiOutput({
      kind: 'task_intake',
      targetTable: 'task_intake',
      targetId: id,
      payload: { raw_text: data.raw_text, kind: data.kind ?? 'freeform', drafts },
      toolName: data.tool_name ?? null,
      model: data.model ?? null,
      promptVersion: data.prompt_version ?? null,
      actorId: userId,
      requestedBy: data.requested_by ?? null,
    });

    await execute(
      `INSERT INTO task_intake
         (id, raw_text, kind, status, drafts, ai_output_id, note, created_by, updated_at)
       VALUES (?, ?, ?, 'pending', ?::jsonb, ?, ?, ?, NOW())`,
      [
        id,
        data.raw_text,
        data.kind ?? 'freeform',
        JSON.stringify(drafts),
        aiOutputId,
        data.note ?? null,
        userId,
      ]
    );
    return this.get(id);
  },

  /**
   * 録音つきの投入を**先に行だけ作る**（migration 180）。
   *
   * ── なぜ待たせないか ──────────────────────────────────────
   *
   * 文字起こしは 1 時間の録音で数分かかります。**nginx の `/api/` は
   * 既定の 60 秒で切る**ので、リクエストの中で待つと長い録音が投げられません
   * （実質 3 分が上限になり、打合せには短すぎる）。議事録が最初から
   * この形なので、投入口も同じにします。
   *
   * **`raw_text` は NOT NULL** なので、打ち込みが空のときは印を入れておき、
   * 文字起こしが終わったときに本文へ差し替えます。
   */
  async createTranscribingIntake(typedText: string, userId: string): Promise<TaskIntake> {
    const id = uuidv4();
    await execute(
      `INSERT INTO task_intake (id, raw_text, kind, status, created_by, updated_at)
       VALUES (?, ?, 'other', 'transcribing', ?, NOW())`,
      [id, typedText.trim() || '（録音を文字起こししています）', userId],
    );
    return this.get(id);
  },

  /**
   * 文字起こしと解析が終わったので、下書きを入れて `pending` にする。
   *
   * **`ai_outputs` はここで作る**（条件1）。行を作った時点では
   * AI の出力がまだ無いので、先に作ると空の記録が残ります。
   */
  async finishTranscribing(
    intakeId: string,
    data: {
      raw_text: string;
      drafts: Omit<TaskDraft, 'draft_key'>[];
      model?: string | null;
      prompt_version?: string | null;
    },
    userId: string,
  ): Promise<TaskIntake> {
    const drafts = normalizeDrafts(data.drafts ?? []);
    const aiOutputId = await recordAiOutput({
      kind: 'task_intake',
      targetTable: 'task_intake',
      targetId: intakeId,
      payload: { raw_text: data.raw_text, kind: 'other', drafts },
      toolName: 'ui:intake:audio',
      model: data.model ?? null,
      promptVersion: data.prompt_version ?? null,
      actorId: userId,
      requestedBy: null,
    });
    await execute(
      `UPDATE task_intake
       SET raw_text = ?, drafts = ?::jsonb, ai_output_id = ?,
           status = 'pending', transcribed_at = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = ?`,
      [data.raw_text, JSON.stringify(drafts), aiOutputId, intakeId],
    );
    return this.get(intakeId);
  },

  /**
   * 文字起こしか解析に失敗した。**行は消さない** —
   * 何を投げたのかと、なぜ駄目だったのかを残す（消すと録り直すしかなくなる）。
   */
  async failTranscribing(intakeId: string, message: string): Promise<void> {
    await execute(
      `UPDATE task_intake
       SET status = 'failed', error_message = ?, updated_at = NOW()
       WHERE id = ? AND status = 'transcribing'`,
      [message.slice(0, 1000), intakeId],
    );
  },

  /**
   * 確認済みの下書きを本登録する。**行き先 (`dest`) ごとに入れる先が違う。**
   *
   * - 渡された rows だけを作る (外されたものは作らない = 不採用として差分に残る)
   * - 下書きとの差分を ai_corrections に積む。**無修正で採用したものは 'none'**
   *   (正解ラベル。これが無いと無修正採用率の分母が壊れる)
   * - 依頼 (requester_id あり) は期限を必須にする (要件 D9)
   *
   * ── 4 つの行き先を 1 つのトランザクションで書く ────────────────
   *
   * 分けると「タスクは入ったが活動記録は入っていない」が起き、
   * **人は「登録した」と思っているので、もう一度は投げません**（黙って消える）。
   *
   * ── 作ったものに `idempotency_key` を残す（列を足さずに済ませる）────
   *
   * `projects` / `activity_logs` には `idempotency_key`（部分一意索引つき）と
   * `source_channel` が既にあります（migration 126）。`intake:<投入id>:<draft_key>` を
   * 入れておくと、①押し直しによる二重登録を **DB が**拒否し、
   * ②あとから「投入口から生まれた案件が受注に至ったか」を
   * **新しい表を作らずに**数えられます（AI 改善の条件3）。
   */
  async commitIntake(
    intakeId: string,
    rows: TaskDraft[],
    userId: string
  ): Promise<CommitResult> {
    const intake = await this.get(intakeId);
    if (intake.status === 'committed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'この投入はすでに登録済みです');
    }
    if (!rows?.length) {
      throw new AppError(400, 'VALIDATION_ERROR', '登録するものがありません。破棄する場合は破棄してください');
    }

    // 事前検証 (トランザクションに入る前に弾く)。**行き先ごとに要るものが違う**
    for (const t of rows) {
      const dest = normalizeDest(t.dest);
      const label = DEST_LABEL[dest];
      if (!t.title?.trim()) {
        throw new AppError(400, 'VALIDATION_ERROR', `内容が空の${label}があります`);
      }
      if (dest === 'task') {
        if (!t.assigned_to) {
          throw new AppError(400, 'VALIDATION_ERROR', `「${t.title}」の担当者が決まっていません`);
        }
        if (t.requester_id && !t.due_at) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            `「${t.title}」は依頼なので期限が必要です。何月何日何時何分までかを指定してください`
          );
        }
        if (t.importance != null && (t.importance < 1 || t.importance > 3)) {
          throw new AppError(400, 'VALIDATION_ERROR', '重要度は 1〜3 で指定してください');
        }
        if (t.urgency != null && (t.urgency < 1 || t.urgency > 3)) {
          throw new AppError(400, 'VALIDATION_ERROR', '緊急度は 1〜3 で指定してください');
        }
      }
      if (dest === 'neta') {
        if (!t.customer_name?.trim()) {
          throw new AppError(400, 'VALIDATION_ERROR', `「${t.title}」のお客様が決まっていません`);
        }
        if (t.gls_category !== 'A' && t.gls_category !== 'B') {
          throw new AppError(400, 'VALIDATION_ERROR', `「${t.title}」の案件分類（スタジオ / ビジネス）を選んでください`);
        }
      }
      if (dest === 'minutes' && !t.project_id) {
        // 議事録は案件にぶら下がる（`project_minutes.project_id` は NOT NULL）
        throw new AppError(400, 'VALIDATION_ERROR', `「${t.title}」をどの案件の議事録にするか選んでください`);
      }
    }

    const created = await withTransaction(async (tx) => {
      const out: { dest: IntakeDest; id: string; title: string }[] = [];
      for (const t of rows) {
        const dest = normalizeDest(t.dest);
        const key = `intake:${intakeId}:${t.draft_key}`;
        const id = uuidv4();

        if (dest === 'task') {
          const isDelegation = !!t.requester_id;
          await tx.execute(
            `INSERT INTO project_tasks
               (id, project_id, title, description, task_type,
                assigned_to, requester_id, requested_at, delegation_status,
                due_at, importance, urgency, source, source_ref, visibility,
                sort_order, created_by, updated_by)
             VALUES (?, ?, ?, ?, 'free',
                     ?, ?, ?, ?,
                     ?, ?, ?, ?, ?, 'team',
                     0, ?, ?)`,
            [
              id,
              t.project_id ?? null,
              t.title.trim(),
              t.description ?? t.detail ?? null,
              t.assigned_to,
              t.requester_id ?? null,
              isDelegation ? new Date().toISOString() : null,
              isDelegation ? 'requested' : null,
              t.due_at ?? null,
              t.importance ?? 2,
              t.urgency ?? 2,
              // 投入経由であることを残す。source_ref から元テキストへ遡れる
              `intake:${intake.kind}`,
              intakeId,
              userId,
              userId,
            ]
          );
        } else if (dest === 'neta') {
          const customerId = await findOrCreateCustomer(tx, t.customer_name!.trim(), userId);
          const code = await nextOppCode(tx);
          await tx.execute(
            `INSERT INTO projects
               (id, code, name, customer_id, stage, project_type, gls_category,
                expected_amount, assigned_to, notes, customer_type,
                intake_channel, idempotency_key, source_channel, created_by)
             /* customer_type は internal / external の2値（社内案件か外のお客様か）で、
                投入口から入るのは外からの引き合いなので external。
                intake_channel の 'other' も CHECK にある値。どちらも実 DB で確かめた */
             VALUES (?, ?, ?, ?, 'neta', 'other', ?, 0, ?, ?, 'external', 'other', ?, 'intake', ?)`,
            [id, code, t.title.trim(), customerId, t.gls_category, userId, t.detail ?? null, key, userId]
          );
          // **最初のステージも履歴に残す**（`project.service` の create と同じ理由 —
          // 1件目が無いと「ネタでいた期間」が測れない）
          await tx.execute(
            `INSERT INTO project_stage_changes (id, project_id, from_stage, to_stage, changed_by)
             VALUES (?, ?, NULL, 'neta', ?)`,
            [uuidv4(), id, userId]
          );
        } else if (dest === 'log') {
          // お客様は**照合するだけ**で作らない。活動記録は相手が分からなくても
          // 記録として成立する（作ると、綴り違いの会社が台帳に増える）
          const customerId = t.customer_name?.trim()
            ? await findCustomerId(tx, t.customer_name.trim())
            : null;
          await tx.execute(
            `INSERT INTO activity_logs
               (id, project_id, customer_id, user_id, activity_type, activity_date,
                subject, description, next_action, next_action_date,
                idempotency_key, source_channel, created_by)
             VALUES (?, ?, ?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, 'intake', ?)`,
            [
              id, t.project_id ?? null, customerId, userId,
              t.activity_type || 'other',
              t.title.trim(), t.detail ?? null,
              t.next_action ?? null, t.next_action_date ?? null,
              key, userId,
            ]
          );
        } else {
          // 議事録。**原文をそのまま `transcript` に残す** — 録音から起こしたものと
          // 同じ形にしておくと、あとで整形をやり直せる（`minutes.service` と同じ考え方）
          await tx.execute(
            `INSERT INTO project_minutes
               (id, project_id, status, title, met_on, transcript,
                summary, decisions, open_items,
                ai_output_id, model, prompt_version, created_by, updated_by)
             VALUES (?, ?, 'draft', ?, to_char(CURRENT_DATE, 'YYYY-MM-DD'), ?,
                     ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?)`,
            [
              id, t.project_id, t.title.trim(), intake.raw_text,
              t.summary ?? null,
              JSON.stringify(t.decisions ?? []),
              JSON.stringify(t.open_items ?? []),
              intake.ai_output_id, null, null, userId, userId,
            ]
          );
        }
        out.push({ dest, id, title: t.title.trim() });
      }
      await tx.execute(
        `UPDATE task_intake
         SET status = 'committed', committed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [intakeId]
      );
      return out;
    });
    const createdIds = created.map((c) => c.id);
    const tasks = rows;

    // 差分を記録 (業務を壊さない best-effort)。draft_key で突合する
    if (intake.ai_output_id) {
      const before = intake.drafts ?? [];
      const diffs: CorrectionInput[] = diffByKey(
        before,
        tasks,
        'draft_key',
        DIFF_FIELDS,
        'tasks'
      );
      // 無修正で採用されたものを 'none' として明示的に記録する。
      // これが無いと「修正されなかった」ことが記録に残らず、無修正採用率が出せない。
      const changedKeys = new Set(
        diffs.map((d) => d.fieldPath.replace(/^tasks\[/, '').replace(/\].*$/, ''))
      );
      const keptKeys = new Set(tasks.map((t) => t.draft_key));
      for (const b of before) {
        if (keptKeys.has(b.draft_key) && !changedKeys.has(b.draft_key)) {
          diffs.push({ fieldPath: `tasks[${b.draft_key}]`, type: 'none' });
        }
      }
      if (diffs.length) {
        await recordCorrections(intake.ai_output_id, diffs, userId);
      }
    }

    return { intake: await this.get(intakeId), created_ids: createdIds, created };
  },

  /** 下書きを破棄する。**生テキストは残す** (投げた事実は消さない) */
  async discardIntake(intakeId: string, userId: string, note?: string | null): Promise<TaskIntake> {
    const intake = await this.get(intakeId);
    if (intake.status === 'committed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'すでに登録済みの投入は破棄できません');
    }
    await execute(
      `UPDATE task_intake
       SET status = 'discarded', discarded_at = NOW(),
           note = COALESCE(?, note), updated_at = NOW()
       WHERE id = ?`,
      [note ?? null, intakeId]
    );

    // 全件不採用として差分に残す (AI が何を外されたか学べるように)
    if (intake.ai_output_id && intake.drafts?.length) {
      const diffs: CorrectionInput[] = intake.drafts.map((d) => ({
        fieldPath: `tasks[${d.draft_key}]`,
        before: d,
        after: null,
        type: 'reject' as const,
      }));
      await recordCorrections(intake.ai_output_id, diffs, userId);
    }
    return this.get(intakeId);
  },

  async get(id: string): Promise<TaskIntake> {
    const row = await queryOne(`${SELECT_INTAKE} WHERE i.id = ? AND i.deleted_at IS NULL`, [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', '投入が見つかりません');
    return withStaleCheck({
      ...(row as unknown as TaskIntake),
      task_count: Number(row.task_count ?? 0),
    });
  },

  /**
   * 投入ログ。既定は本人の分だけ (投げたテキストは個人の記録なので)。
   * status を指定すれば「確認待ちだけ」を取れる。
   */
  async list(
    opts: { userId?: string; status?: IntakeStatus; kind?: IntakeKind; limit?: number } = {}
  ): Promise<TaskIntake[]> {
    let where = 'WHERE i.deleted_at IS NULL';
    const params: unknown[] = [];
    if (opts.userId) { where += ' AND i.created_by = ?'; params.push(opts.userId); }
    if (opts.status) { where += ' AND i.status = ?'; params.push(opts.status); }
    if (opts.kind) { where += ' AND i.kind = ?'; params.push(opts.kind); }

    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const rows = await queryAll(
      `${SELECT_INTAKE} ${where} ORDER BY i.created_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map((r) => ({
      ...(r as unknown as TaskIntake),
      task_count: Number(r.task_count ?? 0),
    }));
  },

  /** この投入から生まれたタスク (遡ってレビューするため) */
  async listGeneratedTasks(intakeId: string): Promise<Record<string, unknown>[]> {
    return queryAll(
      `SELECT t.id, t.title, t.project_id, p.name AS project_name, p.gls_number,
              t.assigned_to, u.name AS assigned_to_name,
              t.due_at::text AS due_at, t.importance, t.urgency,
              t.delegation_status, t.is_completed, t.created_at
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.source_ref = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at ASC`,
      [intakeId]
    );
  },
};
