/**
 * `invalidateProjectQueries()`（`contexts/sales/projectQueries.ts`）— 案件を
 * 書き換えたときに落とす鍵の**唯一のもと**が、実際に全部落とすことを固定する。
 *
 * ── なぜここに検査を置くか ──────────────────────────────────
 *
 * 同じ案件を10以上の別の鍵で持つ画面がある（案件台帳 `project-ledger`・
 * 仕入の候補 `won-projects-for-purchase`・見積の回 `episodes` など）。
 * 保存のたびに呼び出し側が鍵を並べる形に戻すと、鍵が1本増えるたびに
 * どこかが足し忘れる ——実際に v4.5.19 の時点で複数の保存経路が足し忘れており、
 * この関数に一元化したあとも `useCreateProject.ts`・`useLedgerState.ts`・
 * `useLedgerGrid.ts` が**この関数を使わず自前で鍵を並べ直していて**、
 * 同じ不具合（「保存したのに古いまま・リロードすると出る」）が再発した。
 *
 * → **この関数自体**が一覧・1件ぶんの鍵を漏れなく落とすことをここで固定する。
 *   呼び出し側は「この関数を呼んでいるか」だけを確かめればよい形にする。
 */
import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateProjectQueries } from '../../client/src/contexts/sales/projectQueries';

/** 案件の一覧・候補・集計を持つ鍵（`projectQueries.ts` の `PROJECT_LIST_KEYS` と同じ） */
const LIST_KEYS = [
  'projects', 'project-ledger', 'project-integrity', 'dashboard',
  'projects-search', 'projects-dropdown', 'projects-with-activity', 'projects-booking-search',
  'gls-projects', 'gls-projects-for-groups',
  'won-projects-for-purchase', 'won-projects-for-handoff', 'won-projects-for-budget-dashboard',
];

/** 案件1件ごとに持つ鍵（`projectQueries.ts` の `PROJECT_DETAIL_KEYS` と同じ） */
const DETAIL_KEYS = ['project', 'project-single', 'project-summary', 'episodes'];

function setUp() {
  const qc = new QueryClient();
  for (const k of LIST_KEYS) qc.setQueryData([k], { dummy: true });
  // `dashboard` は前方一致で当たる子鍵も一緒に立てて確かめる（`alerts`/`sales-overview` の両方）
  qc.setQueryData(['dashboard', 'alerts'], { dummy: true });
  qc.setQueryData(['dashboard', 'sales-overview'], { dummy: true });
  for (const k of DETAIL_KEYS) qc.setQueryData([k, 'p1'], { dummy: true });
  // 無関係な別案件の1件ぶんは落ちないことも確かめる
  for (const k of DETAIL_KEYS) qc.setQueryData([k, 'p2'], { dummy: true });
  return qc;
}

describe('invalidateProjectQueries — 一覧の鍵は id が無くても全部落ちる', () => {
  it.each(LIST_KEYS)("'%s' を落とす", (key) => {
    const qc = setUp();
    invalidateProjectQueries(qc);
    expect(qc.getQueryState([key])?.isInvalidated).toBe(true);
  });

  it("'dashboard' の子鍵（alerts / sales-overview）も前方一致で両方落ちる", () => {
    const qc = setUp();
    invalidateProjectQueries(qc);
    expect(qc.getQueryState(['dashboard', 'alerts'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['dashboard', 'sales-overview'])?.isInvalidated).toBe(true);
  });

  it('id を渡さなければ1件ぶんの鍵は落ちない（当てられない）', () => {
    const qc = setUp();
    invalidateProjectQueries(qc);
    for (const k of DETAIL_KEYS) {
      expect(qc.getQueryState([k, 'p1'])?.isInvalidated).toBe(false);
    }
  });
});

describe('invalidateProjectQueries — id を渡すと1件ぶんの鍵も落ちる', () => {
  it.each(DETAIL_KEYS)("'%s, id' を落とす（無関係な別案件は落とさない）", (key) => {
    const qc = setUp();
    invalidateProjectQueries(qc, 'p1');
    expect(qc.getQueryState([key, 'p1'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState([key, 'p2'])?.isInvalidated).toBe(false);
  });

  it('一覧の鍵も引き続き全部落ちる（id を渡しても一覧が漏れない）', () => {
    const qc = setUp();
    invalidateProjectQueries(qc, 'p1');
    for (const k of LIST_KEYS) {
      expect(qc.getQueryState([k])?.isInvalidated).toBe(true);
    }
  });
});
