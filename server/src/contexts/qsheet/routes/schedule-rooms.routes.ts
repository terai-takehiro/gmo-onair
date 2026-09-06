/**
 * スケジュール表の「会場」列が結べる部屋の一覧（読み取り専用）。
 * 14-schedule-v2-plan.md §3 A1・A2「会場を選んで列を作る」。
 *
 * ⚠️ なぜ `/studios/locations`（production コンテキスト）を使わないか:
 * あちらは `requirePermission('sales')` の下にあり（`studio.routes.ts`）、
 * 制作技術支援だけを使う技術・運営のアカウントには 403 になる。
 * 列の `room_id` が指すのは同じ `studio_rooms` なので、ここでは qsheet の権限で
 * 同じマスターを読むだけにする（書き込みは一切しない — 部屋の追加・変更はカレンダー側）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryAll } from '../../../shared/db/connection';
import { wrap } from './wrap';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

router.get('/studio-rooms', wrap(async (_req: Request, res: Response) => {
  const locations = await queryAll(
    `SELECT id, name, abbreviation, sort_order FROM studio_locations WHERE deleted_at IS NULL ORDER BY sort_order, name`,
  );
  const rooms = await queryAll(
    `SELECT id, location_id, name, room_type, color, sort_order FROM studio_rooms WHERE deleted_at IS NULL ORDER BY sort_order, name`,
  );
  const data = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    abbreviation: loc.abbreviation ?? null,
    rooms: rooms
      .filter((r) => r.location_id === loc.id)
      .map((r) => ({ id: r.id, name: r.name, room_type: r.room_type, color: r.color ?? null })),
  }));
  res.json({ success: true, data });
}));

export default router;
