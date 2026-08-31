// テロップCG — テンプレートの `baseFields` 編集フォーム（`TemplateFormDialog.tsx` から
// 切り出し・400行規律 — `node scripts/check-file-size.mjs`）。
//
// `pageFields.ts` の `PART_FIELDS[partKey]` を読み、欄ごとに「初期値の入力欄」＋
// 「オペレーターが編集できるようにする」チェックボックスを並べる。score/vote/list は
// `PageFormDialog.tsx` と同じ専用エディタ（`ScoreEntriesEditor`/`VoteChoicesEditor`/
// `ListItemsEditor`）を再利用する — 可変長データの入力UIをここで作り直さない。
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { GraphicsPartKey } from '@/lib/graphicsApi';
import { PART_FIELDS, type PartFieldDef } from './pageFields';
import { ScoreEntriesEditor } from './ScoreEntriesEditor';
import { defaultScoreEntries, normalizeScoreEntries } from './scoreEntries';
import { VoteChoicesEditor } from './VoteChoicesEditor';
import { defaultVoteChoices, normalizeVoteChoices } from './voteChoices';
import { ListItemsEditor } from './ListItemsEditor';
import { defaultListItems, normalizeListItems } from './listItems';

/** 新規テンプレート作成時、部品を選んだ直後の初期値（`PageFormDialog.tsx` の pickPart と同じ考え方） */
export function defaultBaseFields(partKey: GraphicsPartKey): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const def of PART_FIELDS[partKey] ?? []) {
    if (def.kind === 'entries') next[def.key] = defaultScoreEntries();
    else if (def.kind === 'choices') next[def.key] = defaultVoteChoices();
    else if (def.kind === 'list-items') next[def.key] = defaultListItems();
    else if (def.type === 'select-number') next[def.key] = String(def.numberDefault ?? def.numberOptions?.[0] ?? '');
    else next[def.key] = '';
    if (def.bilingual) next[`${def.key}En`] = '';
  }
  return next;
}

/** 保存済みテンプレートの `baseFields`（DB からの生値）を、フォームで扱える形に正規化する */
export function loadBaseFieldsFromTemplate(
  partKey: GraphicsPartKey,
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const def of PART_FIELDS[partKey] ?? []) {
    const v = raw?.[def.key];
    next[def.key] = def.kind === 'entries'
      ? normalizeScoreEntries(v)
      : def.kind === 'choices'
      ? normalizeVoteChoices(v)
      : def.kind === 'list-items'
      ? normalizeListItems(v)
      : typeof v === 'string' ? v : v == null ? '' : String(v);
    if (def.bilingual) {
      const ev = raw?.[`${def.key}En`];
      next[`${def.key}En`] = typeof ev === 'string' ? ev : ev == null ? '' : String(ev);
    }
  }
  return next;
}

function counterClass(length: number, limit: number): string {
  if (length > limit) return 'text-destructive font-bold';
  if (length >= limit * 0.8) return 'text-warning font-bold';
  return 'text-muted-foreground';
}

/** 「オペレーターが編集できるようにする」チェック。チェックが無い欄は下の初期値のまま固定される */
function PublicToggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: () => void }) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-control-md px-1 text-sub font-bold text-muted-foreground hover:text-foreground"
    >
      <input id={id} type="checkbox" className="h-5 w-5" checked={checked} onChange={onChange} />
      オペレーターが編集できるようにする
    </label>
  );
}

function FieldValueEditor({
  def, value, enValue, onChange, onChangeEn,
}: {
  def: PartFieldDef;
  value: unknown;
  enValue: unknown;
  onChange: (v: unknown) => void;
  onChangeEn: (v: unknown) => void;
}) {
  const inputId = `graphics-template-field-${def.key}`;

  if (def.kind === 'entries') {
    return (
      <ScoreEntriesEditor
        label={def.label}
        entries={normalizeScoreEntries(value)}
        maxEntries={def.maxEntries}
        nameLimit={def.nameLimit}
        onChange={onChange}
      />
    );
  }
  if (def.kind === 'choices') {
    return (
      <VoteChoicesEditor
        label={def.label}
        choices={normalizeVoteChoices(value)}
        maxChoices={def.maxChoices}
        choiceLabelLimit={def.choiceLabelLimit}
        onChange={onChange}
      />
    );
  }
  if (def.kind === 'list-items') {
    return (
      <ListItemsEditor
        label={def.label}
        items={normalizeListItems(value)}
        maxItems={def.maxListItems}
        itemLimit={def.itemLimit}
        onChange={onChange}
      />
    );
  }
  if (def.type === 'select-number' && def.numberOptions) {
    const numValue = typeof value === 'string' ? value : value == null ? '' : String(value);
    return (
      <div>
        <Label htmlFor={inputId}>{def.label}</Label>
        <Select value={numValue} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={inputId} className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {def.numberOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}列</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const strValue = typeof value === 'string' ? value : '';
  const length = Array.from(strValue).length;
  const strEnValue = typeof enValue === 'string' ? enValue : '';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={inputId}>{def.label}</Label>
        {def.limit != null && (
          <span className={`font-number text-note ${counterClass(length, def.limit)}`}>
            {length} / {def.limit}
          </span>
        )}
      </div>
      <Input
        id={inputId}
        type={def.type ?? 'text'}
        className="mt-1 min-h-[44px]"
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
      />
      {def.bilingual && (
        <div className="mt-1.5">
          <Label htmlFor={`${inputId}-en`} className="text-note text-muted-foreground">
            {def.label}（英語・任意）
          </Label>
          <Input
            id={`${inputId}-en`}
            type="text"
            className="mt-1 min-h-[44px]"
            value={strEnValue}
            onChange={(e) => onChangeEn(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

export function TemplateFieldsEditor({
  partKey, baseFields, publicKeys, onFieldsChange, onPublicKeysChange,
}: {
  partKey: GraphicsPartKey;
  baseFields: Record<string, unknown>;
  publicKeys: Set<string>;
  onFieldsChange: (next: Record<string, unknown>) => void;
  onPublicKeysChange: (next: Set<string>) => void;
}) {
  const defs = PART_FIELDS[partKey] ?? [];

  const setField = (key: string, value: unknown) => onFieldsChange({ ...baseFields, [key]: value });

  const togglePublic = (def: PartFieldDef) => {
    const next = new Set(publicKeys);
    const nowPublic = !next.has(def.key);
    // 英語版（`${key}En`）は本体と同じ公開/非公開に揃える（別々にロックできても
    // オペレーターにとって嬉しくない — 本体を編集できるなら英語版も編集できてほしい）
    const keys = def.bilingual ? [def.key, `${def.key}En`] : [def.key];
    for (const k of keys) {
      if (nowPublic) next.add(k); else next.delete(k);
    }
    onPublicKeysChange(next);
  };

  if (defs.length === 0) return null;

  return (
    <div className="space-y-3">
      {defs.map((def) => (
        <div key={def.key} className="rounded-card border border-border bg-surface-subtle/40 p-3">
          <div className="mb-2 flex justify-end">
            <PublicToggle
              id={`graphics-template-public-${def.key}`}
              checked={publicKeys.has(def.key)}
              onChange={() => togglePublic(def)}
            />
          </div>
          <FieldValueEditor
            def={def}
            value={baseFields[def.key]}
            enValue={baseFields[`${def.key}En`]}
            onChange={(v) => setField(def.key, v)}
            onChangeEn={(v) => setField(`${def.key}En`, v)}
          />
        </div>
      ))}
    </div>
  );
}
