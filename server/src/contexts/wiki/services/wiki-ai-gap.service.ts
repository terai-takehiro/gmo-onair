/**
 * Wiki の AI — 足りないページ（`docs/design/v4/wiki.md` §7-2・§6-⑦）。
 *
 * ── なぜ捨てないか ────────────────────────────────────────
 *
 * 出典が無くて答えられなかった質問は、**この Wiki に何が足りないかの唯一の実測値**です。
 * 捨てると「AI が答えられなかった」で終わり、マニュアルは育ちません。
 * 登録して回数を数え、月1回の見直しで多い順に書き起こす — **使うほど賢くなる**のは
 * この経路です（条件4 の本体。知識そのものは Wiki のページなので、
 * プロンプトを直すより**足りないページを書くほうが効きます**）。
 *
 * ⚠️ **同じ質問は1行にまとめます**（`normalized` が UNIQUE）。鍵は
 * `shared/src/wiki/markdown.ts` の `normalizeQuestion` が正で、サーバーは
 * `wiki-markdown.ts` に一字一句そろえた写しを持っています。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, type TxClient } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { normalizeQuestion } from '../wiki-markdown';
import { isWikiManager, readableSpaceIds, type WikiUser } from './wiki-access.service';
import { WIKI_GAP_STATUSES, type WikiGapStatus } from './wiki-ai.types';

const GAP_SELECT = `
  SELECT g.id, g.question, g.normalized, g.count, g.last_asked_at, g.thread_id,
         g.space_id, s.name AS space_name, g.status, g.page_id,
         g.resolved_by, ru.name AS resolved_by_name, g.resolved_at
    FROM wiki_ai_gaps g
    LEFT JOIN wiki_spaces s ON s.id = g.space_id
    LEFT JOIN users ru ON ru.id = g.resolved_by
`;

export interface RegisterGapInput {
  question: string;
  threadId?: string | null;
  spaceId?: string | null;
}

/**
 * 答えられなかった質問を登録する（同じ質問なら回数を +1）。
 *
 * ⚠️ **best-effort**。登録に失敗しても「書かれていません」の返事は返します —
 * 記録のために利用者の質問を落とさないこと（`recordAiOutput` と同じ作法）。
 *
 * ⚠️ **一度書いた（`written`）質問がまた来たら `open` に戻します。**
 * 戻さないと、書いたページでは答えられていないことに誰も気づけません。
 */
export async function registerGap(input: RegisterGapInput): Promise<string | null> {
  const question = String(input.question ?? '').trim();
  if (!question) return null;
  const normalized = normalizeQuestion(question);
  if (!normalized) return null;
  try {
    const row = await queryOne(
      `INSERT INTO wiki_ai_gaps (id, question, normalized, count, last_asked_at, thread_id, space_id)
       VALUES (?, ?, ?, 1, NOW(), ?, ?)
       ON CONFLICT (normalized) DO UPDATE
          SET count = wiki_ai_gaps.count + 1,
              last_asked_at = NOW(),
              thread_id = COALESCE(EXCLUDED.thread_id, wiki_ai_gaps.thread_id),
              space_id = COALESCE(wiki_ai_gaps.space_id, EXCLUDED.space_id),
              status = CASE WHEN wiki_ai_gaps.status = 'dismissed' THEN 'dismissed' ELSE 'open' END
       RETURNING id`,
      [`wg-${uuid().slice(0, 8)}`, question, normalized, input.threadId ?? null, input.spaceId ?? null],
    );
    return row ? String(row.id) : null;
  } catch (e) {
    console.warn('[wiki-ai] 足りないページの登録に失敗（回答は返します）:', (e as Error).message);
    return null;
  }
}

/**
 * 同じ質問が**この期間のうちに**何回来たか（条件3 の「まだ解けていない」の目安）。
 * 質問1件ごとの数ではなく、その鍵の累計の回数を返します。
 */
