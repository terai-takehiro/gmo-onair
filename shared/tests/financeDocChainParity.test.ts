/**
 * **受領書類の計算は2か所にある — 同じであることを固定する**（migration 280）
 *
 * サーバーは `shared/`（`@gmo-onair/shared`）を import できないため
 * （`server/tsconfig.json` の `rootDir: "./src"`）、段の判定と支払サイトの計算が
 * **サーバーと画面の2か所**にあります。
 *
 * 片方だけ直すと、**画面が出す支払期日と、台帳に入る支払期日が別の日になります**。
 * しかも画面はそれを言わないので、**誰も気づけません**。
 * 制作資料 AI の往復テスト（`qsheetAiRoundTrip.test.ts` の `parseDur` 突き合わせ）と
 * 同じ形で、両方を import して結果を突き合わせます。
 */
import { describe, it, expect } from 'vitest';
import * as client from '../src/utils/financeDocChain';
import * as server from '../../server/src/shared/services/finance-chain';

const MONTHS = ['2026-01', '2026-02', '2026-08', '2026-12', '2027-02', '2028-02', '2028-12'];
const TERMS = [0, 1, 15, 30, 31, 45, 60, 90, 365];
const MONTH_OFFSETS = [0, 1, 2, 3, 6, 12];

const CHAINS: client.ChainDoc[][] = [
  [],
  [{ doc_type: 'quote' }],
  [{ doc_type: 'quote', revision: 1, amount: 100 }, { doc_type: 'quote', revision: 2, amount: 120 }],
  [{ doc_type: 'quote', amount: 300 }, { doc_type: 'order', amount: 300 }],
  [{ doc_type: 'invoice', amount: 100 }, { doc_type: 'invoice', amount: 50 }],
  [{ doc_type: 'quote', revision: 3, received_at: '2026-09-05' }, { doc_type: 'invoice', received_at: '2026-09-01' }],
  [{ doc_type: 'order', status: 'rejected' }, { doc_type: 'quote' }],
  [{ doc_type: 'invoice', status: 'rejected', amount: 999 }],
];

describe('サーバーと画面で同じ答えを出す', () => {
  it('段の判定', () => {
    for (const c of CHAINS) {
      expect(server.chainStage(c as never)).toBe(client.chainStage(c));
    }
  });

  it('段の呼び名', () => {
    expect(server.CHAIN_STAGE_LABEL).toEqual(client.CHAIN_STAGE_LABEL);
  });

  it('払う金額', () => {
    for (const c of CHAINS) {
      expect(server.chainAmount(c as never)).toBe(client.chainAmount(c));
    }
  });

  it('台帳へ渡せるか', () => {
    for (const c of CHAINS) {
      expect(server.canHandoffChain(c as never)).toBe(client.canHandoffChain(c));
    }
  });

  it('支払サイトからの期日（月 × 日数の総当たり）', () => {
    for (const m of MONTHS) {
      for (const t of TERMS) {
        expect(server.paymentDueFromTerms(m, t)).toBe(client.paymentDueFromTerms(m, t));
      }
    }
  });

  it('◯か月後の月末払い', () => {
    for (const m of MONTHS) {
      for (const n of MONTH_OFFSETS) {
        expect(server.paymentDueFromMonths(m, n)).toBe(client.paymentDueFromMonths(m, n));
      }
    }
  });

  it('月末・月初・日数の足し算', () => {
    for (const m of MONTHS) {
      expect(server.endOfMonthIso(m)).toBe(client.endOfMonthIso(m));
      expect(server.startOfMonthIso(m)).toBe(client.startOfMonthIso(m));
    }
    for (const d of ['2026-01-31', '2026-02-28', '2028-02-29', '2026-12-31']) {
      for (const n of [0, 1, 30, 365]) {
        expect(server.addDaysIso(d, n)).toBe(client.addDaysIso(d, n));
      }
    }
  });

  it('書類の種類の並びが同じ（片方に order を足して片方に足さない、を防ぐ）', () => {
    expect(server.DOC_TYPES).toEqual(client.DOC_TYPES);
  });
});
