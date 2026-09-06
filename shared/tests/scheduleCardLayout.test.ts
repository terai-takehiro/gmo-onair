/**
 * スケジュール表 PC グリッドのカードの置き場所・重ね順・文字の高さ
 * （`client-techops/src/components/schedule/scheduleCardLayout.ts`）
 *
 * ── なぜ試験にするか ────────────────────────────────────────
 * 「かぶったら下（＝遅く始まる）のスケジュールが手前」「かぶった所に文字を出さない」は
 * 見た目の決めごとだが、**画面を見ても静かに壊れていることに気づけない**
 * （文字が少し隠れているだけに見える）。数として固定しておく。
 */
import { describe, it, expect } from "vitest";
import { layoutScheduleCards } from "../../client-techops/src/components/schedule/scheduleCardLayout";
import type { ScheduleColumn, ScheduleItem } from "../src/schedule/types";

// 1分 = 1px の素直な縦軸（本物は `buildTimeline` の非線形なものだが、ここでは位置の計算だけ見る）
const minToY = (min: number) => min;

const col = (id: string, sort: number, width = 100): ScheduleColumn => ({
  id, schedule_id: "s", col_group: "venue", label: id, room_id: null, color: null,
  width_px: width, sort_order: sort, source_template_id: null, source_template_col_id: null,
  updated_at: "2026-09-06T00:00:00Z",
});

const item = (id: string, columnId: string, startMin: number, endMin: number, spanCols = 1): ScheduleItem => ({
  id, schedule_id: "s", column_id: columnId, title: id, kind: "other",
  start_min: startMin, end_min: endMin, span_cols: spanCols, assignee: null, note: null,
  qsheet_document_id: null, link_broken: false, source_template_id: null, source_template_item_id: null,
  updated_at: "2026-09-06T00:00:00Z",
});

const columns = [col("a", 1), col("b", 2), col("c", 3)];
const byId = (cards: ReturnType<typeof layoutScheduleCards>) =>
  new Map(cards.map((c) => [c.item.id, c]));

describe("layoutScheduleCards — 置き場所", () => {
  it("同じ列で重なる項目は横に割る（幅は列の半分ずつ）", () => {
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("x", "a", 540, 600), item("y", "a", 570, 630)],
    }));
    expect(cards.get("x")!.left).toBe(0);
    expect(cards.get("y")!.left).toBe(50);
    expect(cards.get("x")!.width).toBe(48); // 50 - 隙間2
  });

  it("横串は掛かる列の幅いっぱい。全列は表の端から端まで", () => {
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("all", "b", 720, 780, 0), item("two", "a", 800, 820, 2)],
    }));
    expect(cards.get("all")!.left).toBe(0);
    expect(cards.get("all")!.width).toBe(298); // 100*3 - 隙間2
    expect(cards.get("two")!.left).toBe(0);
    expect(cards.get("two")!.width).toBe(198); // a + b
  });

  it("横串どうしが重なったら、幅は保ったまま高さを分け合う（横に細くしない）", () => {
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("m1", "a", 600, 660, 0), item("m2", "a", 620, 680, 0)],
    }));
    expect(cards.get("m1")!.width).toBe(298);
    expect(cards.get("m2")!.width).toBe(298);
    expect(cards.get("m1")!.top).toBe(600);
    expect(cards.get("m2")!.top).toBe(620 + 30); // 自分の帯の下半分
  });
});

describe("layoutScheduleCards — 重ね順（遅く始まるカードが手前）", () => {
  it("配列は奥から手前の順（＝開始時刻の順）に並ぶ", () => {
    const cards = layoutScheduleCards({
      columns, minToY,
      items: [item("late", "a", 700, 760), item("early", "b", 540, 600), item("mid", "c", 600, 660)],
    });
    expect(cards.map((c) => c.item.id)).toEqual(["early", "mid", "late"]);
  });

  it("同時刻に始まるなら、長いほうが奥・短いほうが手前", () => {
    const cards = layoutScheduleCards({
      columns, minToY, items: [item("short", "a", 540, 560), item("long", "b", 540, 700)],
    });
    expect(cards.map((c) => c.item.id)).toEqual(["long", "short"]);
  });

  it("ドラッグ中の1枚はいつでもいちばん手前", () => {
    const cards = layoutScheduleCards({
      columns, minToY, draggingItemId: "early",
      items: [item("early", "a", 540, 600), item("late", "b", 700, 760)],
    });
    expect(cards[cards.length - 1].item.id).toBe("early");
  });
});

describe("layoutScheduleCards — かぶった所に文字を出さない", () => {
  it("重なっていなければ、カードの高さいっぱいまで文字を出せる", () => {
    const cards = byId(layoutScheduleCards({ columns, minToY, items: [item("x", "a", 540, 600)] }));
    expect(cards.get("x")!.textMaxHeight).toBe(60);
  });

  it("手前に重なるカードの上端までしか文字を出さない", () => {
    // 全列の横串（12:00-13:00）の上に、12:30 から始まる列の項目が重なる
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("band", "a", 720, 780, 0), item("later", "b", 750, 800)],
    }));
    expect(cards.get("band")!.textMaxHeight).toBe(30); // 750 - 720
    expect(cards.get("later")!.textMaxHeight).toBe(50); // 手前なので切られない
  });

  it("重なっても掛かっていない列の項目なら切らない", () => {
    // 横串は a・b の2列ぶん。c 列の項目とは横に重ならない
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("band", "a", 720, 780, 2), item("elsewhere", "c", 730, 800)],
    }));
    expect(cards.get("band")!.textMaxHeight).toBe(60);
  });

  it("同じ高さから始まって覆われるなら、文字は1文字も出さない", () => {
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("band", "a", 720, 800, 0), item("same", "b", 720, 760)],
    }));
    expect(cards.get("band")!.textMaxHeight).toBe(0);
    expect(cards.get("same")!.textMaxHeight).toBe(40);
  });

  it("空きが 14px 未満なら文字を出さない（読めない上に隠れる）", () => {
    const cards = byId(layoutScheduleCards({
      columns, minToY, items: [item("band", "a", 720, 800, 0), item("soon", "b", 730, 760)],
    }));
    expect(cards.get("band")!.textMaxHeight).toBe(0); // 10px しか空いていない
  });
});
