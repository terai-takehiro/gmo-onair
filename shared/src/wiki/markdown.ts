// Wiki — Markdown を扱う純関数（docs/design/v4/wiki.md §4-2・§5-3・§5-4）
//
// ── なぜ shared に置くか ────────────────────────────────────
//
// **同じ文字列を、サーバーと画面の両方が同じ規則で読む**ため。
// 見出しの抜き出し（検索の重み付け）とリンクの抜き出し（バックリンク）は
// サーバーが保存のたびに走らせ、画面は編集中に同じ結果を先に見せる。
// 別々に書くと、保存した瞬間に目次とバックリンクが変わって見える。
//
// ⚠️ **ここには React も DOM も持ち込まない。** サーバー（Node）から
// そのまま import するので、純関数だけにする。
// ⚠️ **本文を書き換える関数を置かない。** 本文の正は利用者が打った文字列で、
// 機械が黙って整形すると「打った文と保存された文が違う」が起きる。
// 整えるのは「AI で整える」を人が押したときだけ（§6-③）。

import type {
  WikiFrontMatter,
  WikiItem,
  WikiPropValue,
  WikiSearchHit,
} from './types';

/* ── 見出し ────────────────────────────────────────────────── */

export interface WikiHeading {
  /** 1〜3。`####` 以下は作らない（§4-2） */
  level: number;
  text: string;
  /** 目次のリンク先。同じ文字列が2つあれば -2, -3 … を足す */
  slug: string;
  /** 本文の何行目か（0 始まり） */
  line: number;
}

/** コードの柵（``` … ```）の中の行を false にした表を返す */
function codeFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let inFence = false;
  let fence = '';
  for (const line of lines) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      if (!inFence) {
        inFence = true;
        fence = m[1][0];
      } else if (m[1][0] === fence) {
        inFence = false;
        fence = '';
        mask.push(true); // 閉じの行そのものは柵の中扱い
        continue;
      }
    }
    mask.push(inFence);
  }
  return mask;
}

/** 見出しの文字から目次のリンク先を作る。記号を落として小文字にする */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()<>#!|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 本文から見出し（`#` `##` `###`）を抜く。
 * **コードの柵の中は見出しにしない**（`# コメント` を拾わないため）。
 */
export function extractHeadings(md: string): WikiHeading[] {
  const lines = md.split('\n');
  const inCode = codeFenceMask(lines);
  const out: WikiHeading[] = [];
  const seen = new Map<string, number>();
  lines.forEach((line, i) => {
    if (inCode[i]) return;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!m) return;
    const text = m[2].trim();
    if (!text) return;
    const base = headingSlug(text) || 'h';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ level: m[1].length, text, slug: n === 1 ? base : `${base}-${n}`, line: i });
  });
  return out;
}

/**
 * 検索用の「見出しだけを並べた写し」（`wiki_pages.headings`）。
 * タイトルの次に重く見る（§5-4）ので、1行1見出しで持つ。
 */
export function headingsText(md: string): string {
  return extractHeadings(md).map((h) => h.text).join('\n');
}

/* ── リンク ────────────────────────────────────────────────── */

/** `/wiki/p/<id>` を指すリンクの id（重複を落とす）。バックリンクの元（§5-3） */
export function extractPageLinks(md: string): string[] {
  const out = new Set<string>();
  // [文](/wiki/p/xxxx) と素の <(/wiki/p/xxxx)> の両方
  const re = /\((\/wiki\/p\/[A-Za-z0-9_-]+)[^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const id = m[1].slice('/wiki/p/'.length);
    if (id) out.add(id);
  }
  return [...out];
}

/** ONAiR の案件・機材・部屋へのリンク（§4-3）。画面がカードにする */
export interface WikiOnairRef {
  kind: 'project' | 'equipment' | 'room' | 'page';
  id: string;
  label: string;
}

const ONAIR_PATHS: Array<[RegExp, WikiOnairRef['kind']]> = [
  [/^\/sales\/projects\/([A-Za-z0-9_-]+)/, 'project'],
  [/^\/equipment\/items\/([A-Za-z0-9_-]+)/, 'equipment'],
  [/^\/calendar\/rooms\/([A-Za-z0-9_-]+)/, 'room'],
  [/^\/wiki\/p\/([A-Za-z0-9_-]+)/, 'page'],
];

/** 本文の中の ONAiR リンクを拾う。**本文は書き換えない**（カードにするのは画面） */
export function extractOnairRefs(md: string): WikiOnairRef[] {
  const out: WikiOnairRef[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]*)\]\((\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const [, label, href] = m;
    for (const [pattern, kind] of ONAIR_PATHS) {
      const hit = href.match(pattern);
      if (!hit) continue;
      const key = `${kind}:${hit[1]}`;
      if (seen.has(key)) break;
      seen.add(key);
      out.push({ kind, id: hit[1], label: label.trim() });
      break;
    }
  }
  return out;
}

