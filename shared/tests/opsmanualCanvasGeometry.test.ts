// 運営マニュアルのキャンバス（ManualCanvas）が使う座標変換の純粋関数を固定する。
//
// 何が起きていたか（レビュー指摘）:
//   `manualCanvasGeometry.ts` は「スナップ・8方向リサイズ・回転・整列・等間隔・重ね順」
//   という、画面を見ても間違いに気づけない座標計算だけを行う純粋関数の集まりなのに、
//   段A・段Bを通じてテストが1件も無かった。実際、レビューで見つかった最重要のバグ
//   （ページ切替後に Ctrl+Z が別ページのブロックを上書きする）も、2〜3行のテストで
//   容易に検出できた類のもの（この不具合自体は `ManualCanvas` に `key={ページID}` を
//   渡して切替のたびに再マウントする形で直した — React のライフサイクルに依存する
//   修正のため、DOM 描画を伴わないこのテストファイルでは検証しない。
//   `shared/CLAUDE.md`「画面を見ても間違いに気づけない計算だけを固定する」の方針どおり、
//   ここではキャンバスの計算だけを見る）。
import { describe, it, expect } from 'vitest';
import {
  alignBlocks,
  angleFromCenter,
  applyResize,
  beginResize,
  clamp,
  collectSnapTargets,
  distributeBlocks,
  normalizeAngle,
  reorderZ,
  rectsIntersect,
  snapPosition,
} from '../../client-techops/src/pages/opsmanual/manualCanvasGeometry';

