/**
 * 機材台帳 — 「見えている行だけ描く」ための2つの算数を固定する
 *
 * ── なぜ固定するか ──────────────────────────────────────────
 *
 * この画面は機材 5,000 点で開くのに **30.7 秒**かかり、そのうち
 * **28.2 秒は画面が固まったまま**でした。原因は DB でもサーバーでもなく
 * （DB 42.3ms / API 136ms）、**3,800 行ぶんの DOM を作っていた時間**です
 * （要素 260,177 個）。そこで**画面に入る数十行だけ**を作るようにしました。
 *
 * ⚠️ **ここの間違いは、どれも画面を見ても分かりません**:
 *
 *  ① **空の箱の高さを1行ぶんでも間違えると、送った先に別の行が出ます。**
 *    行はちゃんと並んでいて、文字も欠けていないので「壊れている」とは
 *    見えません。**探している機材が出てこない**だけです
 *
 *  ② **隙間 (`gap`) を引き忘れると 1 枚あたり 8px ずつずれます。**
 *    スマホのカードは `gap-2` で並ぶので、3,800 枚なら **30,400px** —
 *    しかし1画面だけ見ると 8px なので、目では気づけません
 *
 *  ③ **Shift 押しの範囲は `items` の並びで数えます。** 平らにした配列の
 *    番号を渡すと、**付属品を開いているときだけ**違う範囲が選ばれます
 *
 *  ④ **罫線は今まで「引かれていなかった」。** 親の行を `<div>` で包んで
 *    いたので `last:border-b-0` が全部の親に効いていました（実ブラウザで
 *    `border-bottom-width` を測ると表頭だけ 1px・以降 0px）。
 *    包みを外すと**全行に線が出ます** — 速さの話のはずが見た目が変わります
 *
 * だから**反証（間違った書き方だと落ちること）を各項目に付けてあります**。
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_ROWS_TO_WINDOW, OVERSCAN, rowOffsets, rowWindow, varRowWindow,
} from '../../client-equipment/src/pages/equipmentList/useRowWindow';
import { flattenRows, type EquipmentRecord } from '../../client-equipment/src/pages/equipmentList/types';
import {
  RENTAL_CARD_H, RENTAL_KIDS_H, RENTAL_OPEN_BORDER_H, RENTAL_UNIT_H,
  rentalGroupHeight, rentalRowKey, type ModelGroup, type RentalUnit,
} from '../../client-equipment/src/pages/equipmentList/rentalTypes';

// ───────────────────────────────────────────────────────
// ① 描く範囲と、上下に置く空の箱の高さ
// ───────────────────────────────────────────────────────

/** PC の表（隙間なし・1行 41px） */
const table = (over: Partial<Parameters<typeof rowWindow>[0]> = {}) => rowWindow({
  scrollTop: 0, viewportH: 800, listTop: 0, pitch: 41, gap: 0, count: 3800, ...over,
});

/** スマホのカード（隙間 8px・カード 114px → 送り幅 122px） */
const cards = (over: Partial<Parameters<typeof rowWindow>[0]> = {}) => rowWindow({
  scrollTop: 0, viewportH: 800, listTop: 0, pitch: 122, gap: 8, count: 3800, ...over,
});

/**
 * 入れ物に並ぶ子の数から隙間の数を出す。
 * **箱も flex の子**なので、隙間は「子の数 − 1」（0 なら 0）。
 */
function gapCount(w: { start: number; end: number; padTop: number; padBottom: number }): number {
  const children = (w.end - w.start) + (w.padTop > 0 ? 1 : 0) + (w.padBottom > 0 ? 1 : 0);
  return Math.max(children - 1, 0);
}

/** 実際に積み上がる高さ（上の箱 ＋ 描いた行 ＋ 下の箱）。隙間ぶんも数える */
function stackedHeight(w: ReturnType<typeof rowWindow>, pitch: number, gap: number): number {
  return w.padTop + w.padBottom + (w.end - w.start) * (pitch - gap) + gapCount(w) * gap;
}

