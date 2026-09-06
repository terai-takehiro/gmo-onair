/**
 * **受領書類は1通ずつではなく「ひとつづり」で読む**（migration 281）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 見積書 → 発注書 → 請求書 は、実際には次のように崩れます。
 *
 *  ・見積書が3回改定される（同じ取引で見積書が3通届く）
 *  ・見積だけ取って発注しない（請求書が来ない）
 *  ・請求書しか来ない（見積も発注も無い）
 *  ・分割請求で請求書が2通来る
 *
 * ここを外すと **払う金額が変わります**（古い版の見積を拾う・分割請求の
 * 1通目だけ払う）。どれも画面を開いても再現しないので、純関数で固定します。
 *
 * 支払サイトのほうは**月末・うるう年**で外れます。
 * 「翌月末払い」と「30日サイト」は**同じ月と違う月がある**ので、
 * ここを1つの関数で済ませるとどこかの月で必ず1日ずれます。
 */
import { describe, it, expect } from 'vitest';
import {
  addDaysIso, canHandoffChain, chainAmount, chainStage, endOfMonthIso,
  guessProcessingMonth, latestQuote, paymentDueFromMonths, paymentDueFromTerms,
  startOfMonthIso, CHAIN_STAGE_LABEL,
} from '../src/utils/financeDocChain';

const q = (o: Partial<{ received_at: string; revision: number; amount: number; status: string }> = {}) =>
  ({ doc_type: 'quote', ...o });
const inv = (o: Partial<{ received_at: string; amount: number; status: string }> = {}) =>
  ({ doc_type: 'invoice', ...o });
const ord = (o: Partial<{ received_at: string; amount: number; status: string }> = {}) =>
  ({ doc_type: 'order', ...o });

describe('束のいまの段', () => {
  it('空の束は「書類なし」', () => {
    expect(chainStage([])).toBe('empty');
  });

  it('見積だけなら quote_only（発注しなかった取引はここで止まる）', () => {
    expect(chainStage([q(), q({ revision: 2 })])).toBe('quote_only');
  });

  it('請求書しか来ない取引も invoiced として扱う（見積が無くても止めない）', () => {
    expect(chainStage([inv()])).toBe('invoiced');
  });

  it('見積を取り直している最中に請求書が来たら invoiced（払う期日があるほうが急ぐ）', () => {
    expect(chainStage([q({ revision: 3, received_at: '2026-09-05' }), inv({ received_at: '2026-09-01' })]))
      .toBe('invoiced');
  });

  it('却下した書類では段が進まない（間違えて取り込んだ1通で「発注済み」にしない）', () => {
    expect(chainStage([q(), ord({ status: 'rejected' })])).toBe('quote_only');
    expect(chainStage([inv({ status: 'rejected' })])).toBe('empty');
  });

  it('段の呼び名は4つとも用意してある', () => {
    for (const k of ['empty', 'quote_only', 'ordered', 'invoiced'] as const) {
      expect(CHAIN_STAGE_LABEL[k]).toBeTruthy();
    }
  });
});

describe('生きている見積（改定の重なり）', () => {
  it('改定回数の大きいほうを採る', () => {
    const got = latestQuote([q({ revision: 1, amount: 100 }), q({ revision: 3, amount: 300 }), q({ revision: 2, amount: 200 })]);
    expect(got?.amount).toBe(300);
  });

  it('改定回数が同じなら受信日の遅いほう', () => {
    const got = latestQuote([q({ received_at: '2026-08-01', amount: 100 }), q({ received_at: '2026-08-20', amount: 200 })]);
    expect(got?.amount).toBe(200);
  });

  it('手がかりが無ければ後ろのものを採る（一覧は受信順で来る）', () => {
    expect(latestQuote([q({ amount: 100 }), q({ amount: 200 })])?.amount).toBe(200);
  });

  it('却下した見積は生きていない', () => {
    expect(latestQuote([q({ revision: 5, amount: 500, status: 'rejected' }), q({ revision: 1, amount: 100 })])?.amount)
      .toBe(100);
  });

  it('見積が1通も無ければ null', () => {
    expect(latestQuote([inv({ amount: 100 })])).toBeNull();
  });
});

