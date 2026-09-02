/**
 * 財務ダッシュボードの集計期間（① 財務ダッシュボード）
 *
 * ⚠️ **この計算が壊れても画面は「エラー」としか言いません。**
 * `ErrorPanel` は方針として HTTP コードもサーバーのメッセージも出さない
 * （`shared/src/client/states/ErrorPanel.tsx`）ので、`-01` のような壊れた日付を
 * 送っていても、利用者にも開発者にも「損益を読み込めませんでした」としか見えず、
 * **原因に辿り着けません**。だからここで固定します。
 *
 * ユーザー報告: 「特定の案件を絞り込み かつ 期間絞り込みを解除すると
 * 『損益を読み込めませんでした』のエラーが表示される」
 */
import { describe, expect, it } from 'vitest';
import {
  resolvePeriod,
  summaryPeriodParams,
  ledgerPeriodParams,
  type PeriodInput,
} from '../../client/src/contexts/finance/pages/financeDashboard/period';

const base: PeriodInput = {
  mode: 'month', month: '2026-08', year: 2026, quarter: 3,
  rangeFrom: '2026-01', rangeTo: '2026-08',
};

describe('resolvePeriod', () => {
  it('月を指定すると、その月の初日〜末日になる', () => {
    const p = resolvePeriod(base);
    expect(p).toMatchObject({ from: '2026-08-01', to: '2026-08-31', all: false, valid: true });
    // 30日の月・うるう年の2月も**実在する末日**（以前は一律 `-31` だった）
    expect(resolvePeriod({ ...base, month: '2026-09' })).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolvePeriod({ ...base, month: '2028-02' })).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
    expect(resolvePeriod({ ...base, month: '2026-02' })).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });

  /*
   * 末日は**実在する月末日**。以前は一律 `-31`（`2026-09-31` のような実在しない日）を
   * 「TEXT の文字列比較だから月末を必ず含められる」として残していたが、
   * その値が台帳の URL（`recognition_to=2026-04-31`）にそのまま出ていた。
   * サーバーの比較は `recognition_date <= ?`（`finance/list-query.ts`・
   * `monthly-summary.service.ts`）なので、`2026-09-30` でも 9/30 の計上は落ちない。
   */
  it('四半期・年はそのまま範囲になる', () => {
    expect(resolvePeriod({ ...base, mode: 'quarter', quarter: 3 })).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(resolvePeriod({ ...base, mode: 'year' })).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('期間指定は開始と終了が逆でも入れ替えて受ける', () => {
    expect(resolvePeriod({ ...base, mode: 'range', rangeFrom: '2026-08', rangeTo: '2026-01' }))
      .toMatchObject({ from: '2026-01-01', to: '2026-08-31', valid: true });
  });

  // ── ここからが今回の不具合 ──────────────────────────────────

  it('月を空にしても `-01` のような日付を作らない（作ると 400 になっていた）', () => {
    const p = resolvePeriod({ ...base, month: '' });
    expect(p.from).toBe('');
    expect(p.to).toBe('');
    expect(p.valid).toBe(false);
  });

  it('期間指定の開始・終了が空でも同じく読み込みに行かせない', () => {
    expect(resolvePeriod({ ...base, mode: 'range', rangeFrom: '' }).valid).toBe(false);
    expect(resolvePeriod({ ...base, mode: 'range', rangeTo: '' }).valid).toBe(false);
  });

  it('`YYYY-MM` の形でない入力も弾く', () => {
    for (const month of ['2026', '2026-', '26-08', 'あ', '2026-08-15']) {
      expect(resolvePeriod({ ...base, month }).valid, month).toBe(false);
    }
  });

  it('全期間は from/to を持たず、それ自体は有効', () => {
    expect(resolvePeriod({ ...base, mode: 'all' }))
      .toMatchObject({ from: '', to: '', all: true, valid: true, label: '全期間' });
  });
});

describe('送るパラメータ', () => {
  it('全期間は `all=1` だけを送る（空の from/to を送らない）', () => {
    const p = resolvePeriod({ ...base, mode: 'all' });
    expect(summaryPeriodParams(p)).toEqual({ all: '1' });
    // 台帳系は「条件を付けない＝全期間」なので鍵ごと落とす
    expect(ledgerPeriodParams(p)).toEqual({});
  });

  it('月を指定したときは from/to を送る', () => {
    const p = resolvePeriod(base);
    expect(summaryPeriodParams(p)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(ledgerPeriodParams(p)).toEqual({ recognition_from: '2026-08-01', recognition_to: '2026-08-31' });
  });

  it('未入力のときは空のまま（`from: ""` を送らない）', () => {
    const p = resolvePeriod({ ...base, month: '' });
    expect(summaryPeriodParams(p)).toEqual({});
    expect(ledgerPeriodParams(p)).toEqual({});
    // 呼び出し側の `enabled` は `valid` を見る。**`!!from` では `'-01'` を通してしまう**
    expect(p.valid).toBe(false);
  });
});