describe('rowWindow — 描く範囲', () => {
  it('少ない行は間引かない（Ctrl+F で当たらない行を作らない）', () => {
    const w = table({ count: MIN_ROWS_TO_WINDOW });
    expect(w).toEqual({ start: 0, end: MIN_ROWS_TO_WINDOW, padTop: 0, padBottom: 0 });
  });

  it('1行でも超えたら間引き始める', () => {
    const w = table({ count: MIN_ROWS_TO_WINDOW + 1 });
    expect(w.end).toBeLessThan(MIN_ROWS_TO_WINDOW + 1);
  });

  it('いちばん上では上の箱は 0（先頭に無駄な余白を作らない）', () => {
    expect(table().padTop).toBe(0);
    expect(cards().padTop).toBe(0);
  });

  it('いちばん下では下の箱は 0（底に届かない＝最後の行が出ない、を防ぐ）', () => {
    const w = table({ scrollTop: 3800 * 41 - 800 });
    expect(w.end).toBe(3800);
    expect(w.padBottom).toBe(0);
  });

  it('画面に入る数＋のぞき見ぶんしか描かない', () => {
    const w = table({ scrollTop: 50_000 });
    expect(w.end - w.start).toBe(Math.ceil(800 / 41) + 1 + OVERSCAN * 2);
  });

  it('送った位置に居るべき行を描く（1行でもずれたら別の機材が出る）', () => {
    const w = table({ scrollTop: 41 * 1000 });
    expect(w.start).toBe(1000 - OVERSCAN);
    // 上の箱の高さ ＝ 飛ばした行数 × 送り幅。ここが本体
    expect(w.padTop).toBe((1000 - OVERSCAN) * 41);
  });

  it('隙間つき（カード）でも、積み上げた高さが全件ぶんと一致する', () => {
    const total = 3800 * 122 - 8; // n 枚のあいだの隙間は n−1 個
    for (const scrollTop of [0, 1_000, 200_000, 460_000, 3800 * 122]) {
      const w = cards({ scrollTop });
      expect(stackedHeight(w, 122, 8)).toBe(total);
    }
  });

  it('隙間なし（表）でも同じ式で合う', () => {
    for (const scrollTop of [0, 5_000, 100_000, 155_000]) {
      const w = table({ scrollTop });
      expect(stackedHeight(w, 41, 0)).toBe(3800 * 41);
    }
  });

  /**
   * ⚠️ **反証**: 隙間を引かない素朴な式（`n × pitch`）だと、
   * 上下に箱があるぶんだけ**必ず伸びます**。1画面では 8px なので
   * 目では気づけませんが、送った先の行がずれ続けます。
   */
  it('反証: 隙間を引かないと高さが合わなくなる', () => {
    const naive = (w: ReturnType<typeof rowWindow>, count: number, pitch: number) => ({
      ...w, padTop: w.start * pitch, padBottom: (count - w.end) * pitch,
    });
    const w = cards({ scrollTop: 200_000 });
    expect(stackedHeight(naive(w, 3800, 122), 122, 8)).not.toBe(3800 * 122 - 8);
    expect(stackedHeight(naive(w, 3800, 122), 122, 8) - (3800 * 122 - 8)).toBe(16); // 上下の箱ぶん 8px × 2
  });

  it('送り幅が測れていないときは全部描く（真っ白より出しすぎのほうが安全）', () => {
    expect(rowWindow({ scrollTop: 0, viewportH: 800, listTop: 0, pitch: 0, count: 3800 }))
      .toEqual({ start: 0, end: 3800, padTop: 0, padBottom: 0 });
  });

  it('一覧より上に見出しや絞り込みがあっても、その高さぶんずれない', () => {
    const withLead = table({ scrollTop: 41 * 500 + 300, listTop: 300 });
    expect(withLead.start).toBe(500 - OVERSCAN);
  });

  it('一覧が画面より下にあるうちは1行も描かない（カテゴリごとに一覧がある画面で効く）', () => {
    const below = table({ scrollTop: 0, listTop: 5000 });
    expect(below.end - below.start).toBe(0);
    expect(below.padTop).toBe(0);
  });

  it('一覧が上に流れ切ったら1行も描かない', () => {
    const above = table({ scrollTop: 3800 * 41 + 5000, listTop: 0 });
    expect(above.end - above.start).toBe(0);
    expect(above.padBottom).toBe(0);
  });

  /**
   * ⚠️ 送りきったときは**見積もりを信じない**。
   * 行の高さは 1px も違わないわけではなく、0.5px の差でも 3,800 行で 1,900px。
   * そのままだと「まだ下に4枚ある」と判断され、**白いところが残って止まります**。
   */
  it('いちばん下まで送りきったら、見積もりがずれていても最後の行まで描く', () => {
    // 見積もりが実物より 1,900px 大きいふりをする（＝端に着いても end が届かない）
    const short = table({ scrollTop: 3800 * 41 - 2000, viewportH: 679 });
    expect(short.end).toBeLessThan(3800);
    const clamped = table({ scrollTop: 3800 * 41 - 2000, viewportH: 679, atEnd: true });
    expect(clamped.end).toBe(3800);
    expect(clamped.padBottom).toBe(0);
  });

  it('いちばん上まで戻りきったら先頭から描く', () => {
    const w = table({ scrollTop: 300, listTop: 0, atStart: true });
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
  });
});

