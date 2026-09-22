// テロップCG — 右パネル・2段目「文言を入れる」の本体（`TelopEditorPanel.tsx` から分離。
// 400行基準）。プレビュー・ページ名・出る場所・部品ごとの入力欄（またはテンプレートの
// 公開フィールド）・確認済みスイッチまでのひとかたまり。ヘッダー（複製・削除・閉じる・
// 戻る）と保存ボタンは呼び出し側（`<form>` タグごと）に残した。
import type { Dispatch, SetStateAction } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import {
  GRAPHICS_SLOTS, SLOT_LABELS,
  type GraphicsPageRow, type GraphicsPartKey, type GraphicsSlot, type GraphicsThemeKey,
  type GraphicsTemplateRow,
} from '@/lib/graphicsApi';
import { PART_FIELDS } from './pageFields';
import PageLivePreview from './PageLivePreview';
import { PageFieldEditor } from './PageFieldEditor';
import { TemplateFieldsSection } from './TemplateFieldsSection';
import { TemplateLayerFieldsList } from './TemplateLayerFieldsList';
import { VoteInteractiveSection } from './VoteInteractiveSection';

export default function TelopEditorFormBody({
  page, name, onNameChange, partKey, slot, onSlotChange, useTemplateMode, showTemplateFields,
  selectedTemplate, layerFieldsList, setLayerFieldsList, fields, setFields, theme,
  contentEmpty, confirmed, togglingConfirm, onToggleConfirmed,
}: {
  /** 編集対象。null なら新規作成中（出る場所の選択欄・オートフォーカスの分岐に使う） */
  page: GraphicsPageRow | null;
  name: string;
  onNameChange: (name: string) => void;
  partKey: GraphicsPartKey;
  slot: GraphicsSlot;
  onSlotChange: (slot: GraphicsSlot) => void;
  useTemplateMode: boolean;
  showTemplateFields: boolean;
  selectedTemplate: GraphicsTemplateRow | null;
  layerFieldsList: Record<string, unknown>[];
  setLayerFieldsList: Dispatch<SetStateAction<Record<string, unknown>[]>>;
  fields: Record<string, unknown>;
  setFields: Dispatch<SetStateAction<Record<string, unknown>>>;
  theme: GraphicsThemeKey;
  contentEmpty: boolean;
  confirmed: boolean;
  togglingConfirm: boolean;
  onToggleConfirmed: () => void;
}) {
  return (
    <>
      <div className="mb-3">
        <PageLivePreview
          name={name}
          partKey={partKey}
          slot={slot}
          fields={fields}
          theme={theme}
          callNo={page?.callNo}
          layers={
            selectedTemplate?.layers && selectedTemplate.layers.length > 0
              ? selectedTemplate.layers.map((l, i) => ({ partKey: l.partKey, fields: layerFieldsList[i] ?? {} }))
              : undefined
          }
        />
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="telop-name">テロップ名 <span className="text-destructive">*</span></Label>
          <Input
            id="telop-name"
            className="mt-1 min-h-[44px]"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="例：主催者あいさつ 田島常務"
            autoFocus={!page}
          />
        </div>

        {!useTemplateMode && !page && (
          <div>
            <Label>出る位置</Label>
            <Select value={slot} onValueChange={(v) => onSlotChange(v as GraphicsSlot)}>
              <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRAPHICS_SLOTS.map((s) => (
                  <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showTemplateFields && selectedTemplate && (
          selectedTemplate.layers && selectedTemplate.layers.length > 0 ? (
            <TemplateLayerFieldsList
              templateName={selectedTemplate.name}
              layers={selectedTemplate.layers}
              layerFieldsList={layerFieldsList}
              setLayerFieldsList={setLayerFieldsList}
              pageId={page?.id ?? null}
            />
          ) : (
            <TemplateFieldsSection
              partKey={selectedTemplate.partKey}
              slot={selectedTemplate.slot}
              templateName={selectedTemplate.name}
              publicFields={selectedTemplate.publicFields}
              fields={fields}
              setFields={setFields}
              pageId={page?.id ?? null}
            />
          )
        )}

        {!useTemplateMode && (PART_FIELDS[partKey] ?? []).map((def) => (
          <PageFieldEditor
            key={def.key}
            def={def}
            idPrefix="telop-field"
            fields={fields}
            setFields={setFields}
            pageId={page?.id ?? null}
          />
        ))}

        {partKey === 'vote' && (
          <VoteInteractiveSection
            fields={fields}
            setFields={setFields}
            pageId={page?.id ?? null}
            countdownLocked={useTemplateMode}
          />
        )}

        <div className={`flex items-center gap-3 rounded-control-lg border px-3 py-2.5 ${
          contentEmpty ? 'border-border bg-surface-subtle' : confirmed ? 'border-success-border bg-success-surface' : 'border-warning-border bg-warning-surface'
        }`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sub font-bold">
              {contentEmpty ? '未完成（文言が空です）' : confirmed ? '確認済み' : '未確認'}
            </p>
            <p className="mt-0.5 text-note text-muted-foreground">
              {contentEmpty
                ? '文言を入れると確認の切替が使えるようになります。'
                : '表記を見て問題なければ確認済みに。本番で NEXT に立てたとき、未確認は △ で知らせます。'}
            </p>
          </div>
          <Switch
            checked={confirmed}
            onCheckedChange={onToggleConfirmed}
            disabled={contentEmpty || togglingConfirm}
            aria-label="確認済み"
          />
        </div>
      </div>
    </>
  );
}
