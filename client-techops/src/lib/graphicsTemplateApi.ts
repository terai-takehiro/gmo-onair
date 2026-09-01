// テロップCG — テンプレート（部品→**テンプレート**→ページ→送出リストの第2層・段6-2）。
// `graphicsApi.ts` から切り出した（ファイルサイズ規律・400行 — `graphicsRosterApi.ts` と同じ判断）。
// docs/design/v4/graphics.md §2「部品を選んで置き、テーマを当て、公開フィールドを絞る」。
//
// サーバー側の契約:
//   POST   /graphics/projects/:id/templates … 作成
//   GET    /graphics/projects/:id/templates … プロジェクト単位の一覧
//   PUT    /graphics/templates/:id          … 部分更新（name/description/baseFields/publicFields/layers）
//   DELETE /graphics/templates/:id          … 削除（既存ページの template_id は SET NULL で外れる —
//                                              ページは残り、ただの通常ページとして触れる）
//
// 段6-2 本格拡張（複数部品テンプレート）: 既存9部品のうち最大 `MAX_GRAPHICS_TEMPLATE_LAYERS`
// 個を選んで1ページに重ねて置ける。各部品は自分の既定の描画位置のまま描かれる
// （位置調整UIは対象外）。単一部品モードの `partKey`/`slot`/`baseFields`/`publicFields` は、
// 複数部品モードでは一覧表示用に `layers[0]` と同じ値を渡す／読む規約（サーバー側の規約）。
import api from '@/lib/api';
import type { GraphicsPartKey, GraphicsSlot } from './graphicsApi';

/** 組み合わせテンプレートの1レイヤー。上限は `MAX_GRAPHICS_TEMPLATE_LAYERS` */
export interface GraphicsTemplateLayer {
  partKey: GraphicsPartKey;
  /** 部品の入力欄の初期値（`pageFields.ts` の `PART_FIELDS[partKey]` と同じキー） */
  baseFields: Record<string, unknown>;
  /** `baseFields` のキーのうち、ページ作成時にオペレーターが編集できるもの */
  publicFields: string[];
}

/** 組み合わせテンプレートのレイヤー数の上限（サーバー側 `MAX_TEMPLATE_LAYERS` と同じ値） */
export const MAX_GRAPHICS_TEMPLATE_LAYERS = 4;

export interface GraphicsTemplateRow {
  id: string;
  projectId: string;
  /** 単一部品モードの部品（複数部品モードでは layers[0].partKey と同じ値・一覧表示用） */
  partKey: GraphicsPartKey;
  /** 単一部品モードのスロット（複数部品モードでは layers[0] の既定スロットと同じ値） */
  slot: GraphicsSlot;
  name: string;
  description: string | null;
  /** 単一部品モードの初期値（複数部品モードでは layers[0].baseFields と同じ値） */
  baseFields: Record<string, unknown>;
  /** 単一部品モードの公開フィールド（複数部品モードでは layers[0].publicFields と同じ値） */
  publicFields: string[];
  /**
   * 複数部品テンプレート（段6-2 本格拡張）。null/空＝従来どおり単一部品
   * （partKey/baseFields/publicFields が正）。非空＝この配列が正（最大4個）
   */
  layers?: GraphicsTemplateLayer[] | null;
}

export interface GraphicsTemplateInput {
  partKey: GraphicsPartKey;
  slot: GraphicsSlot;
  name: string;
  description?: string;
  baseFields: Record<string, unknown>;
  publicFields: string[];
  /**
   * 複数部品を組み合わせるとき（段6-2 本格拡張）に渡す。非空なら複数部品モード —
   * partKey/slot/baseFields/publicFields には layers[0] と同じ値を渡すこと（単一部品と
   * 同じ形で一覧表示を成立させる規約）
   */
  layers?: GraphicsTemplateLayer[];
}

export async function fetchGraphicsTemplates(projectId: string): Promise<GraphicsTemplateRow[]> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(projectId)}/templates`);
  return data.data;
}

export async function createGraphicsTemplate(
  projectId: string,
  input: GraphicsTemplateInput,
): Promise<GraphicsTemplateRow> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/templates`, input);
  return data.data;
}

export async function updateGraphicsTemplate(
  templateId: string,
  input: Partial<Pick<GraphicsTemplateInput, 'name' | 'description' | 'baseFields' | 'publicFields' | 'layers'>>,
): Promise<GraphicsTemplateRow> {
  const { data } = await api.put(`/graphics/templates/${encodeURIComponent(templateId)}`, input);
  return data.data;
}

export async function deleteGraphicsTemplate(templateId: string): Promise<void> {
  await api.delete(`/graphics/templates/${encodeURIComponent(templateId)}`);
}
