/**
 * 役務提供完了日（`purchases.service_completed_date`）の読み戻し
 *
 * ユーザー報告: 「『役務提供完了日』を入力し、更新・登録しても保存されない」
 *
 * ⚠️ 実際には**保存はされていた**。編集ダイアログがこの欄だけ `useState('')` で
 * 始めており、開き直すと必ず空欄に見え、そのまま「更新」を押すと `null` が送られて
 * **本当に消えて**いた。ここは「API が返す形をそのまま `<input type="date">` に
 * 入れられる形へ直せているか」を固定する。
 *
 * ⚠️ **この列だけ `DATE` 型**なので、API は `2026-08-31T00:00:00.000Z` を返す
 * （他の日付列は TEXT で `2026-08-31` がそのまま返る）。実測で確認済み。
 */
import { describe, expect, it } from 'vitest';
import { toServiceDateInput } from '../../client/src/contexts/finance/pages/ledger/serviceDate';

describe('toServiceDateInput', () => {
  it('DATE 型が返す ISO 文字列を YYYY-MM-DD にする（実測した形）', () => {
    expect(toServiceDateInput('2026-08-31T00:00:00.000Z')).toBe('2026-08-31');
  });

  it('すでに YYYY-MM-DD ならそのまま（TEXT 列と同じ形で来ても壊れない）', () => {
    expect(toServiceDateInput('2026-08-31')).toBe('2026-08-31');
  });

  it('未入力は空文字（`<input type="date">` は null を受け取れない）', () => {
    expect(toServiceDateInput(null)).toBe('');
    expect(toServiceDateInput(undefined)).toBe('');
    expect(toServiceDateInput('')).toBe('');
  });

  it('読めない値は空文字にする（"Invalid Date" を欄に入れない）', () => {
    expect(toServiceDateInput('あ')).toBe('');
  });

  it('月末・年またぎでも日付がずれない（UTC で切り出しているか）', () => {
    expect(toServiceDateInput('2026-12-31T00:00:00.000Z')).toBe('2026-12-31');
    expect(toServiceDateInput('2027-01-01T00:00:00.000Z')).toBe('2027-01-01');
  });
});
