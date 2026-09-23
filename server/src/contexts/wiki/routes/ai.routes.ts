/**
 * Wiki — AI の API（段E）。
 * 設計: `docs/design/v4/wiki.md` §6-⑤・§7 全体・§8。
 *
 * - `POST   /wiki/ask`                        出典つきで答える（出せなければ答えない）
 * - `GET    /wiki/ai/threads`                 スレッドの一覧（**本人のみ**）
 * - `GET    /wiki/ai/threads/:id`             会話1本（本人のみ）
 * - `DELETE /wiki/ai/threads/:id`             会話を消す（本人のみ）
 * - `POST   /wiki/ai/messages/:id/feedback`   3値の評価（条件2）
 * - `POST   /wiki/pages/:id/draft`            そのページに AI で下書きを書く
 * - `POST   /wiki/ai/draft`                   新しい下書きページを AI で作る
 * - `POST   /wiki/rewrite`                    手入力のメモを手順書の形に（**保存しない**）
 * - `POST   /wiki/rewrite/:outputId/decision` 置き換えた／やめた（条件2）
 * - `GET    /wiki/ai/gaps`                    足りないページ
 * - `POST   /wiki/ai/gaps/:id/resolve`        ページにした／書かない
 * - `GET    /wiki/ai/digest`                  AI の直され方と成果（条件4）
 *
 * 権限（§8）: 聞く・評価するは reader（区画 `wiki` は閲覧が全員の既定）、
 * 下書きと整えるは editor、足りないページと digest は manager。
 *
 * ⚠️ **読めないページ・他人のスレッドは 403 ではなく 404**（存在ごと隠す）。
 * 判定は `wiki-access.service.ts` と `wiki-ai-thread.service.ts` が持っていて、
 * **route では緩めません**。
 *
 * ⚠️ **「AI に聞く」の規律をここで緩めないこと**（§7-1・§10 の判断8）。
 * 出典が出せない回答は `wiki-ask.service.ts` が「Wiki にはまだ書かれていません」に
 * 落とし、`no_answer: true` を添えて返します。route はその結果をそのまま渡すだけで、
 * **「とりあえず何か返す」経路を足しません** — 足した瞬間、手順書として使えなくなります。
 *
 * ⚠️ **`/pages/:id/draft` は `pages-write.routes.ts` より先に登録されます**
 * （`contexts/wiki/index.ts` の注記）。道は別ですが、ページの書き込みの道が
 * 広がったときに巻き込まれないための順番です。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { ask } from '../services/wiki-ask.service';
import { draftPage } from '../services/wiki-draft.service';
import { getWikiAiDigest, getWikiAiDigests } from '../services/wiki-ai-digest.service';
import { listGaps, resolveGap } from '../services/wiki-ai-gap.service';
import {
  assertOwnThread, deleteThread, listMessages, listThreads, setMessageFeedback, WIKI_FEEDBACKS,
} from '../services/wiki-ai-thread.service';
import { recordRewriteDecision, rewriteText } from '../services/wiki-rewrite.service';
import { WIKI_AI_KINDS, type WikiAiKind } from '../services/wiki-ai.constants';
import { WIKI_GAP_STATUSES, type WikiAiFeedback, type WikiGapStatus } from '../services/wiki-ai.types';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;
const canManage = [requireAuth, requirePermission('wiki', 'manager')] as const;

function body(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

function has(b: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(b, key);
}

function asText(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new ValidationError(`${what}は文字で入れてください。`);
  return v;
}

function asTextOrNull(v: unknown, what: string): string | null {
  if (v === null || v === '') return null;
  return asText(v, what);
}

/** `?limit=` `?window_days=` のような数字。正の数でなければ無いものとして扱う */
function numParam(raw: unknown): number | undefined {
  const v = Number(p1(raw as string | string[] | undefined));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/* ── ① AI に聞く（§6-⑤・§7-1）─────────────────────────────── */

/**
 * 質問に答える。返すのは会話まるごと（画面はこれをそのまま描く）と、
 * AI が読んだページ・`no_answer`（**答えなかった**の印）です。
 */
router.post('/ask', ...canRead, wrap(async (req, res) => {
  const b = body(req);
  const result = await ask(req.user!, {
    question: asText(b.question, '質問'),
    threadId: has(b, 'thread_id') ? asTextOrNull(b.thread_id, '会話') : null,
    pageId: has(b, 'page_id') ? asTextOrNull(b.page_id, 'ページ') : null,
    spaceId: has(b, 'space_id') ? asTextOrNull(b.space_id, 'スペース') : null,
  });
  res.json({ success: true, data: result });
}));

/** スレッドの一覧。**本人のものだけ**（`listThreads` が作成者で絞る） */
router.get('/ai/threads', ...canRead, wrap(async (req, res) => {
  const rows = await listThreads(req.user!, numParam(req.query.limit) ?? 50);
  res.json({ success: true, data: rows });
}));

/** 会話1本（本人のみ）。他の人のものは「無い」と返します */
router.get('/ai/threads/:id', ...canRead, wrap(async (req, res) => {
  const threadId = p1(req.params.id);
  const thread = await assertOwnThread(req.user!, threadId);
  res.json({ success: true, data: { thread, messages: await listMessages(threadId) } });
}));

/** 会話を消す（本人のみ）。`deleted_at` を入れるだけで、記録（`ai_outputs`）は残ります */
router.delete('/ai/threads/:id', ...canRead, wrap(async (req, res) => {
  const result = await deleteThread(req.user!, p1(req.params.id));
  res.json({ success: true, data: result });
}));

/**
 * 3値の評価（役に立った／言い直して／的外れ・条件2）。
 * 対話は「直される」ものではないので、差分の代わりにこれを集めます。
 */
router.post('/ai/messages/:id/feedback', ...canRead, wrap(async (req, res) => {
  const b = body(req);
  const feedback = asText(b.feedback, '評価');
  if (!(WIKI_FEEDBACKS as readonly string[]).includes(feedback)) {
    throw new ValidationError('役に立った・言い直して・的外れのいずれかを選んでください。');
  }
  const row = await setMessageFeedback(
    req.user!,
    p1(req.params.id),
    feedback as WikiAiFeedback,
    has(b, 'note') ? asTextOrNull(b.note, '一言') : null,
  );
  res.json({ success: true, data: row });
}));

/* ── ② AI で下書きを作る（§7-1・§7-2）───────────────────── */

/**
 * `POST /wiki/pages/:id/draft` と `POST /wiki/ai/draft` の共通の受け取り。
 *
 * ⚠️ **公開する口はありません。** `draftPage` は必ず `status='draft'` で置きます
 * （§7-6「AI は起票まで・確定は人」）。ここに `status` を足さないこと。
 */
function readDraftInput(b: Record<string, unknown>) {
  const ids = has(b, 'source_page_ids') ? b.source_page_ids : [];
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) {
    throw new ValidationError('参考にするページは一覧で入れてください。');
  }
  return {
    spaceId: has(b, 'space_id') ? asTextOrNull(b.space_id, 'スペース') : null,
    parentId: has(b, 'parent_id') ? asTextOrNull(b.parent_id, '親ページ') : null,
    title: has(b, 'title') ? asText(b.title, '題') : undefined,
    threadId: has(b, 'thread_id') ? asTextOrNull(b.thread_id, '会話') : null,
    messageId: has(b, 'message_id') ? asTextOrNull(b.message_id, '回答') : null,
    gapId: has(b, 'gap_id') ? asTextOrNull(b.gap_id, '足りないページ') : null,
    sourcePageIds: ids as string[],
    notes: has(b, 'notes') ? asText(b.notes, 'メモ') : undefined,
  };
}

