// テロップCG — 「前の番組からコピー」の軽量プロジェクト一覧＋テンプレート複製（段E）。
// `graphicsApi.ts` から切り出した（ファイルサイズ規律・400行 — `graphicsRosterApi.ts` /
// `graphicsTemplateApi.ts` と同じ判断）。docs/design/v4/graphics-redesign.md §6「テンプレート」
// （前の番組からコピー）・④設定「見た目」タブ。
//
// サーバー側の契約:
//   GET  /graphics/projects?excludeId=<id>              … 軽量一覧（ピッカー専用。名前・更新日時のみ）
//   POST /graphics/projects/:id/templates/copy-from     … 別プロジェクトのテンプレート一式を複製
import api from '@/lib/api';
import type { GraphicsTemplateRow } from './graphicsTemplateApi';

/** ④「前の番組からコピー」のピッカー専用の軽量一覧行。テーマ・スロット退出ルール等は含まない */
export interface GraphicsProjectSummary {
  id: string;
  name: string;
  ownerType: string;
  ownerId: string;
  updatedAt: unknown;
}

/** 他の CG プロジェクトの一覧（`excludeProjectId` 自身は含まれない・更新日時の新しい順・最大30件） */
export async function fetchGraphicsProjectsList(excludeProjectId: string): Promise<GraphicsProjectSummary[]> {
  const { data } = await api.get('/graphics/projects', { params: { excludeId: excludeProjectId } });
  return data.data;
}

/**
 * 別の CG プロジェクト（`sourceProjectId`）のテンプレート一式を、このプロジェクトへ新しい行
 * として複製する。コピー元は変更しない・このプロジェクトの既存テンプレートも残ったまま
 * 追加されるだけ（上書きではない）。コピー元にテンプレートが無ければ空配列が返る（エラーではない）。
 */
export async function copyGraphicsTemplatesFrom(
  projectId: string,
  sourceProjectId: string,
): Promise<GraphicsTemplateRow[]> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/templates/copy-from`, {
    sourceProjectId: Number(sourceProjectId),
  });
  return data.data.created;
}
