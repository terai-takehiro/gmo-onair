/**
 * 打合せの議事録 (v4 ⑥ やり取りタブ)
 *
 * ── 裏で走らせる ────────────────────────────────────────────
 *
 * 文字起こしは1時間の録音で数分かかります。リクエストの中で待つと
 * **nginx の 60 秒で切れる**ので、行を先に作って返し、処理は裏で進めます。
 * 画面は `status` を見に来ます（`transcribing` → `draft` / `failed`）。
 *
 * **仕掛けを増やさない。** ジョブの表は作らず、行そのものに状態を持たせます。
 * サーバーが落ちて `transcribing` のまま残った行は、読むときに
 * 経過時間で見分けて「失敗」として出します（下の `STUCK_MINUTES`）。
 *
 * ── AI に返る仕組み（会社方針「AI を使い捨てにしない」）────────
 *
 *   条件1 記録   文字起こしの全文と下書きを `ai_outputs`(kind=`minutes_draft`) に
 *   条件2 差分   確定するときにサーバーが自動比較して `ai_corrections` に
 *   条件3 成果   未確認事項から作ったタスクが期限内に閉じたか（タスク側から導出）
 *   条件4 還流   `get_ai_feedback_digest` の advice を次の整形プロンプトに載せる
 *   条件5 レビュー 月1回・営業のマネージャー（運用の決め）
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, recordCorrections, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { transcribeAudio, structureMinutes } from './minutes-ai.service';

export const MINUTES_KIND = 'minutes_draft';

/** これ以上「処理中」のまま動かない行は、落ちたものとみなす */
const STUCK_MINUTES = 20;

export interface MinutesRow {
  id: string;
  project_id: string;
  status: string;
  error_message: string | null;
  title: string;
  met_on: string | null;
  attendees: string | null;
  transcript: string | null;
  duration_sec: number | null;
  summary: string | null;
  decisions: unknown;
  open_items: unknown;
  next_meeting: string | null;
  ai_output_id: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  confirmed_at: string | null;
}

/**
 * 一覧。**`transcript` は返しません** — 1件で数万字あり、一覧に載せると重い。
 * 詳細を開いたときだけ取ります。
 */
export async function listMinutes(projectId: string): Promise<MinutesRow[]> {
  const rows = await queryAll(
    `SELECT id, project_id, status, error_message, title, met_on, attendees,
            duration_sec, summary, decisions, open_items, next_meeting,
            ai_output_id, model, prompt_version, created_at, confirmed_at,
            -- 処理中のまま止まっているものを見分ける
            (status = 'transcribing' AND created_at < NOW() - INTERVAL '${STUCK_MINUTES} minutes') AS stuck
       FROM project_minutes
      WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY COALESCE(met_on, to_char(created_at, 'YYYY-MM-DD')) DESC, created_at DESC`,
    [projectId],
  ) as unknown as (MinutesRow & { stuck: boolean })[];

  // 落ちたものは**画面で「失敗」として出す**。DB を書き換えないのは、
  // 読むだけの処理で状態を変えると、同時に開いた2人で結果が変わるため
  return rows.map((r) => (r.stuck
    ? { ...r, status: 'failed', error_message: r.error_message ?? '文字起こしが途中で止まりました。もう一度お試しください' }
    : r));
}

export async function getMinutes(id: string): Promise<MinutesRow> {
  const row = await queryOne(
    'SELECT * FROM project_minutes WHERE id = ? AND deleted_at IS NULL', [id],
  ) as MinutesRow | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', '議事録が見つかりません');
  return row;
}

/**
 * 録音を受け取って行を作り、**裏で**文字起こし → 整形を進める。
 * 返るのは作った行の id だけ。画面はそれを見に来ます。
 */
export async function startTranscription(
  projectId: string,
  audio: Buffer,
  filename: string,
  metOn: string | null,
  userId: string,
): Promise<MinutesRow> {
  const project = await queryOne(
    'SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId],
  );
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const id = uuidv4();
  await execute(
    `INSERT INTO project_minutes (id, project_id, status, met_on, created_by, updated_by)
     VALUES (?, ?, 'transcribing', ?, ?, ?)`,
    [id, projectId, metOn, userId, userId],
  );

  // **await しない。** ここで待つとリクエストが 60 秒で切れる
  void runTranscription(id, projectId, audio, filename, metOn, userId);

  return getMinutes(id);
}

