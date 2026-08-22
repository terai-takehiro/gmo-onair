import { Router } from 'express';
import axios from 'axios';
import { queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { encrypt, decrypt, mask } from '../crypto';
import { resolveKey } from '../resolve-key';

const router = Router();
const canRead  = [requireAuth, requirePermission('qsheet', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('qsheet', 'manager')] as const;

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

/* ── API 接続テスト ──
 * 設定済みの認証情報で各プラットフォームの API に実際にアクセスし、
 * 「キーが正しいか / API に到達できるか」をブラウザから検証できるようにする。
 * Zoom / Teams はトークンキャッシュを経由せず毎回 OAuth を直接叩く
 * (資格情報を変更した直後でもキャッシュに騙されず現在の値を検証するため)。
 */
type TestStatus = 'ok' | 'error' | 'unconfigured' | 'untested';
interface TestResult { status: TestStatus; message: string; latencyMs: number; detail?: string }

router.post('/test/:platform', ...canRead, async (req, res) => {
  const userId = (req as any).user!.id;
  const platform = String(req.params.platform);
  const started = Date.now();
  const result = (status: TestStatus, message: string, detail?: string): TestResult =>
    ({ status, message, latencyMs: Date.now() - started, ...(detail ? { detail } : {}) });

  try {
    if (platform === 'youtube') {
      const apiKey = await resolveKey(userId, 'youtube_api_key_enc');
      if (!apiKey) return res.json({ success: true, data: result('unconfigured', 'YouTube APIキーが設定されていません') });
      try {
        // 実在する公開動画 ID で軽量リクエスト (quota cost 1)。200 が返ればキー有効。
        await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: { id: 'jNQXAC9IVRw', part: 'id', key: apiKey },
          timeout: 10000,
        });
        return res.json({ success: true, data: result('ok', 'YouTube Data API に接続できました（キー有効）') });
      } catch (err: any) {
        const reason = err?.response?.data?.error?.message || err.message;
        return res.json({ success: true, data: result('error', 'YouTube API への接続に失敗しました', reason) });
      }
    }

    if (platform === 'jstream') {
      const token = await resolveKey(userId, 'jstream_token_enc');
      if (!token) return res.json({ success: true, data: result('unconfigured', 'Jstream トークンが設定されていません') });
      // LPID はリクエスト指定 > 直近の番組設定 から解決 (疎通確認には実在の LPID が必要)
      let lpid: string | null = (req.body?.lpid && String(req.body.lpid).trim()) || null;
      if (!lpid) {
        const prog = await queryOne(
          `SELECT jstream_lpid FROM liveops_programs
           WHERE jstream_lpid IS NOT NULL AND jstream_lpid <> '' AND deleted_at IS NULL
           ORDER BY updated_at DESC LIMIT 1`,
          []
        );
        lpid = (prog as any)?.jstream_lpid || null;
      }
      if (!lpid) {
        return res.json({ success: true, data: result('untested', 'トークンは設定済みですが、疎通確認に使える LPID がありません。番組設定で Jstream LPID を登録するか、LPID を入力してテストしてください') });
      }
      try {
        const jsRes = await axios.get(
          'https://api01-platform.stream.co.jp/apiservice/getLiveConnection/',
          { params: { token, lpid, type: 'text' }, timeout: 10000 }
        );
        const text: string = String(jsRes.data || '');
        const lines = text.trim().split('\n').filter(Boolean);
        const last = lines[lines.length - 1] || '';
        const count = parseInt(last.split(',').pop() || '', 10);
        if (isNaN(count)) {
          return res.json({ success: true, data: result('error', `Jstream API の応答を解析できませんでした (LPID: ${lpid})。トークン/LPID を確認してください`, text.slice(0, 200)) });
        }
        return res.json({ success: true, data: result('ok', `Jstream API に接続できました (LPID: ${lpid} / 現在 ${count.toLocaleString()} 接続)`) });
      } catch (err: any) {
        return res.json({ success: true, data: result('error', 'Jstream API への接続に失敗しました', err.message) });
      }
    }

    if (platform === 'zoom') {
      const [clientId, clientSecret, accountId] = await Promise.all([
        resolveKey(userId, 'zoom_client_id_enc'),
        resolveKey(userId, 'zoom_client_secret_enc'),
        resolveKey(userId, 'zoom_account_id_enc'),
      ]);
      if (!clientId || !clientSecret || !accountId) {
        return res.json({ success: true, data: result('unconfigured', 'Zoom の資格情報 (Account ID / Client ID / Client Secret) が揃っていません') });
      }
      try {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        await axios.post(
          'https://zoom.us/oauth/token',
          new URLSearchParams({ grant_type: 'account_credentials', account_id: accountId }),
          { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        return res.json({ success: true, data: result('ok', 'Zoom OAuth 認証に成功しました（資格情報有効）') });
      } catch (err: any) {
        const reason = err?.response?.data?.reason || err?.response?.data?.error || err.message;
        return res.json({ success: true, data: result('error', 'Zoom OAuth 認証に失敗しました', String(reason)) });
      }
    }

    if (platform === 'teams') {
      const [tenantId, clientId, clientSecret] = await Promise.all([
        resolveKey(userId, 'teams_tenant_id_enc'),
        resolveKey(userId, 'teams_client_id_enc'),
        resolveKey(userId, 'teams_client_secret_enc'),
      ]);
      if (!tenantId || !clientId || !clientSecret) {
        return res.json({ success: true, data: result('unconfigured', 'Teams の資格情報 (Tenant ID / Client ID / Client Secret) が揃っていません') });
      }
      try {
        await axios.post(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        return res.json({ success: true, data: result('ok', 'Microsoft Graph 認証に成功しました（資格情報有効）') });
      } catch (err: any) {
        const desc: string = err?.response?.data?.error_description || err.message;
        return res.json({ success: true, data: result('error', 'Microsoft Graph 認証に失敗しました', String(desc).split('\n')[0].slice(0, 300)) });
      }
    }

    return res.status(400).json({ success: false, message: 'unknown platform' });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
