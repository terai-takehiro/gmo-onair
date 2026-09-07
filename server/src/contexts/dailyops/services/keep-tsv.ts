/**
 * `shared/src/keepReport/tsv.ts` の**写し**（server は `shared/` を import できない）。
 * 直すときは両方を同じに直す — `shared/tests/keepReportDeckParity.test.ts` が一致を検査する。
 *
 * 人が上書きした表（タブ区切り・1行1レコード・1行目は見出し）を読む。プレビューと pptx が同じ読み方で表にする。
 * タブが無い行は `,` `、` `|` `｜` でも切る。空行は飛ばす。升の数は行ごとに違ってよい。
 */
export interface TsvTable { head: string[]; rows: string[][] }

export function parseTsv(text: string): TsvTable {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(/[,、|｜]/)).map((c) => c.trim());
  if (!lines.length) return { head: [], rows: [] };
  return { head: split(lines[0]), rows: lines.slice(1).map(split) };
}
