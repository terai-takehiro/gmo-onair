/**
 * interactive/services/scaling.service.ts — Phase 3 v2.6.9
 * CoNoHa VPS リサイズの外部 API ロジック層 (DB ではなく HTTP integration)。
 */
import { AppError } from '../../../shared/middleware/errorHandler';

export interface ScalingPlan {
  id: string;
  label: string;
  maxConnections: number;
  memory: string;
  vcpu: number;
  flavorRef: string;
}

// 5 段階プリセット (最小=デフォルト 〜 最大=10万人クラス)。
// flavorRef は CoNoHa の各プラン UUID を環境変数から流し込む運用 (空なら resize 時に設定不備として弾く)。
export const SCALING_PLANS: ScalingPlan[] = [
  { id: 'minimum', label: '最小',   maxConnections: 100,    memory: '1GB',  vcpu: 2,  flavorRef: '' },
  { id: 'small',   label: '小規模', maxConnections: 1000,   memory: '2GB',  vcpu: 3,  flavorRef: '' },
  { id: 'medium',  label: '中規模', maxConnections: 10000,  memory: '8GB',  vcpu: 6,  flavorRef: '' },
  { id: 'large',   label: '大規模', maxConnections: 50000,  memory: '32GB', vcpu: 12, flavorRef: '' },
  { id: 'xlarge',  label: '最大',   maxConnections: 100000, memory: '64GB', vcpu: 24, flavorRef: '' },
];

function isConfigured(): boolean {
  return !!(process.env.CONOHA_API_USERNAME && process.env.CONOHA_TENANT_ID);
}

export const scalingService = {
  listPlans() {
    return {
      configured: isConfigured(),
      currentPlan: 'minimum', // TODO: 実際のサーバースペックから判定
      plans: SCALING_PLANS.map((p) => ({
        id: p.id,
        label: p.label,
        maxConnections: p.maxConnections,
        memory: p.memory,
        vcpu: p.vcpu,
      })),
    };
  },

  /**
   * CoNoHa API を呼んで VPS をリサイズ。
   * 認証 → サーバーアクションの 2 段。
   * @throws AppError 設定不備 / 認証失敗 / API エラー
   */
  async resize(planId: string): Promise<{ message: string }> {
    const plan = SCALING_PLANS.find((p) => p.id === planId);
    if (!plan) throw new AppError(400, 'INVALID_PLAN', '無効なプランです');

    const {
      CONOHA_API_USERNAME, CONOHA_API_PASSWORD, CONOHA_TENANT_ID,
      CONOHA_SERVER_ID, CONOHA_IDENTITY_ENDPOINT, CONOHA_COMPUTE_ENDPOINT,
    } = process.env;

    if (!CONOHA_API_USERNAME || !CONOHA_TENANT_ID || !CONOHA_SERVER_ID) {
      throw new AppError(
        503, 'NOT_CONFIGURED',
        'CoNoHa API が設定されていません。環境変数を確認してください。',
      );
    }

    // Step 1: Identity 認証 → トークン取得
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
      throw new AppError(502, 'AUTH_FAILED', 'CoNoHa認証に失敗しました');
    }
    const authData = (await authRes.json()) as { access?: { token?: { id?: string } } };
    const token = authData.access?.token?.id;
    if (!token) {
      throw new AppError(502, 'NO_TOKEN', 'トークンを取得できませんでした');
    }

    // Step 2: Compute API → サーバーリサイズ
    const computeUrl = CONOHA_COMPUTE_ENDPOINT || `https://compute.tyo2.conoha.io/v2/${CONOHA_TENANT_ID}`;
    const resizeRes = await fetch(`${computeUrl}/servers/${CONOHA_SERVER_ID}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify({ resize: { flavorRef: plan.flavorRef } }),
    });
    if (resizeRes.ok || resizeRes.status === 202) {
      return { message: `${plan.label} (${plan.memory}) へのリサイズを開始しました` };
    }
    const errText = await resizeRes.text();
    console.error('[scaling] resize failed:', resizeRes.status, errText);
    throw new AppError(502, 'RESIZE_FAILED', `リサイズに失敗しました: ${resizeRes.status}`);
  },
};
