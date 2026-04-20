import { Router } from 'express';
import { queryOne, execute } from '../../../shared/db/connection';
import { encrypt, decrypt, mask } from '../crypto';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const row = await queryOne(
      'SELECT youtube_api_key_enc, jstream_token_enc, polling_interval_sec FROM liveops_settings WHERE user_id = $1',
      [userId]
    );
    res.json({
      success: true,
      data: {
        youtubeApiKeyMasked: mask(row ? decrypt((row as any).youtube_api_key_enc) : null),
        jstreamTokenMasked: mask(row ? decrypt((row as any).jstream_token_enc) : null),
        pollingIntervalSec: (row as any)?.polling_interval_sec ?? 10,
        hasYoutubeKey: !!(row as any)?.youtube_api_key_enc,
        hasJstreamToken: !!(row as any)?.jstream_token_enc,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

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
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
