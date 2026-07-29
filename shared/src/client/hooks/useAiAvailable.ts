/**
 * AI に頼める状態かどうか (v3.0.9)
 *
 * ── なぜ共通フックにしたか ─────────────────────────────────
 *
 * v3.0.8 の時点で、AI を呼ぶボタンは 7 種あったのに、**押す前に未設定を
 * 判定していたのは1つだけ**だった。残り6つは押してから 503 が返り、
 * 「押したのに何も起きない」ように見えていた
 * (見積の下書き / 問い合わせの返信 / 同じ画面の作り直し /
 *  運営マニュアルの配置図 / リアルタイムCG の取り込み整形)。
 *
 * 会社方針は「AI を使い捨てにしない」だが、その手前に
 * **できないことをできるように見せない**という当たり前がある。
 * 判定を画面ごとに書くと必ずまた漏れるので、フック1つにする。
 *
 * 使い方:
 *   const ai = useAiAvailable(api);
 *   if (ai.available) → ボタンを出す
 *   if (!ai.available && !ai.loading) → 「AI は今つないでいません」と書いて手入力に寄せる
 */
import { useQuery } from '@tanstack/react-query';

interface ApiLike {
  get: (url: string) => Promise<{ data: { data?: { available?: boolean } } }>;
}

export interface AiAvailability {
  /** AI に頼める。false のときはボタンを出さない */
  available: boolean;
  /** 判定中。**この間はボタンを出さない** (出してから消えるとちらつく) */
  loading: boolean;
}

export function useAiAvailable(api: ApiLike): AiAvailability {
  const { data, isLoading } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => (await api.get('/ai/status')).data.data ?? { available: false },
    // 環境変数は動かないので長めに持つ。取れなければ「使えない」に倒す
    staleTime: 10 * 60_000,
    retry: false,
  });
  return { available: !!data?.available, loading: isLoading };
}
