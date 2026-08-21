// 制作資料 (Qシート) — 合計尺 (docTotalSec) の固定。
//
// ── なぜここをテストするか ──────────────────────────────────
//
// 実装には向きが逆の2種類のフォールバックが既にあった:
//   - 編集画面: ロール尺 (section.duration) が勝ち、無ければ行の合計
//   - 進行/ランダウン: 行の合計が勝ち、0 のときだけロール尺にフォールバック
// 1本の関数に統合したとき、どちらの画面の表示結果も**1秒たりとも**変えては
// いけない。ここで両方向を固定し、将来どちらかの分岐が壊れたら気づけるようにする。
//
// また `_pageBreak` のロールは `rows` を持たない。以前の実装
// (`section.rows.reduce(...)`) はここで例外を投げる形だった (D7) ため、
// 落ちないことも合わせて固定する。
import { describe, it, expect } from 'vitest';
import { parseDur, docTotalSec } from '../src/schedule/time';

describe('parseDur', () => {
  it('mm:ss を秒に変換する', () => {
    expect(parseDur('1:30')).toBe(90);
  });
  it('整数秒の文字列をそのまま読む', () => {
    expect(parseDur('45')).toBe(45);
  });
  it('number をそのまま返す', () => {
    expect(parseDur(30)).toBe(30);
  });
  it('null / undefined / 空文字は 0', () => {
    expect(parseDur(null)).toBe(0);
    expect(parseDur(undefined)).toBe(0);
    expect(parseDur('')).toBe(0);
  });
});

describe('docTotalSec — 編集画面 (preferRoleDuration: true, ロール尺優先)', () => {
  it('ロール尺があればそれを使う (行合計は無視)', () => {
    const sections = [{ duration: '5:00', rows: [{ duration: '1:00' }, { duration: '1:00' }] }];
    expect(docTotalSec(sections, { preferRoleDuration: true })).toBe(300);
  });
  it('ロール尺が空なら行の合計にフォールバックする', () => {
    const sections = [{ duration: '', rows: [{ duration: '1:30' }, { duration: '0:30' }] }];
    expect(docTotalSec(sections, { preferRoleDuration: true })).toBe(120);
  });
  it('rows の無いロール (_pageBreak) があっても落ちない', () => {
    const sections = [{ _pageBreak: true }, { duration: '', rows: [{ duration: '1:00' }] }] as any;
    expect(docTotalSec(sections, { preferRoleDuration: true })).toBe(60);
  });
});

describe('docTotalSec — 進行/ランダウン (preferRoleDuration: false, 行合計優先)', () => {
  it('行の合計があればそれを使う (ロール尺は無視)', () => {
    const sections = [{ duration: '5:00', rows: [{ duration: '1:00' }, { duration: '1:00' }] }];
    expect(docTotalSec(sections, { preferRoleDuration: false })).toBe(120);
  });
  it('行の合計が 0 のときだけロール尺にフォールバックする', () => {
    const sections = [{ duration: '5:00', rows: [{ duration: '' }, { duration: '' }] }];
    expect(docTotalSec(sections, { preferRoleDuration: false })).toBe(300);
  });
  it('rows の無いロール (_pageBreak) があっても落ちない', () => {
    const sections = [{ _pageBreak: true }, { duration: '5:00', rows: [] }] as any;
    expect(docTotalSec(sections, { preferRoleDuration: false })).toBe(300);
  });
});

describe('docTotalSec — CM/VTR ロール (rows は空配列で duration だけ持つ)', () => {
  it('両方向で同じ値になる (rows が空なのでロール尺が必ず勝つ)', () => {
    const sections = [{ _break: true, label: 'CM', duration: '1:00', rows: [] }];
    expect(docTotalSec(sections, { preferRoleDuration: true })).toBe(60);
    expect(docTotalSec(sections, { preferRoleDuration: false })).toBe(60);
  });
});

describe('docTotalSec — 入力の防御', () => {
  it('sections が配列でなければ 0', () => {
    expect(docTotalSec(undefined, { preferRoleDuration: true })).toBe(0);
    expect(docTotalSec(null, { preferRoleDuration: false })).toBe(0);
  });
});
