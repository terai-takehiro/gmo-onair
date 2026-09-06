import { Router } from 'express';
import publicRoutes from './routes/public.routes';
import eventRoutes from './routes/events.routes';
import categoryRoutes from './routes/categories.routes';
import entryRoutes from './routes/entries.routes';
import imageRoutes, { imageServingRouter } from './routes/images.routes';
import soundsRoutes from './routes/sounds.routes';
import cueRoutes from './routes/cues.routes';
import oneshotRoutes from './routes/oneshot.routes';

export function createAwardsRoutes(): Router {
  const router = Router();

  // v2.8.96: 公開エンドポイントと images を**最初に**マウント。
  // 後続の auth-blanket 付き router (events/categories/entries/oneshot) の
  // `router.use([...], requireAuth, ...)` middleware が router 内のすべての一致パスで
  // 発火する仕様のため、public path も auth に蹴られないようここで先回り解決する。
  router.use('/awards', publicRoutes);
  router.use('/awards', imageRoutes);
  router.use('/awards', soundsRoutes);  // /audio 配信 + sounds マッピング/CRUD (write のみ auth)

  router.use('/awards', eventRoutes);
  router.use('/awards', categoryRoutes);
  router.use('/awards', entryRoutes);
  router.use('/awards', cueRoutes);
  router.use('/awards', oneshotRoutes);

  return router;
}

export { initAwardsSocketIO } from './socket';

/**
 * 廃止後も残す読み取り専用の画像配信だけを切り出したルーター（段F・レビュー指摘対応）。
 *
 * `awards_entries.photo_url` は `/api/v1/internal/awards/images/<filename>` という
 * 絶対パスを**値としてそのまま**持っており、テロップCGの過去実績移行ツール
 * （`awards-migration.service.ts`）はこの文字列を書き換えずに新しい `RankingEntry.photoUrl`
 * へコピーする。`createAwardsRoutes()`（書き込み系を含む一式）をまるごと外すと、
 * 既に移行済み・今後移行するランキングの顔写真がすべて欠ける（リンク先が無くなるため）。
 * BOX からの自動復元も含めて画像配信だけは生かし、顔写真アップロード・ZIP一括アップロード
 * （`images.routes.ts` の2本の `POST` ・書き込み系）は呼び出し元（旧アプリのUI）が
 * 無くなったため含めない（`imageServingRouter` は読み取り専用の3ミドルウェアだけを持つ）。
 */
export function createAwardsImageRoutes(): Router {
  return imageServingRouter;
}
