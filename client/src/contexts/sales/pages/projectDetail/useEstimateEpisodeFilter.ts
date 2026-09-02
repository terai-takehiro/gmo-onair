/**
 * 見積タブ / 回（episode）での絞り込み（仕様変更 #18・`EstimateTab.tsx` から分離・400行の是正）
 *
 * レギュラー案件だけ、見積を回ごとに絞り込める。判定はタスクタブと同じ
 * `recurrence`（`docs/design/v4/regular-series.md` §1）。初期値は URL の
 * `?episode=`（`EpisodesPanel.tsx`「この回の見積」リンクが付ける）——
 * 押した瞬間にその回で絞り込まれた状態で開けるようにする。以後の切り替えも
 * URL に書き戻すので、ブラウザの戻る・共有リンクでも絞り込みが再現できる。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import type { Episode } from '@gmo-onair/shared/src/types';

export function useEstimateEpisodeFilter(projectId: string, isSeries: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [episodeId, setEpisodeId] = useState<string | null>(() => searchParams.get('episode'));

  const changeEpisodeFilter = (id: string | null) => {
    setEpisodeId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('episode', id); else next.delete('episode');
      return next;
    }, { replace: true });
  };

  // **一覧（`EpisodeScopeToggle`・`EpisodesPanel`）と同じ鍵。** 他タブがすでに
  // 引き済みならキャッシュがそのまま使える
  const episodes = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
    enabled: isSeries,
  });

  /** 版の一覧に出す「#3」のような回のラベル。回を持たない見積（案件全体）は何も返さない */
  const episodeLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of episodes.data ?? []) map[e.id] = `#${e.episode_number}`;
    return map;
  }, [episodes.data]);

  return { episodeId, changeEpisodeFilter, episodeLabels };
}
