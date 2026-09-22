/**
 * Wiki — `.md` の先頭に置く YAML の見出しの書き出しと読み取り
 * （`docs/design/v4/wiki.md` §5-2 の約束3・段D）。
 *
 * ⚠️ **`shared/src/wiki/frontMatter.ts` の意図的な複製です。**
 * サーバーはルートの `shared/`（`@gmo-onair/shared`）を import できません
 * （`server/tsconfig.json` の `rootDir: ./src`）。`wiki-markdown.ts`・`wiki-props.ts` と
 * 同じ理由で、**同じ答えが要るものだけ**をここに写しています。
 *
 * 写したのは2つです:
 *   - `serializeFrontMatter` … `.md` の REST（`GET /wiki/pages/:id.md`）と
 *     スペースまるごとの書き出し（zip）が同じ形を出すため
 *   - `parseFrontMatter`     … 取り込み（`POST /wiki/import`）が、書き出した `.md` を
 *     読み直したときに担当・期限・タグを落とさないため
 * 値の検査（`isValidPropValue` / `sanitizeProps`）は `wiki-props.ts` にあります。
 * **同じものを2か所に写さないこと。**
 *
 * ⚠️ **画面と答えが食い違うと、書き出した `.md` を取り込み直したときに
 * 担当・期限・タグが黙って落ちます。** 本文は合っているので、取り込んだ人は気づきません。
 * 一致は `shared/tests/wikiFrontMatterParity.test.ts` が固定しています。
 */
import type { WikiPropValue } from './wiki-props';

/** `.md` の先頭に置く見出し（`shared/src/wiki/types.ts` の `WikiFrontMatter` と同じ形） */
export interface WikiFrontMatter {
  id?: string;
  title: string;
  space?: string;
  parent?: string;
  tags?: string[];
  owner?: string;
  review_by?: string;
  status?: 'draft' | 'published' | 'archived';
  updated?: string;
  /** データベースの行のときの項目の値 */
  props?: Record<string, WikiPropValue>;
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  /*
   * 記号で始まる・コロンを含む・末尾が空白・空 のときは引用する。
   * ⚠️ **コンマを含むときも必ず引用します。** インラインの配列・表
   * （`tags: [a, b]`・`{ kind: …, id: … }`）では、引用しないと読み直すときに
   * **そのコンマで値が割れます** — 書き出し→取り込みの往復で
   * `R&D, Japan` の1つのタグが2つに増えていました（Codex の指摘・P2）。
   *
   * ⚠️ **`true` `false` や数字に見える文字も必ず引用します。** 引用しないと
   * `parseYamlValue` が真偽値・数値に読み替えてしまい、文字の項目
   * （文字・URL・担当・選択）は `sanitizeProps` が型違いとして**黙って落とします**。
   * 往復すると値が消えるのに、消えたことが画面に出ません（Codex の指摘・P1）。
   */
  const looksTyped = /^(true|false)$/.test(s) || /^-?\d+(\.\d+)?$/.test(s);
  if (
    s === '' || looksTyped || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s)
    || /:\s/.test(s) || /\s$/.test(s) || s.includes(',')
  ) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** ページを `.md`（YAML の見出し付き）にする。書き出し・API・MCP が同じ形を使う */
export function serializeFrontMatter(fm: WikiFrontMatter, body: string): string {
  const lines: string[] = ['---'];
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      lines.push(`${k}: [${v.map((x) => yamlScalar(x)).join(', ')}]`);
      return;
    }
    if (typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>).filter(
        ([, val]) => val !== undefined && val !== null && val !== '',
      );
      if (entries.length === 0) return;
      lines.push(`${k}:`);
      for (const [ik, iv] of entries) {
        if (Array.isArray(iv)) {
          lines.push(`  ${ik}: [${iv.map((x) => yamlScalar(x)).join(', ')}]`);
        } else if (iv && typeof iv === 'object') {
          // ONAiR リンクは kind/id/label の平たい形で出す
          const o = iv as Record<string, unknown>;
          lines.push(`  ${ik}: { ${Object.entries(o).map(([a, b]) => `${a}: ${yamlScalar(b)}`).join(', ')} }`);
        } else {
          lines.push(`  ${ik}: ${yamlScalar(iv)}`);
        }
      }
      return;
    }
    lines.push(`${k}: ${yamlScalar(v)}`);
  };
  put('id', fm.id);
  put('title', fm.title);
  put('space', fm.space);
  put('parent', fm.parent);
  put('tags', fm.tags);
  put('owner', fm.owner);
  put('review_by', fm.review_by);
  put('status', fm.status);
  put('updated', fm.updated);
  put('props', fm.props);
  lines.push('---', '');
  return `${lines.join('\n')}\n${body.replace(/^\n+/, '')}`;
}

/**
 * `.md` の先頭の YAML の見出しを読む。取り込み（Obsidian・Notion）で使う。
 *
 * ⚠️ **YAML の全部は読まない。** 読むのは1段の `key: value` と
 * `key: [a, b]` と 2段目の `props` だけ。読めない行は捨てる
 * （知らない形が画面に届くと React が落ちる、の前例に倣う）。
 */
export function parseFrontMatter(md: string): { data: Record<string, unknown>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: md };
  const data: Record<string, unknown> = {};
  let nested: string | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indented = /^\s{2,}\S/.test(raw);
    const kv = raw.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = parseYamlValue(rawVal);
    if (indented && nested) {
      const bucket = (data[nested] ??= {}) as Record<string, unknown>;
      bucket[key] = val;
      continue;
    }
    if (rawVal === '') {
      nested = key;
      data[key] = {};
      continue;
    }
    nested = null;
    data[key] = val;
  }
  return { data, body: md.slice(m[0].length) };
}

/**
 * 引用符の中のコンマでは切らずに、インラインの配列・表を区切る。
 *
 * ⚠️ **素の `split(',')` にしないこと。** `tags: ["R&D, Japan"]` が
 * 「R&D」と「Japan」の2つに割れ、書き出し→取り込みの往復で**タグが増えます**
 * （書き出しも同じインラインの形で書くため。Codex の指摘・P2）。
 * `\` で打ち消した引用符は中身として数えます。
 */
function splitTopLevel(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const ch of inner) {
    if (escaped) { cur += ch; escaped = false; continue; }
    if (ch === '\\' && quote) { cur += ch; escaped = true; continue; }
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseYamlValue(raw: string): unknown {
  const s = raw.trim();
  if (s === '') return '';
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevel(inner).map((x) => unquote(x.trim())).filter((x) => x !== '');
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj: Record<string, unknown> = {};
    for (const part of splitTopLevel(s.slice(1, -1))) {
      const kv = part.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (kv) obj[kv[1]] = unquote(kv[2].trim());
    }
    return obj;
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return unquote(s);
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}
