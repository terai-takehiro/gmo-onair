/**
 * ステージごとの受注確度（%） — 財務ダッシュボードの「確度加味」表示用
 *
 * マスターは設定「お金のルール」と同じ `GET /stage-probabilities`
 * （`server/src/contexts/sales/services/stage-probability.service.ts` が正）。
 * **新しい API は作らない** — 既に汎用のマスター取得口があるので、
 * ここではそれを `stage → probability` の `Map` に整形して返すだけ。
 *
 * サーバーは常に8ステージぶんを埋めて返す（未設定は既定値）ので、
 * `undefined` になるのは通信がまだ終わっていないときだけ。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface StageProbabilityRow {
  stage: string;
  probability: number;
}

export function useStageProbabilityMap() {
  const q = useQuery({
    queryKey: ['stage-probabilities'],
    queryFn: async () => (await api.get('/stage-probabilities')).data.data as StageProbabilityRow[],
    staleTime: 5 * 60_000,
  });
  const map = new Map<string, number>((q.data ?? []).map((r) => [r.stage, r.probability]));
  return { probabilityMap: map, isReady: !!q.data };
}

/** stage が分からない/持たない行は 100%（重みづけない）として扱う共通ルール */
export function probabilityOf(map: Map<string, number>, stage: string | null | undefined): number {
  if (!stage) return 100;
  return map.has(stage) ? map.get(stage)! : 100;
}