describe('clamp', () => {
  it('範囲内はそのまま、範囲外は境界に丸める', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('max < min のときは min を返す（呼び出し側の丸め誤差で逆転しても暴走しない）', () => {
    expect(clamp(5, 10, 0)).toBe(10);
  });
});

describe('rectsIntersect（マーキー選択の当たり判定）', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };

  it('重なっていれば true', () => {
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('離れていれば false', () => {
    expect(rectsIntersect(a, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
  });

  it('辺がぴったり接するだけ（重ね順無し）は false', () => {
    expect(rectsIntersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('alignBlocks（整列。production-manual.md §6-2「複数選択」）', () => {
  const blocks = [
    { id: 'a', x: 0, y: 0, w: 10, h: 10 },
    { id: 'b', x: 50, y: 20, w: 20, h: 5 },
    { id: 'c', x: 100, y: 5, w: 5, h: 30 },
  ];

  it('1個以下の選択では何もしない（同じ配列を返す）', () => {
    expect(alignBlocks(blocks, ['a'], 'left')).toBe(blocks);
  });

  it('left: 選択の外接矩形の左端にそろえる', () => {
    const next = alignBlocks(blocks, ['a', 'b', 'c'], 'left');
    expect(next.map((b) => b.x)).toEqual([0, 0, 0]);
  });

  it('right: 選択の外接矩形の右端にそろえる', () => {
    const next = alignBlocks(blocks, ['a', 'b', 'c'], 'right');
    // 外接矩形の右端 = max(0+10, 50+20, 100+5) = 105
    expect(next.map((b) => b.x + b.w)).toEqual([105, 105, 105]);
  });

  it('h-center: 選択の外接矩形の左右中央にそろえる', () => {
    const next = alignBlocks(blocks, ['a', 'b', 'c'], 'h-center');
    const centers = next.map((b) => b.x + b.w / 2);
    expect(centers[0]).toBeCloseTo(52.5);
    expect(centers[1]).toBeCloseTo(52.5);
    expect(centers[2]).toBeCloseTo(52.5);
  });

  it('top/bottom/v-middle は縦方向で同じことをする', () => {
    expect(alignBlocks(blocks, ['a', 'b', 'c'], 'top').map((b) => b.y)).toEqual([0, 0, 0]);
    const bottoms = alignBlocks(blocks, ['a', 'b', 'c'], 'bottom').map((b) => b.y + b.h);
    expect(bottoms).toEqual([35, 35, 35]); // max(0+10,20+5,5+30) = 35
  });

  it('選ばれていないブロックは触らない', () => {
    const withExtra = [...blocks, { id: 'untouched', x: 9, y: 9, w: 1, h: 1 }];
    const next = alignBlocks(withExtra, ['a', 'b', 'c'], 'left');
    expect(next.find((b) => b.id === 'untouched')).toEqual({ id: 'untouched', x: 9, y: 9, w: 1, h: 1 });
  });
});

describe('distributeBlocks（等間隔。両端は動かさない）', () => {
  it('2個以下の選択では何もしない（同じ配列を返す）', () => {
    const blocks = [
      { id: 'a', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', x: 15, y: 0, w: 5, h: 10 },
    ];
    expect(distributeBlocks(blocks, ['a', 'b'], 'horizontal')).toBe(blocks);
  });

  it('horizontal: 辺と辺のすき間を等しくし、両端は動かさない', () => {
    const blocks = [
      { id: 'a', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', x: 15, y: 0, w: 5, h: 10 },
      { id: 'c', x: 50, y: 0, w: 10, h: 10 },
    ];
    const next = distributeBlocks(blocks, ['a', 'b', 'c'], 'horizontal');
    const byId = Object.fromEntries(next.map((b) => [b.id, b]));
    expect(byId.a.x).toBe(0); // 先頭は不変
    expect(byId.c.x).toBe(50); // 末尾は不変
    expect(byId.b.x).toBeCloseTo(27.5); // gap = (60-25)/2 = 17.5 → a右端10+17.5=27.5
    // すき間が等しいことを直接確かめる
    const gap1 = byId.b.x - (byId.a.x + byId.a.w);
    const gap2 = byId.c.x - (byId.b.x + byId.b.w);
    expect(gap1).toBeCloseTo(gap2);
  });

  it('vertical でも同じ計算をする', () => {
    const blocks = [
      { id: 'a', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', x: 0, y: 15, w: 10, h: 5 },
      { id: 'c', x: 0, y: 50, w: 10, h: 10 },
    ];
    const next = distributeBlocks(blocks, ['a', 'b', 'c'], 'vertical');
    const byId = Object.fromEntries(next.map((b) => [b.id, b]));
    expect(byId.a.y).toBe(0);
    expect(byId.c.y).toBe(50);
    expect(byId.b.y).toBeCloseTo(27.5);
  });
});

describe('reorderZ（重ね順: 最前面/最背面。相対順は保つ）', () => {
  const blocks = [
    { id: 'a', z: 0 },
    { id: 'b', z: 1 },
    { id: 'c', z: 2 },
    { id: 'd', z: 3 },
  ];

  it('front: 選んだものをまとめて最前面へ', () => {
    const next = reorderZ(blocks, ['a', 'c'], 'front');
    const byId = Object.fromEntries(next.map((b) => [b.id, b.z]));
    // 選ばれなかった b, d が先頭に来て、選んだ a, c が最後（相対順 a→c は維持）
    expect(byId.b).toBeLessThan(byId.d);
    expect(byId.d).toBeLessThan(byId.a);
    expect(byId.a).toBeLessThan(byId.c);
  });

  it('back: 選んだものをまとめて最背面へ', () => {
    const next = reorderZ(blocks, ['b'], 'back');
    const byId = Object.fromEntries(next.map((b) => [b.id, b.z]));
    expect(byId.b).toBe(0);
    expect(byId.a).toBe(1);
    expect(byId.c).toBe(2);
    expect(byId.d).toBe(3);
  });

  it('選択が空なら何もしない', () => {
    expect(reorderZ(blocks, [], 'front')).toBe(blocks);
  });
});

describe('collectSnapTargets / snapPosition（スナップ）', () => {
  it('キャンバス中心・版面の余白・他ブロックの端に吸着する', () => {
    const others = [{ id: 'other', x: 40, y: 20, w: 10, h: 6 }];
    const targets = collectSnapTargets(others, 'self');
    // 動かしている本人のブロック(x=41,y=19)は other の端(40,20)に極めて近い
    const result = snapPosition(41, 19, 10, 6, targets, 2);
    expect(result.x).toBe(40);
    expect(result.y).toBe(20);
    expect(result.guideX).toBe(40);
    expect(result.guideY).toBe(20);
  });

  it('しきい値より遠ければ吸着しない', () => {
    const targets = collectSnapTargets([], 'self');
    const result = snapPosition(70, 70, 10, 10, targets, 2);
    expect(result.x).toBe(70);
    expect(result.y).toBe(70);
    expect(result.guideX).toBeNull();
    expect(result.guideY).toBeNull();
  });

  it('自分自身（excludeId）はスナップ先から除く', () => {
    const self = [{ id: 'self', x: 41, y: 19, w: 10, h: 6 }];
    const targets = collectSnapTargets(self, 'self');
    // 自分の端 40/47/50 が候補に入っていないこと（版面・中心にも掛からない位置で確認）
    expect(targets.vertical).not.toContain(41);
    expect(targets.vertical).not.toContain(51);
  });
});

describe('angleFromCenter / normalizeAngle（回転）', () => {
  it('真上を指すと 0°（上向き=0°の約束）', () => {
    expect(angleFromCenter({ x: 100, y: 100 }, 100, 50)).toBeCloseTo(0);
  });

  it('真右を指すと 90°（時計回り）', () => {
    expect(angleFromCenter({ x: 100, y: 100 }, 150, 100)).toBeCloseTo(90);
  });

  it('真下を指すと 180°', () => {
    expect(angleFromCenter({ x: 100, y: 100 }, 100, 150)).toBeCloseTo(180);
  });

  it('normalizeAngle は 0〜360 の範囲に丸める', () => {
    expect(normalizeAngle(-30)).toBeCloseTo(330);
    expect(normalizeAngle(370)).toBeCloseTo(10);
    expect(normalizeAngle(360)).toBeCloseTo(0);
  });
});

describe('applyResize（8方向リサイズ・回転を考慮）', () => {
  const block = { x: 10, y: 10, w: 20, h: 10, rotation: 0 };

  it('se（角）を右に5mm伸ばすと、幅だけ伸びて左上は動かない', () => {
    const start = beginResize('se', block);
    const r = applyResize(start, 5, 0);
    expect(r).toEqual({ x: 10, y: 10, w: 25, h: 10 });
  });

  it('e（辺）を右に5mm伸ばすと、幅だけ伸びて高さ・上端は変わらない', () => {
    const start = beginResize('e', block);
    const r = applyResize(start, 5, 0);
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(10);
    expect(r.w).toBeCloseTo(25);
    expect(r.h).toBeCloseTo(10);
  });

  it('最小サイズ（MIN_BLOCK_MM）より小さくは縮まない', () => {
    const start = beginResize('se', block);
    const r = applyResize(start, -100, -100);
    expect(r.w).toBeGreaterThanOrEqual(5);
    expect(r.h).toBeGreaterThanOrEqual(5);
  });

  describe('Shift で縦横比を保つ（aspectLock。production-manual.md §6-2「角・辺のつまみ」）', () => {
    it('角のつまみ: 動かした量が大きい側の軸に合わせて拡縮し、比率を保つ', () => {
      const start = beginResize('se', block); // origW/origH = 2
      const r = applyResize(start, 5, 0, undefined, true);
      expect(r.w / r.h).toBeCloseTo(2);
      expect(r.w).toBeCloseTo(25);
      expect(r.h).toBeCloseTo(12.5);
      // アンカー（左上）は動かない
      expect(r.x).toBeCloseTo(10);
      expect(r.y).toBeCloseTo(10);
    });

    it('辺のつまみ: 片方の軸しか掴んでいなくても、もう一方をアンカー中心のまま連動させる', () => {
      const start = beginResize('e', block); // アンカーは左端・垂直中央(y=15)
      const r = applyResize(start, 5, 0, undefined, true);
      expect(r.w / r.h).toBeCloseTo(2);
      expect(r.w).toBeCloseTo(25);
      expect(r.h).toBeCloseTo(12.5);
      expect(r.x).toBeCloseTo(10); // 左端は不変
      // 垂直中央 (anchor.y = 15) を保ったまま高さが伸びる
      expect(r.y + r.h / 2).toBeCloseTo(15);
    });

    it('Shift を離すと（aspectLock=false）縦横比を保たない（回帰確認）', () => {
      const start = beginResize('se', block);
      const r = applyResize(start, 5, 0);
      expect(r.w / r.h).not.toBeCloseTo(2, 1);
    });
  });
});