export async function askCountOf(question: string): Promise<number> {
  const normalized = normalizeQuestion(question);
  if (!normalized) return 0;
  const row = await queryOne('SELECT count FROM wiki_ai_gaps WHERE normalized = ?', [normalized]);
  return Number(row?.count ?? 0);
}

export interface ListGapsInput {
  status?: WikiGapStatus;
  limit?: number;
  /**
   * スペースで絞る。**SQL の `LIMIT` より先に当てます**（Codex レビュー指摘・#735）。
   * 画面側で返ってきた行を絞ると、上限（既定50件）の先にある行は手元に無いので、
   * そのスペースに質問が溜まっていても「0件」に見えます。
   * ⚠️ **棚を推定できなかった行（`space_id IS NULL`）はスペースを選ぶと出ません** —
   * どのスペースのものか分からない質問を、特定のスペースの一覧に混ぜないためです。
   */
  space_id?: string;
}

/**
 * 足りないページの一覧（回数の多い順）。**見直しの画面（§6-⑦）が読みます。**
 *
 * ⚠️ 質問の文そのものは、読めないスペースの中身を含みうる（人が打った文なので
 * 何が書いてあるか分からない）ため、**区画 `wiki` の manager にだけ**出します。
 * 推定した棚が読めないスペースのものなら、その行は出しません。
 */
export async function listGaps(user: WikiUser, input: ListGapsInput = {}): Promise<Record<string, unknown>[]> {
  if (!isWikiManager(user)) return [];
  const spaceIds = await readableSpaceIds(user);
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  const where = ['(g.space_id IS NULL OR g.space_id = ANY(?))'];
  const params: unknown[] = [spaceIds];
  if (input.status) {
    where.push('g.status = ?');
    params.push(input.status);
  }
  if (input.space_id) {
    // 読める範囲の中でだけ効かせる（読めないスペースを指定されたら0件）
    where.push('g.space_id = ? AND g.space_id = ANY(?)');
    params.push(input.space_id, spaceIds);
  }
  return queryAll(
    `${GAP_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY g.status = 'open' DESC, g.count DESC, g.last_asked_at DESC
      LIMIT ${limit}`,
    params,
  );
}

/**
 * 足りないページを片づける（§6-⑦）。
 *
 * - `written` … 書いたページを結びつける（`page_id`）
 * - `dismissed` … 書かないと決めた。**行は消しません** — 消すと
 *   「一度却下した質問」が次に来たときにまた一覧の先頭に並びます
 */
export async function resolveGap(
  user: WikiUser,
  gapId: string,
  status: WikiGapStatus,
  pageId?: string | null,
): Promise<Record<string, unknown>> {
  if (!isWikiManager(user)) throw new NotFoundError('見つかりません');
  if (!WIKI_GAP_STATUSES.includes(status) || status === 'open') {
    throw new ValidationError('ページにした／書かないのどちらかを選んでください。');
  }
  const row = await queryOne(
    `UPDATE wiki_ai_gaps
        SET status = ?, page_id = ?, resolved_by = ?, resolved_at = NOW()
      WHERE id = ?
      RETURNING id`,
    [status, status === 'written' ? (pageId ?? null) : null, user.id, gapId],
  );
  if (!row) throw new NotFoundError('見つかりません');
  const out = await queryOne(`${GAP_SELECT} WHERE g.id = ?`, [gapId]);
  return out ?? {};
}

/**
 * ⚠️ **`status = 'open'` の質問だけに当てます**（#735 の再レビュー・Codex 指摘）。
 * id だけで当てていたころは、同じ質問で2人が同時に「ページを作成」を押すと、
 * 後の取引が前の取引の確定を待ってから**上書きして**両方のページが残りました
 * （結びつかない下書きが1本余る）。`open` に限れば後の取引は当たらずに巻き戻ります。
 */
const MARK_GAP_WRITTEN_SQL = `
  UPDATE wiki_ai_gaps
     SET status = 'written', page_id = ?, resolved_by = ?, resolved_at = NOW()
   WHERE id = ? AND status = 'open'`;

