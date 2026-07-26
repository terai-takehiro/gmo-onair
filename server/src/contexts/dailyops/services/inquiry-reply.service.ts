/**
 * 問い合わせの返信の下書き (AIが作る → 人が直して保存する → 送ったと記録する)
 *
 * **ループを閉じてある** (会社方針「AIを使い捨てにしない」):
 *   ①AI が出した全文       → `ai_outputs` (kind='inquiry_reply', payload_snapshot に切り詰めなし)
 *   ②人が直した差分         → `ai_corrections` (field_path='reply_text', none/fix/reject)
 *   ③その後どうなったか     → `ai_outcomes` (sent / unused + 直した割合・返信までの日数)
 *   ④次の生成に効かせる     → 生成前に `getFeedbackDigest('inquiry_reply')` を読んでプロンプトに載せる
 *   ⑤レビュー              → MCP `get_ai_feedback_digest` と `/review` から読む
 *
 * **送信は ONAiR からは行わない**。メールの送信経路を持っていないので、
 * 人が保存した本文をコピーして自分のメールで送り、「送った」を記録する。
 * ここを曖昧にすると「保存したら送られた」と誤解されるため画面にも明記する。
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { recordAiOutput, recordCorrections, recordAiOutcome } from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { resolveProvider, intakeAiModel } from '../../tasks/services/intake-ai.service';
import { inquiryService } from './inbox.service';

const KIND = 'inquiry_reply';
/** 傾向を載せた回は版を分ける。同じ版に混ぜると「効いたのか」を後から言えない */
const PROMPT_VERSION_BASE = 'inquiry-reply-v1';
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = [
  'あなたは映像制作スタジオ (GMOグローバルスタジオ) の営業窓口の返信を下書きする担当です。',
  '受け取った問い合わせに対する**返信メールの本文だけ**を日本語で書いてください。',
  '',
  '守ること:',
  '- 件名・宛先・署名は書かない (本文だけ)。挨拶から結びまでを書く',
  '- **分からないことを勝手に決めない**。日程・金額・可否は断定せず「確認します」と書く',
  '- 数字を作らない。料金・空き日程・人数を推測で書いてはいけない',
  '- 5〜8行程度。読んで 30 秒で分かる長さにする',
  '- 敬語だが硬すぎない。定型句を並べず、相手が書いた内容に触れる',
  '- 次にこちらが何をするかを1つだけ最後に書く (例「空き日程を確認してご連絡します」)',
  '- 相手の名前が分からないときは「ご担当者様」とする',
].join('\n');

export interface InquiryReplyRow {
  inquiry_id: string;
  ai_text: string | null;
  ai_output_id: string | null;
  final_text: string | null;
  status: 'draft' | 'saved' | 'sent' | 'unused';
  sent_at: string | null;
  note: string | null;
  model: string | null;
  prompt_version: string | null;
  updated_at: string;
}

const COLS = `inquiry_id, ai_text, ai_output_id, final_text, status, sent_at, note,
  model, prompt_version, created_at, updated_at`;

export async function getReply(inquiryId: string): Promise<InquiryReplyRow | null> {
  return ((await queryOne(
    `SELECT ${COLS} FROM inquiry_replies WHERE inquiry_id = ?`, [inquiryId],
  )) ?? null) as unknown as InquiryReplyRow | null;
}

/** 生成に使う本文。要約 + 分類 + AIの提案 (元メールの全文は持っていない) */
function buildUserPrompt(iq: Record<string, unknown>, advice: string | null): string {
  const lines = [
    '# 届いた問い合わせ',
    iq.sender ? `送ってきた人: ${iq.sender}` : '',
    iq.subject ? `件名: ${iq.subject}` : '',
    iq.category ? `分類: ${iq.category}` : '',
    iq.received_at ? `受信日: ${iq.received_at}` : '',
    '',
    '## 内容',
    String(iq.summary ?? ''),
    iq.action_needed ? `\n## こちらがすべきこと (AIの見立て)\n${iq.action_needed}` : '',
  ].filter(Boolean);

  if (advice) {
    lines.push(
      '',
      '# 前回までの傾向',
      advice,
      '',
      '**原文に書かれていないことを補ってはいけません。傾向は書き方の重み付けにだけ使ってください。**',
    );
  }
  return lines.join('\n');
}

async function callAnthropic(model: string, userPrompt: string): Promise<string> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('下書きを受け取れませんでした');
  return text;
}

async function callOpenAI(model: string, userPrompt: string): Promise<string> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const res = await client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
  });
  const text = (res.output_text ?? '').trim();
  if (!text) throw new Error('下書きを受け取れませんでした');
  return text;
}

/**
 * 下書きを作る (作り直しは上書き)。
 *
 * 生成前に**自分の修正傾向を読んでプロンプトに載せる** — これが無いと
 * 直した労力が資産にならない (使うほど賢くならない)。
 */