/** いまある下書きに AI で本文を書く（**公開中のページは書き換えません**） */
router.post('/pages/:id/draft', ...canEdit, wrap(async (req, res) => {
  const result = await draftPage(req.user!, {
    ...readDraftInput(body(req)),
    pageId: p1(req.params.id),
  });
  res.json({ success: true, data: result });
}));

/** 新しい下書きページを AI で作る（会話・足りないページ・メモから） */
router.post('/ai/draft', ...canEdit, wrap(async (req, res) => {
  const result = await draftPage(req.user!, readDraftInput(body(req)));
  res.status(201).json({ success: true, data: result });
}));

/* ── ③ AI で整える（§6-③・§7-1）──────────────────────────── */

/**
 * 手入力のメモを手順書の形に整える。**保存しません** —
 * 返すのは「いま／整えたあと」を並べて見せるための結果だけです。
 */
router.post('/rewrite', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  const result = await rewriteText(req.user!, {
    text: asText(b.text, '整える文'),
    mode: has(b, 'mode') ? asText(b.mode, '整え方') : undefined,
    pageId: has(b, 'page_id') ? asTextOrNull(b.page_id, 'ページ') : null,
  });
  res.json({ success: true, data: result });
}));

/**
 * 「置き換えた」「やめた」を残す（条件2）。
 * `final_md` を添えると、直してから置き換えた分を自動比較します。
 */
