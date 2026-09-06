// テロップCG — 右パネル・新規作成「1／2 ・ 種類を選ぶ」（`TelopEditorPanel.tsx` から分離。
// 400行基準・段階〈1段目/2段目〉で分割）。
//
// 種類（部品）から作るか、既存テンプレートから作るかを選ぶだけの画面。選んだ結果は
// 呼び出し側（`TelopEditorPanel`）の state にそのまま反映される — この部品自身は
// 状態を持たない（受け取った props をそのまま表示するだけ）。
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PART_LABELS, SLOT_LABELS, type GraphicsPartKey, type GraphicsTemplateRow,
} from '@/lib/graphicsApi';
import TelopKindGrid from './TelopKindGrid';

export default function TelopKindOrTemplateStep({
  useTemplateMode, onUseTemplateModeChange, templates, templatesLoading,
  onPickPart, onPickTemplate, onClose,
}: {
  useTemplateMode: boolean;
  onUseTemplateModeChange: (useTemplateMode: boolean) => void;
  templates: GraphicsTemplateRow[];
  templatesLoading: boolean;
  onPickPart: (key: GraphicsPartKey) => void;
  onPickTemplate: (template: GraphicsTemplateRow) => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-full flex-col overflow-hidden rounded-card border border-primary-border bg-card shadow-md lg:w-[420px]">
      <div className="flex items-center gap-2 border-b border-border-faint px-4 py-3">
        <h2 className="min-w-0 flex-1 text-cardtitle">新しいテロップ</h2>
        <span className="shrink-0 text-note text-muted-foreground">1／2 ・ 種類を選ぶ</span>
        <Button type="button" variant="ghost" size="icon" aria-label="やめる" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex gap-1.5 px-4 pt-3">
        <button
          type="button"
          className={`min-h-tap flex-1 rounded-control px-3 text-sub font-bold transition-colors ${!useTemplateMode ? 'bg-primary-surface text-primary' : 'text-muted-foreground'}`}
          onClick={() => onUseTemplateModeChange(false)}
        >
          種類から作る
        </button>
        <button
          type="button"
          className={`min-h-tap flex-1 rounded-control px-3 text-sub font-bold transition-colors ${useTemplateMode ? 'bg-primary-surface text-primary' : 'text-muted-foreground'}`}
          onClick={() => onUseTemplateModeChange(true)}
          disabled={templates.length === 0 && !templatesLoading}
        >
          テンプレートから作る
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!useTemplateMode ? (
          <TelopKindGrid value={null} onPick={onPickPart} />
        ) : templatesLoading ? (
          <p className="flex items-center gap-1.5 text-sub text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />読み込み中…
          </p>
        ) : templates.length === 0 ? (
          <p className="text-sub text-muted-foreground">このプロジェクトにテンプレートはまだありません。</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onPickTemplate(t)}
                className="min-h-tap rounded-control-md border border-border bg-card px-3 py-2 text-left text-sub font-bold hover:bg-surface-subtle"
              >
                {t.name}（{PART_LABELS[t.partKey]}・{SLOT_LABELS[t.slot]}）
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
