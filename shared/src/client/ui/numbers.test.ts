/**
 * 金額の丸めのテスト。
 *
 * ── なぜここだけテストするか ──────────────────────────────────
 * 73画面すべてにテストを書くのは費用が見合わないので、**土台の計算だけ**に絞る
 * (docs/v4-plan.md「自動テストについて」)。金額の丸めはその筆頭:
 *
 *   ・**画面を見ても間違いに気づけない。** 「¥1,235万」が正しいのか
 *     「¥1,234万」が正しいのか、見ただけでは分からない
 *   ・**型でも lint でも捕まらない。** どれも `string` を返す正しいコード
 *   ・**実ブラウザの検査 (verify-ui) でも捕まらない。** 桁の位置は見ているが
 *     数字が合っているかは見ていない
 *   ・実際に **4通りに割れていて、同じ画面の中で食い違っていた**
 *     (KPI カード `¥1,234.568万` / 同じ画面のグラフ `¥1235万`)
 */
import { describe, it, expect } from 'vitest';
import { manYen, toMan, compactYen, formatNum } from './numbers';

describe('manYen — 常に万円', () => {
  it('四捨五入する', () => {
    expect(manYen(4_999)).toBe('¥0万');
    expect(manYen(5_000)).toBe('¥1万');
    expect(manYen(14_999)).toBe('¥1万');
    expect(manYen(15_000)).toBe('¥2万');
    expect(manYen(12_345_678)).toBe('¥1,235万');
  });

  it('**負の数でも同じ丸め方になる** (ここが4通りに割れていた原因)', () => {
    expect(manYen(-5_000)).toBe('¥-1万');
    expect(manYen(-15_000)).toBe('¥-2万');
    expect(manYen(-12_345_678)).toBe('¥-1,235万');
  });

  it('**「¥-0万」を出さない**', () => {
    // Math.round(-0.4999) は -0 になる。そのまま出すと符号だけ残った
    // 「¥-0万」という読めない表示になる (旧実装の1つが実際にそうだった)
    expect(manYen(-4_999)).toBe('¥0万');
    expect(manYen(-1)).toBe('¥0万');
    expect(Object.is(toMan(-4_999), 0)).toBe(true); // -0 ではなく 0
  });

  it('桁区切りは ja-JP で固定する (ブラウザの言語設定に左右されない)', () => {
    expect(manYen(10_000_000)).toBe('¥1,000万');
  });

  it('未入力と 0 を区別する', () => {
    expect(manYen(null)).toBe('—');
    expect(manYen(undefined)).toBe('—');
    expect(manYen('')).toBe('—');
    expect(manYen('あ')).toBe('—');
    expect(manYen(0)).toBe('¥0万');
  });

  it('文字列の数値も受ける (API が文字列で返す列がある)', () => {
    expect(manYen('12345678')).toBe('¥1,235万');
  });
});

describe('compactYen — 1万円未満はそのままの円', () => {
  it('**5,000 円を「¥1万」にしない** (倍に見えるため)', () => {
    expect(compactYen(5_000)).toBe('¥5,000');
    expect(compactYen(9_999)).toBe('¥9,999');
    expect(compactYen(-4_999)).toBe('¥-4,999');
  });

  it('1万円以上は manYen と同じ', () => {
    expect(compactYen(10_000)).toBe('¥1万');
    expect(compactYen(15_000)).toBe('¥2万');
    expect(compactYen(-15_000)).toBe('¥-2万');
    expect(compactYen(12_345_678)).toBe('¥1,235万');
  });

  it('未入力は —', () => {
    expect(compactYen(null)).toBe('—');
    expect(compactYen(0)).toBe('¥0');
  });
});

describe('formatNum — 金額でない数字', () => {
  it('0 と未入力を区別する', () => {
    expect(formatNum(0)).toBe('0');
    expect(formatNum(null)).toBe(null);
    expect(formatNum('')).toBe(null);
  });

  it('桁区切りを入れる', () => {
    expect(formatNum(1234567)).toBe('1,234,567');
  });
});
