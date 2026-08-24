// スケジュール表 PC グリッドの縦軸（時間 → px）— 区切りごとに高さを変える版。
//
// ⚠️ これは表示専用の計算（クライアントの見た目だけを決める）なので、サーバー側に複製しない
// （`shared/src/collab/` や `production/miniapps.ts` の「サーバーも参照する値」とは違う）。
//
// もとは `slot_min`（5/10/15/30/60分の固定刻み）で縦軸を均等割りしていたが、
// 「何も予定が無い時間帯」まで均等な高さを取るため、空白が多い日ほど無駄なスクロールが
// 増えていた（ユーザー指摘「時間の区切りごとに表示される仕組みだとスペースに無駄がなくいい」）。
// 代わりに、項目の開始・終了時刻そのものを目盛り（区切り）にし、
//   - 項目がある区間（`isEmpty: false`）は実際の長さにほぼ比例した高さ
//   - 何も無い区間（`isEmpty: true`）は短くても・長くても見出しの高さに潰す（上限あり）
// で縦軸を作る。`slot_min` はもう縦軸の計算には使わない（表そのもの・DB の値は残したまま）。

export interface TimelineRange {
  start_min: number;
  end_min: number;
}

export interface TimelineSegment {
  startMin: number;
  endMin: number;
  /** true: この区間はどの項目とも重ならない（空き時間） */
  isEmpty: boolean;
  heightPx: number;
}

export interface TimelineTuning {
  /** 項目がある区間の 1分あたりの高さ(px) */
  busyPxPerMin: number;
  /** 項目がある区間の最低の高さ(px)（短い項目でも読める・押せる高さを残す） */
  minBusyPx: number;
  /** 空き区間の最低の高さ(px) */
  minGapPx: number;
  /** 空き区間の最大の高さ(px)（ここで頭打ちにして無駄なスペースを作らない） */
  maxGapPx: number;
  /** 空き区間の 1分あたりの高さ(px)（頭打ちに達するまでの傾き） */
  gapPxPerMin: number;
}

// 匠の調整（数字はここにだけ置く。感覚が合わなくなったらここを直す）:
// - 15分の項目がだいたい元の等間隔グリッド（15分刻み=22px）と同じ高さになるよう busyPxPerMin を選んだ
// - 空き時間は 1px/分で伸び、150px（=約3.6時間ぶん）で頭打ちにする —
//   「空いている」と分かる程度の差は付けつつ、半日空いていても場所を取り過ぎない範囲
export const DEFAULT_TIMELINE_TUNING: TimelineTuning = {
  busyPxPerMin: 1.4,
  minBusyPx: 20,
  minGapPx: 12,
  maxGapPx: 150,
  gapPxPerMin: 1,
};

export interface TimelineLayout {
  segments: TimelineSegment[];
  totalHeightPx: number;
  /** 分 → その位置の Y 座標(px)。区間の途中も比例配分で返す */
  yOf: (min: number) => number;
  /** Y 座標(px) → 分。`yOf` の逆関数（グリッドをクリックした位置から時刻を出す用） */
  minOf: (y: number) => number;
}

function layoutOf(segments: TimelineSegment[], viewStart: number, viewEnd: number): TimelineLayout {
  const cum: number[] = [0];
  for (const seg of segments) cum.push(cum[cum.length - 1] + seg.heightPx);
  const totalHeightPx = cum[cum.length - 1];

  const yOf = (min: number): number => {
    const m = Math.max(viewStart, Math.min(viewEnd, min));
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (m <= seg.endMin) {
        const span = seg.endMin - seg.startMin;
        const frac = span > 0 ? (m - seg.startMin) / span : 0;
        return cum[i] + frac * seg.heightPx;
      }
    }
    return totalHeightPx;
  };

  const minOf = (y: number): number => {
    if (segments.length === 0) return viewStart;
    const yy = Math.max(0, Math.min(totalHeightPx, y));
    for (let i = 0; i < segments.length; i++) {
      if (yy <= cum[i + 1] || i === segments.length - 1) {
        const seg = segments[i];
        const frac = seg.heightPx > 0 ? (yy - cum[i]) / seg.heightPx : 0;
        return seg.startMin + frac * (seg.endMin - seg.startMin);
      }
    }
    return viewEnd;
  };

  return { segments, totalHeightPx, yOf, minOf };
}

/**
 * `ranges`（このビューに出る全項目の開始・終了。列をまたいで1つの縦軸で共有する）から、
 * 「項目がある区間」「何も無い区間」を区切って縦軸を作る。
 */
export function buildTimeline(
  ranges: TimelineRange[],
  viewStartMin: number,
  viewEndMin: number,
  tuning: Partial<TimelineTuning> = {},
): TimelineLayout {
  const t: TimelineTuning = { ...DEFAULT_TIMELINE_TUNING, ...tuning };
  const viewStart = Math.min(viewStartMin, viewEndMin);
  const viewEnd = Math.max(viewStartMin, viewEndMin);

  // ビューに重なる区間だけを、ビュー内に切り詰めて使う
  const clamped = ranges
    .map((r) => ({
      start: Math.max(viewStart, Math.min(r.start_min, r.end_min)),
      end: Math.min(viewEnd, Math.max(r.start_min, r.end_min)),
    }))
    .filter((r) => r.end > r.start);

  if (clamped.length === 0) {
    // 1件も無い（作りたての）表は、まだ「無駄」と比べる相手が無いので圧縮しない —
    // 均等割りだった頃と同じ、押しやすい広さのキャンバスのまま出す
    const heightPx = Math.max(t.minGapPx, (viewEnd - viewStart) * t.busyPxPerMin);
    return layoutOf([{ startMin: viewStart, endMin: viewEnd, isEmpty: true, heightPx }], viewStart, viewEnd);
  }

  const breakpoints = Array.from(new Set([viewStart, viewEnd, ...clamped.flatMap((r) => [r.start, r.end])]))
    .sort((a, b) => a - b);

  const segments: TimelineSegment[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const start = breakpoints[i];
    const end = breakpoints[i + 1];
    const busy = clamped.some((r) => r.start < end && r.end > start);
    const dur = end - start;
    const heightPx = busy
      ? Math.max(t.minBusyPx, dur * t.busyPxPerMin)
      : Math.min(t.maxGapPx, Math.max(t.minGapPx, dur * t.gapPxPerMin));
    segments.push({ startMin: start, endMin: end, isEmpty: !busy, heightPx });
  }

  return layoutOf(segments, viewStart, viewEnd);
}