export async function draftReply(
  inquiryId: string,
  actor: { userId: string },
): Promise<{ row: InquiryReplyRow; usedAdvice: boolean }> {
  const iq = await inquiryService.getById(inquiryId);
  if (!iq) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');

  const provider = resolveProvider();
  if (!provider) {
    // AppError は (statusCode, code, message) の順。以前は code と message が
    // 入れ替わっていて、画面に日本語ではなく 'AI_NOT_CONFIGURED' が出ていた
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'AI が使えない設定のため下書きを作れません。本文は自分で書いてください（保存すれば記録は残ります）。',
    );
  }
  const model = intakeAiModel(provider);

  // 前回までの傾向。取得に失敗しても下書き作成は止めない
  let advice: string | null = null;
  try {
    const digest = await getFeedbackDigest(KIND, 90);
    // advice は配列で返ることもあるので1本の文字列に寄せる
    const raw = Array.isArray(digest.advice) ? digest.advice.join('\n') : digest.advice;
    advice = raw && String(raw).trim() ? String(raw) : null;
  } catch (e) {
    console.warn('[inquiry-reply] digest 取得に失敗 (下書きは続行):', (e as Error).message);
  }
  const promptVersion = advice ? `${PROMPT_VERSION_BASE}+fb` : PROMPT_VERSION_BASE;

  const userPrompt = buildUserPrompt(iq, advice);
  const text = provider === 'openai'
    ? await callOpenAI(model, userPrompt)
    : await callAnthropic(model, userPrompt);

  // ①AI が出した全文を記録 (切り詰めない)。ここが教師データの本体
  const outputId = await recordAiOutput({
    kind: KIND,
    targetTable: 'inquiry_replies',
    targetId: inquiryId,
    payload: { text, inquiry: { subject: iq.subject, summary: iq.summary, category: iq.category } },
    model,
    promptVersion,
    actorId: actor.userId,
  });

  await execute(
    `INSERT INTO inquiry_replies
       (inquiry_id, ai_text, ai_output_id, final_text, status, note, model, prompt_version, created_by, updated_by)
     VALUES (?, ?, ?, NULL, 'draft', NULL, ?, ?, ?, ?)
     ON CONFLICT (inquiry_id) DO UPDATE SET
       ai_text = EXCLUDED.ai_text, ai_output_id = EXCLUDED.ai_output_id,
       final_text = NULL, status = 'draft', note = NULL,
       model = EXCLUDED.model, prompt_version = EXCLUDED.prompt_version,
       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [inquiryId, text, outputId, model, promptVersion, actor.userId, actor.userId],
  );
  return { row: (await getReply(inquiryId))!, usedAdvice: !!advice };
}

/** 直した割合 (0〜1)。文字数の差だけの粗い指標だが、傾向は読める */
function editRatio(before: string, after: string): number {
  if (!before) return after ? 1 : 0;
  const diff = Math.abs(after.length - before.length);
  return Math.min(1, Math.round((diff / before.length) * 100) / 100);
}

/**
 * 人が直した本文を保存する。
 *
 * **差分はサーバーが自動で取る** (人に「何を直したか」を入力させる設計は続かない)。
 * 直していないなら `none` を記録する — これは正解ラベルで、
 * 無いと「無修正で使えた割合」の分母が壊れる。
 */
export async function saveReply(
  inquiryId: string,
  finalText: string,
  note: string | null,
  actor: { userId: string },
): Promise<InquiryReplyRow> {
  const row = await getReply(inquiryId);
  if (!row) throw new AppError(404, 'NOT_FOUND', '下書きがありません');
  const text = (finalText ?? '').trim();
  if (!text) throw new AppError(400, 'VALIDATION_ERROR', '本文が空です');

  await execute(
    `UPDATE inquiry_replies SET final_text = ?, note = ?, status = 'saved',
            updated_by = ?, updated_at = NOW() WHERE inquiry_id = ?`,
    [text, note ?? null, actor.userId, inquiryId],
  );

  // ②修正差分。AI の原文と保存した本文を突き合わせる
  if (row.ai_output_id && row.ai_text !== null) {
    const changed = row.ai_text.trim() !== text;
    await recordCorrections(
      row.ai_output_id,
      [{
        fieldPath: 'reply_text',
        before: row.ai_text,
        after: text,
        type: changed ? 'fix' : 'none',
        note: note ?? null,
      }],
      actor.userId,
    );
    if (changed) {
      await recordAiOutcome(row.ai_output_id, 'edited', {
        key: 'edit_ratio', value: editRatio(row.ai_text, text),
      });
    }
  }
  return (await getReply(inquiryId))!;
}

/**
 * 送った / 使わなかった を記録する。
 * **ONAiR が送るわけではない** — 人が自分のメールで送ったことを残すだけ。
 */
export async function markReply(
  inquiryId: string,
  outcome: 'sent' | 'unused',
  actor: { userId: string },
): Promise<InquiryReplyRow> {
  const row = await getReply(inquiryId);
  if (!row) throw new AppError(404, 'NOT_FOUND', '下書きがありません');

  await execute(
    `UPDATE inquiry_replies SET status = ?, sent_at = ${outcome === 'sent' ? 'NOW()' : 'NULL'},
            updated_by = ?, updated_at = NOW() WHERE inquiry_id = ?`,
    [outcome, actor.userId, inquiryId],
  );

  // ③その後どうなったか。使わなかったのは「不採用」なので差分にも残す
  if (row.ai_output_id) {
    if (outcome === 'unused') {
      await recordCorrections(
        row.ai_output_id,
        [{ fieldPath: 'reply_text', before: row.ai_text, after: null, type: 'reject' }],
        actor.userId,
      );
      await recordAiOutcome(row.ai_output_id, 'unused');
    } else {
      // 受信から送信までの日数 = お客様を待たせた時間
      const iq = await inquiryService.getById(inquiryId);
      const recv = iq?.received_at ? new Date(`${String(iq.received_at)}T00:00:00`).getTime() : NaN;
      const days = Number.isFinite(recv)
        ? Math.max(0, Math.round((Date.now() - recv) / 86_400_000))
        : undefined;
      await recordAiOutcome(row.ai_output_id, 'sent',
        days !== undefined ? { key: 'days_to_reply', value: days } : undefined);
    }
  }
  return (await getReply(inquiryId))!;
}
