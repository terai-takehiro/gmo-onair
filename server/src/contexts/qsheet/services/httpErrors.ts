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