describe('束の払う金額', () => {
  it('請求書があれば請求書（見積は見ない）', () => {
    expect(chainAmount([q({ amount: 300 }), inv({ amount: 280 })])).toBe(280);
  });

  it('分割請求は足す（1通目だけ払うと残りが落ちる）', () => {
    expect(chainAmount([inv({ amount: 100 }), inv({ amount: 50 })])).toBe(150);
  });

  it('見積は足さない（改定なので重複する）', () => {
    expect(chainAmount([q({ revision: 1, amount: 100 }), q({ revision: 2, amount: 120 })])).toBe(120);
  });

  it('金額がどこにも無ければ null（0 円と言い切らない）', () => {
    expect(chainAmount([q(), inv()])).toBeNull();
  });
});

describe('台帳へ渡せるか', () => {
  it('見積だけの束は渡せない（発注しなかった見積はここで止まったまま残す）', () => {
    expect(canHandoffChain([q(), q({ revision: 2 })])).toBe(false);
  });

  it('発注書・請求書が来ていれば渡せる', () => {
    expect(canHandoffChain([q(), ord()])).toBe(true);
    expect(canHandoffChain([inv()])).toBe(true);
  });
});

describe('販管費の支払サイト', () => {
  it('0日サイトは当月末', () => {
    expect(paymentDueFromTerms('2026-08', 0)).toBe('2026-08-31');
  });

  it('30日サイトは月末から30日後', () => {
    expect(paymentDueFromTerms('2026-08', 30)).toBe('2026-09-30');
    expect(paymentDueFromTerms('2026-09', 30)).toBe('2026-10-30');
  });

  it('60日サイトも月末起点', () => {
    expect(paymentDueFromTerms('2026-08', 60)).toBe('2026-10-30');
  });

  it('⚠️ 30日サイトと「翌月末払い」は同じではない（2月締めでずれる）', () => {
    expect(paymentDueFromTerms('2027-02', 30)).toBe('2027-03-30');
    expect(paymentDueFromMonths('2027-02', 1)).toBe('2027-03-31');
  });

  it('うるう年の2月末を正しく出す', () => {
    expect(endOfMonthIso('2028-02')).toBe('2028-02-29');
    expect(endOfMonthIso('2026-02')).toBe('2026-02-28');
    expect(paymentDueFromMonths('2028-01', 1)).toBe('2028-02-29');
  });

  it('年をまたぐ', () => {
    expect(paymentDueFromMonths('2026-12', 1)).toBe('2027-01-31');
    expect(paymentDueFromTerms('2026-12', 31)).toBe('2027-01-31');
  });

  it('計上月は月初で持つ', () => {
    expect(startOfMonthIso('2026-08')).toBe('2026-08-01');
  });

  it('読めない値は null（勝手な日付を作らない）', () => {
    expect(paymentDueFromTerms('2026-8', 30)).toBeNull();
    expect(paymentDueFromTerms('2026-08', -1)).toBeNull();
    expect(paymentDueFromTerms('2026-08', 400)).toBeNull();
    expect(paymentDueFromMonths('', 1)).toBeNull();
  });
});

describe('日付の足し算は現地時刻でずれない', () => {
  it('月をまたぐ', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01');
  });
  it('年をまたぐ', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('読めない値はそのまま返す（例外にしない）', () => {
    expect(addDaysIso('nope', 1)).toBe('nope');
  });
});

describe('処理月の当て推量', () => {
  it('受信日の月を使う', () => {
    expect(guessProcessingMonth('2026-08-31')).toBe('2026-08');
  });
  it('受信日が無ければ null（推さない）', () => {
    expect(guessProcessingMonth(null)).toBeNull();
    expect(guessProcessingMonth('')).toBeNull();
  });
});
