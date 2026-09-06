/**
 * **支払期日の休業日シフト**と**同じ引き合いから2件作らせない**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ・休業日の寄せは**設定の画面に選択肢があるのに、どこも読んでいません**でした。
 *   「前の営業日へ」を選んでも**日曜のままの期日**が入ります。
 *   選んだ人には設定できたように見えるので、**振り込みの日が来るまで**分かりません
 * ・しかも `computeDueDate` は**呼ばれている場所が1つもなく**、
 *   保存される行の支払期日は**ずっと空**でした（「遅れているもの」も数えられない）
 * ・二重登録は**同じ瞬間に2回押したときだけ**起き、押した人には成功に見えます
 *
 * v4 の PR で指摘された形です（#63 / #62）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dueDateOf, shiftForHoliday, closingDateOf,
} from '../../server/src/shared/services/dueDate';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 2026年11月の土日（15日が日曜） */
const CLOSED = new Set([
  '2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22',
  '2026-11-23', // 勤労感謝の日（月曜）
  '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', // 年末年始
]);
const isClosed = (d: string) => CLOSED.has(d);

describe('支払期日を営業日へ寄せる', () => {
  it('休業日でなければ動かさない', () => {
    expect(shiftForHoliday('2026-11-13', 'before', isClosed)).toBe('2026-11-13');
    expect(shiftForHoliday('2026-11-13', 'after', isClosed)).toBe('2026-11-13');
  });

  it('前の営業日へ／次の営業日へ', () => {
    // 11/15(日) → 前は 11/13(金)（14日も土曜なので飛ばす）
    expect(shiftForHoliday('2026-11-15', 'before', isClosed)).toBe('2026-11-13');
    expect(shiftForHoliday('2026-11-15', 'after', isClosed)).toBe('2026-11-16');
    // 11/23(月・祝) → 前は 11/20(金)
    expect(shiftForHoliday('2026-11-23', 'before', isClosed)).toBe('2026-11-20');
  });

  it('「寄せない」は1日も動かさない（前の版と同じ）', () => {
    expect(shiftForHoliday('2026-11-15', 'none', isClosed)).toBe('2026-11-15');
  });

  it('年をまたぐ休業日も抜ける', () => {
    // 12/31 は年末年始 → 前は 12/28(月)
    expect(shiftForHoliday('2026-12-31', 'before', isClosed)).toBe('2026-12-28');
    // 次は 1/2 … も休業日なので 1/2 の次へ（表にあるのは 1/1 まで）
    expect(shiftForHoliday('2026-12-31', 'after', isClosed)).toBe('2027-01-02');
  });

  it('全部休業日でも止まらない（60日で諦めて元の日を返す）', () => {
    // 表の入れ方を間違えたとき、**日付が入らないより寄っていない日付のほうが直せる**
    expect(shiftForHoliday('2026-11-15', 'before', () => true)).toBe('2026-11-15');
  });

  it('`dueDateOf` は寄せ方を渡したときだけ寄せる', () => {
    const rule = { closingDay: 31, paymentMonths: 1, paymentDay: 15 };
    expect(closingDateOf('2026-10-10', 31)).toBe('2026-10-31');
    // 渡さなければ今までどおり（日曜のまま）
    expect(dueDateOf('2026-10-10', rule)).toBe('2026-11-15');
    expect(dueDateOf('2026-10-10', rule, { shift: 'before', isClosed })).toBe('2026-11-13');
    expect(dueDateOf('2026-10-10', rule, { shift: 'after', isClosed })).toBe('2026-11-16');
  });
});

describe('設定が実際に効いている', () => {
  it('保存される行にも支払期日を入れる（人が入れた値は上書きしない）', () => {
    // `computeDueDate` は**どこからも呼ばれていなかった**（下見の画面だけが使っていた）
    const routes = read('server', 'src', 'contexts', 'finance', 'routes', 'revenues.routes.ts');
    expect(routes).toMatch(/const dueDate = payment_due_date \|\| await computeDueDate\(recognition_date, customer_id, CURRENT_ENTITY_CODE\)/);
  });

  it('休業日は土日・祝日・全社の休業日で見る（拠点ごとの休みは見ない）', () => {
    const svc = read('server', 'src', 'contexts', 'finance', 'services', 'money-rules.service.ts');
    expect(svc).toMatch(/location_id IS NULL AND availability <> 'open'/);
    expect(svc).toMatch(/if \(dow === 0 \|\| dow === 6\) return true;/);
    expect(svc).toMatch(/holidaysOf\(y\)/);
  });

  it('下見（設定の画面）でも同じ寄せ方を掛ける', () => {
    // 掛けないと「8/31 になります」と見せて 8/29 が入る
    const routes = read('server', 'src', 'contexts', 'finance', 'routes', 'money-rules.routes.ts');
    expect(routes).toMatch(/previewDueDate\(recognition_date, r, shift\)/);
    const page = read('client', 'src', 'contexts', 'platform', 'pages', 'money', 'MoneyRulesPage.tsx');
    expect(page).toMatch(/payment_holiday_shift: holidayShift/);
  });
});

describe('同じ引き合いから2件つくらせない', () => {
  it('鍵を渡したら、すでにある案件を返す（エラーにしない）', () => {
    // 画面の `disabled` は描き直し1回ぶん遅れるので、同じ瞬間の2回押しは通る（#62）
    const svc = read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');
    expect(svc).toMatch(/const idem = typeof data\.idempotency_key === 'string'/);
    expect(svc).toMatch(/if \(dup\) return await this\.getById\(dup\.id\);/);
    // 同時のときは一意索引が止める。**先に出来たほうを返す**
    expect(svc).toMatch(/if \(already\) return await this\.getById\(already\.id\);/);
    const hook = read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'useCreateProject.ts');
    expect(hook).toMatch(/idempotency_key: `inquiry:\$\{inquiryId\}:project`/);
  });
});
