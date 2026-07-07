import { queryOne } from '../../shared/db/connection';
import { decrypt } from './crypto';

export type SettingsColumn =
  | 'youtube_api_key_enc'
  | 'jstream_token_enc'
  | 'zoom_client_id_enc'
  | 'zoom_client_secret_enc'
  | 'zoom_account_id_enc'
  | 'teams_client_id_enc'
  | 'teams_client_secret_enc'
  | 'teams_tenant_id_enc';

/** APIキーを取得: 自分のキーを優先し、なければ他ユーザーのキーにフォールバック */
export async function resolveKey(userId: string, column: SettingsColumn): Promise<string | null> {
  const own = await queryOne(
    `SELECT ${column} FROM liveops_settings WHERE user_id = $1`,
    [userId]
  );
  const enc = (own as any)?.[column] || null;
  if (enc) return decrypt(enc);

  // org-level fallback: use any configured key
  const fallback = await queryOne(
    `SELECT ${column} FROM liveops_settings WHERE ${column} IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
    []
  );
  const fallbackEnc = (fallback as any)?.[column] || null;
  return fallbackEnc ? decrypt(fallbackEnc) : null;
}
