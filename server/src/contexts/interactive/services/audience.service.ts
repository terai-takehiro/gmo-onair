/**
 * interactive/services/audience.service.ts — Phase 3 v2.6.9
 * 視聴者向け (認証不要) ドメインロジック。
 */
import crypto from 'crypto';
import QRCode from 'qrcode';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  accepting: boolean | null;
  youtube_url: string | null;
  banner_url: string | null;
  admin_comment: string | null;
  survey_url: string | null;
  waiting_message: string | null;
  ended_message: string | null;
  max_connections: number;
}

interface ChannelRow {
  id: string;
  youtube_url: string | null;
  banner_url: string | null;
  admin_comment: string | null;
  survey_url: string | null;
}

export const audienceService = {
  async getEventForAudience(eventId: string, channelId: string | undefined) {
    const row = (await queryOne(
      `SELECT id, title, description, status, accepting,
              youtube_url, banner_url, admin_comment, survey_url,
              waiting_message, ended_message
       FROM interactive_events WHERE id = ? AND deleted_at IS NULL`,
      [eventId],
    )) as unknown as EventRow | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

    let channel: ChannelRow | null = null;
    try {
      if (channelId) {
        channel = (await queryOne(
          'SELECT * FROM interactive_channels WHERE id = ? AND event_id = ? AND is_active = true',
          [channelId, eventId],
        )) as unknown as ChannelRow | null;
      }
      if (!channel) {
        channel = (await queryOne(
          'SELECT * FROM interactive_channels WHERE event_id = ? AND is_active = true ORDER BY sort_order LIMIT 1',
          [eventId],
        )) as unknown as ChannelRow | null;
      }
    } catch {
      /* OK — channels テーブルが古いスキーマで無いケース */
    }

    const stamps = await queryAll(
      'SELECT id, label, emoji, color, animation, sort_order, image_url FROM interactive_stamps WHERE event_id = ? AND is_active = true ORDER BY sort_order',
      [eventId],
    );

    return {
      title: row.title,
      status: row.status,
      accepting: row.accepting ?? false,
      youtube_url: channel?.youtube_url || row.youtube_url || null,
      banner_url: channel?.banner_url || row.banner_url || null,
      admin_comment: channel?.admin_comment || row.admin_comment || null,
      survey_url: channel?.survey_url || row.survey_url || null,
      waiting_message: row.waiting_message || null,
      ended_message: row.ended_message || null,
      stamps,
    };
  },

  /** セッション作成。視聴者がイベントに参加するエンドポイント */
  async join(eventId: string, userAgent: string) {
    const event = await queryOne(
      'SELECT id, status, max_connections FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
      [eventId],
    );
    if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

    const sessionToken = crypto.randomBytes(32).toString('hex');
    await execute(
      `INSERT INTO interactive_sessions (id, event_id, session_token, user_agent)
       VALUES (gen_random_uuid(), ?, ?, ?)`,
      [eventId, sessionToken, String(userAgent || '').slice(0, 500)],
    );
    return { session_token: sessionToken };
  },

  /** スタンプ送信 (HTTP fallback) */
  async sendStamp(eventId: string, stampId: string) {
    if (!stampId) throw new AppError(400, 'VALIDATION_ERROR', 'stamp_idは必須です');
    const bucketAt = new Date();
    bucketAt.setSeconds(0, 0);
    await execute(
      `INSERT INTO interactive_stamp_counts (id, stamp_id, event_id, count, bucket_at)
       VALUES (gen_random_uuid(), ?, ?, 1, ?)
       ON CONFLICT (stamp_id, bucket_at)
       DO UPDATE SET count = interactive_stamp_counts.count + 1`,
      [stampId, eventId, bucketAt.toISOString()],
    );
  },

  /** イベント参加用 QR (SVG) */
  async generateQrSvg(clientUrl: string, eventId: string, channelId?: string) {
    const url = channelId
      ? `${clientUrl}/interactive/audience/${eventId}?ch=${channelId}`
      : `${clientUrl}/interactive/audience/${eventId}`;
    return QRCode.toString(url, { type: 'svg', margin: 1 });
  },
};
