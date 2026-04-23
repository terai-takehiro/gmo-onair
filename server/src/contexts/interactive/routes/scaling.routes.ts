import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();
router.use(requireAuth, requirePermission('interactive', 'manager'));

// スケーリングプラン定義
const SCALING_PLANS = [
  { id: 'test',    label: 'テスト',         maxConnections: 50,    memory: '512MB', vcpu: 1, flavorRef: '' },
  { id: 'small',   label: 'スモール',       maxConnections: 500,   memory: '1GB',   vcpu: 2, flavorRef: '' },
  { id: 'medium',  label: 'ミディアム',     maxConnections: 2000,  memory: '2GB',   vcpu: 3, flavorRef: '' },
  { id: 'large',   label: 'ラージ',         maxConnections: 5000,  memory: '4GB',   vcpu: 4, flavorRef: '' },
  { id: 'xlarge',  label: 'エクストララージ', maxConnections: 10000, memory: '8GB',   vcpu: 6, flavorRef: '' },
  { id: 'max',     label: 'マキシマム',     maxConnections: 20000, memory: '16GB',  vcpu: 8, flavorRef: '' },
];

// プラン一覧取得
router.get('/plans', (_req: Request, res: Response) => {
  const configured = !!(process.env.CONOHA_API_USERNAME && process.env.CONOHA_TENANT_ID);
  res.json({
    success: true,
    data: {
      configured,
      currentPlan: 'medium', // TODO: 実際のサーバースペックから判定
      plans: SCALING_PLANS.map(p => ({ id: p.id, label: p.label, maxConnections: p.maxConnections, memory: p.memory, vcpu: p.vcpu })),
    },
  });
});

// スケーリング実行
router.post('/resize', async (req: Request, res: Response) => {
  const { planId } = req.body;
  const plan = SCALING_PLANS.find(p => p.id === planId);
  if (!plan) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PLAN', message: '無効なプランです' } });
    return;
  }

  const { CONOHA_API_USERNAME, CONOHA_API_PASSWORD, CONOHA_TENANT_ID, CONOHA_SERVER_ID, CONOHA_IDENTITY_ENDPOINT, CONOHA_COMPUTE_ENDPOINT } = process.env;

  if (!CONOHA_API_USERNAME || !CONOHA_TENANT_ID || !CONOHA_SERVER_ID) {
    res.status(503).json({
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'CoNoHa API が設定されていません。環境変数を確認してください。' },
    });
    return;
  }

  try {
    // Step 1: Identity認証 → トークン取得
    const identityUrl = CONOHA_IDENTITY_ENDPOINT || 'https://identity.tyo2.conoha.io/v2.0';
    const authRes = await fetch(`${identityUrl}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: {
          passwordCredentials: { username: CONOHA_API_USERNAME, password: CONOHA_API_PASSWORD },
          tenantId: CONOHA_TENANT_ID,
        },
      }),
    });

    if (!authRes.ok) {
      res.status(502).json({ success: false, error: { code: 'AUTH_FAILED', message: 'CoNoHa認証に失敗しました' } });
      return;
    }

    const authData = await authRes.json();
    const token = authData.access?.token?.id;
    if (!token) {
      res.status(502).json({ success: false, error: { code: 'NO_TOKEN', message: 'トークンを取得できませんでした' } });
      return;
    }

    // Step 2: Compute API → サーバーリサイズ
    const computeUrl = CONOHA_COMPUTE_ENDPOINT || `https://compute.tyo2.conoha.io/v2/${CONOHA_TENANT_ID}`;
    const resizeRes = await fetch(`${computeUrl}/servers/${CONOHA_SERVER_ID}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify({ resize: { flavorRef: plan.flavorRef } }),
    });

    if (resizeRes.ok || resizeRes.status === 202) {
      res.json({ success: true, message: `${plan.label} (${plan.memory}) へのリサイズを開始しました` });
    } else {
      const errText = await resizeRes.text();
      console.error('[scaling] resize failed:', resizeRes.status, errText);
      res.status(502).json({ success: false, error: { code: 'RESIZE_FAILED', message: `リサイズに失敗しました: ${resizeRes.status}` } });
    }
  } catch (err: any) {
    console.error('[scaling] error:', err?.message);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err?.message || 'スケーリングエラー' } });
  }
});

export default router;
