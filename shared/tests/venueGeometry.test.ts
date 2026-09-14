// 会場図面（新ミニアプリ）の縮尺変換・当たり判定を固定する。
// 方針: `shared/CLAUDE.md`「画面を見ても間違いに気づけない計算だけを固定する」。
// 2軸の縮尺変換（X と Y で別の px/mm）が正しいかは、画面を見ても気づけない典型例
// （§8-2: 用賀の図面は X:63.199 / Y:60.577 mm/pt の異方性がある）。
import { describe, it, expect } from 'vitest';
import {
  computeAutoScale,
  computeBBox,
  isItemOverflowing,
  itemFootprintSize,
  mmToUnderlayPx,
  underlayPxToMm,
  fromTopLeftRect,
  toTopLeftRect,
  collectVenueSnapTargets,
  SCALE_STEPS,
} from '../src/venue/geometry';
import type { VenueFixture, VenueItem, VenueUnderlay } from '../src/venue/types';

const underlay: VenueUnderlay = {
  file: 'test.png',
  originMm: { x: 100, y: 200 },
  pxPerMmX: 2,
  pxPerMmY: 3,
  widthPx: 1000,
  heightPx: 1000,
};

describe('mmToUnderlayPx / underlayPxToMm（2軸の縮尺変換）', () => {
  it('X と Y で別の倍率を使う', () => {
    expect(mmToUnderlayPx({ x: 200, y: 300 }, underlay)).toEqual({ x: 200, y: 300 });
    // (200-100)*2=200, (300-200)*3=300
  });

  it('往復して元に戻る', () => {
    const mm = { x: 543.2, y: 987.6 };
    const px = mmToUnderlayPx(mm, underlay);
    const back = underlayPxToMm(px, underlay);
    expect(back.x).toBeCloseTo(mm.x, 6);
    expect(back.y).toBeCloseTo(mm.y, 6);
  });
});

describe('itemFootprintSize', () => {
  it('矩形は w/d をそのまま返す', () => {
    expect(itemFootprintSize({ id: '1', kind: 'shape', x: 0, y: 0, rotation: 0, z: 0, w: 500, d: 300 })).toEqual({
      w: 500,
      d: 300,
      shape: 'rect',
    });
  });

  it('円は diameter を w=d として返す', () => {
    expect(itemFootprintSize({ id: '1', kind: 'shape', x: 0, y: 0, rotation: 0, z: 0, diameter: 600 })).toEqual({
      w: 600,
      d: 600,
      shape: 'circle',
    });
  });

  it('points があれば外接矩形を返す（line/dimension）', () => {
    const size = itemFootprintSize({
      id: '1',
      kind: 'line',
      x: 0,
      y: 0,
      rotation: 0,
      z: 0,
      points: [
        [0, 0],
        [400, 100],
      ],
    });
    expect(size).toEqual({ w: 400, d: 100, shape: 'line' });
  });

  it('何も無ければ 1x1 の点として返す', () => {
    expect(itemFootprintSize({ id: '1', kind: 'text', x: 0, y: 0, rotation: 0, z: 0 })).toEqual({
      w: 1,
      d: 1,
      shape: 'point',
    });
  });
});

describe('toTopLeftRect / fromTopLeftRect（中心座標 ⇔ 左上座標のアダプタ）', () => {
  it('中心 x/y を左上基準に変換する', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 1000, y: 500, rotation: 0, z: 0, w: 200, d: 100 };
    expect(toTopLeftRect(item)).toEqual({ id: 'a', x: 900, y: 450, w: 200, h: 100 });
  });

  it('往復すると元の中心座標に戻る', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 1000, y: 500, rotation: 0, z: 0, w: 200, d: 100 };
    const rect = toTopLeftRect(item);
    const back = fromTopLeftRect(item, rect);
    expect(back.x).toBe(1000);
    expect(back.y).toBe(500);
  });

  it('リサイズ結果（w/h が変わった rect）を反映する', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 1000, y: 500, rotation: 0, z: 0, w: 200, d: 100 };
    const resized = fromTopLeftRect(item, { x: 900, y: 450, w: 400, h: 100 });
    expect(resized.w).toBe(400);
    expect(resized.x).toBe(1100); // 900 + 400/2
  });

  it('円（diameter）は w だけを直径として書き戻す', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 100, y: 100, rotation: 0, z: 0, diameter: 200 };
    const rect = toTopLeftRect(item);
    const resized = fromTopLeftRect(item, { ...rect, w: 300, h: 300 });
    expect(resized.diameter).toBe(300);
  });

  it('points を持つ品目は座標をまとめて平行移動・拡縮する', () => {
    const item: VenueItem = {
      id: 'a',
      kind: 'line',
      x: 0,
      y: 0,
      rotation: 0,
      z: 0,
      points: [
        [0, 0],
        [400, 100],
      ],
    };
    const rect = toTopLeftRect(item);
    const moved = fromTopLeftRect(item, { ...rect, x: rect.x + 50, y: rect.y + 20 });
    expect(moved.points).toEqual([
      [50, 20],
      [450, 120],
    ]);
  });
});

