// 経理データ取込み (accounting) コンテキスト
// Phase 1: Layer A (生データ取込み) のみ実装
// Phase 2 以降で ETL + 既存テーブルへの反映、UI を追加予定

import { Router } from 'express';
import importsRoutes from './routes/imports.routes';

export function createAccountingRoutes(): Router {
  const router = Router();
  router.use('/accounting', importsRoutes);
  return router;
}