// ───────────────────────────────────────────────────────
// ①-b 行ごとに高さが違うとき（貸出機材のタブ）
// ───────────────────────────────────────────────────────

describe('varRowWindow — 高さがまちまちな一覧', () => {
  /** 64px のカードが 300 枚。5 枚目だけ開いていて 200px */
  const heights = Array.from({ length: 300 }, (_, i) => (i === 5 ? 200 : 64));
  const offsets = rowOffsets(heights, 8);
  const win = (over = {}) => varRowWindow({
    scrollTop: 0, viewportH: 800, listTop: 0, offsets, gap: 8, ...over,
  });

  it('積み上げは「高さの合計 ＋ 隙間 × 枚数」', () => {
    expect(rowOffsets([10, 20, 30], 8)).toEqual([0, 18, 46, 84]);
    expect(rowOffsets([10, 20, 30], 0)).toEqual([0, 10, 30, 60]);
  });

  it('同じ高さを並べると `rowWindow` と同じ答えになる（式が1つであることの確認）', () => {
    const flat = rowOffsets(new Array(3800).fill(41), 0);
    for (const scrollTop of [0, 4_100, 100_000, 155_000]) {
      const a = varRowWindow({ scrollTop, viewportH: 800, listTop: 0, offsets: flat });
      const b = rowWindow({ scrollTop, viewportH: 800, listTop: 0, pitch: 41, count: 3800 });
      expect(a).toEqual(b);
    }
  });

  it('開いた塊より下は、その塊のぶんだけ位置が下がる', () => {
    // 5枚目が 200px なので、6枚目の上端は「64+8」×5 ＋ 200+8
    expect(offsets[6]).toBe(72 * 5 + 208);
  });

  it('送った先に居るべき塊を描く', () => {
    const w = win({ scrollTop: offsets[100] });
    expect(w.start).toBe(100 - OVERSCAN);
    expect(w.padTop).toBe(offsets[100 - OVERSCAN] - 8);
  });

  it('積み上げた高さが、上の箱 ＋ 描いた分 ＋ 下の箱と一致する', () => {
    const total = offsets[300] - 8;
    for (const scrollTop of [0, 3_000, 12_000, offsets[300]]) {
      const w = win({ scrollTop });
      const body = heights.slice(w.start, w.end).reduce((a, b) => a + b, 0);
      expect(w.padTop + body + gapCount(w) * 8 + w.padBottom).toBe(total);
    }
  });

  it('端に着いたら見積もりを信じずそこまで描く', () => {
    expect(win({ scrollTop: offsets[300] - 900, atEnd: true }).end).toBe(300);
    expect(win({ scrollTop: 500, atStart: true }).start).toBe(0);
  });

  it('少ない枚数なら間引かない', () => {
    const few = rowOffsets(new Array(MIN_ROWS_TO_WINDOW).fill(64), 8);
    const w = varRowWindow({ scrollTop: 0, viewportH: 800, listTop: 0, offsets: few, gap: 8 });
    expect(w).toEqual({ start: 0, end: MIN_ROWS_TO_WINDOW, padTop: 0, padBottom: 0 });
  });
});

