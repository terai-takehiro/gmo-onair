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

/* ── 折りたたみ（`<details><summary>`。設計 §4-2）────────────────
 *
 * ⚠️ **`rehype-raw` は入れない**（本文に `<script>` が混ざっても素通しにしない）。
 * そのため生の HTML は描かれずに落ちる。設計書の表にある「折りたたみ」だけは
 * **元の文字列から形を見つけて**、自前の部品で描く（注意書きと同じ作法）。
 * 本文の形は変えないので、書き出した `.md` を GitHub で開いても折りたたみのまま。
 */

export interface WikiFoldSegment { kind: 'fold'; summary: string; body: string }
export interface WikiTextSegment { kind: 'md'; text: string }
export type WikiSegment = WikiTextSegment | WikiFoldSegment;

const OPEN_RE = /^\s*<details>\s*(?:<summary>([\s\S]*?)<\/summary>)?\s*$/;
const SUMMARY_RE = /^\s*<summary>([\s\S]*?)<\/summary>\s*$/;
const CLOSE_RE = /^\s*<\/details>\s*$/;

/**
 * 本文を「ふつうの Markdown」と「折りたたみ」に切り分ける。
 * 閉じ（`</details>`）が無い開きは**ただの文字**として扱う（書きかけで本文が消えない）。
 */
export function splitFolds(md: string): WikiSegment[] {
  const lines = md.split('\n');
  const out: WikiSegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.join('\n').trim() !== '') out.push({ kind: 'md', text: buf.join('\n') });
    buf = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const open = OPEN_RE.exec(lines[i]);
    if (!open) { buf.push(lines[i]); continue; }

    let close = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (CLOSE_RE.test(lines[j])) { close = j; break; }
    }
    if (close === -1) { buf.push(lines[i]); continue; }

    let summary = open[1] ?? '';
    let bodyStart = i + 1;
    if (!open[1]) {
      const sm = SUMMARY_RE.exec(lines[bodyStart] ?? '');
      if (sm) { summary = sm[1]; bodyStart += 1; }
    }

    flush();
    out.push({
      kind: 'fold',
      summary: summary.trim(),
      body: lines.slice(bodyStart, close).join('\n').trim(),
    });
    i = close;
  }

  flush();
  return out;
}
