/**
 * 会場・スタジオの書き方（`projectDetail/venue.ts`）
 *
 * **ここを間違えると「押さえた場所が画面に出ない」**という壊れ方をします。
 * 実際に起きていたのがそれで（`booking.room_name` を読んでいたが、サーバーは
 * その項目を返さない）、**押さえている部屋があっても必ず「部屋 未設定」**でした。
 * 画面を見ても「まだ押さえていないのだろう」と読めてしまうので気づけません。
 *
 * サーバーが返す形は `GET /studios/bookings?project_id=` の実測に合わせてあります
 * （実 Postgres ＋ 実サーバーで確認: 部屋は `rooms[]`、外現場は `location_note`）。
 */
import { describe, it, expect } from 'vitest';
import {
  venuesOfBooking, venuesOf, venueSummary, venueLine,
} from '../../client/src/contexts/sales/pages/projectDetail/venue';

/** 実際に返ってきた形（項目名を写し違えないよう、実測の並びのまま） */
const booking = (rooms: string[], location_note: string | null = null) => ({
  rooms: rooms.map((name, i) => ({ room_id: `r${i}`, room_name: name })),
  location_note,
});

describe('venuesOfBooking — 予約1件の場所', () => {
  it('部屋を押さえている予約は部屋名を返す', () => {
    expect(venuesOfBooking(booking(['WORLD STUDIO', '第1調整室']))).toEqual([
      { name: 'WORLD STUDIO', kind: 'room' },
      { name: '第1調整室', kind: 'room' },
    ]);
  });

  it('外現場は `location_note` を場所として返す', () => {
    expect(venuesOfBooking(booking([], '幕張メッセ 展示ホール9'))).toEqual([
      { name: '幕張メッセ 展示ホール9', kind: 'place' },
    ]);
  });

  // **両方持つ予約を落とさない**（部屋を押さえたうえで外の会場も書いてある）
  it('部屋と外現場の両方があれば両方返す', () => {
    expect(venuesOfBooking(booking(['SKY STUDIO'], '搬入は品川ふ頭')).map((v) => v.name))
      .toEqual(['SKY STUDIO', '搬入は品川ふ頭']);
  });

  it('部屋も場所も無い予約は空（「場所が未設定」と書けるように、ここでは文言を決めない）', () => {
    expect(venuesOfBooking(booking([]))).toEqual([]);
    expect(venuesOfBooking({})).toEqual([]);
    // 空白だけの手入力は場所として数えない（「 」が会場名になると消せない）
    expect(venuesOfBooking(booking([], '   '))).toEqual([]);
  });
});

describe('venuesOf — 案件の予約すべて', () => {
  // **本番とリハで同じ部屋を押さえるのが普通**。数えると「ほか1室」が嘘になる
  it('同じ部屋を2回数えない', () => {
    const bookings = [booking(['WORLD STUDIO']), booking(['WORLD STUDIO', '第1調整室'])];
    expect(venuesOf(bookings).map((v) => v.name)).toEqual(['WORLD STUDIO', '第1調整室']);
  });

  it('サーバーが返した順のまま（並べ替えない）', () => {
    const bookings = [booking(['第3スタジオ']), booking(['第1スタジオ'])];
    expect(venuesOf(bookings).map((v) => v.name)).toEqual(['第3スタジオ', '第1スタジオ']);
  });

  it('予約が1件も無ければ空', () => {
    expect(venuesOf([])).toEqual([]);
  });
});

describe('venueSummary — 事実の帯の1行', () => {
  it('先頭1つと残りの数を返す', () => {
    expect(venueSummary([booking(['WORLD STUDIO', '第1調整室'])]))
      .toEqual({ first: 'WORLD STUDIO', extra: 1, unit: '室' });
  });

  it('1つだけなら「ほか」を出さない（extra 0）', () => {
    expect(venueSummary([booking(['SKY STUDIO'])]))
      .toEqual({ first: 'SKY STUDIO', extra: 0, unit: '室' });
  });

  // **外現場が混ざったら「室」と言えない**（幕張メッセは部屋ではない）
  it('残りに外現場が混ざると単位が「件」になる', () => {
    expect(venueSummary([booking(['WORLD STUDIO']), booking([], '幕張メッセ')]))
      .toEqual({ first: 'WORLD STUDIO', extra: 1, unit: '件' });
  });

  it('場所が1つも無ければ null（呼ぶ側が「押さえていません」と書き分ける）', () => {
    expect(venueSummary([])).toBeNull();
    expect(venueSummary([booking([])])).toBeNull();
  });
});

describe('venueLine — 右の欄の1行', () => {
  it('中黒でつなぐ', () => {
    expect(venueLine(booking(['WORLD STUDIO', '第1調整室']))).toBe('WORLD STUDIO・第1調整室');
  });

  // **数を落とさない。** 畳んだぶんは `+N` で必ず見える
  it('3つを超えたら +N に畳む', () => {
    expect(venueLine(booking(['A', 'B', 'C', 'D', 'E']))).toBe('A・B・C +2');
  });

  it('場所が無ければ null', () => {
    expect(venueLine(booking([]))).toBeNull();
  });
});
