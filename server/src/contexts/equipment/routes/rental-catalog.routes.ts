// 機材管理「レンタル機材検索」— 借りる前段の下調べ専用（検索・詳細・取得状況の読み取りだけ）。
//
// データそのものは制作技術支援（qsheet）が持つ TOC・レスターの横断カタログ
// （`qsheet_rental_items`。テーブル名・所有コンテキストは qsheet のままだが、中身は
// 案件に紐づかない2社共通のマスタなので、他アプリから読むこと自体に問題は無い）。
// 予約リスト（案件/番組ごとの owner スコープ）・今すぐ取得トリガーはここには置かない
// — 依頼は依然として制作技術支援側（`/techops/rental`）で行う。ここは「見るだけ」。
// ロジックの二重実装を避けるため `../../qsheet/services/rental.service` をそのまま再利用する。
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import * as rentalSvc from '../../qsheet/services/rental.service';

const router = Router();
router.use(requireAuth, requirePermission('equipment'));

const notFound = (res: Response) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '見つかりません' } });

// 取得状況（「最終取得」の表示用）
router.get('/sync-status', async (req: Request, res: Response) => {
  const data = await rentalSvc.getSyncStatus();
  res.json({ success: true, data });
});

// カタログ検索
router.get('/items', async (req: Request, res: Response) => {
  const data = await rentalSvc.searchItems(req.query);
  res.json({ success: true, data });
});

// 機材詳細
router.get('/items/:company/:itemId', async (req: Request, res: Response) => {
  const data = await rentalSvc.getItemDetail(String(req.params.company), String(req.params.itemId));
  if (!data) return notFound(res);
  res.json({ success: true, data });
});

export default router;
