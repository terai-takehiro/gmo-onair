/**
 * 写真の持ち主の確認は、**BOX を叩く回数**まで含めて決めごとです。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ①確認を外すと、id を渡すだけで**別の案件の写真**が取れます。
 * ②かといって毎回2回 BOX に訊くと、**100 枚の格子で 200 回**になり、
 *   絞られて**正しい写真まで 404**になります（格子が歯抜けに見える）。
 *
 * どちらも**画面を見ても分かりません**（①は見た目が正しく、②は「たまに出ない」）。
 * BOX の呼び出し方を外から渡す作りにしてあるので、ここで回数を数えられます。
 */
import { describe, it, expect } from 'vitest';
import { createPhotoAccess } from '../../server/src/contexts/sales/services/project-photo-access.service';

/** 呼ばれた回数を数える読み込み。時計も手で進める */
function harness(ids: string[] = ['p1', 'p2']) {
  let calls = 0;
  let clock = 1_000_000;
  const set = new Set(ids);
  const access = createPhotoAccess(
    async (projectId) => { calls++; return projectId === 'no-folder' ? null : new Set(set); },
    () => clock,
  );
  return {
    access,
    calls: () => calls,
    tick: (ms: number) => { clock += ms; },
    add: (id: string) => set.add(id),
  };
}

describe('写真の持ち主の確認', () => {
  it('その案件の写真は通す／よその写真は通さない', async () => {
    const h = harness();
    expect(await h.access.isProjectPhoto('pj1', 'p1')).toBe(true);
    expect(await h.access.isProjectPhoto('pj1', 'よそのファイル')).toBe(false);
  });

  // ⚠️ ここが指摘された側。100 枚の格子で 200 回叩かない
  it('同じ案件の 100 枚を確かめても、BOX に訊くのは1回', async () => {
    const h = harness(Array.from({ length: 100 }, (_, i) => `photo${i}`));
    for (let i = 0; i < 100; i++) {
      expect(await h.access.isProjectPhoto('pj1', `photo${i}`)).toBe(true);
    }
    expect(h.calls()).toBe(1);
  });

  it('案件が違えば別に覚える', async () => {
    const h = harness();
    await h.access.isProjectPhoto('pj1', 'p1');
    await h.access.isProjectPhoto('pj2', 'p1');
    expect(h.calls()).toBe(2);
  });

  it('知らない id を連打されても、引き直しは間隔を空けてから', async () => {
    const h = harness();
    await h.access.isProjectPhoto('pj1', 'p1');          // 1回目（ここで覚える）
    for (let i = 0; i < 50; i++) {
      expect(await h.access.isProjectPhoto('pj1', `当てずっぽう${i}`)).toBe(false);
    }
    expect(h.calls()).toBe(1);
    h.tick(6_000);                                       // 間隔を過ぎたら1回だけ引き直す
    expect(await h.access.isProjectPhoto('pj1', '当てずっぽう')).toBe(false);
    expect(h.calls()).toBe(2);
  });

  it('あとから上げた写真は、間隔を過ぎれば見えるようになる', async () => {
    const h = harness();
    expect(await h.access.isProjectPhoto('pj1', 'あとで上げる')).toBe(false);
    h.add('あとで上げる');
    h.tick(6_000);
    expect(await h.access.isProjectPhoto('pj1', 'あとで上げる')).toBe(true);
  });

  it('上げた直後は「捨てて取り直す」ので待たされない', async () => {
    const h = harness();
    await h.access.isProjectPhoto('pj1', 'p1');
    h.add('いま上げた');
    h.access.forget('pj1');                              // 上げた口が呼ぶ
    expect(await h.access.isProjectPhoto('pj1', 'いま上げた')).toBe(true);
  });

  it('覚えている間は BOX に訊かないが、時間が経てば取り直す', async () => {
    const h = harness();
    await h.access.isProjectPhoto('pj1', 'p1');
    h.tick(59_000);
    await h.access.isProjectPhoto('pj1', 'p1');
    expect(h.calls()).toBe(1);
    h.tick(2_000);                                       // 60 秒を過ぎた
    await h.access.isProjectPhoto('pj1', 'p1');
    expect(h.calls()).toBe(2);
  });

  it('BOX が落ちている・フォルダが無いときは通さない', async () => {
    const h = harness();
    expect(await h.access.isProjectPhoto('no-folder', 'p1')).toBe(false);
  });

  it('覚える案件の数に上限がある（入れっぱなしにしない）', async () => {
    const h = harness();
    for (let i = 0; i < 250; i++) await h.access.isProjectPhoto(`pj${i}`, 'p1');
    expect(h.access.size()).toBeLessThanOrEqual(200);
  });

  it('id が空なら何も訊かずに断る', async () => {
    const h = harness();
    expect(await h.access.isProjectPhoto('pj1', '')).toBe(false);
    expect(await h.access.isProjectPhoto('', 'p1')).toBe(false);
    expect(h.calls()).toBe(0);
  });
});
