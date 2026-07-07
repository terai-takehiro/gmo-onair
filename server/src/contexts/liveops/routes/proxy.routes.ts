import { Router } from 'express';
import axios from 'axios';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { decrypt } from '../crypto';
import { resolveKey } from '../resolve-key';
import { getZoomToken } from '../zoom-token';
import { getTeamsToken } from '../teams-token';
import { getCount } from '../teams-subscription';

const router = Router();
const canRead  = [requireAuth, requirePermission('liveops', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('liveops', 'manager')] as const;

/** YouTube Data API v3 proxy */
router.get('/youtube', ...canRead, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const apiKey = await resolveKey(userId, 'youtube_api_key_enc');
    if (!apiKey) return res.status(400).json({ success: false, message: 'YouTube APIキーが設定されていません。設定ページでAPIキーを登録してください。' });

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

/** Jstream Equipmedia proxy */
router.get('/jstream', ...canRead, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const token = await resolveKey(userId, 'jstream_token_enc');
    if (!token) return res.status(400).json({ success: false, message: 'Jstreamトークンが設定されていません。設定ページでトークンを登録してください。' });

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
  } catch {
    res.status(500).json({ success: false, message: 'Jstream API error' });
  }
});

/** Zoom Meeting / Webinar participant count */
router.get('/zoom', ...canRead, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const [clientId, clientSecret, accountId] = await Promise.all([
      resolveKey(userId, 'zoom_client_id_enc'),
      resolveKey(userId, 'zoom_client_secret_enc'),
      resolveKey(userId, 'zoom_account_id_enc'),
    ]);
    if (!clientId || !clientSecret || !accountId) {
      return res.status(400).json({ success: false, message: 'Zoom APIキーが設定されていません。設定ページで資格情報を登録してください。' });
    }

    const token = await getZoomToken(clientId, clientSecret, accountId);
    const { type, meetingId, webinarId } = req.query as { type?: string; meetingId?: string; webinarId?: string };

    let endpoint: string;
    if (type === 'webinar') {
      if (!webinarId) return res.status(400).json({ success: false, message: 'webinarId required' });
      endpoint = `https://api.zoom.us/v2/metrics/webinars/${encodeURIComponent(webinarId)}/participants?type=live`;
    } else {
      if (!meetingId) return res.status(400).json({ success: false, message: 'meetingId required' });
      endpoint = `https://api.zoom.us/v2/metrics/meetings/${encodeURIComponent(meetingId)}/participants?type=live`;
    }

    const zoomRes = await axios.get(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const count: number = zoomRes.data?.total_count ?? 0;
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    const status = err?.response?.status || 500;
    const msg = err?.response?.data?.message || 'Zoom API error';
    res.status(status).json({ success: false, message: msg });
  }
});

/** Teams participant count (in-memory from webhook) */
router.get('/teams', ...canRead, async (req, res) => {
  const { programId } = req.query as { programId?: string };
  if (!programId) return res.status(400).json({ success: false, message: 'programId required' });
  res.json({ success: true, data: { count: getCount(programId) } });
});

/** Singular Live — get model */
router.get('/singular/model/:programId', ...canRead, async (req, res) => {
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
    await queryOne(
      'UPDATE liveops_programs SET singular_model_cache = $2, updated_at = NOW() WHERE id = $1',
      [req.params.programId, JSON.stringify(singRes.data)]
    );
    res.json({ success: true, data: singRes.data });
  } catch {
    res.status(500).json({ success: false, message: 'Singular API error' });
  }
});

/** Singular Live — send values */
router.post('/singular/control/:programId', ...canWrite, async (req, res) => {
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
  } catch {
    res.status(500).json({ success: false, message: 'Singular API error' });
  }
});

export default router;
