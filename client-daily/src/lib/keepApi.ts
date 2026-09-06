/**
 * 隔週キープの数字（定例報告パック）の react-query フック集
 *
 * サーバーは `server/src/contexts/dailyops/routes/keep.routes.ts`。
 * パックの形は `shared/src/keepReport/types.ts` の `KeepReportPack`（円のまま持ち、
 * 千円への丸めは画面側 `pages/weekly/keep/format.ts` の `toThousandYen`）。
 *
 * ── 鍵の決めごと ────────────────────────────────────────────
 * パックは **会議日 × 主体 × お客様区分 × いまの数字か** で1本。凍結した版があれば
 * サーバーがそれを返し、`live=1` を付けたときだけ「いまの数字」を計算し直す。
 * 「資料」の印（`keep_pick`）と手入力（満足度）を保存したら `KEEP_PACK_KEY` ごと
 * 捨てる — 主体・区分の組み合わせぶんの鍵を1つずつ追いかけない。
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type {
  CustomerSegment, EntityScope, KeepInput, KeepInputKey, KeepReportPack,
} from '@gmo-onair/shared/src/keepReport/types';

export type SegmentScope = CustomerSegment | 'all';

export interface KeepPackResponse {
  pack: KeepReportPack;
  /** 凍結した版を返したか（`false` なら「いまの数字」） */
  frozen: boolean;
  pack_id: string | null;
}

export interface KeepMeetings {
  next_meeting_date: string | null;
  previous_meeting_date: string | null;
}

export interface KeepPackSummary {
  id: string;
  meeting_date: string;
  frozen_at: string | null;
}

export const KEEP_PACK_KEY = 'keep-pack';

export function useKeepPack(meeting: string | null, entity: EntityScope, segment: SegmentScope, live: boolean) {
  return useQuery({
    queryKey: [KEEP_PACK_KEY, meeting, entity, segment, live],
    queryFn: () =>
      api.get('/dailyops/keep/pack', {
        params: { meeting, entity, segment, ...(live ? { live: 1 } : {}) },
      }).then((r) => r.data.data as KeepPackResponse),
    enabled: !!meeting,
    // 絞り込みを切り替えても前の表を消さない（白紙 → 骨組み → 表 の点滅を避ける）
    placeholderData: keepPreviousData,
    // 1本の計算が重い（売上・予算・カレンダー・内覧会を横断する）ので、少しの間は使い回す
    staleTime: 30_000,
  });
}

export function useKeepMeetings() {
  return useQuery({
    queryKey: ['keep-meetings'],
    queryFn: () => api.get('/dailyops/keep/meetings').then((r) => r.data.data as KeepMeetings),
    staleTime: 60_000,
  });
}

/** 凍結したパックの一覧（会議日の選択肢に使う） */
export function useKeepPacks() {
  return useQuery({
    queryKey: ['keep-packs'],
    queryFn: () => api.get('/dailyops/keep/packs').then((r) => r.data.data as KeepPackSummary[]),
    staleTime: 60_000,
  });
}

/** ONAiR に無い数字の手入力（会議日ごと）。表示はパックの中の値を使うので、ここは編集の初期値用 */
export function useKeepInputs(meeting: string | null) {
  return useQuery({
    queryKey: ['keep-inputs', meeting],
    queryFn: () => api.get(`/dailyops/keep/inputs/${meeting}`).then((r) => r.data.data as KeepInput[]),
    enabled: !!meeting,
  });
}

function useInvalidateKeep() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [KEEP_PACK_KEY] });
    qc.invalidateQueries({ queryKey: ['keep-inputs'] });
    qc.invalidateQueries({ queryKey: ['keep-packs'] });
  };
}

export function useSaveKeepInput(meeting: string | null) {
  const invalidate = useInvalidateKeep();
  return useMutation({
    mutationFn: (input: { key: KeepInputKey; value: Record<string, unknown> }) =>
      api.put(`/dailyops/keep/inputs/${meeting}`, input).then((r) => r.data.data as KeepInput),
    onSuccess: invalidate,
    meta: { action: '手入力の数字の保存' },
  });
}

/**
 * ヨミ表の「資料」の印。**案件管理の API**（`PUT /projects/:id/keep-pick`）に書く —
 * 印は案件の持ち物で、案件詳細のふりかえりタブと同じ値を読み書きするため。
 */
export function useSetKeepPick() {
  const invalidate = useInvalidateKeep();
  return useMutation({
    mutationFn: ({ projectId, keep_pick }: { projectId: string; keep_pick: boolean }) =>
      api.put(`/projects/${projectId}/keep-pick`, { keep_pick }).then((r) => r.data.data),
    onSuccess: invalidate,
    meta: { action: '「資料」の印の保存' },
  });
}
