import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(isProduction ? {} : { details: err.details }),
      },
    });
    return;
  }

  const dbDetail = (err as any).detail || (err as any).constraint || '';
  console.error('Unhandled error:', _req.method, _req.path, err.message, dbDetail, err.stack?.split('\n')[1]);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'サーバー内部エラーが発生しました' },
  });
}
