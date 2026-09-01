/**
 * 販管費の一覧 — 集計を1本にまとめても、条件の作り方が変わっていないこと
 *
 * ⚠️ **チップの件数は「種別以外の絞り込みだけ」を掛けて数える**という決めごとがあり、
 * 一覧は2種類の WHERE を必要とします（全部掛けたものと、チップ3つを外したもの）。
 * ここを混ぜると、**チップの数字と押した先の行数がずれます**
 * （どちらもそれらしい数字なので、画面を見ても気づけません）。
 *
 * ⚠️ **`?` の並びが命です。** DB 層は `?` を出現順に `$1..$n` へ置き換えるので、
 * 分けて作ったものを合成する順を間違えると**静かに違う行が返ります**。
 *
 * 応答が1バイトも変わっていないことは実 Postgres で 19 条件ぶん突き合わせています。
 * ここでは、その前提になっている「条件の作り方」を固定します。
 */
import { describe, expect, it } from 'vitest';
import {
  buildSgaWhere, buildSgaWhereParts,
} from '../../server/src/contexts/finance/list-query';

type Q = Parameters<typeof buildSgaWhere>[0];
const q = (o: Record<string, string>) => o as unknown as Q;

const CASES: Record<string, string>[] = [
  {},
  { source: 'staff' },
  { expense_type: 'fixed' },
  { expense_type: 'unknown_value' },
  { account_title_id: 'none' },
  { account_title_id: 'at-1' },
  { search: '携帯' },
  { recognition_month: '2026-08' },
  { source: 'staff', expense_type: 'fixed', account_title_id: 'at-1', search: '携帯' },
  { source: 'accounting', recognition_from: '2026-08-01', recognition_to: '2026-08-31' },
  { date_from: '2026-08-10', date_to: '2026-08-20' },
];

describe('分けて作っても、合成すると元と同じ', () => {
  for (const c of CASES) {
    it(`${JSON.stringify(c)}: プレースホルダの数とパラメータの数が一致`, () => {
      const { where, params } = buildSgaWhere(q(c));
      expect((where.match(/\?/g) ?? []).length).toBe(params.length);
    });
  }

  it('合成の順は「チップ → それ以外」（並びを変えると違う行が返る）', () => {
    const c = { source: 'staff', account_title_id: 'at-1', search: '携帯', recognition_month: '2026-08' };
    const { base, chip } = buildSgaWhereParts(q(c));
    const { params } = buildSgaWhere(q(c));
    expect(params).toEqual([...chip.params, ...base.params]);
  });
});

describe('チップとそれ以外の切り分け', () => {
  it('`base` にチップの3つが現れない（現れると二重に掛かる）', () => {
    const { base } = buildSgaWhereParts(q({
      source: 'staff', expense_type: 'fixed', account_title_id: 'at-1', search: '携帯',
    }));
    expect(base.where).not.toContain('s.source');
    expect(base.where).not.toContain('s.expense_type');
    expect(base.where).not.toContain('s.account_title_id');
    // それ以外は残っている
    expect(base.where).toContain('ILIKE');
  });

  it('チップを何も指定しなければ `TRUE`（全部が hit）', () => {
    const { chip } = buildSgaWhereParts(q({ search: '携帯' }));
    expect(chip.sql).toBe('TRUE');
    expect(chip.params).toEqual([]);
  });

  /*
   * ⚠️ **知らない値は素通しさせない。** 絞ったのに全件出ると気づけないため、
   * 分ける前は `AND FALSE` を足していた。分けたあとも同じでなければならない。
   */
  it('知らない種別は `FALSE`（全件に化けない）', () => {
    expect(buildSgaWhereParts(q({ expense_type: 'zzz' })).chip.sql).toBe('FALSE');
    expect(buildSgaWhere(q({ expense_type: 'zzz' })).where).toContain('FALSE');
  });

  it('科目の `none` は「未設定」を意味し、パラメータを積まない', () => {
    const { chip } = buildSgaWhereParts(q({ account_title_id: 'none' }));
    expect(chip.sql).toContain('IS NULL');
    expect(chip.params).toEqual([]);
  });

  it('`base` は消した行を必ず外す', () => {
    for (const c of CASES) {
      expect(buildSgaWhereParts(q(c)).base.where).toContain('s.deleted_at IS NULL');
    }
  });
});