router.post('/rewrite/:outputId/decision', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  const result = await recordRewriteDecision(req.user!, p1(req.params.outputId), {
    decision: asText(b.decision, '操作'),
    finalMd: has(b, 'final_md') ? asTextOrNull(b.final_md, '置き換えた文') : null,
  });
  res.json({ success: true, data: result });
}));

/* ── 足りないページ（§7-2・§6-⑦）──────────────────────────── */

/**
 * 出典が無くて答えられなかった質問（回数の多い順）。
 *
 * ⚠️ **manager だけ**です。質問の文そのものは人が打った文で、
 * 読めないスペースの中身を含みうるためです（`listGaps` の注記）。
 */
router.get('/ai/gaps', ...canManage, wrap(async (req, res) => {
  const status = p1(req.query.status as string | string[] | undefined);
  if (status && !(WIKI_GAP_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError('状態の指定が正しくありません。');
  }
  // `?space=` は **SQL の LIMIT より先**に当てる（画面で絞ると上限の先が見えない）
  const space = p1(req.query.space as string | string[] | undefined);
  const rows = await listGaps(req.user!, {
    status: status ? (status as WikiGapStatus) : undefined,
    limit: numParam(req.query.limit),
    ...(space ? { space_id: space } : {}),
  });
  res.json({ success: true, data: rows });
}));

/** ページにした（`written`）／書かないと決めた（`dismissed`）。**行は消しません** */
router.post('/ai/gaps/:id/resolve', ...canManage, wrap(async (req, res) => {
  const b = body(req);
  const status = asText(b.status, '状態');
  if (!(WIKI_GAP_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError('ページにした／書かないのどちらかを選んでください。');
  }
  const row = await resolveGap(
    req.user!,
    p1(req.params.id),
    status as WikiGapStatus,
    has(b, 'page_id') ? asTextOrNull(b.page_id, 'ページ') : null,
  );
  res.json({ success: true, data: row });
}));

/* ── AI の直され方と成果（条件4・§7-3）───────────────────── */

/**
 * `kind` を渡すとその1つ、渡さないと3つまとめて返します。
 *
 * ⚠️ **集計はここで書きません。** `wiki-ai-digest.service.ts` が
 * 共通の `getFeedbackDigest` に Wiki の成果を足したものを返します。
 * 同じ数字を2か所で作ると、片方を直した日に食い違います。
 */
router.get('/ai/digest', ...canManage, wrap(async (req, res) => {
  const windowDays = numParam(req.query.window_days) ?? 90;
  const kind = p1(req.query.kind as string | string[] | undefined);
  if (kind && !(WIKI_AI_KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError('集計の種類の指定が正しくありません。');
  }
  const data = kind
    ? [await getWikiAiDigest(kind as WikiAiKind, windowDays)]
    : await getWikiAiDigests(windowDays);
  res.json({ success: true, data });
}));

export default router;
