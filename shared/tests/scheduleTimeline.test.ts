// shared/src/schedule/timeline.ts の固定テスト。
// スケジュール表 PC グリッドの「区切りごとに高さを変える」縦軸計算。
import { describe, it, expect } from "vitest";
import { buildTimeline, DEFAULT_TIMELINE_TUNING } from "../src/schedule/timeline";

describe("buildTimeline", () => {
  it("項目が1件も無いときは圧縮しない（作りたての表で押しやすい広さを残す）", () => {
    const layout = buildTimeline([], 480, 1440); // 08:00-24:00（丸1日ぶん・960分）
    expect(layout.segments).toHaveLength(1);
    expect(layout.segments[0].isEmpty).toBe(true);
    // 圧縮しない＝上限(150px)より広く、busyPxPerMin ベースの高さになる
    expect(layout.totalHeightPx).toBeCloseTo(960 * DEFAULT_TIMELINE_TUNING.busyPxPerMin);
    expect(layout.totalHeightPx).toBeGreaterThan(DEFAULT_TIMELINE_TUNING.maxGapPx);
  });

  it("重なりの無い単独項目は、無関係な重なりに引きずられず本来の長さで描かれる", () => {
    // 9:00-9:30 に3件重なる瞬間があり、14:00-14:30 は誰とも重ならない単独項目
    const ranges = [
      { start_min: 540, end_min: 570 },
      { start_min: 540, end_min: 570 },
      { start_min: 540, end_min: 570 },
      { start_min: 840, end_min: 870 },
    ];
    const layout = buildTimeline(ranges, 480, 1440); // 08:00-24:00
    const busySegs = layout.segments.filter((s) => !s.isEmpty);
    // 9:00-9:30 の重なり区間と 14:00-14:30 の単独区間、2つの「項目がある区間」に分かれる
    expect(busySegs).toHaveLength(2);
    const morning = busySegs.find((s) => s.startMin === 540)!;
    const afternoon = busySegs.find((s) => s.startMin === 840)!;
    // どちらも「30分ぶんの高さ」で同じ（重なりの有無で高さが変わらない）
    expect(afternoon.heightPx).toBeCloseTo(morning.heightPx);
    expect(afternoon.heightPx).toBeCloseTo(30 * DEFAULT_TIMELINE_TUNING.busyPxPerMin);
  });

  it("何も無い区間は上限で頭打ちになる（無駄なスペースを作らない）", () => {
    const ranges = [
      { start_min: 540, end_min: 570 }, // 9:00-9:30
      { start_min: 1200, end_min: 1230 }, // 20:00-20:30（10時間以上あとの単独項目）
    ];
    const layout = buildTimeline(ranges, 480, 1440);
    const gap = layout.segments.find((s) => s.isEmpty && s.startMin === 570)!;
    expect(gap.heightPx).toBeLessThanOrEqual(DEFAULT_TIMELINE_TUNING.maxGapPx);
    expect(gap.heightPx).toBe(DEFAULT_TIMELINE_TUNING.maxGapPx);
  });

  it("短い空きは上限より小さく、長い空きとの差が付く", () => {
    const ranges = [
      { start_min: 540, end_min: 570 }, // 9:00-9:30
      { start_min: 575, end_min: 600 }, // 9:35-10:00（5分だけ空く）
      { start_min: 900, end_min: 930 }, // 15:00-15:30（かなり長く空く）
    ];
    const layout = buildTimeline(ranges, 480, 1440);
    const shortGap = layout.segments.find((s) => s.isEmpty && s.startMin === 570)!;
    const longGap = layout.segments.find((s) => s.isEmpty && s.startMin === 600)!;
    expect(shortGap.heightPx).toBeLessThan(longGap.heightPx);
    expect(longGap.heightPx).toBe(DEFAULT_TIMELINE_TUNING.maxGapPx);
  });

  it("yOf は単調増加で、区間の境目でつながる（重ならない・隙間が空かない）", () => {
    const ranges = [
      { start_min: 540, end_min: 570 },
      { start_min: 900, end_min: 930 },
    ];
    const layout = buildTimeline(ranges, 480, 1440);
    let prevY = -Infinity;
    for (let m = 480; m <= 1440; m += 5) {
      const y = layout.yOf(m);
      expect(y).toBeGreaterThanOrEqual(prevY);
      prevY = y;
    }
    expect(layout.yOf(480)).toBe(0);
    expect(layout.yOf(1440)).toBeCloseTo(layout.totalHeightPx);
  });

  it("minOf は yOf の逆関数になっている（クリック位置→時刻の往復）", () => {
    const ranges = [
      { start_min: 540, end_min: 570 },
      { start_min: 900, end_min: 930 },
    ];
    const layout = buildTimeline(ranges, 480, 1440);
    for (const m of [480, 500, 555, 700, 915, 1440]) {
      const y = layout.yOf(m);
      expect(layout.minOf(y)).toBeCloseTo(m, 0);
    }
  });

  it("ビュー範囲外の項目は無視し、範囲外へはみ出す項目はビュー内に切り詰める", () => {
    const ranges = [
      { start_min: 0, end_min: 60 }, // ビューより前（無視される）
      { start_min: 450, end_min: 600 }, // ビュー開始(480)より前から始まり、ビュー内へ食い込む
      { start_min: 1500, end_min: 1600 }, // ビューより後（無視される）
    ];
    const layout = buildTimeline(ranges, 480, 1440);
    expect(layout.segments[0].startMin).toBe(480);
    expect(layout.segments[layout.segments.length - 1].endMin).toBe(1440);
    // 480-600 が「項目がある区間」として残っていること
    const busy = layout.segments.find((s) => !s.isEmpty && s.startMin === 480);
    expect(busy).toBeDefined();
    expect(busy!.endMin).toBe(600);
  });
});
