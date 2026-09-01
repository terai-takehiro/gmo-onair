// テロップCG — 複数部品テンプレート選択時の、レイヤーごとの公開フィールド編集セクション一覧。
// `PageFormDialog.tsx` から切り出した（ファイルサイズ規律・400行）。
// レイヤーごとに `TemplateFieldsSection` を「① ネーム」のような見出しつきで縦に並べる。
import { PART_DEFAULT_SLOT, PART_LABELS, type GraphicsTemplateLayer } from '@/lib/graphicsApi';
import { TemplateFieldsSection } from './TemplateFieldsSection';
import { LAYER_MARKS } from './TemplateLayerBlock';

export function TemplateLayerFieldsList({
  templateName, layers, layerFieldsList, setLayerFieldsList, pageId,
}: {
  templateName: string;
  layers: GraphicsTemplateLayer[];
  layerFieldsList: Record<string, unknown>[];
  setLayerFieldsList: (updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void;
  /** `kind: 'image'` の欄へそのまま横流しする。新規作成中は null */
  pageId: string | null;
}) {
  return (
    <div className="space-y-5">
      {layers.map((layer, i) => (
        <TemplateFieldsSection
          key={i}
          partKey={layer.partKey}
          slot={PART_DEFAULT_SLOT[layer.partKey]}
          templateName={templateName}
          publicFields={layer.publicFields}
          fields={layerFieldsList[i] ?? {}}
          setFields={(updater) => setLayerFieldsList((prev) => {
            const next = [...prev];
            next[i] = updater(next[i] ?? {});
            return next;
          })}
          pageId={pageId}
          heading={`${LAYER_MARKS[i] ?? `#${i + 1}`} ${PART_LABELS[layer.partKey]}`}
        />
      ))}
    </div>
  );
}
