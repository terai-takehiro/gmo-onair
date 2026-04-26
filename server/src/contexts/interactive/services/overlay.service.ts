/**
 * interactive/services/overlay.service.ts — Phase 3 v2.6.9
 * オーバーレイテンプレート CRUD のロジック層。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

const VALID_TYPES = ['stamp_counter', 'ticker', 'bar_chart', 'floating'] as const;
type OverlayType = (typeof VALID_TYPES)[number];

export interface OverlayInput {
  name?: string;
  type?: string;
  config?: Record<string, unknown>;
}

function safeType(type: string | undefined, fallback: OverlayType = 'stamp_counter'): OverlayType {
  return type && (VALID_TYPES as readonly string[]).includes(type) ? (type as OverlayType) : fallback;
}

export const overlayService = {
  async list() {
    return queryAll('SELECT * FROM interactive_overlay_templates ORDER BY name LIMIT 100');
  },

  async create(input: OverlayInput, userId: string) {
    if (!input.name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');

    const id = uuidv4();
    await execute(
      `INSERT INTO interactive_overlay_templates (id, name, type, config, created_by) VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        String(input.name).slice(0, 255),
        safeType(input.type),
        JSON.stringify(input.config ?? {}),
        userId,
      ],
    );
    return queryOne('SELECT * FROM interactive_overlay_templates WHERE id = ?', [id]);
  },

  async update(id: string, input: OverlayInput) {
    const existing = (await queryOne(
      'SELECT * FROM interactive_overlay_templates WHERE id = ?',
      [id],
    )) as { name: string; type: string; config: unknown } | null;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');

    await execute(
      `UPDATE interactive_overlay_templates SET name=?, type=?, config=?, updated_at=NOW() WHERE id=?`,
      [
        input.name ? String(input.name).slice(0, 255) : existing.name,
        safeType(input.type, existing.type as OverlayType),
        JSON.stringify(input.config ?? existing.config),
        id,
      ],
    );
    return queryOne('SELECT * FROM interactive_overlay_templates WHERE id = ?', [id]);
  },

  async delete(id: string) {
    await execute('DELETE FROM interactive_overlay_templates WHERE id = ?', [id]);
  },
};
