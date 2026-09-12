/**
 * スケジュール表（段4）のサービス層が投げる例外。
 *
 * 既存の qsheet routes（`documents.routes.ts` など）は raw try/catch で
 * `{ success:false, error:{code,message} }` を組み立てているが、段4は
 * サービス層と route 層を分けるためにここへ寄せる。
 *
 * ⚠️ 楽観ロックの 409 は `current_updated_at` / `updated_by_name` を
 * **`error` オブジェクトの直下**に返す必要がある（既存の `PUT /documents/:id` と
 * 同じ形。`EditorPage.tsx` がその形で読む）。`extra` をそこへ展開する。
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = '見つかりません') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'この操作を行う権限がありません') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, 'BAD_REQUEST', message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, currentUpdatedAt: string, updatedByName: string | null) {
    super(409, 'CONFLICT', message, { current_updated_at: currentUpdatedAt, updated_by_name: updatedByName });
  }
}

/**
 * 運営マニュアルの編集ロック（段E・production-manual.md §6-2-1）。
 * 他人が新しく（＝stale でなく）持っているロックに書き込もうとしたときの 409。
 * `ConflictError` と同じ「取り合いの事故」の系統だが、コードを分けて画面が
 * 「他の人が編集中」と「保存の衝突」を出し分けられるようにする。
 */
export class LockError extends HttpError {
  constructor(message: string, lockedBy: string | null, lockedByName: string | null) {
    super(409, 'LOCKED', message, { locked_by: lockedBy, locked_by_name: lockedByName });
  }
}

/**
 * AI 生成（段8）が投げる例外。**`500` にしない** — 画面が
 * 「AI が失敗しました。手で作れます」と出し分けられるようにするため（04-ai.md §10-1）。
 */
export class AiNotConfiguredError extends HttpError {
  constructor(message = 'この環境は AI につないでいません') {
    super(503, 'AI_NOT_CONFIGURED', message);
  }
}
export class AiFailedError extends HttpError {
  constructor(message = 'AI の呼び出しに失敗しました') {
    super(502, 'AI_FAILED', message);
  }
}
export class AiEmptyError extends HttpError {
  constructor(message = 'AI の出力から有効な提案を作れませんでした') {
    super(422, 'AI_EMPTY', message);
  }
}
/** 本番中は AI を呼ばない（04-ai.md §8-2）。クライアントはボタンを消すのが主だが、
 *  直接 API を叩かれたときの保険としてサーバー側にも同じ拒否を1つ持つ。 */
export class ProductionActiveError extends HttpError {
  constructor(message = '本番進行中のため AI 生成は使えません') {
    super(409, 'PRODUCTION_ACTIVE', message);
  }
}

/**
 * 楽観ロックの判定。`expected_updated_at` は「画面が最後にサーバーから受け取った値」。
 * 未送信（`undefined`）は素通しする（旧クライアント互換）。
 */
export function checkOptimisticLock(
  expectedUpdatedAt: unknown,
  current: { updated_at: unknown; updated_by: unknown; updater_name?: unknown },
  userId: string,
  what = 'この項目',
): void {
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt) return;
  const expectedMs = new Date(expectedUpdatedAt).getTime();
  const currentMs = new Date(current.updated_at as string).getTime();
  if (!Number.isFinite(expectedMs) || !Number.isFinite(currentMs) || expectedMs === currentMs) return;

  const isSelf = current.updated_by === userId;
  const name = (current.updater_name as string) || null;
  throw new ConflictError(
    isSelf
      ? `${what}は別のタブ/端末で更新されています。最新の内容を読み込み直してください。`
      : `${what}は ${name || '他のユーザー'} さんが先に更新しました。上書きを防ぐため保存を中止しました。`,
    current.updated_at as string,
    name,
  );
}
