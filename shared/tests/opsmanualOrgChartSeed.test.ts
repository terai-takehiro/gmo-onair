// 運営マニュアル — 体制図ブロックの「取り込み」（`mergeProjectMembers` / `mergeGpmTiers`）を固定する。
//
// 本体は client-techops 側（`client-techops/src/pages/opsmanual/orgChartSeed.ts`）にある。
// shared/CLAUDE.md「テスト」の考え方（画面を見ても間違いに気づけない計算は、置き場所が
// どこであれ固定する）で、client-techops にテストの置き場所が無いためここに置く
// （前例は `opsmanualPreExportChecks.test.ts` の冒頭）。
//
// ここが押さえるのは4つ（どれも押した人には見えない間違い方をする）:
//   ① キャンバスに出していない電話・メールを黙って保存しない
//   ② 1人も足さなかったら元の参照を返す（中身の変わらない undo の1手を積まない）
//   ③ 同じ名前の人は**階層をまたいで**足さない
//   ④ 「入れる階層が無い」と「足す人がいない」を混ぜない
import { describe, expect, it } from 'vitest';
import {
  countSeedPeople,
  mergeGpmTiers,
  mergeProjectMembers,
} from '../../client-techops/src/pages/opsmanual/orgChartSeed';
import type { OrgChartShow } from '../../client-techops/src/pages/opsmanual/blocks/orgchart/orgChartUi';
import type { ManualOrgSeedPerson, ManualOrgSeedTier } from '../../client-techops/src/lib/manualApi';
import type { ManualOrgChartContent, ManualOrgPerson, ManualOrgTier } from '../src/opsmanual/types';

/** 右パネルの既定（`resolveOrgChartShow`）＝ 役割だけ出す */
const SHOW_DEFAULT: OrgChartShow = { role: true, org: false, phone: false, email: false };
/** 4つとも入れた状態 */
const SHOW_ALL: OrgChartShow = { role: true, org: true, phone: true, email: true };

function tier(id: string, label: string, boxes: { label: string; people: string[] }[] = []): ManualOrgTier {
  return {
    id,
    label,
    boxes: boxes.map((b, i) => ({
      id: `${id}-box-${i}`,
      label: b.label,
      people: b.people.map((name) => ({ id: `psn-${name}`, name })),
    })),
  };
}

function content(tiers: ManualOrgTier[]): ManualOrgChartContent {
  return { tiers };
}

/** 置いた直後のまま（名前の無い階層が1つ・チーム0） */
function untouched(): ManualOrgChartContent {
  return content([tier('t1', '')]);
}

function allPeople(c: ManualOrgChartContent): ManualOrgPerson[] {
  return c.tiers.flatMap((t) => t.boxes.flatMap((b) => b.people));
}

function names(c: ManualOrgChartContent): string[] {
  return allPeople(c).map((p) => p.name);
}

const GPM_SEED: ManualOrgSeedTier[] = [
  {
    label: '決裁層',
    boxes: [{ label: '経営', org: '自社', people: [{ name: '佐藤', role: '決裁', email: 'sato@example.com', badge: '決裁' }] }],
  },
  {
    label: '実務層',
    boxes: [{ label: '技術', people: [{ name: '鈴木', role: 'TD', email: 'suzuki@example.com' }] }],
  },
];