/**
 * 足りないページの質問を、**その人が見てよいときだけ**返す（ページを作る側の入口）。
 *
 * ⚠️ 見る条件は一覧（`listGaps`）と同じです（#740 の Codex 指摘・P1）:
 * manager であること、**棚が読めるスペースか棚が未推定**であること。
 * 一覧だけで絞っていたころは、「メンバーだけ」のスペースから外された manager が、
 * 開いたままの画面に残っていた id で質問の文を AI の下書きの材料にでき、
 * その結果を読めるスペースへ書き出せました。どれかに外れたら存在ごと隠します（404）。
 * そのうえで、まだ `open` かを見ます（下の `assertGapOpen`）。
 */
export async function readOpenGapFor(user: WikiUser, gapId: string): Promise<{ question: string }> {
  if (!isWikiManager(user)) throw new NotFoundError('足りないページの質問が見つかりません');
  const spaceIds = await readableSpaceIds(user);
  const row = await queryOne(
    'SELECT question FROM wiki_ai_gaps WHERE id = ? AND (space_id IS NULL OR space_id = ANY(?))',
    [gapId, spaceIds],
  );
  if (!row) throw new NotFoundError('足りないページの質問が見つかりません');
  await assertGapOpen(gapId);
  return { question: String(row.question ?? '') };
}

/**
 * 結びつける前の確認（AI の下書きは AI を呼ぶ**前に**見る。呼んでから断ると費用だけかかる）。
 * 無い → 404／もう片づいている → 400（押し直しても同じなので、読み込み直しを促す）。
 */
export async function assertGapOpen(gapId: string, db: Pick<TxClient, 'queryOne'> = { queryOne }): Promise<void> {
  const row = await db.queryOne('SELECT status FROM wiki_ai_gaps WHERE id = ?', [gapId]);
  if (!row) throw new NotFoundError('足りないページの質問が見つかりません');
  if (row.status !== 'open') {
    throw new ValidationError('この質問は、ほかの人がもう片づけました。一覧を読み込み直してください。');
  }
}

/**
 * 先に結びつけた質問を `open` に戻す（**そのページに結びつけたときだけ**）。
 * 既にある下書きに AI で書くとき、質問を先に押さえてからページを書き換えるので、
 * 書き換えが落ちたときにここで戻します（`wiki-draft.service.ts`）。
 */
export async function releaseGapClaim(gapId: string, pageId: string): Promise<void> {
  await queryOne(
    `UPDATE wiki_ai_gaps
        SET status = 'open', page_id = NULL, resolved_by = NULL, resolved_at = NULL
      WHERE id = ? AND page_id = ? AND status = 'written'
      RETURNING id`,
    [gapId, pageId],
  );
}

/**
 * 同じ結びつけを、**ページを作る取引の中で**行う（Codex レビュー指摘・#735）。
 *
 * ⚠️ **ここでは握りつぶしません。** 結びつけに失敗したらページごと巻き戻すのが
 * 狙いです。片方だけ成功すると、**下書きは残ったのに質問は `open` のまま**になり、
 * 画面にはその下書きを結びつけ直す手立てが無いので、押し直した人が下書きを
 * 2本作ります。両方まとめて失敗すれば、押し直しはきれいなやり直しになります。
 */
export async function markGapWrittenTx(
  tx: TxClient,
  gapId: string,
  pageId: string,
  userId: string,
): Promise<void> {
  // ⚠️ `RETURNING` で**当たったか**を見る。当たらない（消えた・id が違う）ときに
  //    黙って通すと、ページだけできて質問は結びつかないまま＝直したい状態に戻る
  const row = await tx.queryOne(`${MARK_GAP_WRITTEN_SQL} RETURNING id`, [pageId, userId, gapId]);
  // 当たらなかった理由（無い／もう片づいている）で文言を分ける。どちらでも取引ごと巻き戻る
  if (!row) await assertGapOpen(gapId, tx);
}
