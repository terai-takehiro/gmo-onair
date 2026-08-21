/**
 * スケジュール表（段4）の route ハンドラ用の薄いラッパー。
 * `HttpError` はここで整形して返す。それ以外は Express の errorHandler（app.ts）に渡す
 * （500 として一律にログ・整形される）。
 */
import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../services/httpErrors';

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
 * `req.params.xxx` を `string` に正規化する（`@types/express-serve-static-core` の
 * `ParamsDictionary` は `string | string[]` — 繰り返しキャプチャの型が混ざる）。
 * `flow-templates.routes.ts` の `p1` と同じ作法。
 */
export function p1(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : v ?? '';
}
