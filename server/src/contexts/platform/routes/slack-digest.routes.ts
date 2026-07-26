/**
 * 朝の1通 (Slack) の配信設定 — **システム管理者のみ**
 *
 * 触ると全社チャンネルに出るので、権限は絞ってある (§4.20)。
 * 個人への DM の ON/OFF は `/dashboard/notification-prefs` (本人が持つ) 側。
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { DIGEST_BLOCKS, buildDigestText, buildPersonalDigests } from '../services/digest.service';
import { isSlackConfigured, listChannels, postMessage, findUserByEmail } from '../services/slack.service';

const router = Router();
router.use(requireAuth, requireRole('system_admin'));

const COLS = `id, label, channel, send_time, weekdays, blocks, enabled, last_sent_at, last_error, updated_at`;
const BLOCK_KEYS = new Set(DIGEST_BLOCKS.map((b) => b.key));

/** 入力の正規化。おかしな値を DB に入れない */
function normalize(body: Record<string, unknown>) {
  const channel = String(body.channel ?? '').trim();
  if (!channel) throw new AppError(400, 'VALIDATION_ERROR', '投稿先のチャンネルを入れてください');
  const time = String(body.send_time ?? '06:00').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new AppError(400, 'VALIDATION_ERROR', '時刻は 06:00 のように入れてください');
  }
  const days = Array.isArray(body.weekdays)
    ? body.weekdays.map((d) => Number(d)).filter((d) => d >= 1 && d <= 7)
    : String(body.weekdays ?? '1,2,3,4,5').split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 7);
  if (days.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '送る曜日を1つ以上選んでください');
  const blocks = (Array.isArray(body.blocks) ? body.blocks : [])
    .map((b) => String(b))
    .filter((b) => BLOCK_KEYS.has(b));
  if (blocks.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '出す内容を1つ以上選んでください');
  return {
    label: body.label ? String(body.label).slice(0, 120) : null,
    channel,
    send_time: time,
    weekdays: Array.from(new Set(days)).sort().join(','),
    blocks,
    enabled: body.enabled !== false,
  };
}

/** 出せる内容のメニュー + Slack の状態 (画面はこれ1本で組める) */
router.get('/slack-digests/meta', async (_req, res) => {
  const ch = isSlackConfigured() ? await listChannels() : { channels: [], reason: '未設定' };
  res.json({
    success: true,
    data: {
      blocks: DIGEST_BLOCKS,
      slack_configured: isSlackConfigured(),
      // channels が空でも画面は手入力で進められる (reason を出して理由が分かるようにする)
      channels: ch.channels,
      channels_reason: ch.reason ?? null,
    },
  });
});

router.get('/slack-digests', async (_req, res) => {
  const rows = await queryAll(
    `SELECT ${COLS} FROM slack_digests WHERE deleted_at IS NULL ORDER BY send_time, created_at`,
  );
  res.json({ success: true, data: rows });
});

router.post('/slack-digests', async (req, res) => {
  const v = normalize(req.body ?? {});
  const id = uuidv4();
  await execute(
    `INSERT INTO slack_digests (id, label, channel, send_time, weekdays, blocks, enabled, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
    [id, v.label, v.channel, v.send_time, v.weekdays, JSON.stringify(v.blocks), v.enabled, req.user!.id, req.user!.id],
  );
  res.status(201).json({ success: true, data: await queryOne(`SELECT ${COLS} FROM slack_digests WHERE id = ?`, [id]) });
});

router.put('/slack-digests/:id', async (req, res) => {
  const existing = await queryOne(`SELECT id FROM slack_digests WHERE id = ? AND deleted_at IS NULL`, [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '配信設定が見つかりません');
  const v = normalize(req.body ?? {});
  await execute(
    `UPDATE slack_digests SET label = ?, channel = ?, send_time = ?, weekdays = ?, blocks = ?::jsonb,
            enabled = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
    [v.label, v.channel, v.send_time, v.weekdays, JSON.stringify(v.blocks), v.enabled, req.user!.id, req.params.id],
  );
  res.json({ success: true, data: await queryOne(`SELECT ${COLS} FROM slack_digests WHERE id = ?`, [req.params.id]) });
});

