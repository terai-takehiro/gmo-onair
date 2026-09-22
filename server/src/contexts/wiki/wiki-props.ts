/**
 * Wiki — データベースの項目の値の検査（`docs/design/v4/wiki.md` §4-4・§5-3-6）。
 *
 * ⚠️ **`shared/src/wiki/frontMatter.ts` の意図的な複製です。**
 * サーバーはルートの `shared/`（`@gmo-onair/shared`）を import できません
 * （`server/tsconfig.json` の `rootDir: ./src`）。`wiki-markdown.ts` とまったく同じ理由で、
 * **保存のたびにサーバーが走らせるもの**だけをここに写しています。
 *
 * 写したのは2つだけです:
 *   - `isValidPropValue` … 値が項目の型に合っているか
 *   - `sanitizeProps`    … 知らない項目を落とし、型の合う値だけを残す
 * YAML の見出し（`serializeFrontMatter` / `parseFrontMatter`）は段E で要るので、
 * そのとき必要な分だけ写してください（使わない関数をここに置くと、
 * どちらが正か分からなくなります）。
 *
 * ⚠️ **画面と答えが食い違うと、画面では入れられた値がサーバーで黙って消えます。**
 * しかも消えたことは画面に出ないので、**誰も間違いとして報告しません**。
 * 片方だけ直さないこと。一致は `shared/tests/wikiPropsParity.test.ts` が固定しています
 * （`wikiMarkdownParity.test.ts` と同じ形）。
 *
 * ⚠️ ここは**純関数だけ**です。ONAiR リンクの相手が実在するかの確認は DB を引くので
 * `services/wiki-row-props.ts` にあります（画面側には確かめようが無く、複製できないため）。
 */

/** 項目の型は9つ（§4-4）。増やすときは shared の `WikiItemType` と一緒に増やす */
export type WikiItemType =
  | 'text'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'person'
  | 'checkbox'
  | 'number'
  | 'url'
  | 'onair_link';

/** ONAiR リンクの相手。行の中でカードになる */
export type WikiOnairKind = 'project' | 'equipment' | 'room' | 'page';

export const WIKI_ITEM_TYPES: readonly WikiItemType[] = [
  'text', 'select', 'multi_select', 'date', 'person', 'checkbox', 'number', 'url', 'onair_link',
];

export const WIKI_ONAIR_KINDS: readonly WikiOnairKind[] = ['project', 'equipment', 'room', 'page'];

export interface WikiOnairLink {
  kind: WikiOnairKind;
  id: string;
  label?: string;
}

export type WikiPropValue =
  | string
  | number
  | boolean
  | string[]
  | WikiOnairLink
  | null;

export interface WikiItem {
  id: string;
  name: string;
  type: WikiItemType;
  options?: Array<{ value: string; color?: string }>;
  required?: boolean;
  onairKinds?: WikiOnairKind[];
}

/**
 * 値が項目の型に合っているか。**サーバーが保存の前に必ず通す**
 * （知らない項目・型違いを保存すると、画面のセルが描けずに落ちる）。
 *
 * ⚠️ **`shared/src/wiki/frontMatter.ts` の同名の関数と1文字も違えないこと。**
 */
export function isValidPropValue(item: WikiItem, value: WikiPropValue): boolean {
  if (value === null || value === '') return !item.required;
  switch (item.type) {
    case 'text':
    case 'url':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'person':
      return typeof value === 'string';
    case 'select':
      return (
        typeof value === 'string' &&
        (!item.options || item.options.some((o) => o.value === value))
      );
    case 'multi_select':
      return (
        Array.isArray(value) &&
        value.every(
          (v) =>
            typeof v === 'string' &&
            (!item.options || item.options.some((o) => o.value === v)),
        )
      );
    case 'onair_link': {
      if (typeof value !== 'object' || Array.isArray(value)) return false;
      const link = value as { kind?: unknown; id?: unknown };
      return (
        typeof link.kind === 'string' &&
        ['project', 'equipment', 'room', 'page'].includes(link.kind) &&
        typeof link.id === 'string' &&
        link.id.length > 0
      );
    }
    default:
      return false;
  }
}

/**
 * 知らない項目を落とし、型の合う値だけを残す。保存の前に必ず通す。
 *
 * ⚠️ **`shared/src/wiki/frontMatter.ts` の同名の関数と1文字も違えないこと。**
 */
export function sanitizeProps(
  items: WikiItem[],
  props: Record<string, WikiPropValue> | null | undefined,
): Record<string, WikiPropValue> {
  const out: Record<string, WikiPropValue> = {};
  if (!props) return out;
  for (const item of items) {
    const v = props[item.id];
    if (v === undefined) continue;
    if (isValidPropValue(item, v)) out[item.id] = v;
  }
  return out;
}