// ───────────────────────────────────────────────────────
// ①-c 貸出機材の塊1つぶんの高さ
// ───────────────────────────────────────────────────────

describe('rentalGroupHeight — 描く前でも高さが分かること', () => {
  const unit = (children: number): RentalUnit => ({
    id: 'u', eq_code: 'E', unit_number: 1, serial_number: null, status: 'active',
    condition: 'good', location_name: null, location_detail: null, rental_display_name: null,
    children: Array.from({ length: children }, (_, i) => ({
      id: `c${i}`, eq_code: 'C', name: 'x', unit_number: null, status: 'active',
    })),
  });
  const group = (units: RentalUnit[]) => ({ units } as ModelGroup);

  it('畳んでいればカード1枚ぶん', () => {
    expect(rentalGroupHeight(group([unit(0), unit(0)]), false)).toBe(RENTAL_CARD_H);
  });

  it('開くと 区切り線 ＋ 台数ぶん', () => {
    expect(rentalGroupHeight(group([unit(0), unit(0)]), true))
      .toBe(RENTAL_CARD_H + RENTAL_OPEN_BORDER_H + RENTAL_UNIT_H * 2);
  });

  it('付属品がある台は「↳」の行ぶん高い', () => {
    expect(rentalGroupHeight(group([unit(2)]), true))
      .toBe(RENTAL_CARD_H + RENTAL_OPEN_BORDER_H + RENTAL_UNIT_H + RENTAL_KIDS_H);
  });

  /**
   * ⚠️ **土台は実測で置き換える。** スマホはカードが折り返して背が高くなり
   * （実測 64px → 115px）、決め打ちのままだと積み上げが足りず
   * **底まで送りきれません**。
   */
  it('カード1枚の実寸を渡すとそれを土台にする', () => {
    expect(rentalGroupHeight(group([unit(0)]), false, 115)).toBe(115);
    expect(rentalGroupHeight(group([unit(0)]), true, 115))
      .toBe(115 + RENTAL_OPEN_BORDER_H + RENTAL_UNIT_H);
  });

  /**
   * ⚠️ **鍵に開閉を含める。** 型番だけを鍵にすると、開いて背が高くなった
   * ときの実寸を閉じたあとも使い続け、**一覧が縮みません**。
   */
  it('高さを覚える鍵は開いているかどうかで変わる', () => {
    expect(rentalRowKey('a::b::V', true)).not.toBe(rentalRowKey('a::b::V', false));
  });
});

// ───────────────────────────────────────────────────────
// ② 行を平らに並べる（並び・段差・番号・罫線）
// ───────────────────────────────────────────────────────

const item = (id: string, over: Partial<EquipmentRecord> = {}): EquipmentRecord =>
  ({ id, name: id, ...over } as EquipmentRecord);