describe('① キャンバスに出していない電話・メールは持ち込まない', () => {
  it('案件のメンバー: 既定（電話・メールが切り）では、どちらもキーごと持たない', () => {
    const seed: ManualOrgSeedPerson[] = [
      { name: '山田', role: 'PM', phone: '090-0000-0000', email: 'yamada@example.com' },
    ];
    const res = mergeProjectMembers(untouched(), 't1', seed, SHOW_DEFAULT);

    expect(res.status).toBe('added');
    const person = allPeople(res.content)[0];
    // 切れている項目は入力欄も出ない ＝ 入れた自覚も消す手立ても無いまま保存されてしまう
    expect(person).not.toHaveProperty('phone');
    expect(person).not.toHaveProperty('email');
    // 役割は連絡先ではないので、切っていても持ち込む（あとから出せる）
    expect(person.role).toBe('PM');
  });

  it('案件のメンバー: 「出す項目」を入れてあれば電話・メールも入る', () => {
    const seed: ManualOrgSeedPerson[] = [
      { name: '山田', role: 'PM', phone: '090-0000-0000', email: 'yamada@example.com' },
    ];
    const res = mergeProjectMembers(untouched(), 't1', seed, SHOW_ALL);

    const person = allPeople(res.content)[0];
    expect(person.phone).toBe('090-0000-0000');
    expect(person.email).toBe('yamada@example.com');
  });

  it('プロジェクト管理の体制: メールも同じ扱い（切りなら持ち込まない・入りなら入る）', () => {
    const off = mergeGpmTiers(untouched(), GPM_SEED, SHOW_DEFAULT);
    expect(allPeople(off.content).every((p) => !('email' in p))).toBe(true);
    // バッジは「出す項目」に無い（読むだけの印）ので、いつでも入る
    expect(allPeople(off.content)[0].badge).toBe('決裁');

    const on = mergeGpmTiers(untouched(), GPM_SEED, SHOW_ALL);
    expect(allPeople(on.content).map((p) => p.email)).toEqual(['sato@example.com', 'suzuki@example.com']);
  });
});

describe('② 1人も足さなかったら元の参照を返す', () => {
  it('プロジェクト管理の体制: 2回押しても、2回目は中身も参照も変わらない', () => {
    const first = mergeGpmTiers(untouched(), GPM_SEED, SHOW_DEFAULT);
    expect(first.status).toBe('added');
    expect(names(first.content)).toEqual(['佐藤', '鈴木']);

    const second = mergeGpmTiers(first.content, GPM_SEED, SHOW_DEFAULT);
    // ここが別の参照を返すと、中身が1文字も変わらない undo の1手と自動保存が積まれる
    expect(second.content).toBe(first.content);
    expect(second.status).toBe('none');
  });

  it('プロジェクト管理の体制: チームの無い階層だけの候補では、空の階層を足さない', () => {
    const base = content([tier('t1', '決裁層', [{ label: '経営', people: ['佐藤'] }])]);
    const res = mergeGpmTiers(base, [{ label: '推進層', boxes: [] }], SHOW_DEFAULT);

    expect(res.content).toBe(base);
    expect(res.status).toBe('none');
  });

  it('案件のメンバー: 同じ名前の人ばかりなら元の参照のまま', () => {
    const base = content([tier('t1', '', [{ label: '', people: ['山田'] }])]);
    const res = mergeProjectMembers(base, 't1', [{ name: '山田' }], SHOW_DEFAULT);

    expect(res.content).toBe(base);
    expect(res.status).toBe('none');
  });
});

describe('③ 同じ名前の人は階層をまたいで足さない', () => {
  it('案件のメンバー: 入れる階層を切り替えて押しても、同じ人は増えない', () => {
    const base = content([tier('t1', '決裁層'), tier('t2', '実務層')]);
    const seed: ManualOrgSeedPerson[] = [{ name: '山田', role: 'PM' }];

    const first = mergeProjectMembers(base, 't1', seed, SHOW_DEFAULT);
    expect(names(first.content)).toEqual(['山田']);

    const second = mergeProjectMembers(first.content, 't2', seed, SHOW_DEFAULT);
    expect(second.status).toBe('none');
    expect(names(second.content)).toEqual(['山田']);
  });

  it('プロジェクト管理の体制: 別の階層にもう居る人は足さない', () => {
    const base = content([tier('t1', '決裁層', [{ label: '経営', people: ['鈴木'] }])]);
    const res = mergeGpmTiers(
      base,
      [{ label: '実務層', boxes: [{ label: '技術', people: [{ name: '鈴木' }, { name: '田中' }] }] }],
      SHOW_DEFAULT,
    );

    expect(res.status).toBe('added');
    expect(names(res.content)).toEqual(['鈴木', '田中']);
  });
});

