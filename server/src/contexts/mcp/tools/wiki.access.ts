/**
 * Wiki の MCP ツール共通の入口（段E・設計 `docs/design/v4/wiki.md` §7-6・§8）。
 *
 * ⚠️ **閲覧できる範囲は画面とまったく同じです。** 6本すべてが
 * `contexts/wiki/services/wiki-access.service.ts` を通ります —
 * 「MCP だから見えてよい」は作りません。読めないページは 403 ではなく
 * **404**（存在ごと隠す・§8）で、その判定もそちらが持っています。
 *
 * 呼ぶ人は2通りあり、扱いを変えます:
 *
 * | 呼ぶ人 | 読む | 書く | なぜ |
 * | --- | --- | --- | --- |
 * | OAuth（ONAiR ログイン連携） | 実ユーザーとして。区画 `wiki` の reader 以上 | 同 editor 以上 | 画面と同じ判定（`meetsPermissionLevel`） |
 * | 静的 API キー | 誰でもない鍵として。**`visibility='all'` のスペースの公開ページだけ** | **403** | 下の注意書き |
 *
 * ⚠️ **静的 API キーは書けません。** `wiki_pages.created_by` は `users` への
 * 外部キーで、共用 actor の id（既定 `mcp-claude`）は `users` に居ません
 * （`feedback-tickets.tools.ts` と同じ理由）。そもそも「誰が書いた下書きか」は
 * ページの画面にそのまま出る記録なので、名義を借りた代筆を作りません。
 *
 * ⚠️ **静的 API キーの読み取りを `visibility='all'` に絞るのは意図です。**
 * この鍵には「その人」が居ないので、`members` のスペースについて
 * 「見てよい人か」を決められません。`readableSpaceIds` に `users` に居ない id を
 * 渡すと `wiki_space_members` に当たらず、結果として `all` のスペースだけが残ります
 * （下書きも `created_by` が一致しないので出ません）。**この性質に頼っているので、
 * 判定側を変えるときはここも一緒に見てください。**
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne } from '../../../shared/db/connection';
import { meetsPermissionLevel } from '../../../shared/middleware/auth';
import { HttpError, NotFoundError } from '../../qsheet/services/httpErrors';
import { canReadSpace, type WikiUser } from '../../wiki/services/wiki-access.service';
import { actorContext, currentActorId, runTool, type ToolResult } from '../helpers';

/** `wiki-access.service` がそのまま受け取れる形（＋どちらの鍵で来たか） */
export interface WikiMcpActor extends WikiUser {
  id: string;
  isOAuth: boolean;
}

/**
 * Wiki のツールの先頭で必ず呼ぶ。
 *
 * `gate.ts` の権限ゲートは **OAuth のときだけ**効くので（静的キーは素通り）、
 * 静的キーを止められるのはここだけです。二重に見えますが、
 * 制作資料（`production.access.ts`）と同じ二重の防御で、二重で正しい作りです。
 */
export async function requireWikiActor(minLevel: 'reader' | 'editor' = 'reader'): Promise<WikiMcpActor> {
  const actor = actorContext.getStore();

  if (!actor?.isOAuth) {
    if (minLevel !== 'reader') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Wiki への書き込みは ONAiR ログイン連携（OAuth）でのみ使えます。共有APIキーでは下書きを作れません。',
      );
    }
    return { id: currentActorId(), permissions: {}, isOAuth: false };
  }

  const user = (await queryOne(
    "SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL AND status = 'active'",
    [actor.actorId],
  )) as { id: string; role: string } | null;
  if (!user) {
    throw new AppError(403, 'FORBIDDEN', 'このアカウントでは Wiki のツールを使えません。');
  }

  const perm = (await queryOne(
    'SELECT access_level FROM user_permissions WHERE user_id = ? AND module = ?',
    [user.id, 'wiki'],
  )) as { access_level?: string } | null;
  const level = perm?.access_level ? String(perm.access_level) : undefined;

  if (!meetsPermissionLevel(String(user.role), level, minLevel)) {
    throw new AppError(
      403,
      'FORBIDDEN',
      minLevel === 'editor'
        ? 'この操作には Wiki の editor 以上の権限が必要です。'
        : 'この操作には Wiki の reader 以上の権限が必要です。',
    );
  }

  return {
    id: String(user.id),
    role: String(user.role),
    permissions: level ? { wiki: level } : {},
    isOAuth: true,
  };
}

/**
 * スペースを**短い英数字（`key`）でも id でも**受ける。
 * 読めないスペースは「無い」と返します（§8。存在ごと隠す）。
 */
/**
 * 静的 API キー（誰でもない鍵）のとき、**公開ページ以外は「無い」として止める**。
 *
 * ⚠️ **`canReadPage` は下書き以外をすべて通します**（`archived` も含む）。
 * 上の表は静的キーを「`visibility='all'` のスペースの**公開ページ**だけ」と
 * 決めているのに、`get_wiki_page` は `assertReadablePage` に任せていたので、
 * **鍵を持っている人が id さえ知っていれば、一覧にも検索にも出ない
 * `archived` のページの全文を取れて**いました（Codex の指摘・P2）。
 * 隠したページを「探せないから安全」で済ませない、というのがここの要点です。
 *
 * ⚠️ **OAuth のときは何もしません。** そちらは画面と同じ範囲が正しく、
 * 自分の下書きや一覧から隠したページを MCP から読めてよいためです。
 */
export async function assertPublishedForStaticKey(
  actor: WikiMcpActor,
  pageId: string,
): Promise<void> {
  if (actor.isOAuth) return;
  const row = await queryOne(
    "SELECT status FROM wiki_pages WHERE id = ? AND deleted_at IS NULL",
    [pageId],
  );
  if (!row || String(row.status) !== 'published') {
    // 画面と同じく **404**（存在ごと隠す・設計 §8）
    throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
  }
}

export async function resolveSpaceId(user: WikiUser, space: string): Promise<string> {
  const row = await queryOne(
    'SELECT id FROM wiki_spaces WHERE (key = ? OR id = ?) AND deleted_at IS NULL LIMIT 1',
    [space, space],
  );
  const id = row ? String(row.id) : null;
  if (!id || !(await canReadSpace(user, id))) {
    throw new NotFoundError('スペースが見つかりません');
  }
  return id;
}

/**
 * サービス層の `HttpError`（404 / 409 / 400）を `AppError` に移し替える。
 *
 * ⚠️ これが無いと `runTool` がどれも `INTERNAL_ERROR` にしてしまい、
 * **取り合い（409）と「無い」（404）を呼び出し側が区別できません** —
 * `update_wiki_page` は 409 を受けたら読み直して出し直す契約なので、
 * ここが潰れると再試行の判断ができなくなります。
 */
function asError(err: unknown): Error {
  if (err instanceof HttpError) return new AppError(err.status, err.code, err.message, err.extra);
  return err instanceof Error ? err : new Error(String(err));
}

/** Wiki のツールの包み（`runTool` ＋ 上の移し替え） */
export function runWikiTool(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  return runTool(async () => {
    try {
      return await fn();
    } catch (err) {
      throw asError(err);
    }
  });
}
