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
      'SELECT youtube_api_key_enc, jstream_token_enc, polling_interval_sec FROM liveops_settings WHERE user_id = $1',
      [userId]
    );
    // Check if any user has configured keys (org-level fallback)
    const anyYt = !row?.youtube_api_key_enc
      ? await queryOne('SELECT youtube_api_key_enc FROM liveops_settings WHERE youtube_api_key_enc IS NOT NULL LIMIT 1', [])
      : null;
    const anyJs = !row?.jstream_token_enc
      ? await queryOne('SELECT jstream_token_enc FROM liveops_settings WHERE jstream_token_enc IS NOT NULL LIMIT 1', [])
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
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const { youtubeApiKey, jstreamToken, pollingIntervalSec } = req.body;

    const existing = await queryOne(
      'SELECT user_id FROM liveops_settings WHERE user_id = $1',
      [userId]
    );

    if (existing) {
      const sets: string[] = ['polling_interval_sec = $2', 'updated_at = NOW()'];
      const params: unknown[] = [userId, pollingIntervalSec ?? 10];
      if (youtubeApiKey !== undefined && youtubeApiKey !== '') {
        sets.push(`youtube_api_key_enc = $${params.length + 1}`);
        params.push(encrypt(youtubeApiKey));
      }
      if (jstreamToken !== undefined && jstreamToken !== '') {
        sets.push(`jstream_token_enc = $${params.length + 1}`);
        params.push(encrypt(jstreamToken));
      }
      await execute(
        `UPDATE liveops_settings SET ${sets.join(', ')} WHERE user_id = $1`,
        params
      );
    } else {
      await execute(
        `INSERT INTO liveops_settings (user_id, youtube_api_key_enc, jstream_token_enc, polling_interval_sec)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          youtubeApiKey ? encrypt(youtubeApiKey) : null,
          jstreamToken ? encrypt(jstreamToken) : null,
          pollingIntervalSec ?? 10,
        ]
      );
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
