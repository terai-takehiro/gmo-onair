/**
 * テロップCG ティッカーの尺計算（`shared/src/qsheet/graphicsTicker.ts`）
 *
 * ── なぜここを試すのか ──────────────────────────────────
 *
 * ティッカーは「読み切れること」が最優先（specs §6・§8）。速度を px/s で
 * 固定し、尺を文の長さから逆算する式が崩れると、長い文ほど速く流れて
 * 読めなくなる（duration 固定の典型バグ）。式と3段の速度をここで固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  TICKER_PX_PER_SEC,
  tickerPxPerSec,
  estimateTickerTextWidth,
  estimateDurationSec,
} from '../src/qsheet/graphicsTicker';

describe('tickerPxPerSec — 速度3段と未知値の既定', () => {
  it('slow=90 / normal=110 / fast=130（specs §6 の 90–130）', () => {
    expect(tickerPxPerSec('slow')).toBe(90);
    expect(tickerPxPerSec('normal')).toBe(110);
    expect(tickerPxPerSec('fast')).toBe(130);
    expect(TICKER_PX_PER_SEC.normal).toBe(110);
  });
  it('知らない値・未指定は normal に落ちる（fields は unknown で来る）', () => {
    expect(tickerPxPerSec(undefined)).toBe(110);
    expect(tickerPxPerSec('turbo')).toBe(110);
    expect(tickerPxPerSec(90)).toBe(110);
  });
});

describe('estimateDurationSec — (文の幅 + 1920) ÷ 速度', () => {
  it('10文字 @normal: (10×44×1.05 + 1920) ÷ 110', () => {
    expect(estimateTickerTextWidth('あいうえおかきくけこ')).toBeCloseTo(462, 5);
    expect(estimateDurationSec('あいうえおかきくけこ', 'normal')).toBeCloseTo((462 + 1920) / 110, 5);
  });
  it('長い文ほど尺が伸びる（速度が変わるのではない）', () => {
    const short = estimateDurationSec('あ'.repeat(10), 'normal');
    const long = estimateDurationSec('あ'.repeat(40), 'normal');
    expect(long).toBeGreaterThan(short);
    // 差はちょうど 追加30文字 ÷ 110px/s
    expect(long - short).toBeCloseTo((30 * 44 * 1.05) / 110, 5);
  });
  it('空文でも画面幅ぶんの尺は返す（0除算・0秒にならない）', () => {
    expect(estimateDurationSec('', 'fast')).toBeCloseTo(1920 / 130, 5);
  });
  it('サロゲートペア（絵文字等）も1文字と数える', () => {
    expect(estimateTickerTextWidth('𠮷野家')).toBeCloseTo(3 * 44 * 1.05, 5);
  });
});