describe('collectVenueSnapTargets', () => {
  it('壁（エリアの bbox の辺と中心）を含む', () => {
    const targets = collectVenueSnapTargets([], [], { x: 0, y: 0, w: 1000, h: 2000 }, { x: [], y: [] }, false);
    expect(targets.vertical).toEqual(expect.arrayContaining([0, 500, 1000]));
    expect(targets.horizontal).toEqual(expect.arrayContaining([0, 1000, 2000]));
  });

  it('通り芯を含む', () => {
    const targets = collectVenueSnapTargets([], [], { x: 0, y: 0, w: 1000, h: 1000 }, { x: [300], y: [700] }, false);
    expect(targets.vertical).toContain(300);
    expect(targets.horizontal).toContain(700);
  });

  it('自分以外の品目の端と中心を含み、除外リストは無視する', () => {
    const other: VenueItem = { id: 'b', kind: 'shape', x: 500, y: 500, rotation: 0, z: 0, w: 100, d: 100 };
    const excluded: VenueItem = { id: 'c', kind: 'shape', x: 900, y: 900, rotation: 0, z: 0, w: 100, d: 100 };
    const targets = collectVenueSnapTargets([other, excluded], ['c'], { x: 0, y: 0, w: 2000, h: 2000 }, { x: [], y: [] }, false);
    expect(targets.vertical).toEqual(expect.arrayContaining([450, 500, 550]));
    expect(targets.vertical).not.toContain(850);
  });

  it('gridOn のとき 1m グリッドを足す', () => {
    const targets = collectVenueSnapTargets([], [], { x: 0, y: 0, w: 2500, h: 1000 }, { x: [], y: [] }, true);
    expect(targets.vertical).toEqual(expect.arrayContaining([0, 1000, 2000, 3000]));
  });
});

describe('isItemOverflowing（§4-5）', () => {
  const area = { polygonMm: [] as [number, number][], bboxMm: { x: 0, y: 0, w: 1000, h: 1000 } };

  it('エリア内に収まっていれば false', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 500, y: 500, rotation: 0, z: 0, w: 100, d: 100 };
    expect(isItemOverflowing(item, area, [])).toBe(false);
  });

  it('エリアの外に出ていれば true', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 980, y: 500, rotation: 0, z: 0, w: 100, d: 100 };
    expect(isItemOverflowing(item, area, [])).toBe(true);
  });

  it('固定物に重なっていれば true（エリア内でも）', () => {
    const item: VenueItem = { id: 'a', kind: 'shape', x: 500, y: 500, rotation: 0, z: 0, w: 100, d: 100 };
    const fixtures: VenueFixture[] = [
      { key: 'truss-1', floor: 'f1', label: 'トラス', kind: 'truss', bboxMm: { x: 480, y: 480, w: 50, h: 50 } },
    ];
    expect(isItemOverflowing(item, area, fixtures)).toBe(true);
  });

  it('多角形が与えられていれば bbox より優先する', () => {
    const polyArea = {
      polygonMm: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ] as [number, number][],
      bboxMm: { x: 0, y: 0, w: 1000, h: 1000 },
    };
    const item: VenueItem = { id: 'a', kind: 'shape', x: 500, y: 500, rotation: 0, z: 0, w: 10, d: 10 };
    expect(isItemOverflowing(item, polyArea, [])).toBe(true);
  });
});

describe('computeAutoScale（§9-1: 幅と高さの両方が収まる最大の切りのよい縮尺）', () => {
  it('幅も高さも収まる最初の段を選ぶ', () => {
    expect(computeAutoScale(5000, 3000, 100, 60)).toBe(50);
  });

  it('幅だけでなく高さも見る（幅は収まるが高さが収まらない段は飛ばす）', () => {
    // 1:50 だと幅100は収まるが高さ 8000/50=160 は収まらない → 1:100 (幅50/高さ80) も収まらない場合がある例
    const scale = computeAutoScale(4000, 8000, 100, 100);
    // 4000/100=40<=100, 8000/100=80<=100 → 1:100 なら両方収まる。1:75 は 4000/75=53.3<=100, 8000/75=106.7>100 なのでNG
    expect(scale).toBe(100);
  });

  it('どの段でも収まらなければ最大の段を返す', () => {
    expect(computeAutoScale(1_000_000, 1_000_000, 100, 100)).toBe(SCALE_STEPS[SCALE_STEPS.length - 1]);
  });
});

describe('computeBBox', () => {
  it('空配列は null', () => {
    expect(computeBBox([])).toBeNull();
  });

  it('複数品目の外接矩形を出す', () => {
    const items: VenueItem[] = [
      { id: 'a', kind: 'shape', x: 100, y: 100, rotation: 0, z: 0, w: 100, d: 100 },
      { id: 'b', kind: 'shape', x: 500, y: 300, rotation: 0, z: 0, w: 100, d: 100 },
    ];
    expect(computeBBox(items)).toEqual({ x: 50, y: 50, w: 500, h: 300 });
  });
});
