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
  ledgerOpenQuery,
  type PeriodInput,
} from '../../client/src/contexts/finance/pages/financeDashboard/period';
import {
  singleMonthOf,
  ledgerPeriodFromUrl,
} from '../../client/src/contexts/finance/pages/ledger/ledgerUrlPeriod';

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

/*
 * ── ダッシュボード → 台帳 の受け渡し（9/2 仕様変更・F4）─────────────
 *
 * ⚠️ **ここが食い違っても画面はエラーを出しません。**
 * 台帳は期間で絞れてはいるのに「計上月」の欄が空のままで、利用者からは
 * 「何で絞られているのか分からない」としか見えませんでした
 * （ユーザー報告「月で絞り込んで台帳を開くと、計上月の部分に表示がされていない」）。
 *
 * 直し方は「単月なら計上月の欄に入れ、from/to は落とす」。
 * `recognition_date` は TEXT の `YYYY-MM-DD` なので、サーバー側の
 * `LIKE '2026-04-%'` と `>= '2026-04-01' AND <= '2026-04-30'` は同じ集合を指し、
 * **絞り込みの結果は1件も変わりません**（`server/.../finance/list-query.ts`）。
 * だから「月の欄に入れてよいのは、ちょうど1つの月に収まるときだけ」を固定します。
 */
describe('singleMonthOf', () => {
  it('月初から実在の月末までなら、その月を返す', () => {
    expect(singleMonthOf('2026-08-01', '2026-08-31')).toBe('2026-08');
    expect(singleMonthOf('2026-09-01', '2026-09-30')).toBe('2026-09');   // 30日の月
    expect(singleMonthOf('2028-02-01', '2028-02-29')).toBe('2028-02');   // うるう年
    expect(singleMonthOf('2026-02-01', '2026-02-28')).toBe('2026-02');
  });

  it('1つの月に収まらない・半端な範囲は空（＝月の欄に入れない）', () => {
    expect(singleMonthOf('2026-04-01', '2026-06-30')).toBe('');   // 四半期
    expect(singleMonthOf('2026-01-01', '2026-12-31')).toBe('');   // 年
    expect(singleMonthOf('2026-04-01', '2026-04-29')).toBe('');   // 月末まで無い
    expect(singleMonthOf('2026-04-02', '2026-04-30')).toBe('');   // 月初から無い
    // 実在しない月末（以前はダッシュボードが `-31` を組み立てていた）も入れない
    expect(singleMonthOf('2026-09-01', '2026-09-31')).toBe('');
    expect(singleMonthOf('2026-13-01', '2026-13-31')).toBe('');
    expect(singleMonthOf('', '')).toBe('');
    expect(singleMonthOf('2026-04', '2026-04')).toBe('');
  });
});

describe('ledgerPeriodFromUrl', () => {
  it('単月で来たら計上月の欄に入れ、期間（from/to）は持たない', () => {
    const p = resolvePeriod(base);
    const got = ledgerPeriodFromUrl(p.from, p.to, p.label, false, false);
    expect(got.month).toBe('2026-08');
    expect(got.range).toBeNull();
    expect(got.handoff).toEqual({ kind: 'month', label: p.label });
  });

  it('四半期・年は月の欄に入れず期間として持つ（嘘の月を出さない）', () => {
    const q = resolvePeriod({ ...base, mode: 'quarter', quarter: 2 });
    const got = ledgerPeriodFromUrl(q.from, q.to, q.label, false, false);
    expect(got.month).toBe('');
    expect(got.range).toEqual({ from: '2026-04-01', to: '2026-06-30', label: q.label });
    expect(got.handoff?.kind).toBe('range');
  });

  it('`period_label` が無くても、帯には人が読む形の月を出す', () => {
    /*
     * ダッシュボードの「台帳をひらく」は必ず `period_label` を付けるが、
     * **URL を手で書いた人・古いブックマークには付いていない**。
     * 以前はそのとき `2026-04` と機械の形が帯に出ていた（画面の他の場所は
     * すべて `2026年04月`）。ここが崩れても画面は普通に動くので、
     * 誰も報告しないまま残る類の食い違い。だからテストで固定する。
     */
    const got = ledgerPeriodFromUrl('2026-04-01', '2026-04-30', '', false, false);
    expect(got.month).toBe('2026-04');
    expect(got.handoff).toEqual({ kind: 'month', label: '2026年04月' });
  });

  it('全期間で来たら「全月」で開く（黙って今月にしない）', () => {
    const got = ledgerPeriodFromUrl('', '', '全期間', true, false);
    expect(got).toMatchObject({ month: '', range: null, handoff: { kind: 'all', label: '全期間' } });
  });

  it('期間なしで来たとき: 案件で絞っていれば全月、そうでなければ今月', () => {
    expect(ledgerPeriodFromUrl('', '', '', false, true)).toMatchObject({ month: '', handoff: null });
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    expect(ledgerPeriodFromUrl('', '', '', false, false)).toMatchObject({ month: ym, handoff: null });
  });

  it('月と期間を同時には持たない（サーバーが AND で合成して0件になるため）', () => {
    for (const p of [
      resolvePeriod(base),
      resolvePeriod({ ...base, mode: 'quarter' }),
      resolvePeriod({ ...base, mode: 'year' }),
      resolvePeriod({ ...base, mode: 'all' }),
    ]) {
      const got = ledgerPeriodFromUrl(p.from, p.to, p.label, p.all, false);
      expect(!!got.month && !!got.range, p.label).toBe(false);
    }
  });
});

