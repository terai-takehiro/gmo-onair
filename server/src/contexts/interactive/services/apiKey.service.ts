/**
 * interactive/services/apiKey.service.ts
 *
 * 外部公開 API 用のキー発行/検証。
 *   - 発行: 32 バイト乱数を base64url 化し "ak_" prefix を付けて返す (発行時のみ)
 *   - DB には SHA-256 ハッシュのみ保存
 *   - 検証は ハッシュ → revoked_at IS NULL → last_used_at 更新
 *
 * scope は将来用 (現状 "read" のみ想定)。
 */
import crypto from 'crypto';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scope: string[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function hash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateRawKey(): { raw: string; prefix: string } {
  const bytes = crypto.randomBytes(32).toString('base64url');
  const raw = `ak_${bytes}`;
  return { raw, prefix: raw.slice(0, 12) };
}

export const apiKeyService = {
  async list(): Promise<ApiKeyRow[]> {
    return (await queryAll(
      `SELECT id, name, key_prefix, scope, created_by, created_at, last_used_at, revoked_at
       FROM interactive_api_keys
       ORDER BY revoked_at NULLS FIRST, created_at DESC`,
    )) as unknown as ApiKeyRow[];
  },

  async create(name: string, createdBy: string | null, scope: string[] = ['read']) {
    if (!name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
    const id = crypto.randomUUID();
    const { raw, prefix } = generateRawKey();
    const keyHash = hash(raw);
    await execute(
      `INSERT INTO interactive_api_keys (id, name, key_prefix, key_hash, scope, created_by)
       VALUES (?, ?, ?, ?, ?::jsonb, ?)`,
      [id, name.trim(), prefix, keyHash, JSON.stringify(scope), createdBy],
    );
    return { id, name: name.trim(), keyPrefix: prefix, secret: raw, scope };
  },

  async revoke(id: string) {
    await execute(
      `UPDATE interactive_api_keys SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
      [id],
    );
  },

  /**
   * X-API-Key ヘッダー値からキーを検証。
   * 有効な場合 last_used_at を更新して row を返す。
   * 無効/取消済みは null。
   */
  async verify(rawKey: string): Promise<ApiKeyRow | null> {
    if (!rawKey || !rawKey.startsWith('ak_')) return null;
    const keyHash = hash(rawKey);
    const row = (await queryOne(
      `SELECT id, name, key_prefix, scope, created_by, created_at, last_used_at, revoked_at
       FROM interactive_api_keys
       WHERE key_hash = ? AND revoked_at IS NULL`,
      [keyHash],
    )) as unknown as ApiKeyRow | null;
    if (!row) return null;
    // fire-and-forget で last_used_at 更新 (失敗しても検証成功は返す)
    execute(`UPDATE interactive_api_keys SET last_used_at = NOW() WHERE id = ?`, [row.id]).catch(
      () => undefined,
    );
    return row;
  },
};
