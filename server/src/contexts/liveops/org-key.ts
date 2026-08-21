/**
 * 組織共通の鍵（`liveops_org_settings`）を読む。
 *
 * サーバー側の視聴者取得は「操作している人」を持たないため、`resolve-key.ts` の
 * `resolveKey`（自分の鍵 → 無ければ組織内の他人の鍵にフォールバック）は使えない。
 * 誰の割り当てを消費しているか分からなくなるため（実装設計 §6-1）。
 * ここでは常に `liveops_org_settings` の1行だけを見る。
 */
import { queryOne, execute } from '../../shared/db/connection';
import { encrypt, decrypt, mask } from './crypto';

export interface OrgKeys {
  youtubeApiKey: string | null;
  jstreamToken: string | null;
  zoom: { accountId: string; clientId: string; clientSecret: string } | null;
  teams: { tenantId: string; clientId: string; clientSecret: string } | null;
}

interface OrgSettingsRow {
  youtube_api_key_enc: string | null;
  jstream_token_enc: string | null;
  zoom_account_id_enc: string | null;
  zoom_client_id_enc: string | null;
  zoom_client_secret_enc: string | null;
  teams_tenant_id_enc: string | null;
  teams_client_id_enc: string | null;
  teams_client_secret_enc: string | null;
  polling_interval_sec: number;
  updated_by: string | null;
  updated_at: string;
}

async function loadRow(): Promise<OrgSettingsRow | null> {
  const row = await queryOne(
    `SELECT youtube_api_key_enc, jstream_token_enc,
            zoom_account_id_enc, zoom_client_id_enc, zoom_client_secret_enc,
            teams_tenant_id_enc, teams_client_id_enc, teams_client_secret_enc,
            polling_interval_sec, updated_by, updated_at
       FROM liveops_org_settings WHERE id = TRUE`,
    [],
  );
  return (row as unknown as OrgSettingsRow) ?? null;
}

/**
 * 復号できない（`decrypt` が `null` を返す）値は「未設定」と同じ扱いにする。
 * `decrypt` は失敗しても例外を投げず `null` を返すので、ここで必ず吸収する。
 */
export async function loadOrgKeys(): Promise<OrgKeys> {
  const row = await loadRow();
  if (!row) {
    return { youtubeApiKey: null, jstreamToken: null, zoom: null, teams: null };
  }

  const youtubeApiKey = row.youtube_api_key_enc ? decrypt(row.youtube_api_key_enc) : null;
  const jstreamToken = row.jstream_token_enc ? decrypt(row.jstream_token_enc) : null;

  const zoomAccountId = row.zoom_account_id_enc ? decrypt(row.zoom_account_id_enc) : null;
  const zoomClientId = row.zoom_client_id_enc ? decrypt(row.zoom_client_id_enc) : null;
  const zoomClientSecret = row.zoom_client_secret_enc ? decrypt(row.zoom_client_secret_enc) : null;
  const zoom =
    zoomAccountId && zoomClientId && zoomClientSecret
      ? { accountId: zoomAccountId, clientId: zoomClientId, clientSecret: zoomClientSecret }
      : null;

  const teamsTenantId = row.teams_tenant_id_enc ? decrypt(row.teams_tenant_id_enc) : null;
  const teamsClientId = row.teams_client_id_enc ? decrypt(row.teams_client_id_enc) : null;
  const teamsClientSecret = row.teams_client_secret_enc ? decrypt(row.teams_client_secret_enc) : null;
  const teams =
    teamsTenantId && teamsClientId && teamsClientSecret
      ? { tenantId: teamsTenantId, clientId: teamsClientId, clientSecret: teamsClientSecret }
      : null;

  return { youtubeApiKey, jstreamToken, zoom, teams };
}

/** 計測に使う取得間隔（秒）。組織共通の1本だけを正とする。 */
export async function loadOrgPollingIntervalSec(): Promise<number> {
  const row = await loadRow();
  return row?.polling_interval_sec ?? 10;
}

/** 画面用: 伏せ字と has* だけを返す（平文は1文字も含めない） */
export async function loadOrgSettingsForDisplay() {
  const row = await loadRow();
  if (!row) {
    return {
      youtubeApiKeyMasked: '', jstreamTokenMasked: '',
      hasYoutubeKey: false, hasJstreamToken: false,
      hasZoomCredentials: false, hasTeamsCredentials: false,
      pollingIntervalSec: 10, updatedBy: null, updatedAt: null,
    };
  }
  return {
    youtubeApiKeyMasked: mask(row.youtube_api_key_enc ? decrypt(row.youtube_api_key_enc) : null),
    jstreamTokenMasked: mask(row.jstream_token_enc ? decrypt(row.jstream_token_enc) : null),
    hasYoutubeKey: !!row.youtube_api_key_enc,
    hasJstreamToken: !!row.jstream_token_enc,
    hasZoomCredentials: !!(row.zoom_account_id_enc && row.zoom_client_id_enc && row.zoom_client_secret_enc),
    hasTeamsCredentials: !!(row.teams_tenant_id_enc && row.teams_client_id_enc && row.teams_client_secret_enc),
    pollingIntervalSec: row.polling_interval_sec,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export interface OrgSettingsInput {
  youtubeApiKey?: string | null;
  jstreamToken?: string | null;
  zoomAccountId?: string | null;
  zoomClientId?: string | null;
  zoomClientSecret?: string | null;
  teamsTenantId?: string | null;
  teamsClientId?: string | null;
  teamsClientSecret?: string | null;
  pollingIntervalSec?: number;
}

/**
 * 保存の作法は既存の個人設定（settings.routes.ts）に揃える:
 * `undefined` は「触らない」、空文字も「変更しない」、明示的な `null` は「消す」。
 */
export async function saveOrgSettings(input: OrgSettingsInput, userId: string): Promise<void> {
  const sets: string[] = ['updated_by = $1', 'updated_at = NOW()'];
  const params: unknown[] = [userId];

  const addSecret = (value: string | null | undefined, col: string) => {
    if (value === undefined || value === '') return; // 触らない
    params.push(value === null ? null : encrypt(value));
    sets.push(`${col} = $${params.length}`);
  };

  addSecret(input.youtubeApiKey, 'youtube_api_key_enc');
  addSecret(input.jstreamToken, 'jstream_token_enc');
  addSecret(input.zoomAccountId, 'zoom_account_id_enc');
  addSecret(input.zoomClientId, 'zoom_client_id_enc');
  addSecret(input.zoomClientSecret, 'zoom_client_secret_enc');
  addSecret(input.teamsTenantId, 'teams_tenant_id_enc');
  addSecret(input.teamsClientId, 'teams_client_id_enc');
  addSecret(input.teamsClientSecret, 'teams_client_secret_enc');

  if (input.pollingIntervalSec !== undefined) {
    params.push(input.pollingIntervalSec);
    sets.push(`polling_interval_sec = $${params.length}`);
  }

  await execute(`UPDATE liveops_org_settings SET ${sets.join(', ')} WHERE id = TRUE`, params);
}
