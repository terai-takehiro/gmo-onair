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
  venuesOfBooking, venuesOf, venueSummary, venueLine, roomLabel,
} from '../../client/src/contexts/sales/pages/projectDetail/venue';

/** 実際に返ってきた形（項目名を写し違えないよう、実測の並びのまま） */
const booking = (rooms: string[], location_note: string | null = null) => ({
  rooms: rooms.map((name, i) => ({ room_id: `r${i}`, room_name: name })),
  location_note,
});

describe('roomLabel — 拠点の略称を前に付ける（migration 189）', () => {
  it('略称があれば「用賀 WORLD STUDIO」', () => {
    expect(roomLabel({ room_name: 'WORLD STUDIO', location_abbreviation: '用賀' }))
      .toBe('用賀 WORLD STUDIO');
  });

  /*
   * **決めていない拠点には前置きを付けない。** 正式名
   * （「GMOサムライスタジオ用賀」= 12文字）で代用すると、案件詳細の枠では
   * 拠点名だけで埋まって部屋名が消える。だから `location_name` は受け取らない
   */
  it('略称が無ければ部屋名だけ（正式名で代用しない）', () => {
    expect(roomLabel({ room_name: 'WORLD STUDIO' })).toBe('WORLD STUDIO');
    expect(roomLabel({ room_name: 'WORLD STUDIO', location_abbreviation: null })).toBe('WORLD STUDIO');
    expect(roomLabel({ room_name: 'WORLD STUDIO', location_abbreviation: '  ' })).toBe('WORLD STUDIO');
  });

  // 「外現場」拠点の部屋名に拠点名が入っているような場合。**同じ語を2回言わない**
  it('部屋名に略称が入っていれば重ねない', () => {
    expect(roomLabel({ room_name: '用賀スタジオ', location_abbreviation: '用賀' })).toBe('用賀スタジオ');
  });

  it('部屋名が無ければ空（呼ぶ側が落とす）', () => {
    expect(roomLabel({ room_name: null, location_abbreviation: '用賀' })).toBe('');
  });
});

describe('venuesOfBooking — 予約1件の場所', () => {
  it('部屋を押さえている予約は部屋名を返す', () => {
    // **`toMatchObject`**（`toEqual` ではない）。重複を除くための鍵（`key`）が
    // 増えたが、ここで見たいのは**名前と種類**だけ（レビューでの指摘 #101）
    expect(venuesOfBooking(booking(['WORLD STUDIO', '第1調整室']))).toMatchObject([
      { name: 'WORLD STUDIO', kind: 'room' },
      { name: '第1調整室', kind: 'room' },
    ]);
  });

  it('外現場は `location_note` を場所として返す', () => {
    expect(venuesOfBooking(booking([], '幕張メッセ 展示ホール9'))).toMatchObject([
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

  // **拠点が違えば同じ部屋名でも別の場所**（「第1スタジオ」は渋谷にも福岡にもありうる）
  it('拠点の略称まで含めて重複を見る', () => {
    const bookings = [
      { rooms: [{ room_id: 'a', room_name: '第1スタジオ', location_abbreviation: '渋谷' }], location_note: null },
      { rooms: [{ room_id: 'b', room_name: '第1スタジオ', location_abbreviation: '福岡' }], location_note: null },
    ];
    expect(venuesOf(bookings).map((v) => v.name)).toEqual(['渋谷 第1スタジオ', '福岡 第1スタジオ']);
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

  // **同じ語を2回言わない。** 「用賀 A・用賀 B」だと部屋名に使える幅が減る
  it('同じ拠点の部屋が並ぶときは略称を1回だけ前に出す', () => {
    const b = {
      rooms: [
        { room_id: 'a', room_name: 'WORLD STUDIO', location_abbreviation: '用賀' },
        { room_id: 'b', room_name: '第1調整室', location_abbreviation: '用賀' },
      ],
      location_note: null,
    };
    expect(venueLine(b)).toBe('用賀 WORLD STUDIO・第1調整室');
  });

  // 拠点をまたぐ予約で畳むと、どちらの部屋がどの拠点か分からなくなる
  it('拠点が違えば1つずつ略称を付ける', () => {
    const b = {
      rooms: [
        { room_id: 'a', room_name: 'WORLD STUDIO', location_abbreviation: '用賀' },
        { room_id: 'b', room_name: '第1スタジオ', location_abbreviation: '渋谷' },
      ],
      location_note: null,
    };
    expect(venueLine(b)).toBe('用賀 WORLD STUDIO・渋谷 第1スタジオ');
  });

  // **外現場のメモは畳みの対象にしない**（消えると押さえた場所が行から落ちる）
  it('部屋を畳んでも外現場のメモは必ず出す', () => {
    const b = {
      rooms: ['A', 'B', 'C', 'D'].map((n, i) => ({ room_id: `r${i}`, room_name: n })),
      location_note: '幕張メッセ',
    };
    expect(venueLine(b)).toBe('A・B・C +1・幕張メッセ');
  });
});
