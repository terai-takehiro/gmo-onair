// スケジュール表の「横串」(列をまたぐ項目) の置き場所の決め方。migration 280・2026-09-06。
import { describe, it, expect } from "vitest";
import { SPAN_ALL, isSpanItem, spanPlacement, spanLabel } from "../src/schedule/span";

describe("isSpanItem", () => {
  it("1 と 未設定 は横串ではない", () => {
    expect(isSpanItem(1)).toBe(false);
    expect(isSpanItem(null)).toBe(false);
    expect(isSpanItem(undefined)).toBe(false);
  });
  it("0（全列）と 2 以上は横串", () => {
    expect(isSpanItem(SPAN_ALL)).toBe(true);
    expect(isSpanItem(2)).toBe(true);
  });
});

describe("spanPlacement", () => {
  it("全列は列を足しても常に表の端から端まで", () => {
    expect(spanPlacement(SPAN_ALL, 2, 5)).toEqual({ startIndex: 0, count: 5 });
    expect(spanPlacement(SPAN_ALL, 0, 1)).toEqual({ startIndex: 0, count: 1 });
  });
  it("N 列は自分の列から右へ N 列", () => {
    expect(spanPlacement(3, 1, 5)).toEqual({ startIndex: 1, count: 3 });
  });
  it("右に列が足りなければ、ある所までに詰める（はみ出さない）", () => {
    expect(spanPlacement(4, 3, 5)).toEqual({ startIndex: 3, count: 2 });
  });
  it("1・未設定は自分の列だけ", () => {
    expect(spanPlacement(1, 2, 5)).toEqual({ startIndex: 2, count: 1 });
    expect(spanPlacement(undefined, 2, 5)).toEqual({ startIndex: 2, count: 1 });
  });
  it("列が無い・列が見つからないときは null（描かない）", () => {
    expect(spanPlacement(1, 0, 0)).toBeNull();
    expect(spanPlacement(2, -1, 3)).toBeNull();
    expect(spanPlacement(2, 3, 3)).toBeNull();
  });
});

describe("spanLabel", () => {
  it("表示用の短い文言", () => {
    expect(spanLabel(SPAN_ALL)).toBe("全列");
    expect(spanLabel(1)).toBe("この列だけ");
    expect(spanLabel(3)).toBe("3列");
  });
});
