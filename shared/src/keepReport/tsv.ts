/**
 * 人が上書きした表（タブ区切り・1行1レコード・1行目は見出し）を読む。
 *
 * 画面のプレビュー（`client-daily/.../PartRenderer.tsx`）と pptx の出力（server は `shared/` を import
 * できないので `server/src/contexts/dailyops/services/keep-tsv.ts` に**写し**を持つ・parity テストで一致を固定）
 * が**同じ読み方**で表にする — 片方だけで読むと「画面では表なのに資料では生の TSV が文で出る」になる
 * （PR #607 レビュー 5 回目 P1）。
 *
 * タブが無い行は `,` `、` `|` `｜` でも切る（スプレッドシートから貼るとタブ・手で打つと読点になる）。
 * 空行は飛ばす。升の数は行ごとに違ってよい（描く側が足りない升を空で埋める）。
 */
export interface TsvTable { head: string[]; rows: string[][] }

export function parseTsv(text: string): TsvTable {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(/[,、|｜]/)).map((c) => c.trim());
  if (!lines.length) return { head: [], rows: [] };
  return { head: split(lines[0]), rows: lines.slice(1).map(split) };
}
