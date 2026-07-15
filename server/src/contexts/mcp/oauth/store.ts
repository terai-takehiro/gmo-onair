import { v4 as uuidv4 } from 'uuid';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { queryOne, execute } from '../../../shared/db/connection';

// 動的クライアント登録 (DCR / RFC 7591) のクライアントストア。
// claude.ai のコネクタが接続時に自己登録する。PKCE を使う public client として扱い、
// client_secret は発行しない (token_endpoint_auth_method: 'none')。

function rowToClient(row: any): OAuthClientInformationFull {
  return {
    client_id: row.client_id,
    client_name: row.client_name ?? undefined,
    redirect_uris: row.redirect_uris ?? [],
    token_endpoint_auth_method: row.token_endpoint_auth_method ?? 'none',
    grant_types: row.grant_types ?? ['authorization_code', 'refresh_token'],
    response_types: row.response_types ?? ['code'],
    scope: row.scope ?? undefined,
    client_id_issued_at: Number(row.client_id_issued_at),
    ...(row.raw && typeof row.raw === 'object' ? {} : {}),
  } as OAuthClientInformationFull;
}

export const mcpClientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = await queryOne('SELECT * FROM mcp_oauth_clients WHERE client_id = ?', [clientId]);
    return row ? rowToClient(row) : undefined;
  },

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    const clientId = `mcp-${uuidv4()}`;
    const issuedAt = Math.floor(Date.now() / 1000);
    const redirectUris = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
    // public client (PKCE) に固定。claude.ai は PKCE を送るため client_secret は不要。
    const authMethod = 'none';
    const grantTypes = client.grant_types ?? ['authorization_code', 'refresh_token'];
    const responseTypes = client.response_types ?? ['code'];

    await execute(
      `INSERT INTO mcp_oauth_clients
        (client_id, client_name, redirect_uris, token_endpoint_auth_method, grant_types, response_types, scope, raw, client_id_issued_at)
       VALUES (?, ?, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?)`,
      [
        clientId,
        (client as any).client_name ?? null,
        JSON.stringify(redirectUris),
        authMethod,
        JSON.stringify(grantTypes),
        JSON.stringify(responseTypes),
        (client as any).scope ?? null,
        JSON.stringify(client ?? {}),
        issuedAt,
      ],
    );

    return {
      ...client,
      client_id: clientId,
      client_id_issued_at: issuedAt,
      token_endpoint_auth_method: authMethod,
      grant_types: grantTypes,
      response_types: responseTypes,
      redirect_uris: redirectUris,
    } as OAuthClientInformationFull;
  },
};
