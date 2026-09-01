// テロップCG — `PageFormDialog.tsx` の保存ロジック（作成/更新 × 自由入力/単一部品/
// 複数部品テンプレートの分岐）だけを切り出した（ファイルサイズ規律・400行）。UIは持たない。
//
// テンプレート付きページの更新は publicFields のキーだけを送る（サーバー側は既存の
// fields にマージ・publicFields 外のキーは 400 で拒否する — `pickPublicFields` 参照）。
// 作成時は逆に、publicFields 外のキーを送ってもサーバー側で無視されるだけなので
// pick せずそのまま渡す（`graphicsApi.ts` の `GraphicsPageInput` のコメント参照）。
import {
  createGraphicsPage, updateGraphicsPage,
  type GraphicsPageRow, type GraphicsPartKey, type GraphicsProofState, type GraphicsSlot,
  type GraphicsTemplateRow,
} from '@/lib/graphicsApi';
import { pickPublicFields } from './TemplateFieldsSection';

export interface SavePageFormArgs {
  projectId: string;
  /** 編集対象。null なら新規作成 */
  page: GraphicsPageRow | null;
  name: string;
  partKey: GraphicsPartKey;
  slot: GraphicsSlot;
  /** 自由入力・単一部品テンプレートで使う値（複数部品テンプレートでは無視） */
  fields: Record<string, unknown>;
  proofState: GraphicsProofState;
  useTemplateMode: boolean;
  selectedTemplate: GraphicsTemplateRow | null;
  /** 複数部品テンプレートのレイヤーごとの値（インデックスが `selectedTemplate.layers` と対応） */
  layerFieldsList: Record<string, unknown>[];
}

export async function saveGraphicsPageForm(args: SavePageFormArgs): Promise<GraphicsPageRow> {
  const {
    projectId, page, name, partKey, slot, fields, proofState,
    useTemplateMode, selectedTemplate, layerFieldsList,
  } = args;
  const templateLayers = selectedTemplate?.layers;
  const isMultiLayer = !!templateLayers && templateLayers.length > 0;

  if (page) {
    if (page.templateId && selectedTemplate) {
      return isMultiLayer
        ? updateGraphicsPage(page.id, {
            name,
            proofState,
            layerFields: templateLayers!.map((l, i) => pickPublicFields(l, layerFieldsList[i] ?? {})),
          })
        : updateGraphicsPage(page.id, { name, proofState, fields: pickPublicFields(selectedTemplate, fields) });
    }
    return updateGraphicsPage(page.id, { name, slot, partKey, fields: { ...fields }, proofState });
  }

  if (useTemplateMode && selectedTemplate) {
    return isMultiLayer
      ? createGraphicsPage(projectId, {
          name,
          slot: selectedTemplate.slot,
          partKey: selectedTemplate.partKey,
          fields: {},
          proofState,
          templateId: selectedTemplate.id,
          layerFields: templateLayers!.map((_, i) => ({ ...(layerFieldsList[i] ?? {}) })),
        })
      : createGraphicsPage(projectId, {
          name,
          slot: selectedTemplate.slot,
          partKey: selectedTemplate.partKey,
          fields: { ...fields },
          proofState,
          templateId: selectedTemplate.id,
        });
  }

  return createGraphicsPage(projectId, { name, slot, partKey, fields: { ...fields }, proofState });
}
