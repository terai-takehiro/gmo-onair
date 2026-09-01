/**
 * `DATE`(OID 1082) を文字列で返す — 時間帯で日付がずれないこと
 *
 * ⚠️ **`pg` の既定では `DATE` が JS の `Date` になり、コンテナの時間帯次第で1日ずれます。**
 * `2026-08-31` は「ローカル時刻の 0 時」の `Date` になるので、JSON にすると
 * UTC では `2026-08-31T00:00:00.000Z`、`TZ=Asia/Tokyo` では
 * **`2026-08-30T15:00:00.000Z`（前日）** になります。
 * いま `TZ` はどこにも設定しておらず、**たまたま UTC だから合っていただけ**でした
 * （実測: 直す前にサーバーを `TZ=Asia/Tokyo` で起動すると、役務提供完了日が
 * `2026-08-30` として返ってきました）。
 *
 * DB 全体で DATE 列は **25 列**あるので、時間帯を設定した日に一斉にずれます。
 * ここは「その罠に戻っていないか」を、DB を使わずに固定します。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONNECTION = readFileSync(
  join(__dirname, '../../server/src/shared/db/connection.ts'), 'utf8',
);

describe('DATE の型パーサー', () => {
  it('OID 1082 のパーサーを設定している（外すと時間帯でずれる）', () => {
    expect(CONNECTION).toMatch(/setTypeParser\(\s*1082\s*,/);
  });

  it('数値のパーサー（NUMERIC / BIGINT）も残っている', () => {
    expect(CONNECTION).toMatch(/setTypeParser\(\s*1700\s*,/);
    expect(CONNECTION).toMatch(/setTypeParser\(\s*20\s*,/);
  });
});

/*
 * 直す前に**実際に壊れていた**3か所を、値の形だけ取り出して固定する。
 * どれも「`Date` が来ると壊れ、`YYYY-MM-DD` の文字列なら正しく動く」形。
 */
describe('DATE が文字列で来ることに依存している読み口', () => {
  /** 直す前に pg が返していたもの（UTC 環境の場合） */
  const asDate = new Date(Date.UTC(2026, 7, 31));
  /** 直したあと */
  const asText = '2026-08-31';

  it('`String(x).slice(0, 10)` が日付になる（qsheet の精算・放送日）', () => {
    // 直す前は "Mon Aug 31" という、日付ですらない文字列になっていた
    expect(String(asDate).slice(0, 10)).toBe('Mon Aug 31');
    expect(String(asText).slice(0, 10)).toBe('2026-08-31');
  });

  it('`^\\d{4}-\\d{2}-\\d{2}$` に当たる（引き合いのストック見直し日）', () => {
    const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
    // 直す前は JSON 経由で ISO 文字列になり、末尾アンカーに当たらず
    // 「今日が見直しの日です」と出続け、日付入力も空になっていた
    expect(ISO.test(asDate.toISOString())).toBe(false);
    expect(ISO.test(asText)).toBe(true);
  });

  it('TEXT 列へ書き戻しても形が揃う（進行台本の放送日）', () => {
    expect(String(asDate.toISOString())).toBe('2026-08-31T00:00:00.000Z');
    expect(String(asText)).toBe('2026-08-31');
  });

  it('先頭10文字を取る形は、どちらの形でも同じ結果になる（既存の読み口が壊れない）', () => {
    for (const v of [asText, '2026-08-31T00:00:00.000Z']) {
      expect(v.slice(0, 10)).toBe('2026-08-31');
      expect(v.match(/^\d{4}-\d{2}-\d{2}/)?.[0]).toBe('2026-08-31');
    }
  });
});
