// テロップCG — テンプレートの作成・編集ダイアログ（段6-2・docs/design/v4/graphics.md §2）。
//
// ①部品（partKey）を選ぶ → ②`PART_FIELDS[partKey]` の各欄に初期値を入れ、
// 「オペレーターが編集できるようにする」でページ作成時に触れる欄を絞る（欄そのものの
// 入力UIは `TemplateFieldsEditor.tsx` に切り出した・400行規律）→ ③テンプレート名・
// 説明（任意）を入力して保存。
//
// 部品・スロットはテンプレート作成後は変更できない（更新APIが受け取らない —
// `graphicsApi.ts` の `updateGraphicsTemplate` の型どおり）。編集時はバッジ表示に固定する。
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  GRAPHICS_SLOTS, SLOT_LABELS, PART_LABELS,
  PART_DEFAULT_SLOT, createGraphicsTemplate, updateGraphicsTemplate,
  type GraphicsTemplateRow, type GraphicsPartKey, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { PART_KEYS } from './pageFields';
import { SlotBadge } from './badges';
import { TemplateFieldsEditor, defaultBaseFields, loadBaseFieldsFromTemplate } from './TemplateFieldsEditor';

export default function TemplateFormDialog({
  projectId, template, open, onOpenChange, onSaved,
}: {
  projectId: string;
  /** 編集対象。null なら新規作成 */
  template: GraphicsTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: GraphicsTemplateRow) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [partKey, setPartKey] = useState<GraphicsPartKey>('name');
  const [slot, setSlot] = useState<GraphicsSlot>(PART_DEFAULT_SLOT.name);
  const [baseFields, setBaseFields] = useState<Record<string, unknown>>({});
  const [publicKeys, setPublicKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 開くたびに編集対象（または新規の既定値）を入れ直す
  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setDescription(template.description ?? '');
      setPartKey(template.partKey);
      setSlot(template.slot);
      setBaseFields(loadBaseFieldsFromTemplate(template.partKey, template.baseFields));
      setPublicKeys(new Set(template.publicFields));
    } else {
      const initPartKey: GraphicsPartKey = 'name';
      setName('');
      setDescription('');
      setPartKey(initPartKey);
      setSlot(PART_DEFAULT_SLOT[initPartKey]);
      setBaseFields(defaultBaseFields(initPartKey));
      setPublicKeys(new Set());
    }
  }, [open, template]);

  const pickPart = (key: GraphicsPartKey) => {
    setPartKey(key);
    setSlot(PART_DEFAULT_SLOT[key]);
    setBaseFields(defaultBaseFields(key));
    setPublicKeys(new Set());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const publicFields = Array.from(publicKeys);
      let saved: GraphicsTemplateRow;
      if (template) {
        saved = await updateGraphicsTemplate(template.id, {
          name: name.trim(),
          description: description.trim(),
          baseFields: { ...baseFields },
          publicFields,
        });
        notifySuccess('テンプレートを保存しました');
      } else {
        saved = await createGraphicsTemplate(projectId, {
          partKey,
          slot,
          name: name.trim(),
          description: description.trim() || undefined,
          baseFields: { ...baseFields },
          publicFields,
        });
        notifySuccess('テンプレートを作りました');
      }
      onOpenChange(false);
      onSaved(saved);
    } catch {
      notifyError(template ? 'テンプレートを保存できませんでした' : 'テンプレートを作れませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? `テンプレートを編集（${template.name}）` : 'テンプレートを作る'}</DialogTitle>
        </DialogHeader>

        <form id="graphics-template-form" className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="graphics-template-name">テンプレート名 <span className="text-destructive">*</span></Label>
            <Input
              id="graphics-template-name"
              className="mt-1 min-h-[44px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：受賞者ネーム（英語表記つき）"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="graphics-template-description">説明（任意）</Label>
            <Textarea
              id="graphics-template-description"
              className="mt-1"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="使いどころのメモなど（オペレーターには見せません）"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>部品</Label>
              {template ? (
                <p className="mt-1 flex min-h-[44px] items-center text-list font-bold">{PART_LABELS[partKey]}</p>
              ) : (
                <Select value={partKey} onValueChange={(v) => pickPart(v as GraphicsPartKey)}>
                  <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PART_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{PART_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>スロット（出る場所）</Label>
              {template ? (
                <div className="mt-1 flex min-h-[44px] items-center"><SlotBadge slot={slot} /></div>
              ) : (
                <Select value={slot} onValueChange={(v) => setSlot(v as GraphicsSlot)}>
                  <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GRAPHICS_SLOTS.map((s) => (
                      <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          {template && (
            <p className="text-note text-muted-foreground">
              部品・スロットは作成後は変更できません。変えたい場合は削除して作り直してください（この
              テンプレートで作られた既存のページには影響しません）。
            </p>
          )}

          <div>
            <p className="mb-1 text-th font-bold text-muted-foreground">初期値と公開フィールド</p>
            <p className="mb-2 text-note text-muted-foreground">
              チェックを入れた欄だけ、ページ作成時にオペレーターが書き換えられます。チェックが無い欄は
              下に入れた初期値のまま固定されます。
            </p>
            <TemplateFieldsEditor
              partKey={partKey}
              baseFields={baseFields}
              publicKeys={publicKeys}
              onFieldsChange={setBaseFields}
              onPublicKeysChange={setPublicKeys}
            />
          </div>
        </form>

        <DialogFooter>
          <Button type="submit" form="graphics-template-form" className="min-h-[44px]" disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : template ? '保存する' : '作る'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
