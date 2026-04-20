import { Router, Request, Response } from 'express';
import axios from 'axios';
import { queryOne } from '../../../shared/db/connection';
import { decrypt } from '../crypto';

const router = Router();

/** YouTube Data API v3 proxy — CORS workaround */
router.get('/youtube', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const settings = userId
      ? await queryOne('SELECT youtube_api_key_enc FROM liveops_settings WHERE user_id = $1', [userId])
      : null;

    const apiKey = (settings as any)?.youtube_api_key_enc ? decrypt((settings as any).youtube_api_key_enc) : null;
    if (!apiKey) return res.status(400).json({ success: false, message: 'YouTube API key not configured' });

    const { videoIds } = req.query as { videoIds?: string };
    if (!videoIds) return res.status(400).json({ success: false, message: 'videoIds required' });

    const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: { id: videoIds, part: 'liveStreamingDetails,statistics', key: apiKey },
      timeout: 10000,
    });

    const items = ytRes.data.items || [];
    const counts: Record<string, number | null> = {};
    for (const item of items) {
      const concurrent = item.liveStreamingDetails?.concurrentViewers;
      counts[item.id] = concurrent != null ? parseInt(concurrent, 10) : null;
    }
    res.json({ success: true, data: counts });
  } catch (err: any) {
    const status = err?.response?.status || 500;
    res.status(status).json({ success: false, message: err?.response?.data?.error?.message || 'YouTube API error' });
  }
});

/** Jstream Equipmedia proxy — CORS workaround */
router.get('/jstream', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const settings = userId
      ? await queryOne('SELECT jstream_token_enc FROM liveops_settings WHERE user_id = $1', [userId])
      : null;

    const token = (settings as any)?.jstream_token_enc ? decrypt((settings as any).jstream_token_enc) : null;
    if (!token) return res.status(400).json({ success: false, message: 'Jstream token not configured' });

    const { lpid } = req.query as { lpid?: string };
    if (!lpid) return res.status(400).json({ success: false, message: 'lpid required' });

    const jsRes = await axios.get(
      'https://api01-platform.stream.co.jp/apiservice/getLiveConnection/',
      { params: { token, lpid, type: 'text' }, timeout: 10000 }
    );

    // CSV format: last line, last comma-separated value is the concurrent count
    const text: string = jsRes.data || '';
    const lines = text.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const parts = last.split(',');
    const count = parseInt(parts[parts.length - 1], 10);
    res.json({ success: true, data: { count: isNaN(count) ? 0 : count } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Jstream API error' });
  }
});

/** Singular Live Control App — get model */
router.get('/singular/model/:programId', async (req, res) => {
  try {
    const program = await queryOne(
      'SELECT singular_app_token_enc FROM liveops_programs WHERE id = $1 AND deleted_at IS NULL',
      [req.params.programId]
    );
    if (!(program as any)?.singular_app_token_enc) {
      return res.status(400).json({ success: false, message: 'Singular token not configured for this program' });
    }
    const token = decrypt((program as any).singular_app_token_enc);
    if (!token) return res.status(400).json({ success: false, message: 'Failed to decrypt token' });

    const singRes = await axios.get(
      `https://app.singular.live/apiv2/controlapps/${token}/model`,
      { timeout: 10000 }
    );
    // Cache model in DB
    await queryOne(
      'UPDATE liveops_programs SET singular_model_cache = $2, updated_at = NOW() WHERE id = $1',
      [req.params.programId, JSON.stringify(singRes.data)]
    );
    res.json({ success: true, data: singRes.data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Singular API error' });
  }
});

/** Singular Live Control App — send values */
router.post('/singular/control/:programId', async (req, res) => {
  try {
    const program = await queryOne(
      'SELECT singular_app_token_enc FROM liveops_programs WHERE id = $1 AND deleted_at IS NULL',
      [req.params.programId]
    );
    if (!(program as any)?.singular_app_token_enc) {
      return res.status(400).json({ success: false, message: 'Singular token not configured' });
    }
    const token = decrypt((program as any).singular_app_token_enc);
    if (!token) return res.status(400).json({ success: false, message: 'Failed to decrypt token' });

    const { payload } = req.body;
    const singRes = await axios.patch(
      `https://app.singular.live/apiv2/controlapps/${token}/control`,
      payload,
      { timeout: 10000 }
    );
    res.json({ success: true, data: singRes.data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Singular API error' });
  }
});

export default router;
