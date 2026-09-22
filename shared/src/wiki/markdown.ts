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
//
// 役割で3つに分けてある（1ファイル 400 行の上限）:
//   markdown.ts    … 見出し・リンク・質問の鍵（このファイル）
//   frontMatter.ts … YAML の見出しの読み書きと、データベースの項目の値の検査
//   search.ts      … 検索の点数付けと抜粋

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
