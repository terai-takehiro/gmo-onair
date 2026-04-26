/**
 * interactive/services/channel.service.ts — Phase 3 v2.6.9
 * チャンネル CRUD のロジック層。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

export interface CreateInput {
  name?: string;
  language_code?: string;
  youtube_url?: string | null;
  banner_url?: string | null;
  admin_comment?: string | null;
  survey_url?: string | null;
}

export interface UpdateInput {
  name?: string;
  language_code?: string;
  youtube_url?: string | null;
  banner_url?: string | null;
  admin_comment?: string | null;
  survey_url?: string | null;
  is_active?: boolean;
}

export const channelService = {
  async listByEvent(eventId: string) {
    return queryAll(
      'SELECT * FROM interactive_channels WHERE event_id = ? ORDER BY sort_order, created_at',
      [eventId],
    );
  },

  async create(eventId: string, input: CreateInput) {
    const id = uuid();
    const maxOrder = (await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1)::int + 1 as next FROM interactive_channels WHERE event_id = ?',
      [eventId],
    )) as { next: number } | null;

    await execute(
      `INSERT INTO interactive_channels (id, event_id, name, language_code, youtube_url, banner_url, admin_comment, survey_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, eventId,
        input.name || 'デフォルト',
        input.language_code || 'ja',
        input.youtube_url ?? null,
        input.banner_url ?? null,
        input.admin_comment ?? null,
        input.survey_url ?? null,
        maxOrder?.next ?? 0,
      ],
    );

    return queryOne('SELECT * FROM interactive_channels WHERE id = ?', [id]);
  },

  async update(id: string, input: UpdateInput) {
    await execute(
      `UPDATE interactive_channels SET
         name = COALESCE(?, name), language_code = COALESCE(?, language_code),
         youtube_url = ?, banner_url = ?, admin_comment = ?, survey_url = ?,
         is_active = COALESCE(?, is_active), updated_at = NOW()
       WHERE id = ?`,
      [
        input.name || null,
        input.language_code || null,
        input.youtube_url ?? null,
        input.banner_url ?? null,
        input.admin_comment ?? null,
        input.survey_url ?? null,
        input.is_active !== undefined ? input.is_active : null,
        id,
      ],
    );
    return queryOne('SELECT * FROM interactive_channels WHERE id = ?', [id]);
  },

  async delete(id: string) {
    await execute('DELETE FROM interactive_channels WHERE id = ?', [id]);
  },
};
