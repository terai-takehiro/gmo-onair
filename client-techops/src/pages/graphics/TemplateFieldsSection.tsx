// テロップCG — テンプレート選択時のフィールド表示・入力ロジック(段6-2)。
// `PageFormDialog.tsx` から切り出した（ファイルサイズ規律・400行 — `check-file-size.mjs`）。
//
// docs/design/v4/graphics.md §2「公開フィールド以外はオペレーターから触れない」の
// フォーム側の実装。テンプレートの `publicFields` に含まれるキーだけ編集欄を出し
// （`PageFieldEditor.tsx` を共用）、それ以外は「テンプレート固定・編集できません」の
// 読み取り専用表示にする。サーバー側（templates.routes.ts・pages.routes.ts）が同じ
// 境界を強制するので、ここが崩れても実害は無い——が、崩れたまま気づかず使わせないための表示。
import { Lock } from 'lucide-react';
import { PART_LABELS, SLOT_LABELS, type GraphicsTemplateRow } from '@/lib/graphicsApi';
import { PART_FIELDS } from './pageFields';
import { PageFieldEditor } from './PageFieldEditor';
import { defaultScoreEntries, normalizeScoreEntries } from './scoreEntries';
import { defaultVoteChoices, normalizeVoteChoices } from './voteChoices';
import { defaultListItems, normalizeListItems } from './listItems';

/** 編集不可の欄に出す値の要約（構造化欄はそのまま出すと崩れるので短い文字列にする） */
function describeLockedValue(kind: 'entries' | 'choices' | 'list-items' | undefined, value: unknown): string {
  if (kind === 'entries') {
    const arr = normalizeScoreEntries(value);
    return arr.length > 0 ? arr.map((e) => e.name || '（無題）').join('・') : '（未設定）';
  }
  if (kind === 'choices') {
    const arr = normalizeVoteChoices(value);
    return arr.length > 0 ? arr.map((c) => c.label || '（無題）').join('・') : '（未設定）';
  }
  if (kind === 'list-items') {
    const arr = normalizeListItems(value);
    return arr.length > 0 ? arr.join('・') : '（未設定）';
  }
  if (typeof value === 'string') return value.trim() || '（未設定）';
  if (value == null) return '（未設定）';
  return String(value);
}

/**
 * テンプレートの `baseFields` を、新規ページ作成時の `fields` 初期値へ変換する
 * （公開・非公開を問わず全キーをそのまま入れる——編集不可の欄も baseFields の値で固定表示するため）。
 */
export function initialFieldsFromTemplate(template: GraphicsTemplateRow): Record<string, unknown> {
  const next: Record<string, unknown> = { ...template.baseFields };
  for (const def of PART_FIELDS[template.partKey] ?? []) {
    if (def.kind === 'entries' && next[def.key] === undefined) next[def.key] = defaultScoreEntries();
    if (def.kind === 'choices' && next[def.key] === undefined) next[def.key] = defaultVoteChoices();
    if (def.kind === 'list-items' && next[def.key] === undefined) next[def.key] = defaultListItems();
  }
  return next;
}

/**
 * `fields` のうち、テンプレートの `publicFields` に含まれるキーだけを取り出す。
 * `updateGraphicsPage`（PUT /graphics/pages/:id）へ送るのはこの部分集合だけにすること
 * — サーバー側は既存の値へマージするので、ロックされたフィールドは送らなくてよい
 * （送ると 400 で拒否される）。
 */
export function pickPublicFields(
  template: GraphicsTemplateRow,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const publicSet = new Set(template.publicFields);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (publicSet.has(key)) out[key] = fields[key];
  }
  return out;
}

export function TemplateFieldsSection({
  template,
  fields,
  setFields,
}: {
  template: GraphicsTemplateRow;
  fields: Record<string, unknown>;
  setFields: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}) {
  const publicSet = new Set(template.publicFields);
  const defs = PART_FIELDS[template.partKey] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-note border border-border bg-surface-subtle px-3 py-2 text-sub">
        <span className="text-muted-foreground">部品</span>
        <span className="font-bold">{PART_LABELS[template.partKey]}</span>
        <span className="text-muted-foreground">／出る場所</span>
        <span className="font-bold">{SLOT_LABELS[template.slot]}</span>
        <span className="text-note text-muted-foreground">（テンプレート「{template.name}」で固定）</span>
      </div>

      {defs.map((def) => {
        if (!publicSet.has(def.key)) {
          return (
            <div key={def.key} className="flex items-start gap-2 rounded-note bg-surface-subtle px-3 py-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-note font-bold text-muted-foreground">{def.label}（編集できません）</p>
                <p className="mt-0.5 truncate text-sub">
                  {describeLockedValue(def.kind, fields[def.key])}
                </p>
              </div>
            </div>
          );
        }
        const enKey = `${def.key}En`;
        const enIsLocked = !!def.bilingual && !publicSet.has(enKey);
        return (
          <div key={def.key}>
            <PageFieldEditor
              def={def}
              idPrefix="tpl-field"
              fields={fields}
              setFields={setFields}
              showBilingual={!enIsLocked}
            />
            {enIsLocked && (
              <div className="mt-1.5 flex items-start gap-1.5 text-note text-muted-foreground">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{def.label}（英語・テンプレート固定）: {describeLockedValue(undefined, fields[enKey])}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
