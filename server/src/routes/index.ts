import { Router } from 'express';
import { createPlatformRoutes } from '../contexts/platform';
import { createSalesRoutes } from '../contexts/sales';
import { createProductionRoutes } from '../contexts/production';
import { createFinanceRoutes } from '../contexts/finance';
import { createGpmRoutes } from '../contexts/gpm';
import { createAssetRoutes } from '../contexts/asset';
import { createEquipmentRoutes } from '../contexts/equipment';
import { createQsheetRoutes } from '../contexts/qsheet';
import { createLiveopsRoutes } from '../contexts/liveops';
import { createTasksRoutes } from '../contexts/tasks';
import { createDailyopsRoutes } from '../contexts/dailyops';
import { createScheduleRoutes } from '../contexts/schedule';
import { createGraphicsRoutes } from '../contexts/graphics';
import { createAwardsImageRoutes } from '../contexts/awards';
import { createWikiRoutes } from '../contexts/wiki';

export function createRoutes(): Router {
  const router = Router();

  // 各コンテキストのルートを登録
  router.use(createPlatformRoutes());
  router.use(createSalesRoutes());
  router.use(createProductionRoutes());
  router.use(createFinanceRoutes());
  router.use('/gpm', createGpmRoutes());   // プロジェクト管理 (migration 161)
  router.use(createAssetRoutes());
  router.use(createEquipmentRoutes());
  // Phase 2 (qsheet→techops 移行): 二重マウント。旧 /qsheet/* を叩く既存クライアント/外部連携との
  // 後方互換のため残しつつ、新しい client-techops バンドルが呼ぶ /techops/* も同じルーターで追加提供する。
  // /qsheet/* は撤去しない（両方を維持する）。
  router.use(createQsheetRoutes('/qsheet'));
  router.use(createQsheetRoutes('/techops'));
  router.use(createLiveopsRoutes());
  // awards (旧リアルタイムCG) / quiz の API は段F で「廃止」にした (2026-09-06・client-awards/CLAUDE.md 参照)。
  // ⚠️ 画像配信 (/awards/images/*) だけは読み取り専用で生かす — テロップCGの過去実績移行
  // ツールが作る RankingEntry.photoUrl が旧 awards_entries.photo_url をそのまま指しており、
  // 外すと移行済み・今後移行するランキングの顔写真が欠ける (レビュー指摘・実測で確認)。
  router.use('/awards', createAwardsImageRoutes());
  // テロップCG (techops ミニアプリ graphics。リアルタイムCG の後継 — docs/design/v4/graphics.md)
  router.use(createGraphicsRoutes());
  router.use(createTasksRoutes());
  router.use(createDailyopsRoutes());
  router.use(createScheduleRoutes());
  router.use(createWikiRoutes());   // Wiki (新しいブロックアプリ・docs/design/v4/wiki.md)

  return router;
}
