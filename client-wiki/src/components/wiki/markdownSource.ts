/**
 * 描く前に本文（Markdown の文字列）から拾う小物。
 *
 * react-markdown が渡してくる `node`（hast）は**本文の何行目か**を持っている。
 * そこで「描かれたあとの React の要素」を触るのではなく、**元の文字列を行で切り出す**。
 * 注意書きの `[!NOTE]` を消す・見出しの目次リンク先を当てるのは、これで済む
 * （描かれたあとの要素から文字を拾うやり方は、強調やリンクが混ざると壊れる）。
 */
import { extractOnairRefs, type WikiOnairRef } from '@gmo-onair/shared/src/wiki/markdown';
import { parseAlertKind, type WikiAlertKind } from './WikiAlert';

/** react-markdown が渡す `node` のうち、ここで使うところだけ */
export interface MdNodeLike {
  position?: { start?: { line?: number }; end?: { line?: number } } | null;
  children?: Array<{ type?: string; tagName?: string; value?: string; properties?: Record<string, unknown> }>;
}

/** hast の1行目（本文の何行目か）。1 始まり。無ければ null */
export function startLineOf(node: MdNodeLike | undefined): number | null {
  const n = node?.position?.start?.line;
  return typeof n === 'number' ? n : null;
}

/** 引用の1行目が `> [!NOTE]` などなら、その種類を返す */
export function alertKindOf(node: MdNodeLike | undefined, md: string): WikiAlertKind | null {
  const line = startLineOf(node);
  if (line === null) return null;
  const raw = md.split('\n')[line - 1];
  if (raw === undefined) return null;
  return parseAlertKind(raw.replace(/^\s*>\s?/, ''));
}

/**
 * 注意書きの中身だけを取り出す。
 * ①引用の範囲を行で切る ②各行の `>` を落とす ③1行目の `[!NOTE]` を落とす。
 * 1行目が印だけなら、その行ごと落とす（先頭に空行を残さない）。
 */
export function alertBodySource(node: MdNodeLike | undefined, md: string): string {
  const start = startLineOf(node);
  const end = node?.position?.end?.line;
  if (start === null || typeof end !== 'number') return '';
  const lines = md.split('\n').slice(start - 1, end).map((l) => l.replace(/^\s*>\s?/, ''));
  if (lines.length === 0) return '';
  lines[0] = lines[0].replace(/^\s*\[![A-Z]+\]\s*/, '');
  if (lines[0].trim() === '') lines.shift();
  return lines.join('\n').trim();
}

/**
 * 段落が **リンク1本だけ**でできているか。そうなら ONAiR カードにする
 * （docs/design/v4/wiki.md §4-3。文の中に混ざったリンクはカードにしない）。
 */
export function soleLinkOf(node: MdNodeLike | undefined): { href: string; label: string } | null {
  const kids = (node?.children ?? []).filter(
    (c) => !(c.type === 'text' && (c.value ?? '').trim() === ''),
  );
  if (kids.length !== 1) return null;
  const only = kids[0];
  if (only.tagName !== 'a') return null;
  const href = only.properties?.href;
  if (typeof href !== 'string' || !href) return null;
  return { href, label: textOf(only) };
}

/** hast の要素の中の文字だけを繋ぐ（強調やコードが混ざっていても拾える） */
export function textOf(node: { value?: string; children?: unknown }): string {
  if (typeof node.value === 'string') return node.value;
  const kids = node.children;
  if (!Array.isArray(kids)) return '';
  return kids.map((k) => textOf(k as { value?: string; children?: unknown })).join('');
}

/**
 * URL が ONAiR のデータを指しているか。
 * **判定は shared の `extractOnairRefs` に任せる** — 同じ規則を2か所に書くと、
 * 片方だけ直した日に画面とサーバーの見え方がずれる。
 */
export function onairRefOf(href: string, label: string): WikiOnairRef | null {
  if (!href.startsWith('/')) return null;
  const hit = extractOnairRefs(`[x](${href})`)[0];
  return hit ? { ...hit, label } : null;
}
