/**
 * 社内通知とひな形の API — v4 設定 ⑦
 *
 * ── 通知は「自分のもの」しか触れない ────────────────────────
 *
 * 一覧も既読も**ログインしている本人の行だけ**を対象にします。id を渡す形に
 * すると、他人の id を渡せば他人の通知を既読にできてしまいます。
 * 権限で守るのではなく、**そもそも他人の行に届かない SQL** にしてあります。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { listFor, unreadCount, markRead } from '../services/notification.service';
import { runDueJobs, SCHEDULER_JOBS } from '../services/scheduler.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
const p1 = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v ?? '');

const router = Router();
router.use(requireAuth);

/** ベルの中身。**権限を掛けない** — 通知は全員が受け取る */
router.get('/', wrap(async (req, res) => {
  const me = req.user!.id;
  res.json({
    success: true,
    data: {
      items: await listFor(me, { unreadOnly: req.query.unread === '1', limit: Number(req.query.limit) || 30 }),
      unread: await unreadCount(me),
    },
  });
}));

router.post('/read', wrap(async (req, res) => {
  const ids = req.body?.ids;
  await markRead(req.user!.id, ids === 'all' || !Array.isArray(ids) ? 'all' : ids.map(String));
  res.json({ success: true, data: { unread: await unreadCount(req.user!.id) } });
}));

// ───────────────────────────────────────────────────────────
// ひな形（設定 ⑦）
// ───────────────────────────────────────────────────────────

/** 読むのは system_admin だけ（旧 `admin` 区画は廃止）。定時実行の直近の記録もいっしょに返す */
router.get('/templates', requireRole('system_admin'), wrap(async (_req, res) => {
  const templates = await queryAll(
    `SELECT id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order
       FROM notification_templates ORDER BY sort_order`,
  );
  const runs = await queryAll(
    `SELECT job_key, run_date, started_at, finished_at, created, error
       FROM scheduled_job_runs ORDER BY run_date DESC, job_key LIMIT 30`,
  );
  // 「何通送ったか」は**出した社内通知の実数**。モックのサンプル値は出さない
  const counts = await queryAll(
    `SELECT template_id, COUNT(*)::int AS n FROM notifications
      WHERE template_id IS NOT NULL GROUP BY template_id`,
  );
  res.json({ success: true, data: { templates, runs, counts, jobs: SCHEDULER_JOBS } });
}));

/**
 * ひな形を直す。**社外の文面も直せます**（コピーして使うため）。
 * ただし `enabled` は社外では意味を持たない — v4 に送信の経路が無いので、
 * 画面が触らせません（ここでも念のため弾きます）。
 */
router.put('/templates/:id', requireRole('system_admin'), wrap(async (req, res) => {
  const id = p1(req.params.id);
  const { subject, body, enabled } = req.body ?? {};
  const row = await queryAll(
    'SELECT audience, channel FROM notification_templates WHERE id = ?', [id],
  );
  if (row.length === 0) throw new AppError(404, 'NOT_FOUND', 'そのひな形はありません');
  const external = row[0].audience === 'external';

  const sets: string[] = ['updated_at = NOW()', 'updated_by = ?'];
  const params: unknown[] = [req.user!.id];
  if (typeof subject === 'string') { sets.push('subject = ?'); params.push(subject); }
  if (typeof body === 'string') { sets.push('body = ?'); params.push(body); }
  if (typeof enabled === 'boolean') {
    if (external && enabled) {
      throw new AppError(400, 'VALIDATION_ERROR',
        '社外あての文面は自動で送りません。文面をコピーして送ってください。');
    }
    sets.push('enabled = ?'); params.push(enabled);
  }
  await execute(`UPDATE notification_templates SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  res.json({ success: true });
}));

/**
 * いま流す（試験用）。**時刻を無視して流します。**
 * 二重に出ないことは `notifications` の一意索引が守るので、
 * 何度押しても同じ通知は増えません。
 */
router.post('/run-jobs', requireRole('system_admin'), wrap(async (_req, res) => {
  res.json({ success: true, data: await runDueJobs(true) });
}));

export default router;