describe('flattenRows — 行の並べ方', () => {
  const parents = [item('a', { children_count: 2 }), item('b'), item('c', { children_count: 1 })];
  const kidsOfA = [item('a1', { parent_id: 'a' }), item('a2', { parent_id: 'a' })];

  it('何も開いていなければ親だけが並ぶ', () => {
    const rows = flattenRows(parents, new Set(), {}, new Set());
    expect(rows.map((r) => r.kind)).toEqual(['parent', 'parent', 'parent']);
  });

  it('開いた親の直後に付属品が段差1で入る', () => {
    const rows = flattenRows(parents, new Set(['a']), { a: kidsOfA }, new Set());
    expect(rows.map((r) => (r.kind === 'loading' ? 'loading' : r.item.id)))
      .toEqual(['a', 'a1', 'a2', 'b', 'c']);
    expect(rows.filter((r) => r.kind === 'child').every((r) => r.kind === 'child' && r.depth === 1)).toBe(true);
  });

  it('取りに行っている最中は「読み込んでいます」の行が付く', () => {
    const rows = flattenRows(parents, new Set(['c']), {}, new Set(['c']));
    expect(rows.map((r) => r.kind)).toEqual(['parent', 'parent', 'parent', 'loading']);
  });

  /**
   * ⚠️ **Shift 押しの範囲は `items` の番号で数える。**
   * 平らにした配列の番号を渡すと、**付属品を開いているときだけ**
   * 選ばれる範囲が変わります（開き方で結果が変わり、画面には何も出ません）。
   */
  it('`index` は `items` の中の番号（平らにした配列の番号ではない）', () => {
    const rows = flattenRows(parents, new Set(['a']), { a: kidsOfA }, new Set());
    const b = rows.find((r) => r.kind === 'parent' && r.item.id === 'b');
    expect(b && b.kind === 'parent' && b.index).toBe(1); // items の中では2番目
    expect(rows.findIndex((r) => r.kind === 'parent' && r.item.id === 'b')).toBe(3); // 平らにすると4行目
  });

  it('「付属品も出す」で当たった付属品は、親をたどった深さで段差が付く', () => {
    const list = [
      item('p'),
      item('c1', { parent_id: 'p' }),
      item('g1', { parent_id: 'c1' }),
    ];
    const rows = flattenRows(list, new Set(), {}, new Set());
    expect(rows.map((r) => (r.kind === 'child' ? r.depth : 'parent'))).toEqual(['parent', 1, 2]);
  });

  // ── 罫線（見た目を1px も変えないための項目）───────────────
  //
  // 前の DOM は `<div>{親}{付属品…}</div>` で、`last:border-b-0` が
  // **包みの中の最後**に効いていました。それを真偽値で写し取る。

  it('親の行のあいだには線を引かない（いまの見た目のまま）', () => {
    const rows = flattenRows(parents, new Set(), {}, new Set());
    expect(rows.map((r) => r.divider)).toEqual([false, false, false]);
  });

  it('付属品を開くと、親と途中の付属品には線が出て、最後の付属品には出ない', () => {
    const rows = flattenRows(parents, new Set(['a']), { a: kidsOfA }, new Set());
    // a(親) / a1 / a2 / b / c
    expect(rows.map((r) => r.divider)).toEqual([true, true, false, false, false]);
  });

  it('読み込み中の行は必ず線が出る（前から `last:` が付いていない）', () => {
    const rows = flattenRows(parents, new Set(['a']), { a: kidsOfA }, new Set(['a']));
    expect(rows.map((r) => r.divider)).toEqual([true, true, true, true, false, false]);
  });

  it('並びに混ざった付属品は、最後の1行以外に線が出る（包みを持たないため）', () => {
    const list = [item('p'), item('c1', { parent_id: 'p' }), item('q')];
    expect(flattenRows(list, new Set(), {}, new Set()).map((r) => r.divider))
      .toEqual([false, true, false]);
  });

  /**
   * ⚠️ **反証**: 包みを外して `divider` を素直に全部 true にすると、
   * **今まで線が1本も無かった親の行のあいだに 3,800 本の線が出ます**。
   */
  it('反証: 全部 true にすると、いまの見た目と食い違う', () => {
    const now = flattenRows(parents, new Set(), {}, new Set()).map((r) => r.divider);
    expect(now).not.toEqual([true, true, true]);
  });
});
