/**
 * interactive/services/stamp.service.ts — Phase 3 v2.6.9
 * スタンプ CRUD + 並び替えのロジック層。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface CreateInput {
  event_id: string;
  label: string;
  emoji?: string;
  color?: string;
  animation?: string;
  sort_order?: number;
  image_url?: string | null;
}

export interface UpdateInput {
  label?: string;
  emoji?: string;
  color?: string;
  animation?: string;
  sort_order?: number;
  is_active?: boolean;
  image_url?: string | null;
}

export interface ReorderItem {
  id: string;
  sort_order: number;
}

const MAX_STAMPS_PER_EVENT = 20;

export const stampService = {
  async create(input: CreateInput) {
    if (!input.event_id || !input.label) {
      throw new AppError(400, 'VALIDATION_ERROR', 'event_idとlabelは必須です');
    }
    const count =
      ((await queryOne(
        'SELECT COUNT(*)::int as c FROM interactive_stamps WHERE event_id = ?',
        [input.event_id],
      )) as { c: number } | null)?.c ?? 0;
    if (count >= MAX_STAMPS_PER_EVENT) {
      throw new AppError(400, 'LIMIT_EXCEEDED', `スタンプは最大${MAX_STAMPS_PER_EVENT}個です`);
    }

    const id = uuidv4();
    await execute(
      `INSERT INTO interactive_stamps (id, event_id, label, emoji, color, animation, sort_order, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.event_id,
        String(input.label).slice(0, 100),
        input.emoji ?? '',
        input.color ?? '#e11d48',
        input.animation ?? 'bounce',
        input.sort_order ?? 0,
        input.image_url ?? null,
      ],
    );

    return queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [id]);
  },

  async update(id: string, input: UpdateInput) {
    const existing = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'スタンプが見つかりません');

    await execute(
      `UPDATE interactive_stamps SET
         label = COALESCE(?, label), emoji = COALESCE(?, emoji), color = COALESCE(?, color),
         animation = COALESCE(?, animation), sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active), image_url = COALESCE(?, image_url)
       WHERE id = ?`,
      [
        input.label || null,
        input.emoji !== undefined ? input.emoji : null,
        input.color || null,
        input.animation || null,
        input.sort_order !== undefined ? input.sort_order : null,
        input.is_active !== undefined ? input.is_active : null,
        input.image_url !== undefined ? (input.image_url || null) : null,
        id,
      ],
    );
    return queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [id]);
  },

  async delete(id: string) {
    await execute('DELETE FROM interactive_stamps WHERE id = ?', [id]);
  },

  async reorder(eventId: string, order: ReorderItem[]) {
    if (!Array.isArray(order)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'orderは配列で指定してください');
    }
    for (const item of order.slice(0, MAX_STAMPS_PER_EVENT)) {
      if (item.id && typeof item.sort_order === 'number') {
        await execute(
          'UPDATE interactive_stamps SET sort_order = ? WHERE id = ? AND event_id = ?',
          [item.sort_order, item.id, eventId],
        );
      }
    }
    return queryAll(
      'SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order',
      [eventId],
    );
  },
};