router.delete('/slack-digests/:id', async (req, res) => {
  await execute(`UPDATE slack_digests SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: { deleted: true } });
});

/**
 * 本文を確認する — **送らない**。
 * 全社に出るものを送る前に読めないと初回が事故るので必ず用意する。
 */
router.post('/slack-digests/preview', async (req, res) => {
  const blocks = (Array.isArray(req.body?.blocks) ? req.body.blocks : [])
    .map((b: unknown) => String(b)).filter((b: string) => BLOCK_KEYS.has(b));
  const text = await buildDigestText(blocks);
  res.json({ success: true, data: { text } });
});

/** いま1回だけ送る (テスト送信)。last_sent_at は動かさない = その日の定時送信は止めない */
router.post('/slack-digests/:id/send-now', async (req, res) => {
  if (!isSlackConfigured()) {
    throw new AppError(503, 'SLACK_NOT_CONFIGURED', 'Slack のトークン (SLACK_BOT_TOKEN) が設定されていません');
  }
  const row = await queryOne(
    `SELECT channel, blocks FROM slack_digests WHERE id = ? AND deleted_at IS NULL`, [req.params.id],
  ) as { channel: string; blocks: unknown } | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '配信設定が見つかりません');
  const blocks = Array.isArray(row.blocks) ? (row.blocks as string[]) : [];
  const text = await buildDigestText(blocks);
  try {
    await postMessage(row.channel, text);
    await execute(`UPDATE slack_digests SET last_error = NULL WHERE id = ?`, [req.params.id]);
    res.json({ success: true, data: { sent: true, text } });
  } catch (err) {
    const message = (err as Error).message;
    await execute(`UPDATE slack_digests SET last_error = ? WHERE id = ?`, [message.slice(0, 500), req.params.id]);
    throw new AppError(502, 'SLACK_SEND_FAILED', message);
  }
});

// ── 個人への DM の時刻 (1行だけ)。受け取るかどうかは各自が決める ──────────
const DM_COLS = `send_time, weekdays, enabled, last_sent_at, last_error, updated_at`;

router.get('/slack-dm', async (_req, res) => {
  const row = await queryOne(`SELECT ${DM_COLS} FROM slack_dm_settings WHERE id = TRUE`);
  res.json({
    success: true,
    data: row ?? { send_time: '06:00', weekdays: '1,2,3,4,5', enabled: true, last_sent_at: null, last_error: null },
  });
});

router.put('/slack-dm', async (req, res) => {
  const b = req.body ?? {};
  const time = String(b.send_time ?? '06:00').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new AppError(400, 'VALIDATION_ERROR', '時刻は 06:00 のように入れてください');
  }
  const days = (Array.isArray(b.weekdays) ? b.weekdays : String(b.weekdays ?? '1,2,3,4,5').split(','))
    .map((d: unknown) => Number(d)).filter((d: number) => d >= 1 && d <= 7);
  if (days.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '送る曜日を1つ以上選んでください');
  await execute(
    `INSERT INTO slack_dm_settings (id, send_time, weekdays, enabled, updated_by, updated_at)
     VALUES (TRUE, ?, ?, ?, ?, NOW())
     ON CONFLICT (id) DO UPDATE SET
       send_time = EXCLUDED.send_time, weekdays = EXCLUDED.weekdays,
       enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [time, Array.from(new Set(days)).sort().join(','), b.enabled !== false, req.user!.id],
  );
  res.json({ success: true, data: await queryOne(`SELECT ${DM_COLS} FROM slack_dm_settings WHERE id = TRUE`) });
});

/** DM の本文を確認する — **自分の分だけ**を組んで返す (送らない) */
router.post('/slack-dm/preview', async (req, res) => {
  const all = await buildPersonalDigests();
  const mine = all.find((d) => d.userId === req.user!.id);
  res.json({
    success: true,
    data: {
      text: mine?.text ?? '（あなたに出すものは今ありません。期限切れ・今日が期限・未返答の依頼が無い人には送りません）',
      recipients: all.length,
    },
  });
});

/** いま1回だけ自分に DM を送る (テスト送信) */
router.post('/slack-dm/send-now', async (req, res) => {
  if (!isSlackConfigured()) {
    throw new AppError(503, 'SLACK_NOT_CONFIGURED', 'Slack のトークン (SLACK_BOT_TOKEN) が設定されていません');
  }
  const all = await buildPersonalDigests();
  const mine = all.find((d) => d.userId === req.user!.id);
  if (!mine) throw new AppError(400, 'NOTHING_TO_SEND', 'あなたに出すものが今ありません（期限切れ・今日が期限・未返答の依頼がない状態です）');
  const slackId = await findUserByEmail(mine.email);
  if (!slackId) {
    throw new AppError(400, 'SLACK_USER_NOT_FOUND', `Slack で ${mine.email} のユーザーが見つかりません（App に users:read.email が必要です）`);
  }
  await postMessage(slackId, mine.text);
  res.json({ success: true, data: { sent: true, text: mine.text } });
});

export default router;
