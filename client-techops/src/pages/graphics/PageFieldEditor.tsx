// テロップCG — 1フィールド分の入力欄（`pageFields.ts` の `PartFieldDef` 1件をレンダリング）。
// `PageFormDialog.tsx`（自由入力）と `TemplateFieldsSection.tsx`（テンプレートの公開フィールド）
// の両方から使う共通部品——同じ入力ロジックを二重に持たない（400行規律の副産物でもある）。
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { PartFieldDef } from './pageFields';
import { ScoreEntriesEditor } from './ScoreEntriesEditor';
import { normalizeScoreEntries } from './scoreEntries';
import { VoteChoicesEditor } from './VoteChoicesEditor';
import { normalizeVoteChoices } from './voteChoices';
import { ListItemsEditor } from './ListItemsEditor';
import { normalizeListItems } from './listItems';

/** 目安の上限文字数に対する文字数カウンターの色（80%到達で注意色・超過で警告色 — 保存は止めない） */
function counterClass(length: number, limit: number): string {
  if (length > limit) return 'text-destructive font-bold';
  if (length >= limit * 0.8) return 'text-warning font-bold';
  return 'text-muted-foreground';
}

export function PageFieldEditor({
  def, idPrefix, fields, setFields, showBilingual = true,
}: {
  def: PartFieldDef;
  /** DOM id の接頭辞。同じページに複数のフォームがあるときの id 衝突を避ける */
  idPrefix: string;
  fields: Record<string, unknown>;
  setFields: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  /**
   * `def.bilingual` の英語版サブ欄を出すかどうか（既定 true）。テンプレートの公開フィールドが
   * 本体キーだけを公開し `${key}En` を公開していないときは false を渡す——編集できても
   * 保存されない（`publicFields` 外のキーは送信時に落ちる）欄を見せないため。
   */
  showBilingual?: boolean;
}) {
  if (def.kind === 'entries') {
    return (
      <ScoreEntriesEditor
        label={def.label}
        entries={normalizeScoreEntries(fields[def.key])}
        maxEntries={def.maxEntries}
        nameLimit={def.nameLimit}
        onChange={(next) => setFields((prev) => ({ ...prev, [def.key]: next }))}
      />
    );
  }
  if (def.kind === 'choices') {
    return (
      <VoteChoicesEditor
        label={def.label}
        choices={normalizeVoteChoices(fields[def.key])}
        maxChoices={def.maxChoices}
        choiceLabelLimit={def.choiceLabelLimit}
        onChange={(next) => setFields((prev) => ({ ...prev, [def.key]: next }))}
      />
    );
  }
  if (def.kind === 'list-items') {
    return (
      <ListItemsEditor
        label={def.label}
        items={normalizeListItems(fields[def.key])}
        maxItems={def.maxListItems}
        itemLimit={def.itemLimit}
        onChange={(next) => setFields((prev) => ({ ...prev, [def.key]: next }))}
      />
    );
  }
  if (def.type === 'select-number' && def.numberOptions) {
    const rawNum = fields[def.key];
    const numValue = typeof rawNum === 'string' ? rawNum : rawNum == null ? '' : String(rawNum);
    return (
      <div>
        <Label htmlFor={`${idPrefix}-${def.key}`}>{def.label}</Label>
        <Select value={numValue} onValueChange={(v) => setFields((prev) => ({ ...prev, [def.key]: v }))}>
          <SelectTrigger id={`${idPrefix}-${def.key}`} className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {def.numberOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}列</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const raw = fields[def.key];
  const value = typeof raw === 'string' ? raw : '';
  const length = Array.from(value).length;
  const enKey = `${def.key}En`;
  const enRaw = fields[enKey];
  const enValue = typeof enRaw === 'string' ? enRaw : '';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={`${idPrefix}-${def.key}`}>{def.label}</Label>
        {def.limit != null && (
          <span className={`font-number text-note ${counterClass(length, def.limit)}`}>
            {length} / {def.limit}
          </span>
        )}
      </div>
      <Input
        id={`${idPrefix}-${def.key}`}
        type={def.type ?? 'text'}
        className="mt-1 min-h-[44px]"
        value={value}
        onChange={(e) => setFields((prev) => ({ ...prev, [def.key]: e.target.value }))}
      />
      {/* 英語版（任意）。本体のすぐ下に自動的に足す — bilingual フィールドだけ（pageFields.ts）。
          未入力なら出力の ?lang=en でも日本語のままフォールバック */}
      {def.bilingual && showBilingual && (
        <div className="mt-1.5">
          <Label htmlFor={`${idPrefix}-${enKey}`} className="text-note text-muted-foreground">
            {def.label}（英語・任意）
          </Label>
          <Input
            id={`${idPrefix}-${enKey}`}
            type="text"
            className="mt-1 min-h-[44px]"
            value={enValue}
            placeholder="未入力なら出力の ?lang=en でも日本語のまま表示されます"
            onChange={(e) => setFields((prev) => ({ ...prev, [enKey]: e.target.value }))}
          />
        </div>
      )}
    </div>
  );
}
