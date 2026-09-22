/**
 * 2つの版の違いを**行単位**で出す（§6-⑥「追加した行は緑・削除した行は赤」）
 *
 * 画面を見ても間違いに気づけない計算なので、素の JavaScript で閉じてある
 * （外の部品を足さない。この1ファイル以外に差分の作り手を作らない）。
 *
 * 作り:
 *   ①前後の同じ行を先に落とす（手直しは真ん中に集まるので、これだけで
 *     ほとんどの版が数十行まで縮む）
 *   ②残りを最長共通部分列（LCS）の表で対応付ける
 *   ③表が大きくなりすぎる版は、真ん中を「まるごと入れ替え」として出す
 *     （長い本文で画面が固まるより、粗くても返すほうがよい）
 */

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 古いほうの行番号（1 始まり）。追加された行は null */
  oldNo: number | null;
  /** 新しいほうの行番号（1 始まり）。削除された行は null */
  newNo: number | null;
}

/** LCS の表を作ってよい大きさの上限（行数 × 行数）。超えたら粗い差分にする */
const MAX_CELLS = 1_000_000;

export interface DiffSummary {
  added: number;
  removed: number;
  /** 表が大きすぎて粗い差分にしたか（画面に断りを出す） */
  coarse: boolean;
}

export function diffLines(oldText: string, newText: string): { lines: DiffLine[]; summary: DiffSummary } {
  const a = oldText.split('\n');
  const b = newText.split('\n');

  // ① 前後の同じ行を落とす
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head
    && tail < b.length - head
    && a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail += 1;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const lines: DiffLine[] = [];
  for (let i = 0; i < head; i += 1) {
    lines.push({ op: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 });
  }

  const coarse = midA.length * midB.length > MAX_CELLS;
  if (coarse) {
    // ③ まるごと入れ替え
    midA.forEach((t, i) => lines.push({ op: 'del', text: t, oldNo: head + i + 1, newNo: null }));
    midB.forEach((t, i) => lines.push({ op: 'add', text: t, oldNo: null, newNo: head + i + 1 }));
  } else {
    lines.push(...lcsDiff(midA, midB, head));
  }

  for (let i = 0; i < tail; i += 1) {
    const oi = a.length - tail + i;
    const ni = b.length - tail + i;
    lines.push({ op: 'same', text: a[oi], oldNo: oi + 1, newNo: ni + 1 });
  }

  return {
    lines,
    summary: {
      added: lines.filter((l) => l.op === 'add').length,
      removed: lines.filter((l) => l.op === 'del').length,
      coarse,
    },
  };
}

/** ② 最長共通部分列で対応付ける。`offset` は落とした前置きの行数 */
function lcsDiff(a: string[], b: string[], offset: number): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];

  // dp[i][j] = a[i..] と b[j..] の最長共通部分列の長さ。1本の配列で持つ
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i], oldNo: offset + i + 1, newNo: offset + j + 1 });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      out.push({ op: 'del', text: a[i], oldNo: offset + i + 1, newNo: null });
      i += 1;
    } else {
      out.push({ op: 'add', text: b[j], oldNo: null, newNo: offset + j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ op: 'del', text: a[i], oldNo: offset + i + 1, newNo: null });
    i += 1;
  }
  while (j < m) {
    out.push({ op: 'add', text: b[j], oldNo: null, newNo: offset + j + 1 });
    j += 1;
  }
  return out;
}

/**
 * 変わっていない行が長く続くところを畳む。
 * 前後 `context` 行だけ残し、その間は「N行 同じ」の印を1つ置く。
 */
export interface DiffChunk {
  kind: 'line' | 'skip';
  line?: DiffLine;
  /** kind='skip' のとき、畳んだ行数 */
  count?: number;
}

export function collapseSame(lines: DiffLine[], context = 3): DiffChunk[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.op === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k += 1) {
      keep[k] = true;
    }
  });

  const out: DiffChunk[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped > 0) {
        out.push({ kind: 'skip', count: skipped });
        skipped = 0;
      }
      out.push({ kind: 'line', line: l });
    } else {
      skipped += 1;
    }
  });
  if (skipped > 0) out.push({ kind: 'skip', count: skipped });
  return out;
}
