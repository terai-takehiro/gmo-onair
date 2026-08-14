/**
 * 会場・スタジオの書き方（案件詳細 ⑥ の事実の帯と右の欄）
 *
 * ── なぜこのファイルが必要になったか ────────────────────────
 *
 * 概要タブは会場を `booking.room_name ?? booking.location_name` で描いていました。
 * **`GET /studios/bookings` はそのどちらの項目も返しません** — 部屋は
 * `rooms[]`（`studio_booking_rooms` → `studio_rooms`）にぶら下がり、外現場は
 * `location_note`（予約の1項目）です。つまり**押さえている部屋があっても
 * 必ず「部屋 未設定」になっていました**（実 Postgres ＋ 実サーバーで確認。
 * 利用者からのご指摘「どうやってもいまは会場未定になる」はこれです）。
 *
 * 型（`types.ts` の `StudioBooking`）が**存在しない項目を宣言していた**ので、
 * 型チェックにも lint にも出ませんでした。**API が返す形に型を合わせた**うえで、
 * 表示の組み立てをこの1か所に集めます。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 * - **部屋も外現場も「押さえた場所」として同じ並びに入れる。** 予約は
 *   ①部屋だけ ②外現場のメモだけ ③両方 の3通りがあり、どれかを落とすと
 *   **押さえたのに画面に出ない場所**ができる（いちばん困る壊れ方）
 * - **拠点名は出さない。** `studio_locations` に略称が無く、正式名は
 *   「GMOサムライスタジオ用賀」で、事実の帯の1枠（約250px）では部屋名が消える。
 *   `GMOサムライスタジオ` を機械的に削る細工はしない（拠点が増えた日に崩れる）
 * - **同じ部屋を2回数えない。** 本番とリハで同じ部屋を押さえるのが普通なので、
 *   数えると「WORLD STUDIO ほか1室」が実際は1室になる
 * - **並べ替えない。** サーバーが 拠点 → 部屋 の並びで返すので、その順のまま
 */

/** `GET /studios/bookings` の `rooms[]` のうち、表示に使う項目だけ */
export interface VenueRoom {
  room_name: string | null;
}

/** 場所を持つもの（予約）。`StudioBooking` もこの形を満たす */
export interface VenueBooking {
  rooms?: VenueRoom[] | null;
  location_note?: string | null;
}

export interface Venue {
  name: string;
  /** 部屋マスターの部屋か、手入力の場所（外現場）か。数え方の単位が変わる */
  kind: 'room' | 'place';
}

const clean = (s: string | null | undefined): string => (s ?? '').trim();

/** 予約1件が押さえている場所。**部屋 ＋ 外現場のメモ**（どちらも落とさない） */
export function venuesOfBooking(b: VenueBooking): Venue[] {
  const out: Venue[] = [];
  for (const r of b.rooms ?? []) {
    const name = clean(r?.room_name);
    if (name) out.push({ name, kind: 'room' });
  }
  const note = clean(b.location_note);
  if (note) out.push({ name: note, kind: 'place' });
  return out;
}

/** 案件の予約すべてから、重複を除いた場所の並び（サーバーが返した順のまま） */
export function venuesOf(bookings: VenueBooking[]): Venue[] {
  const seen = new Set<string>();
  const out: Venue[] = [];
  for (const b of bookings ?? []) {
    for (const v of venuesOfBooking(b)) {
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      out.push(v);
    }
  }
  return out;
}

export interface VenueSummary {
  /** 先頭の1つ。事実の帯はこれだけを大きく出す */
  first: string;
  /** 残りの数。0 なら添えない */
  extra: number;
  /** 残りの数え方。**外現場が混ざったら「室」と言えない** */
  unit: '室' | '件';
}

/**
 * 事実の帯（1行）用のまとめ。
 *
 * **場所が1つも無いときは `null`** を返す（呼ぶ側が「押さえていません」と
 * 「予約はあるが部屋が入っていない」を書き分けられるように、ここでは文言を決めない）。
 */
export function venueSummary(bookings: VenueBooking[]): VenueSummary | null {
  const venues = venuesOf(bookings);
  if (venues.length === 0) return null;
  const rest = venues.slice(1);
  return {
    first: venues[0].name,
    extra: rest.length,
    unit: rest.every((v) => v.kind === 'room') ? '室' : '件',
  };
}

/** 上限を超えた分を `+N` に畳んで並べる（右の欄の1行）。既定は3つまで */
export function venueLine(b: VenueBooking, max = 3): string | null {
  const names = venuesOfBooking(b).map((v) => v.name);
  if (names.length === 0) return null;
  if (names.length <= max) return names.join('・');
  return `${names.slice(0, max).join('・')} +${names.length - max}`;
}
