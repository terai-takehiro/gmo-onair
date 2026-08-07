/**
 * 料金表の「場所」(v4 大③・migration 172)
 *
 * モックの ⑧ 料金表は上辺に場所のタブがあり、用賀・渋谷・青山で**別々の表**を
 * 持ちます（渋谷・青山は「料金は未定」で空）。
 *
 * ── なぜ場所を分けるのが安全側なのか ────────────────────────
 *
 * 1つの表を全部の案件で使っていると、**渋谷の案件に用賀の値段がそのまま出ます**。
 * しかも出た金額はそれらしいので、気づかずに見積を送ってしまいます。
 * 空の場所は空と見せるほうがよい（「まだ入れていない」は直せる）。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface PricingLocation {
  id: string;
  name: string;
  sort_order: number;
  category_count: number;
  item_count: number;
}

/** その案件がどの場所の料金表を見るべきか。**理由も返る**（画面がそのまま出す） */
export interface LocationHint {
  location_id: string | null;
  reason: 'booking' | 'only_priced' | 'ambiguous' | 'none';
  candidates: string[];
}

export const LOCATION_KEY = ['pricing-locations'];

export function usePricingLocations() {
  return useQuery({
    queryKey: LOCATION_KEY,
    queryFn: async () => (await api.get('/pricing/locations')).data.data as PricingLocation[],
    staleTime: 5 * 60_000,
  });
}

export function useLocationHint(projectId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['pricing-location-hint', projectId ?? 'none'],
    queryFn: async () => (await api.get('/pricing/locations/resolve', {
      params: projectId ? { project_id: projectId } : {},
    })).data.data as LocationHint,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * なぜこの場所の表を見ているのか。**画面にそのまま出します。**
 *
 * どの表を見ているか分からないまま金額を積むのが、この機能でいちばん危ない形です。
 */
export function hintText(hint: LocationHint | undefined, locationName: string | undefined): string {
  if (!hint) return '';
  switch (hint.reason) {
    case 'booking':
      return `この案件のスタジオ予約が ${locationName ?? 'この場所'} なので、その料金表を出しています`;
    case 'ambiguous':
      return 'この案件は複数の拠点に予約があります。**どの場所の料金表を使うかを選んでください**';
    case 'only_priced':
      return `料金が入っているのは ${locationName ?? 'この場所'} だけです。別の場所の案件なら選び直してください`;
    default:
      return 'まだどの場所にも料金が入っていません';
  }
}