/** 裏で走る本体。**例外を外に出さない** — 出しても受け取る人がいないので、行に書く */
async function runTranscription(
  id: string, projectId: string, audio: Buffer, filename: string,
  metOn: string | null, userId: string,
): Promise<void> {
  try {
    const stt = await transcribeAudio(audio, filename);

    // 文字起こしは先に保存する。**整形に失敗しても文字は残す** —
    // ここが消えると録音し直しになる
    await execute(
      `UPDATE project_minutes SET transcript = ?, duration_sec = ?, updated_at = NOW() WHERE id = ?`,
      [stt.text, stt.durationSec, id],
    );

    // 過去に人がどう直したかを整形プロンプトに載せる (条件4)。
    // **失敗しても整形は続ける** — 助言が無いだけで、下書きは作れる
    let advice: string[] = [];
    try {
      const digest = await getFeedbackDigest(MINUTES_KIND, 90);
      advice = digest.advice ?? [];
    } catch { /* 助言が取れなくても続ける */ }

    const s = await structureMinutes(stt.text, { metOn, advice });

    // AI が出したものの**全文**を残す (条件1)。ここが後で「人がどこを直したか」の before になる
    const outputId = await recordAiOutput({
      kind: MINUTES_KIND,
      targetTable: 'project_minutes',
      targetId: id,
      payload: {
        transcript: stt.text,
        stt_model: stt.model,
        title: s.title, summary: s.summary,
        decisions: s.decisions, open_items: s.open_items,
        next_meeting: s.next_meeting, attendees: s.attendees,
      },
      toolName: 'minutes.transcribe',
      model: s.model,
      promptVersion: s.promptVersion,
      actorId: userId,
    });

    await execute(
      `UPDATE project_minutes
          SET status = 'draft', title = ?, summary = ?, decisions = ?::jsonb,
              open_items = ?::jsonb, next_meeting = ?, attendees = ?,
              ai_output_id = ?, model = ?, prompt_version = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        s.title, s.summary, JSON.stringify(s.decisions), JSON.stringify(s.open_items),
        s.next_meeting || null, s.attendees || null,
        outputId, s.model, s.promptVersion, id,
      ],
    );
  } catch (e) {
    const message = (e as Error).message || '文字起こしに失敗しました';
    console.error('[minutes] transcription failed:', projectId, message);
    await execute(
      `UPDATE project_minutes SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
      [message.slice(0, 500), id],
    ).catch(() => { /* ここで失敗したら諦める (行は stuck 判定で拾われる) */ });
  }
}

/** 人が直せる項目 */
const EDITABLE = ['title', 'summary', 'attendees', 'met_on', 'next_meeting'] as const;

/**
 * 差分を取る項目。**`met_on` は入れない** — 打合せの日は人が投げるときに指定する値で、
 * AI が出したものではない。入れると人が自分で入れた値を「AI の誤り」と数えてしまう。
 */
const DIFF_FIELDS = ['title', 'summary', 'attendees', 'next_meeting'] as const;

export interface MinutesUpdate {
  title?: string;
  summary?: string;
  attendees?: string | null;
  met_on?: string | null;
  next_meeting?: string | null;
  decisions?: { text: string; quote?: string }[];
  open_items?: { text: string; owner?: string; due?: string }[];
  /** true で「確定」にする。**確定した時点で差分を残す** */
  confirm?: boolean;
}

const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/**
 * 直して保存する。確定するときに**サーバーが自動で before/after を比べ**、
 * `ai_corrections` に入れます（条件2）。**人には何も入力させません。**
 */
