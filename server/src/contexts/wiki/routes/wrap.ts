/**
 * Wiki の route ハンドラ用の薄いラッパー（`contexts/qsheet/routes/wrap.ts` と同じ形）。
 * `HttpError` はここで整形して返し、それ以外は Express の `errorHandler`（`app.ts`）へ渡します。
 *
 * ⚠️ **新しいエラー型は作りません。** 投げるのは
 * `contexts/qsheet/services/httpErrors.ts` の `NotFoundError` /
 * `ValidationError` / `ConflictError` です。エラーの形（`{ success, error:{ code, message } }`）が
 * アプリごとに違うと、画面の `humanizeError` が読めなくなります。
 */
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../../qsheet/services/httpErrors';

type Handler = (req: Request, res: Response) => Promise<void>;

export function wrap(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof HttpError) {
        res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message, ...(err.extra ?? {}) },
        });
        return;
      }
      next(err);
    });
  };
}

/**
 * `req.params.xxx` を `string` に正規化する
 * （`@types/express-serve-static-core` の `ParamsDictionary` は `string | string[]`）。
 */
export function p1(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : v ?? '';
}