describe('④ 「入れる階層が無い」と「足す人がいない」を混ぜない', () => {
  it('階層が1つも無いときは no-tier（重複と同じ知らせ方をしない）', () => {
    const base = content([]);
    const res = mergeProjectMembers(base, null, [{ name: '山田' }], SHOW_DEFAULT);

    expect(res.status).toBe('no-tier');
    expect(res.content).toBe(base);
  });

  it('取り込み元が空なら none', () => {
    const base = content([tier('t1', '決裁層')]);
    expect(mergeProjectMembers(base, 't1', [], SHOW_DEFAULT).status).toBe('none');
    expect(mergeGpmTiers(base, [], SHOW_DEFAULT).status).toBe('none');
  });
});

describe('取り込みの基本の形', () => {
  it('置いた直後の空の階層は、プロジェクト管理の体制の取り込みで消える', () => {
    const res = mergeGpmTiers(untouched(), GPM_SEED, SHOW_DEFAULT);

    expect(res.content.tiers.map((t) => t.label)).toEqual(['決裁層', '実務層']);
    // 元の配列・階層は書き換えない（undo のスナップショットが壊れる）
    expect(res.content.tiers[0].id).not.toBe('t1');
  });

  it('案件のメンバーは、いま選んでいる階層の1つ目のチームに入る', () => {
    const base = content([
      tier('t1', '決裁層', [{ label: '経営', people: ['佐藤'] }]),
      tier('t2', '実務層', [{ label: '技術', people: [] }, { label: '中継', people: [] }]),
    ]);
    const res = mergeProjectMembers(base, 't2', [{ name: '山田' }], SHOW_DEFAULT);

    expect(res.content.tiers[1].boxes[0].people.map((p) => p.name)).toEqual(['山田']);
    expect(res.content.tiers[1].boxes[1].people).toEqual([]);
    expect(base.tiers[1].boxes[0].people).toEqual([]);
  });

  it('同じ名前のチームがすでにあれば、そこへ足す', () => {
    const base = content([tier('t1', '実務層', [{ label: '技術', people: ['鈴木'] }])]);
    const res = mergeGpmTiers(
      base,
      [{ label: '実務層', boxes: [{ label: '技術', people: [{ name: '田中' }] }] }],
      SHOW_DEFAULT,
    );

    expect(res.content.tiers).toHaveLength(1);
    expect(res.content.tiers[0].boxes).toHaveLength(1);
    expect(res.content.tiers[0].boxes[0].people.map((p) => p.name)).toEqual(['鈴木', '田中']);
  });

  it('同じ名前のチームへ足すとき、取り込み元の所属が落ちない', () => {
    const base = content([tier('t1', '実務層', [{ label: '技術', people: ['鈴木'] }])]);
    const res = mergeGpmTiers(
      base,
      [{ label: '実務層', boxes: [{ label: '技術', org: '東洋中継サービス', people: [{ name: '田中' }] }] }],
      SHOW_DEFAULT,
    );

    expect(res.content.tiers[0].boxes[0].org).toBe('東洋中継サービス');
  });

  it('すでに入っている所属は、取り込みで上書きしない', () => {
    const base = content([tier('t1', '実務層', [{ label: '技術', people: ['鈴木'] }])]);
    base.tiers[0].boxes[0].org = '自社';
    const res = mergeGpmTiers(
      base,
      [{ label: '実務層', boxes: [{ label: '技術', org: '東洋中継サービス', people: [{ name: '田中' }] }] }],
      SHOW_DEFAULT,
    );

    expect(res.content.tiers[0].boxes[0].org).toBe('自社');
  });

  it('countSeedPeople は階層をまたいだ人数を数える', () => {
    expect(countSeedPeople(GPM_SEED)).toBe(2);
    expect(countSeedPeople([])).toBe(0);
  });
});
