/**
 * 組織共通の鍵（`liveops_org_settings`）の読み書きと接続テスト。実装設計 §6-2。
 *
 * ⚠️ `liveops:manager` だけ。`reader` には GET も出さない。
 * ⚠️ 応答に平文を1文字も含めない（mask() と has* だけ）。
 */
import { Router } from 'express';
import axios from 'axios';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { loadOrgKeys, loadOrgSettingsForDisplay, saveOrgSettings } from '../org-key';
import { getZoomToken } from '../zoom-token';

const router = Router();
const canManage = [requireAuth, requirePermission('qsheet', 'manager')] as const;

router.get('/', ...canManage, async (_req, res) => {
  try {
    const data = await loadOrgSettingsForDisplay();
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/', ...canManage, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const {
      youtubeApiKey, jstreamToken, pollingIntervalSec,
      zoomAccountId, zoomClientId, zoomClientSecret,
      teamsTenantId, teamsClientId, teamsClientSecret,
    } = req.body ?? {};
    await saveOrgSettings(
      { youtubeApiKey, jstreamToken, pollingIntervalSec, zoomAccountId, zoomClientId, zoomClientSecret, teamsTenantId, teamsClientId, teamsClientSecret },
      userId,
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

type TestStatus = 'ok' | 'error' | 'unconfigured';
interface TestResult { status: TestStatus; message: string; latencyMs: number; detail?: string }

router.post('/test/:platform', ...canManage, async (req, res) => {
  const platform = String(req.params.platform);
  const started = Date.now();
  const result = (status: TestStatus, message: string, detail?: string): TestResult =>
    ({ status, message, latencyMs: Date.now() - started, ...(detail ? { detail } : {}) });

  try {
    const keys = await loadOrgKeys();

    if (platform === 'youtube') {
      if (!keys.youtubeApiKey) return res.json({ success: true, data: result('unconfigured', '組織共通の YouTube APIキーが未設定です') });
      try {
        await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: { id: 'jNQXAC9IVRw', part: 'id', key: keys.youtubeApiKey },
          timeout: 10000,
        });
        return res.json({ success: true, data: result('ok', 'YouTube Data API に接続できました（キー有効）') });
      } catch (err: any) {
        return res.json({ success: true, data: result('error', 'YouTube API への接続に失敗しました', err?.response?.data?.error?.message || err.message) });
      }
    }

    if (platform === 'jstream') {
      if (!keys.jstreamToken) return res.json({ success: true, data: result('unconfigured', '組織共通の Jstream トークンが未設定です') });
      const lpid = String(req.body?.lpid || '').trim();
      if (!lpid) return res.json({ success: true, data: result('unconfigured', '疎通確認に使う LPID を入力してください') });
      try {
        await axios.get('https://api01-platform.stream.co.jp/apiservice/getLiveConnection/', {
          params: { token: keys.jstreamToken, lpid, type: 'text' }, timeout: 10000,
        });
        return res.json({ success: true, data: result('ok', `Jstream API に接続できました (LPID: ${lpid})`) });
      } catch (err: any) {
        return res.json({ success: true, data: result('error', 'Jstream API への接続に失敗しました', err.message) });
      }
    }

    if (platform === 'zoom') {
      if (!keys.zoom) return res.json({ success: true, data: result('unconfigured', '組織共通の Zoom 資格情報が未設定です') });
      try {
        await getZoomToken(keys.zoom.clientId, keys.zoom.clientSecret, keys.zoom.accountId);
        return res.json({ success: true, data: result('ok', 'Zoom OAuth 認証に成功しました（資格情報有効）') });
      } catch (err: any) {
        return res.json({ success: true, data: result('error', 'Zoom OAuth 認証に失敗しました', err?.response?.data?.reason || err.message) });
      }
    }

    if (platform === 'teams') {
      if (!keys.teams) return res.json({ success: true, data: result('unconfigured', '組織共通の Teams 資格情報が未設定です') });
      try {
        await axios.post(
          `https://login.microsoftonline.com/${keys.teams.tenantId}/oauth2/v2.0/token`,
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: keys.teams.clientId,
            client_secret: keys.teams.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
        );
        return res.json({ success: true, data: result('ok', 'Microsoft Graph 認証に成功しました（資格情報有効）') });
      } catch (err: any) {
        const desc = err?.response?.data?.error_description || err.message;
        return res.json({ success: true, data: result('error', 'Microsoft Graph 認証に失敗しました', String(desc).split('\n')[0].slice(0, 300)) });
      }
    }

    return res.status(400).json({ success: false, message: 'unknown platform' });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
