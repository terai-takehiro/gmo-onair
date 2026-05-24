import { Router } from 'express';
import { queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { encrypt, decrypt, mask } from '../crypto';

const router = Router();
const canRead  = [requireAuth, requirePermission('liveops', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('liveops', 'manager')] as const;

router.get('/', ...canRead, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const row = await queryOne(
      `SELECT youtube_api_key_enc, jstream_token_enc, polling_interval_sec,
              zoom_client_id_enc, zoom_client_secret_enc, zoom_account_id_enc,
              teams_client_id_enc, teams_client_secret_enc, teams_tenant_id_enc
       FROM liveops_settings WHERE user_id = $1`,
      [userId]
    );
    const anyYt = !row?.youtube_api_key_enc
      ? await queryOne('SELECT youtube_api_key_enc FROM liveops_settings WHERE youtube_api_key_enc IS NOT NULL LIMIT 1', [])
      : null;
    const anyJs = !row?.jstream_token_enc
      ? await queryOne('SELECT jstream_token_enc FROM liveops_settings WHERE jstream_token_enc IS NOT NULL LIMIT 1', [])
      : null;
    const anyZoom = !(row as any)?.zoom_client_id_enc
      ? await queryOne('SELECT zoom_client_id_enc FROM liveops_settings WHERE zoom_client_id_enc IS NOT NULL LIMIT 1', [])
      : null;
    const anyTeams = !(row as any)?.teams_client_id_enc
      ? await queryOne('SELECT teams_client_id_enc FROM liveops_settings WHERE teams_client_id_enc IS NOT NULL LIMIT 1', [])
      : null;

    res.json({
      success: true,
      data: {
        youtubeApiKeyMasked: mask(row ? decrypt((row as any).youtube_api_key_enc) : null),
        jstreamTokenMasked: mask(row ? decrypt((row as any).jstream_token_enc) : null),
        pollingIntervalSec: (row as any)?.polling_interval_sec ?? 10,
        hasYoutubeKey: !!(row as any)?.youtube_api_key_enc || !!anyYt,
        hasJstreamToken: !!(row as any)?.jstream_token_enc || !!anyJs,
        hasOwnYoutubeKey: !!(row as any)?.youtube_api_key_enc,
        hasOwnJstreamToken: !!(row as any)?.jstream_token_enc,
        hasZoomCredentials: !!(row as any)?.zoom_client_id_enc || !!anyZoom,
        hasTeamsCredentials: !!(row as any)?.teams_client_id_enc || !!anyTeams,
        hasOwnZoomCredentials: !!(row as any)?.zoom_client_id_enc,
        hasOwnTeamsCredentials: !!(row as any)?.teams_client_id_enc,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const {
      youtubeApiKey, jstreamToken, pollingIntervalSec,
      zoomClientId, zoomClientSecret, zoomAccountId,
      teamsClientId, teamsClientSecret, teamsTenantId,
    } = req.body;

    const existing = await queryOne(
      'SELECT user_id FROM liveops_settings WHERE user_id = $1',
      [userId]
    );

    if (existing) {
      const sets: string[] = ['polling_interval_sec = $2', 'updated_at = NOW()'];
      const params: unknown[] = [userId, pollingIntervalSec ?? 10];
      const addField = (value: unknown, col: string) => {
        if (value !== undefined && value !== '') {
          sets.push(`${col} = $${params.length + 1}`);
          params.push(encrypt(value as string));
        }
      };
      addField(youtubeApiKey, 'youtube_api_key_enc');
      addField(jstreamToken, 'jstream_token_enc');
      addField(zoomClientId, 'zoom_client_id_enc');
      addField(zoomClientSecret, 'zoom_client_secret_enc');
      addField(zoomAccountId, 'zoom_account_id_enc');
      addField(teamsClientId, 'teams_client_id_enc');
      addField(teamsClientSecret, 'teams_client_secret_enc');
      addField(teamsTenantId, 'teams_tenant_id_enc');
      await execute(
        `UPDATE liveops_settings SET ${sets.join(', ')} WHERE user_id = $1`,
        params
      );
    } else {
      const enc = (v: unknown) => (v ? encrypt(v as string) : null);
      await execute(
        `INSERT INTO liveops_settings
           (user_id, youtube_api_key_enc, jstream_token_enc, polling_interval_sec,
            zoom_client_id_enc, zoom_client_secret_enc, zoom_account_id_enc,
            teams_client_id_enc, teams_client_secret_enc, teams_tenant_id_enc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          userId,
          enc(youtubeApiKey), enc(jstreamToken), pollingIntervalSec ?? 10,
          enc(zoomClientId), enc(zoomClientSecret), enc(zoomAccountId),
          enc(teamsClientId), enc(teamsClientSecret), enc(teamsTenantId),
        ]
      );
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
