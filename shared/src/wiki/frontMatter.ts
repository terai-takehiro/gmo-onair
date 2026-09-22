// Wiki — `.md` の先頭に置く YAML の見出しと、データベースの項目の値（§5-2 の約束3・§4-4）
//
// 書き出した `.md` を取り込み直したときに担当・期限・タグが落ちないことが要（本文は
// 合っているので、落ちても取り込んだ人は気づかない）。React も DOM も持ち込まない。
// 元は markdown.ts にあり、1ファイル 400 行の上限で役割ごとに分けた。

import type { WikiFrontMatter, WikiItem, WikiPropValue } from './types';

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
