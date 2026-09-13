// 会場図面（新ミニアプリ）の「一気に並べる」7つの並べ方（§7）を固定する。
// 見るのは脚数（保有数との差の判定に使う）と外接寸法（プレビューに出す数値）——
// どちらも画面を見ても間違いに気づけない計算（`shared/CLAUDE.md`）。
import { describe, it, expect } from 'vitest';
import {
  arrangeClassroom,
  arrangeGrid,
  arrangeIsland,
  arrangeOShape,
  arrangeRound,
  arrangeTheater,
  arrangeUShape,
  translateArrangeResult,
} from '../src/venue/arrange';

describe('arrangeGrid（格子に並べる）', () => {
  it('既定は行2×列2で、ピッチ未指定なら幅・奥行+50', () => {
    const result = arrangeGrid('rubeck-chair', 535, 490, {}, 'g1');
    expect(result.items).toHaveLength(4);
    expect(result.counts['rubeck-chair']).toBe(4);
    // 2列: 幅方向は (535+50) * 1 = 585 分の間隔 + 品目幅 = bbox.w
    expect(result.bbox.w).toBe(535 + (535 + 50));
    expect(result.bbox.h).toBe(490 + (490 + 50));
  });

  it('行×列とピッチを指定できる', () => {
    const result = arrangeGrid('rubeck-chair', 535, 490, { rows: 3, cols: 1, pitchYMm: 1000 }, 'g1');
    expect(result.items).toHaveLength(3);
    expect(result.bbox.h).toBe(490 + 1000 * 2);
  });

  it('全品目が同じ groupId を持つ', () => {
    const result = arrangeGrid('rubeck-chair', 535, 490, {}, 'g1');
    expect(result.items.every((it) => it.groupId === 'g1')).toBe(true);
  });
});

describe('arrangeTheater（劇場形式）', () => {
  it('既定 5行×10列で50脚', () => {
    const result = arrangeTheater({});
    expect(result.items).toHaveLength(50);
    expect(result.counts['rubeck-chair']).toBe(50);
  });

  it('行×列を変えると脚数が変わる', () => {
    const result = arrangeTheater({ rows: 2, cols: 4 });
    expect(result.items).toHaveLength(8);
  });

  it('中央通路の分だけ横幅が広がる', () => {
    const narrow = arrangeTheater({ rows: 1, cols: 2, centerAisleMm: 0 });
    const wide = arrangeTheater({ rows: 1, cols: 2, centerAisleMm: 1200 });
    expect(wide.bbox.w - narrow.bbox.w).toBe(1200);
  });
});

describe('arrangeClassroom（スクール形式）', () => {
  it('既定 机3列×4行・机1台に椅子2脚で、机12台・椅子24脚', () => {
    const result = arrangeClassroom({});
    expect(result.counts['long-table-white']).toBe(12);
    expect(result.counts['rubeck-chair']).toBe(24);
  });

  it('chairsPerTable を変えると椅子の数が変わる', () => {
    const result = arrangeClassroom({ chairsPerTable: 3, tablesPerRow: 1, rows: 1 });
    expect(result.counts['long-table-white']).toBe(1);
    expect(result.counts['rubeck-chair']).toBe(3);
  });
});

describe('arrangeIsland（島形式）', () => {
  it('既定 4島・片側3脚で、机8台・椅子24脚', () => {
    const result = arrangeIsland({});
    expect(result.counts['long-table-white']).toBe(8);
    expect(result.counts['rubeck-chair']).toBe(24);
  });
});

describe('arrangeRound（円卓）', () => {
  it('既定 ハイテーブル1台・椅子4脚', () => {
    const result = arrangeRound({});
    expect(result.counts['high-table']).toBe(1);
    expect(result.counts['high-chair']).toBe(4);
  });

  it('椅子はテーブルを中心とした円周上に等間隔で並ぶ', () => {
    const result = arrangeRound({ chairs: 4, radiusMm: 550 });
    const table = result.items.find((it) => it.key === 'high-table')!;
    const chairs = result.items.filter((it) => it.key === 'high-chair');
    for (const chair of chairs) {
      const dist = Math.hypot(chair.x - table.x, chair.y - table.y);
      expect(dist).toBeCloseTo(550, 6);
    }
  });
});

describe('arrangeUShape / arrangeOShape（コの字・ロの字）', () => {
  it('ロの字はコの字より手前辺の机・椅子ぶんだけ品目が多い（閉じる）', () => {
    const u = arrangeUShape({ widthTables: 3, depthTables: 2 });
    const o = arrangeOShape({ widthTables: 3, depthTables: 2 });
    expect(o.items.length).toBeGreaterThan(u.items.length);
    expect(o.counts['long-table-white']).toBe((u.counts['long-table-white'] ?? 0) + 3);
  });

  it('机・椅子だけで構成される', () => {
    const result = arrangeUShape({});
    const keys = new Set(result.items.map((it) => it.key));
    expect(keys).toEqual(new Set(['long-table-white', 'rubeck-chair']));
  });
});

describe('translateArrangeResult', () => {
  it('全品目を同じだけ平行移動する', () => {
    const result = arrangeGrid('rubeck-chair', 535, 490, { rows: 1, cols: 2 }, 'g1');
    const moved = translateArrangeResult(result, 1000, 2000);
    expect(moved.map((it) => it.x)).toEqual(result.items.map((it) => it.x + 1000));
    expect(moved.map((it) => it.y)).toEqual(result.items.map((it) => it.y + 2000));
  });
});
