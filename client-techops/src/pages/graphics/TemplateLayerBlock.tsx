// テロップCG — 複数部品テンプレートの1レイヤーぶんの編集ブロック（段6-2 本格拡張）。
// `TemplateFormDialog.tsx` から切り出した（ファイルサイズ規律・400行）。
//
// このセッションで新しく追加したレイヤーは部品を選び直せる（`isNew`）。すでに保存済みの
// レイヤー（ダイアログを開いた時点で `template.layers` にあったもの）は、単一部品
// テンプレートの部品・スロットと同じ理由で部品を固定表示にする — 部品を変えると
// 既存ページが参照しているフィールドの形が変わってしまうため。
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PART_LABELS, type GraphicsPartKey } from '@/lib/graphicsApi';
import { PART_KEYS } from './pageFields';
import { TemplateFieldsEditor } from './TemplateFieldsEditor';

/** ①②③④ — レイヤーの見出し番号（上限4個ぶん） */
export const LAYER_MARKS = ['①', '②', '③', '④'];

export interface TemplateLayerDraft {
  /** React key・状態更新の突き合わせ専用のローカルID（サーバーへは送らない） */
  uid: string;
  /** このダイアログのセッション中に追加されたレイヤーかどうか（部品を選び直せるかの判定に使う） */
  isNew: boolean;
  partKey: GraphicsPartKey;
  baseFields: Record<string, unknown>;
  publicKeys: Set<string>;
}

export function TemplateLayerBlock({
  index, total, layer, onPartKeyChange, onFieldsChange, onPublicKeysChange, onRemove, onMoveUp, onMoveDown,
}: {
  index: number;
  total: number;
  layer: TemplateLayerDraft;
  onPartKeyChange: (key: GraphicsPartKey) => void;
  onFieldsChange: (next: Record<string, unknown>) => void;
  onPublicKeysChange: (next: Set<string>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-list font-bold text-muted-foreground">
          {LAYER_MARKS[index] ?? `#${index + 1}`}
        </span>
        <div className="min-w-[160px] flex-1">
          {layer.isNew ? (
            <Select value={layer.partKey} onValueChange={(v) => onPartKeyChange(v as GraphicsPartKey)}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PART_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{PART_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="flex min-h-[44px] items-center text-list font-bold">{PART_LABELS[layer.partKey]}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="このレイヤーを上へ"
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="このレイヤーを下へ"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="このレイヤーを削除" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {!layer.isNew && (
        <p className="mb-3 text-note text-muted-foreground">
          部品は追加後は変更できません。変えたい場合はこのレイヤーを削除して作り直してください。
        </p>
      )}
      <div>
        <Label className="mb-1 block text-th font-bold text-muted-foreground">初期値と公開フィールド</Label>
        <TemplateFieldsEditor
          partKey={layer.partKey}
          baseFields={layer.baseFields}
          publicKeys={layer.publicKeys}
          onFieldsChange={onFieldsChange}
          onPublicKeysChange={onPublicKeysChange}
        />
      </div>
    </div>
  );
}