describe('ledgerOpenQuery（「台帳をひらく」の URL）', () => {
  it('月で見ていたときは、台帳の計上月の欄にその月が入る', () => {
    const q = new URLSearchParams(ledgerOpenQuery(resolvePeriod(base)));
    expect(q.get('recognition_from')).toBe('2026-08-01');
    expect(q.get('recognition_to')).toBe('2026-08-31');
    // ⚠️ ここが今回の要望。URL を台帳側の読み取りに通すと月が埋まる
    expect(ledgerPeriodFromUrl(
      q.get('recognition_from') ?? '', q.get('recognition_to') ?? '',
      q.get('period_label') ?? '', q.get('period_all') === '1', false,
    ).month).toBe('2026-08');
  });

  it('全期間は `period_all=1` を載せる（載せないと台帳が既定の今月で開く）', () => {
    const q = new URLSearchParams(ledgerOpenQuery(resolvePeriod({ ...base, mode: 'all' })));
    expect(q.get('period_all')).toBe('1');
    expect(q.get('period_label')).toBe('全期間');
    // 台帳 API へ送る条件は増やさない（`period_all` は URL だけの鍵）
    expect(q.get('recognition_from')).toBeNull();
  });

  it('月が未入力（valid=false）のときは何も載せない', () => {
    expect(ledgerOpenQuery(resolvePeriod({ ...base, month: '' }))).toBe('');
  });
});

/*
 * 内訳の**行クリック**の引き継ぎ（ご指摘「明細一覧に飛ばしてください」）。
 *
 * 3列とも「押す＝その台帳の明細一覧へ移動」に揃えたので、行クリックも
 * カード下の「台帳をひらく」も**同じ `ledgerOpenQuery`** を通る。違うのは
 * 案件を付けるかどうかだけ（行＝その行の案件／フッター＝画面で絞り込み中の案件）。
 *
 * ⚠️ ここで確かめたいのは「URL を作れること」ではなく、**作った URL を台帳側の
 * 読み取り（`ledgerPeriodFromUrl`）に通すと、ダッシュボードで見ていたのと同じ
 * 期間で開く**こと。片側だけ直しても画面上は何も言わずに今月へ落ちるため。
 */
describe('内訳の行クリック → 台帳（明細一覧）の引き継ぎ', () => {
  it('売上・仕入の行は、その行の案件と月を持って台帳を開く', () => {
    // 行が持っている案件（画面の絞り込みとは無関係に、押した行のもの）
    const q = new URLSearchParams(
      ledgerOpenQuery(resolvePeriod(base), 'p-1', 'GLS-A001 スタジオ収録'),
    );
    expect(q.get('project_id')).toBe('p-1');
    expect(q.get('project_name')).toBe('GLS-A001 スタジオ収録');
    // 台帳側の読み取りに通すと、計上月の欄が埋まる（単月なので `range` にはしない）
    const read = ledgerPeriodFromUrl(
      q.get('recognition_from') ?? '', q.get('recognition_to') ?? '',
      q.get('period_label') ?? '', q.get('period_all') === '1', !!q.get('project_id'),
    );
    expect(read).toMatchObject({ month: '2026-08', range: null });
    expect(read.handoff?.kind).toBe('month');
  });

  it('月に収まらない期間（四半期）で押しても、その期間のまま台帳が開く', () => {
    const q = new URLSearchParams(
      ledgerOpenQuery(resolvePeriod({ ...base, mode: 'quarter', quarter: 3 }), 'p-1', '案件'),
    );
    const read = ledgerPeriodFromUrl(
      q.get('recognition_from') ?? '', q.get('recognition_to') ?? '',
      q.get('period_label') ?? '', q.get('period_all') === '1', true,
    );
    // 月の欄には入れようが無いので空のまま、期間として持ち続ける
    expect(read.month).toBe('');
    expect(read.range).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(read.handoff?.kind).toBe('range');
  });

  it('販管費の行は案件を付けない（案件に紐づかないため）', () => {
    const q = new URLSearchParams(ledgerOpenQuery(resolvePeriod(base)));
    expect(q.get('project_id')).toBeNull();
    expect(q.get('project_name')).toBeNull();
    // 期間だけはちゃんと引き継ぐ（`?project_id` が無いので `hasProject` は false）
    expect(ledgerPeriodFromUrl(
      q.get('recognition_from') ?? '', q.get('recognition_to') ?? '',
      q.get('period_label') ?? '', false, false,
    ).month).toBe('2026-08');
  });

  it('全期間で見ているときに行を押しても、台帳が既定の今月へ落ちない', () => {
    // ⚠️ ここが落ちると、ダッシュボードの金額と台帳の金額が黙って食い違う
    const q = new URLSearchParams(ledgerOpenQuery(resolvePeriod({ ...base, mode: 'all' }), 'p-1', '案件'));
    const read = ledgerPeriodFromUrl(
      q.get('recognition_from') ?? '', q.get('recognition_to') ?? '',
      q.get('period_label') ?? '', q.get('period_all') === '1', true,
    );
    expect(read).toMatchObject({ month: '', range: null });
    expect(read.handoff?.kind).toBe('all');
  });
});
