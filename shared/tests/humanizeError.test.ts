/**
 * エラー文の言い換え（`shared/src/client/states/ErrorPanel.tsx`）
 *
 * ⚠️ **この画面は HTTP コードもサーバーのメッセージも出さない方針**なので、
 * 分岐を間違えても**画面を見ても気づけません**（それらしい日本語が出るだけ）。
 * 実際、財務の絞り込みで頻発していたエラーは
 * **「混み合っている(429)」「時間切れ(504)」「壊れた(500)」が全部同じ文言**で、
 * 利用者も開発者も切り分けられませんでした。だからここで固定します。
 */
import { describe, expect, it } from 'vitest';
import { humanizeError } from '../src/client/states/ErrorPanel';

const withStatus = (status: number) => ({ response: { status }, message: 'Request failed' });

describe('humanizeError', () => {
  it('混み合っている(429)・時間切れ(504)・壊れた(500) を別の文言にする', () => {
    const tooMany = humanizeError(withStatus(429));
    const timeout = humanizeError(withStatus(504));
    const broken = humanizeError(withStatus(500));
    // **3つとも違う文**であること（同じだと切り分けられない）
    expect(new Set([tooMany.cause, timeout.cause, broken.cause]).size).toBe(3);
    expect(tooMany.cause).toContain('待つ');
    expect(timeout.cause).toContain('時間内');
    expect(broken.cause).toContain('サーバー側');
  });

  it('502 / 503 は今までどおり「サーバー側で処理が止まりました」', () => {
    for (const s of [502, 503]) {
      expect(humanizeError(withStatus(s)).cause).toBe('サーバー側で処理が止まりました。');
    }
  });

  it('権限・見つからない・競合・大きすぎるはそれぞれ専用の文言', () => {
    expect(humanizeError(withStatus(403)).cause).toContain('権限');
    expect(humanizeError(withStatus(404)).cause).toContain('見つかりません');
    expect(humanizeError(withStatus(409)).cause).toContain('ほかの人');
    expect(humanizeError(withStatus(413)).cause).toContain('大きすぎます');
  });

  it('通信できないときは status を持たない', () => {
    expect(humanizeError({ message: 'Network Error' }).cause).toBe('通信ができませんでした。');
    expect(humanizeError(undefined).cause).toBe('通信ができませんでした。');
  });

  it('画面テキストに技術用語・HTTP コードを混ぜない', () => {
    const forbidden = /\d{3}|Internal Server Error|Network Error|timeout|null|undefined|SQL/i;
    for (const s of [403, 404, 409, 413, 429, 500, 502, 503, 504]) {
      const { cause, next } = humanizeError(withStatus(s));
      expect(forbidden.test(cause), `cause(${s})=${cause}`).toBe(false);
      expect(forbidden.test(next), `next(${s})=${next}`).toBe(false);
    }
  });
});
