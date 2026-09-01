// テロップCG — ランキング発表パーツ（part_key: 'ranking'）の演出SE（ステップ切替時の
// 効果音）管理API。`graphicsTemplateApi.ts` から切り出した形と同じ判断（400行規律・
// graphicsApi.ts との分割）。段6-5（旧 client-awards の演出SE基盤の移植）。
//
// サーバー側の契約:
//   POST   /graphics/projects/:id/sounds … アップロード（同じ step/rankStart は UPSERT で上書き・認証必須）
//   GET    /graphics/projects/:id/sounds … プロジェクト単位の一覧（**認証なし**）
//   PUT    /graphics/sounds/:id          … volume / enabled の更新（認証必須。ファイル差し替えは新規アップロードで）
//   DELETE /graphics/sounds/:id          … 削除（認証必須。ローカルファイルも削除）
//
// **GET 一覧は意図的に認証なし。** 管理UI（`RankingSoundsPanel.tsx`）だけでなく、
// 認証を持たない出力URL（`?audio=1`）の `useRankingAudio.ts` もこの一覧を読むため
// （旧 client-awards の `GET /events/:id/sounds` と同じ設計）。
//
// 静的配信 `/graphics/sounds/<file>`（認証なし）は `useRankingAudio.ts` が
// `<audio>` の `src` に直接そのまま渡す。
import api from '@/lib/api';
import type { RankingStep } from '@/pages/graphics/rankingFields';

export interface RankingSoundRow {
  id: number;
  projectId: number;
  step: string;
  /** ranks52 の開始順位バリアント（5/4/3/2）。それ以外の step は null（汎用SE） */
  rankStart: number | null;
  file: string;
  /** 静的配信URL（認証なし・`<audio>` の src にそのまま渡せる） */
  url: string;
  volume: number;
  enabled: boolean;
}

export async function fetchRankingSounds(projectId: string | number): Promise<RankingSoundRow[]> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(String(projectId))}/sounds`);
  return data.data;
}

export async function uploadRankingSound(
  projectId: string | number,
  input: { step: RankingStep; rankStart?: number | null; volume?: number; enabled?: boolean; file: File },
): Promise<RankingSoundRow> {
  const fd = new FormData();
  fd.append('step', input.step);
  if (input.rankStart != null) fd.append('rankStart', String(input.rankStart));
  if (input.volume != null) fd.append('volume', String(input.volume));
  if (input.enabled != null) fd.append('enabled', String(input.enabled));
  fd.append('sound', input.file);
  const { data } = await api.post(
    `/graphics/projects/${encodeURIComponent(String(projectId))}/sounds`,
    fd,
  );
  return data.data;
}

export async function updateRankingSound(
  soundId: string | number,
  input: { volume?: number; enabled?: boolean },
): Promise<RankingSoundRow> {
  const { data } = await api.put(`/graphics/sounds/${encodeURIComponent(String(soundId))}`, input);
  return data.data;
}

export async function deleteRankingSound(soundId: string | number): Promise<void> {
  await api.delete(`/graphics/sounds/${encodeURIComponent(String(soundId))}`);
}
