/**
 * 画面に描く本文を決める（`wiki_pages.body_md` はそのまま・**書き換えない**）
 *
 * Markdown の書き方として `# 題` から始めるのはごく普通で、取り込み（§5-2 の約束3）で
 * 入ってくる `.md` もほぼそうなっている。一方この画面は題を別に大きく出すので、
 * そのまま描くと**同じ題が2回並ぶ**（検証環境の実データで踏んだ）。
 *
 * そこで「先頭の `#` が題と同じなら、描くときだけ落とす」。
 * **保存されている本文は1文字も変えない** — 書き出した `.md` は今までどおり
 * `# 題` から始まり、GitHub や VS Code で開いたときの見え方も変わらない。
 *
 * ⚠️ 目次（`WikiToc`）も本文（`WikiMarkdown`）も**この関数が返した同じ文字列**を使うこと。
 *    別々の文字列を渡すと、見出しの id（行番号から引く）と目次のリンク先がずれて
 *    押しても飛ばなくなる。
 */

/** 先頭の見出しが題と同じなら落とす。それ以外は本文をそのまま返す */
export function bodyForDisplay(body: string, title: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const m = lines[i]?.match(/^#\s+(.+?)\s*#*\s*$/);
  if (!m) return body;
  if (m[1].trim() !== title.trim()) return body;

  // 題の行と、その直後の空行を1つだけ落とす（段落の間隔を変えないため）
  const rest = lines.slice(i + 1);
  if (rest[0]?.trim() === '') rest.shift();
  return rest.join('\n');
}