/* ── 足りないページ（§7-2） ───────────────────────────────── */

/**
 * 同じ質問を1件にまとめる鍵。空白・記号・語尾のゆれを落とす。
 *
 * ⚠️ **強く丸めすぎない。** 「配信の設定は？」と「収録の設定は？」が
 * 同じ鍵になると、別の質問が1件に潰れて回数が嘘になる。
 * 落とすのは 空白・記号・丁寧語の語尾だけにする。
 */
export function normalizeQuestion(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[、。．，！？!?・：:；;（）()「」『』【】\[\]"'`]/g, '')
    .replace(/(ですか|でしょうか|ますか|かな|かね)$/u, '')
    .replace(/\s+/g, '')
    .slice(0, 200);
}

/* ── YAML の見出し（書き出し・取り込み・MCP の .md） ─────────── */

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  // 記号で始まる・コロンを含む・空 のときだけ引用する
  if (s === '' || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s/.test(s) || /\s$/.test(s)) {
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

function parseYamlValue(raw: string): unknown {
  const s = raw.trim();
  if (s === '') return '';
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((x) => unquote(x.trim()));
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj: Record<string, unknown> = {};
    for (const part of s.slice(1, -1).split(',')) {
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

/* ── データベースの項目の値（§4-4） ───────────────────────── */

/**
 * 値が項目の型に合っているか。**サーバーが保存の前に必ず通す**
 * （知らない項目・型違いを保存すると、画面のセルが描けずに落ちる）。
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

/** 知らない項目を落とし、型の合う値だけを残す。保存の前に必ず通す */
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

/* ── 検索の点数（§5-4。重みを直すたびに migration が要らないよう Node で） ── */

export interface WikiScoreInput {
  title: string;
  headings: string;
  body_md: string;
  updated_at: string;
}

/** 検索語を分ける。全角の空白も区切りに使う */
export function splitTerms(q: string): string[] {
  return q
    .trim()
    .split(/[\s　]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * タイトル×3・見出し×2・本文×1（§5-4）。
 * **2語以上は AND** — 1語でも当たらなければ 0（呼ぶ側が落とす）。
 * 同じ語が何度も出るほど少しだけ上がるが、上限を付ける（長い本文が勝ちすぎないため）。
 */
export function scorePage(page: WikiScoreInput, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = page.title.toLowerCase();
  const headings = page.headings.toLowerCase();
  const body = page.body_md.toLowerCase();
  let total = 0;
  for (const raw of terms) {
    const term = raw.toLowerCase();
    const inTitle = countOccurrences(title, term);
    const inHeadings = countOccurrences(headings, term);
    const inBody = countOccurrences(body, term);
    if (inTitle + inHeadings + inBody === 0) return 0; // AND
    total +=
      Math.min(inTitle, 3) * 3 + Math.min(inHeadings, 4) * 2 + Math.min(inBody, 6) * 1;
  }
  return total;
}

/** 当たった語の前後を切り出す。画面は当たった語を太くする */
export function makeExcerpt(body: string, terms: string[], width = 120): string {
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return body.slice(0, width).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, at - Math.floor(width / 3));
  const cut = body.slice(start, start + width).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + cut + (start + width < body.length ? '…' : '');
}

/** 一致した見出しのうち、いちばん上のもの。無ければ null */
export function matchedHeading(md: string, terms: string[]): string | null {
  const hs = extractHeadings(md);
  for (const h of hs) {
    const t = h.text.toLowerCase();
    if (terms.some((term) => t.includes(term.toLowerCase()))) return h.text;
  }
  return null;
}

/** 並べ替え: 点数が同じなら新しいほうを上に */
export function compareHits(a: WikiSearchHit, b: WikiSearchHit): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
}
