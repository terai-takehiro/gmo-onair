/**
 * server 側の複製 — 正は `shared/src/production/episodeSpec.ts`。
 *
 * サーバーは `server/src/` の外を import できない（`tsconfig.json` の `rootDir`）ため、
 * ここに**意図的に複製**してある。`scripts/check-collab-parity.mjs` の `PAIRS` が
 * 実装（コメント以外の行）の一致を検査する。**直すときは両方を同時に直すこと。**
 */

/** 一度の操作で作れる回の上限（サーバー側の従来の上限を踏襲） */
export const MAX_EPISODES_PER_BATCH = 100;

export type EpisodeSpecResult =
  | { mode: 'count'; count: number }
  | { mode: 'explicit'; numbers: number[] };

/** 入力の読み取りに失敗したときに投げる。`message` はそのまま画面に出せる日本語 */
export class EpisodeSpecError extends Error {}

/** 「追加する数」欄のテキストを、作る話数（または件数）に変換する */
export function parseEpisodeSpec(input: string): EpisodeSpecResult {
  const raw = (input ?? '').trim();
  if (!raw) throw new EpisodeSpecError('追加する数を入力してください');

  const hasMarker = raw.includes('#') || raw.includes(',') || raw.includes('、') || raw.includes('-');
  if (!hasMarker) {
    if (!/^\d+$/.test(raw)) {
      throw new EpisodeSpecError(`数字で入力してください（入力: "${raw}"）`);
    }
    const count = Number(raw);
    if (count < 1) throw new EpisodeSpecError('1件以上を指定してください');
    if (count > MAX_EPISODES_PER_BATCH) {
      throw new EpisodeSpecError(`一度に作成できるのは${MAX_EPISODES_PER_BATCH}件までです`);
    }
    return { mode: 'count', count };
  }

  const body = raw.startsWith('#') ? raw.slice(1) : raw;
  const parts = body.split(/[,、]/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) throw new EpisodeSpecError('話数を指定してください');

  const numbers: number[] = [];
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1) {
        throw new EpisodeSpecError(`話数は1以上で指定してください（"${part}"）`);
      }
      if (start > end) {
        throw new EpisodeSpecError(`範囲の順序が逆です（"${part}"）`);
      }
      for (let n = start; n <= end; n++) numbers.push(n);
      continue;
    }
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n < 1) throw new EpisodeSpecError(`話数は1以上で指定してください（"${part}"）`);
      numbers.push(n);
      continue;
    }
    throw new EpisodeSpecError(`読み取れない指定です（"${part}"）。例: "3" "1-2" "1,3,5-8"`);
  }

  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  }
  if (dupes.size > 0) {
    const list = [...dupes].sort((a, b) => a - b).map((n) => `#${n}`).join('、');
    throw new EpisodeSpecError(`同じ話数を2回指定しています（${list}）`);
  }

  if (numbers.length > MAX_EPISODES_PER_BATCH) {
    throw new EpisodeSpecError(`一度に作成できるのは${MAX_EPISODES_PER_BATCH}件までです`);
  }

  return { mode: 'explicit', numbers: [...numbers].sort((a, b) => a - b) };
}

/**
 * 昇順の話数リストを、連続する区間ごとにまとめる。
 * `episode_orders` は `start_episode`/`end_episode` の2列しか持たず
 * 非連続レンジを1レコードで表現できないため、区間ごとに複数レコードへ分けて記録する用途
 * （`1,3,5-8` なら `[{1,1},{3,3},{5,8}]` の3区間になる）。
 */
export function groupConsecutive(numbers: number[]): Array<{ start: number; end: number }> {
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups: Array<{ start: number; end: number }> = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last && n === last.end + 1) {
      last.end = n;
    } else {
      groups.push({ start: n, end: n });
    }
  }
  return groups;
}

/** 画面のプレビュー用に「#3、#5〜#8」の形式へ整形する（件数は呼び出し側で付ける） */
export function describeEpisodeNumbers(numbers: number[]): string {
  return groupConsecutive(numbers)
    .map((g) => (g.start === g.end ? `#${g.start}` : `#${g.start}〜#${g.end}`))
    .join('、');
}
