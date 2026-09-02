/**
 * 「利用日＋回番号」の入力を読み取る（DB を見ない純関数だけ）— 調査項目 S5
 *
 * 実際に作る側（採番・INSERT）は `episodeDated.service.ts`。
 * **分けているのは1ファイル400行の上限**（`scripts/check-file-size.mjs`）のためと、
 * 入力の読み取りだけを DB 無しで確かめられるようにするため
 * （`episodeGenerate.service.ts` が日付計算だけを純関数で持っているのと同じ考え方）。
 */
import { parseEpisodeSpec, EpisodeSpecError, MAX_EPISODES_PER_BATCH } from '../../../shared/production/episodeSpec';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 入力の読み取りに失敗したときに投げる。`message` はそのまま画面に出せる日本語 */
export class EpisodeDatedError extends Error {}

/** 1行ぶんの入力（画面の「利用日」1行 = ここ1件） */
export interface ParsedDatedEntry {
  recordingDate: string;
  /** 明示指定された回番号。件数だけの指定（"3"）のときは null（採番はトランザクションの中で取る） */
  numbers: number[] | null;
  /** この日に作る本数（明示指定なら `numbers.length`） */
  count: number;
  /** 放送日の明示指定。null なら収録日＋オフセットで出す */
  broadcastDate: string | null;
  /** 回の単価。未指定は null（「決めていない」。**¥0 と混同しない**） */
  unitPrice: number | null;
}

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new EpisodeDatedError(`${label}は YYYY-MM-DD 形式で指定してください（入力: "${value}"）`);
  }
}

/** 未指定（undefined / null / 空文字）は null。0 は正当な値なので落とさない */
function readOptionalAmount(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new EpisodeDatedError(`${label}は0以上の数で入れてください`);
  return n;
}

/**
 * リクエストの `entries` を検証して、作る内容を確定させる（DB は見ない純関数）。
 *
 * 同じ日を2行に分けているとき・同じ回番号を2度書いているときは**ここで断る**
 * （DB のユニーク制約に任せると「何件か入って何件か落ちた」状態になりうるため）。
 */
export function parseDatedEntries(raw: unknown): ParsedDatedEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new EpisodeDatedError('利用日を1行以上入れてください');
  }

  const entries: ParsedDatedEntry[] = [];
  const seenDates = new Set<string>();
  const seenNumbers = new Map<number, string>();
  let total = 0;

  for (const item of raw as Record<string, unknown>[]) {
    const recordingDate = String(item?.recording_date ?? '').trim();
    if (!recordingDate) throw new EpisodeDatedError('利用日（収録日）を入れてください');
    assertIsoDate(recordingDate, '利用日（収録日）');
    if (seenDates.has(recordingDate)) {
      throw new EpisodeDatedError(`同じ日を2行に分けています（${recordingDate}）。1行にまとめてください`);
    }
    seenDates.add(recordingDate);

    let spec;
    try {
      spec = parseEpisodeSpec(String(item?.episodes ?? ''));
    } catch (e) {
      if (e instanceof EpisodeSpecError) {
        throw new EpisodeDatedError(`${recordingDate}: ${e.message}`);
      }
      throw e;
    }

    const numbers = spec.mode === 'explicit' ? spec.numbers : null;
    const count = spec.mode === 'explicit' ? spec.numbers.length : spec.count;
    for (const n of numbers ?? []) {
      const other = seenNumbers.get(n);
      if (other) {
        throw new EpisodeDatedError(`#${n} を ${other} と ${recordingDate} の両方に書いています`);
      }
      seenNumbers.set(n, recordingDate);
    }

    const broadcastDateRaw = String(item?.broadcast_date ?? '').trim();
    if (broadcastDateRaw) assertIsoDate(broadcastDateRaw, '放送日');

    total += count;
    entries.push({
      recordingDate,
      numbers,
      count,
      broadcastDate: broadcastDateRaw || null,
      unitPrice: readOptionalAmount(item?.unit_price, '回の単価'),
    });
  }

  if (total > MAX_EPISODES_PER_BATCH) {
    throw new EpisodeDatedError(`一度に作成できるのは${MAX_EPISODES_PER_BATCH}件までです（指定では${total}件）`);
  }
  return entries;
}

/**
 * 案件の回番号の並びに空きがあるか（飛び番）を出す。
 *
 * **禁止はしない**（実務で欠番は起きる）。プレビューに出して人に気づかせるだけ。
 * 出しすぎても読めないので先頭20件で打ち切る。
 */
export function findNumberGaps(allNumbers: number[]): number[] {
  if (allNumbers.length === 0) return [];
  const set = new Set(allNumbers);
  const min = Math.min(...allNumbers);
  const max = Math.max(...allNumbers);
  const gaps: number[] = [];
  for (let n = min + 1; n < max && gaps.length < 20; n++) {
    if (!set.has(n)) gaps.push(n);
  }
  return gaps;
}

