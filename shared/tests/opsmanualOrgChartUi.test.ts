// 運営マニュアル — 体制図の「分岐（木構造）」を支える純粋関数 `descendantBoxIds` を固定する。
//
// 本体は client-techops 側（`client-techops/src/pages/opsmanual/blocks/orgchart/orgChartUi.ts`）に
// ある。shared/CLAUDE.md「テスト」の考え方（画面を見ても間違いに気づけない計算は、置き場所が
// どこであれ固定する）で、client-techops にテストの置き場所が無いためここに置く
// （前例は `opsmanualOrgChartSeed.test.ts`）。
//
// ここが押さえるのは1つ（外部レビュー指摘・P1）: 階層の並べ替えで「元は子だった箱」が
// 「手前の階層の箱」として親候補に出てしまい、選ぶと循環ができて両方の箱がキャンバスから
// 消える。`OrgChartBlockContent.tsx` の `parentOptionsOf` はこの関数で自分の子孫を除いて防ぐ。
import { describe, expect, it } from 'vitest';
import { descendantBoxIds } from '../../client-techops/src/pages/opsmanual/blocks/orgchart/orgChartUi';
import type { ManualOrgBox } from '../src/opsmanual/types';

function box(id: string, parentId?: string | null): Pick<ManualOrgBox, 'id' | 'parentId'> {
  return { id, parentId };
}

describe('descendantBoxIds — 体制図の分岐の循環防止（外部レビュー・P1）', () => {
  it('直接の子を含む', () => {
    const boxes = [box('a'), box('b', 'a')];
    expect(descendantBoxIds('a', boxes)).toEqual(new Set(['b']));
  });

  it('孫（子の子）も含む——手前の階層の候補から漏らさない', () => {
    const boxes = [box('a'), box('b', 'a'), box('c', 'b')];
    expect(descendantBoxIds('a', boxes)).toEqual(new Set(['b', 'c']));
  });

  it('子が無ければ空集合', () => {
    const boxes = [box('a'), box('b')];
    expect(descendantBoxIds('a', boxes)).toEqual(new Set());
  });

  it('関係の無い箱は含まない', () => {
    const boxes = [box('a'), box('b', 'a'), box('c')]; // c は独立
    expect(descendantBoxIds('a', boxes)).toEqual(new Set(['b']));
  });

  it('自分自身は含まない（自分は自分の子孫ではない）', () => {
    const boxes = [box('a'), box('b', 'a')];
    expect(descendantBoxIds('a', boxes).has('a')).toBe(false);
  });

  it('枝分かれ（複数の子）を両方とも数える', () => {
    const boxes = [box('a'), box('b', 'a'), box('c', 'a'), box('d', 'b')];
    expect(descendantBoxIds('a', boxes)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('既にデータが循環していても無限ループにならない（防御的）', () => {
    const boxes = [box('a', 'b'), box('b', 'a')]; // a↔b の循環
    expect(descendantBoxIds('a', boxes)).toEqual(new Set(['b', 'a']));
  });

  it('この集合を親候補から除くと、子を親の親として選べなくなる（実際の使い方の確認）', () => {
    // a（親）→ b（子）という関係がある状態で、階層の並べ替えにより b が a より
    // 手前の階層になったとする。b はまだ a の子（a.parentId は未設定・b.parentId='a'）。
    // a の親候補を作るとき、この関数で b（＝a の子孫）を除けば、a が b を親として
    // 選んで循環になることはない。
    const boxes = [box('a'), box('b', 'a')];
    const excludedForA = descendantBoxIds('a', boxes);
    const candidatesForA = boxes.filter((x) => x.id !== 'a' && !excludedForA.has(x.id));
    expect(candidatesForA.map((x) => x.id)).toEqual([]);
  });
});