export async function updateMinutes(id: string, body: MinutesUpdate, userId: string): Promise<MinutesRow> {
  const before = await getMinutes(id);
  if (before.status === 'transcribing') {
    throw new AppError(400, 'VALIDATION_ERROR', '文字起こしの途中です。終わってから直してください');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };

  for (const col of EDITABLE) {
    if (!(col in body)) continue;
    push(col, (body as Record<string, unknown>)[col] ?? null);
  }
  if (body.decisions) {
    push('decisions', JSON.stringify(body.decisions.map((d) => ({ text: d.text, quote: d.quote ?? '' }))));
    sets[sets.length - 1] = 'decisions = ?::jsonb';
  }
  if (body.open_items) {
    push('open_items', JSON.stringify(body.open_items.map((o) => ({
      text: o.text, owner: o.owner ?? '', due: o.due ?? '',
    }))));
    sets[sets.length - 1] = 'open_items = ?::jsonb';
  }
  if (body.confirm) {
    sets.push("status = 'confirmed'");
    sets.push('confirmed_at = NOW()');
    sets.push('confirmed_by = ?');
    params.push(userId);
  }
  if (sets.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '変更する項目がありません');

  params.push(userId, id);
  await execute(
    `UPDATE project_minutes SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    params,
  );
  const after = await getMinutes(id);

  // 差分は**確定したときだけ**残す。書きかけの途中経過を全部入れると、
  // 「AI がどれだけ直されたか」ではなく「何回保存したか」を測ることになる
  if (body.confirm && before.ai_output_id) {
    await recordMinutesCorrections(before.ai_output_id, after, userId);
  }
  return after;
}

/** 配列は「件数と中身」で比べる。行ごとの対応は取れない (順番が入れ替わる) ので、丸ごと1項目として扱う */
function listChanged(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? []) !== JSON.stringify(b ?? []);
}

/**
 * 人がどこを直したかを残す (条件2)。
 *
 * ── before は「**AI が出したもの**」。直前の行の状態ではない ──────
 *
 * 最初は「保存する直前の行」と比べていたが、**書きかけを1度保存してから
 * 確定すると、その間に直した分がすべて『無修正』になる**（実測して発見）。
 * 比べる相手は `ai_outputs.payload_snapshot`、つまり AI が出した中身そのもの。
 * これが `references/patterns.md` の言う「上書き保存で下書きを消す」の変種。
 */
async function recordMinutesCorrections(outputId: string, after: MinutesRow, userId: string): Promise<void> {
  const row = await queryOne(
    'SELECT payload_snapshot FROM ai_outputs WHERE id = ?', [outputId],
  ) as { payload_snapshot?: Record<string, unknown> } | undefined;
  const ai = (row?.payload_snapshot ?? {}) as Record<string, unknown>;

  const diffs: CorrectionInput[] = [];

  for (const col of DIFF_FIELDS) {
    const b = norm(ai[col]);
    const a = norm((after as unknown as Record<string, unknown>)[col]);
    if (b === a) continue;
    diffs.push({
      fieldPath: col,
      before: ai[col] ?? null,
      after: (after as unknown as Record<string, unknown>)[col] ?? null,
      // 空 → 値 は「AI が拾えなかったものを人が足した」= 追記。
      // 値 → 別の値 は取り違え = 誤り。**混ぜると直す先が分からない**
      type: b === '' ? 'enrich' : 'fix',
    });
  }
  for (const col of ['decisions', 'open_items'] as const) {
    if (!listChanged(ai[col], after[col])) continue;
    diffs.push({
      fieldPath: col,
      before: ai[col] ?? null,
      after: after[col] ?? null,
      type: JSON.stringify(ai[col] ?? []) === '[]' ? 'enrich' : 'fix',
    });
  }

  const all = [...DIFF_FIELDS, 'decisions', 'open_items'];
  if (diffs.length === 0) {
    // **無修正で確定した**ことを残す。これが正解ラベルで、
    // 無いと「無修正採用率」の分母が壊れる
    await recordCorrections(outputId, [{ fieldPath: '(全体)', type: 'none' }], userId);
    return;
  }
  // 直さなかった項目も残す (分母)。**確定は1回きり**なので積み上がらない
  for (const col of all) {
    if (diffs.some((d) => d.fieldPath === col)) continue;
    diffs.push({ fieldPath: col, type: 'none' });
  }
  await recordCorrections(outputId, diffs, userId);
}

export async function deleteMinutes(id: string, userId: string): Promise<void> {
  await getMinutes(id);
  await execute(
    'UPDATE project_minutes SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [userId, id],
  );
}
