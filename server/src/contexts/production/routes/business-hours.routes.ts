/**
 * 休日・営業時間の API — v4 設定 ⑥
 *
 * 読むのは `studio` 権限があれば通します（予約を入れる人は「その時間は取れるか」を
 * 知る必要がある）。直せるのは `system_admin` だけ — 拠点・部屋と同じ扱いにします
 * （`studio.routes.ts` の `adminOnly` と揃える。片方だけ緩いと、
 *  部屋は直せないのに営業時間は直せる、というちぐはぐが起きる）。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  listSettings, saveHours, upsertClosedDay, bookingsInRange, checkBooking, holidaysBetween,
} from '../services/business-hours.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
const p1 = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v ?? '');

const router = Router();
router.use(requireAuth);
const adminOnly = requireRole('system_admin');

/** 拠点の一覧（画面の左レール）。**部屋数も返す** — 空の拠点が分かる */
router.get('/locations', requirePermission('sales', 'reader'), wrap(async (_req, res) => {
  const rows = await queryAll(
    `SELECT l.id, l.name,
            (SELECT COUNT(*)::int FROM studio_rooms r
              WHERE r.location_id = l.id AND r.deleted_at IS NULL) AS room_count,
            (SELECT COUNT(*)::int FROM closed_days c
              WHERE c.deleted_at IS NULL AND c.availability <> 'open'
                AND (c.location_id = l.id OR c.location_id IS NULL)) AS closed_count
       FROM studio_locations l
      WHERE l.deleted_at IS NULL
      ORDER BY l.sort_order, l.name`,
  );
  res.json({ success: true, data: rows });
}));

/**
 * カレンダーに出す祝日。**`/:locationId` より前に置くこと** —
 * あとに書くと `holidays` が拠点 id として読まれて 404 になる。
 *
 * **権限を掛けない。** 祝日は国が決めた公開情報で、会社の予定ではない。
 * `studio` を要求すると、パートナーの予定しか見ない人のカレンダーで
 * 日付が黒いままになる。
 */
router.get('/holidays', wrap(async (req, res) => {
  // **時刻が付いていても通す。** この製品の期間指定は
  // `to=2026-08-08T23:59` の形で渡す所が多く（予約の一覧がそう）、
  // 日付だけを要求すると呼ぶ側が2通りになって片方が 400 になる
  // （実ブラウザで日表に切り替えたときに踏んだ）
  const from = String(req.query.from ?? '').slice(0, 10);
  const to = String(req.query.to ?? '').slice(0, 10);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(from) || !ymd.test(to)) {
    throw new AppError(400, 'VALIDATION_ERROR', '期間（from・to）を YYYY-MM-DD で指定してください');
  }
  res.json({ success: true, data: await holidaysBetween(from, to) });
}));

router.get('/:locationId', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  res.json({ success: true, data: await listSettings(p1(req.params.locationId)) });
}));

router.put('/:locationId/hours', adminOnly, wrap(async (req, res) => {
  const rows = Array.isArray(req.body?.hours) ? req.body.hours : [];
  await saveHours(p1(req.params.locationId), rows);
  res.json({ success: true, data: await listSettings(p1(req.params.locationId)) });
}));

/**
 * 休業日を足す／直す。
 *
 * **重なる予約をいっしょに返します。** モックの指定どおり予約は消さないので、
 * 「この期間に N 件の予約があります」を出して個別に連絡してもらいます。
 */
router.put('/closed-days', adminOnly, wrap(async (req, res) => {
  const { id, location_id, from_date, to_date, name, kind, availability } = req.body ?? {};
  if (!from_date || !to_date || !name) {
    throw new AppError(400, 'VALIDATION_ERROR', '期間と名前を入れてください');
  }
  if (String(from_date) > String(to_date)) {
    throw new AppError(400, 'VALIDATION_ERROR', '終わりの日が始まりより前になっています');
  }
  const savedId = await upsertClosedDay({
    id, location_id: location_id || null, from_date, to_date, name, kind, availability,
  });
  const affected = availability === 'open'
    ? []
    : await bookingsInRange(location_id || null, from_date, to_date);
  res.json({ success: true, data: { id: savedId, affected } });
}));

router.delete('/closed-days/:id', adminOnly, wrap(async (req, res) => {
  await execute('UPDATE closed_days SET deleted_at = NOW() WHERE id = ?', [p1(req.params.id)]);
  res.json({ success: true, message: '休業日を消しました' });
}));

/** 休業日にする前に「重なる予約」を見る（保存しない） */
router.get('/closed-days/affected', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? from);
  if (!from) throw new AppError(400, 'VALIDATION_ERROR', '期間を入れてください');
  const loc = req.query.location_id ? String(req.query.location_id) : null;
  res.json({ success: true, data: await bookingsInRange(loc, from, to) });
}));

/**
 * この日時は営業時間の外か。**予約を作る前に画面が訊く。**
 * 保存は止めないので、これは注意を出すためだけのもの。
 */
router.post('/check', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  const { location_id, start_time, end_time } = req.body ?? {};
  if (!start_time) throw new AppError(400, 'VALIDATION_ERROR', '開始日時を入れてください');
  res.json({ success: true, data: await checkBooking(location_id || null, start_time, end_time || null) });
}));

/** 時間外の印が付いた予約の一覧（あとから拾うため） */
router.get('/out-of-hours/list', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  const from = String(req.query.from ?? '');
  const rows = await queryAll(
    `SELECT b.id, b.title, b.start_time, b.end_time, b.out_of_hours_reason, p.name AS project_name
       FROM studio_bookings b
       LEFT JOIN projects p ON p.id = b.project_id
      WHERE b.deleted_at IS NULL AND b.out_of_hours = TRUE
        ${from ? 'AND substr(b.start_time, 1, 10) >= ?' : ''}
      ORDER BY b.start_time`,
    from ? [from] : [],
  );
  res.json({ success: true, data: rows });
}));

export default router;
