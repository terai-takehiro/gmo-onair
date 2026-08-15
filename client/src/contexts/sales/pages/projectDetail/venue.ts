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
 * - **拠点は略称だけを前に付ける**（`studio_locations.abbreviation`・migration 189）。
 *   正式名「GMOサムライスタジオ用賀」は12文字あり、帯の1枠（200〜270px）では
 *   **拠点名だけで埋まって部屋名が消える**。**略称が決まっていなければ前置きを
 *   付けない**（部屋名だけ）— 正式名で代用すると枠が壊れる。
 *   ⚠️ **正式名を機械的に短くしない。**「GMOサムライスタジオ」を削る細工は、
 *   拠点が増えた日・名前が変わった日に黙って崩れる。**略称は人が決めるもの**で、
 *   設定 → 拠点・部屋（`/settings/sites`）で直せる
 * - **同じ部屋を2回数えない。** 本番とリハで同じ部屋を押さえるのが普通なので、
 *   数えると「用賀 WORLD STUDIO ほか1室」が実際は1室になる
 * - **並べ替えない。** サーバーが 拠点 → 部屋 の並びで返すので、その順のまま
 */

/** `GET /studios/bookings` の `rooms[]` のうち、表示に使う項目だけ */
export interface VenueRoom {
  room_name: string | null;
  /** 拠点の略称。**決めていなければ NULL**（正式名では代用しない） */
  location_abbreviation?: string | null;
  /**
   * 部屋マスターの id。**重複を除くときの鍵**（レビューでの指摘 #101）。
   * 画面に出す名前で数えると、**別の拠点にある同じ名前の部屋**（「第1スタジオ」が
   * 用賀にも渋谷にもある・どちらも略称を決めていない）が同じものと見なされ、
   * **押さえた部屋が1つ画面から消えます**（「ほか1室」が出ない）。
   */
  room_id?: string | null;
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
  /**
   * 重複を除くための鍵。**部屋は id、外現場は文字**（`venuesOf` の説明）。
   * 画面には出しません。
   */
  key: string;
}

const clean = (s: string | null | undefined): string => (s ?? '').trim();

/**
 * 部屋1つの書き方。**拠点の略称があれば前に付ける**（「用賀 WORLD STUDIO」）。
 * 略称を決めていない拠点は**部屋名だけ**（正式名は長すぎて枠が壊れる）
 */
export function roomLabel(r: VenueRoom): string {
  const name = clean(r?.room_name);
  if (!name) return '';
  const loc = clean(r?.location_abbreviation);
  // **略称が部屋名にすでに入っているときは重ねない**（「用賀 用賀スタジオ」を作らない）
  if (!loc || name.includes(loc)) return name;
  return `${loc} ${name}`;
}

/** 予約1件が押さえている場所。**部屋 ＋ 外現場のメモ**（どちらも落とさない） */
export function venuesOfBooking(b: VenueBooking): Venue[] {
  const out: Venue[] = [];
  for (const r of b.rooms ?? []) {
    const name = roomLabel(r);
    /*
     * **鍵は id と名前の両方**。id だけにすると、id が付いていない応答や
     * 予約ごとに番号を振り直す作りの相手に当たったとき、**別の部屋が
     * 同じ鍵になって消えます**（消えても画面には何も出ません）。
     * 両方が一致したときだけ同じものと見なす＝**多く出るほうに倒す**
     * （同じ部屋が2回並ぶのは目で分かるが、消えたことは分からない）。
     */
    if (name) out.push({ name, kind: 'room', key: `room:${clean(r?.room_id)}|${name}` });
  }
  const note = clean(b.location_note);
  if (note) out.push({ name: note, kind: 'place', key: `place:${note}` });
  return out;
}

/**
 * 案件の予約すべてから、重複を除いた場所の並び（サーバーが返した順のまま）。
 *
 * ⚠️ **数えるのは名前ではなく部屋の id**（レビューでの指摘 #101）。
 * 本番とリハで同じ部屋を押さえるのは普通なので重複は除きますが、
 * **名前で除くと「別の拠点の同じ名前の部屋」まで消えます**
 * （略称を決めていない拠点どうしだと、画面上の名前がまったく同じになる）。
 * 消えたことは画面に出ないので、**押さえた部屋が1つ無いこと**に誰も気づけません。
 */
export function venuesOf(bookings: VenueBooking[]): Venue[] {
  const seen = new Set<string>();
  const out: Venue[] = [];
  for (const b of bookings ?? []) {
    for (const v of venuesOfBooking(b)) {
      // 部屋は id、外現場のメモは文字そのものが鍵（id を持たない）
      const key = v.key;
      if (seen.has(key)) continue;
      seen.add(key);
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

/**
 * 予約1件を1行で書く（右の欄）。上限を超えた部屋は `+N` に畳む（既定は3つまで）。
 *
 * **同じ拠点の部屋が並ぶときは、略称を1回だけ前に出す**
 * （「用賀 WORLD STUDIO・用賀 第1調整室」→「用賀 WORLD STUDIO・第1調整室」）。
 * 同じ語を2回言うと、そのぶん部屋名を出せる幅が減る。
 * **拠点をまたぐ予約では畳まない** — どちらの部屋がどの拠点か分からなくなる。
 *
 * ⚠️ **外現場のメモは畳みの対象にしない。** 上限で消えると
 * 「幕張メッセで押さえてある」ことが行から丸ごと落ちる
 */
export function venueLine(b: VenueBooking, max = 3): string | null {
  const rooms = (b.rooms ?? []).filter((r) => clean(r?.room_name));
  const note = clean(b.location_note);

  const abbrs = new Set(rooms.map((r) => clean(r.location_abbreviation)));
  const shared = abbrs.size === 1 ? [...abbrs][0] : '';
  // 略称が部屋名に入っている拠点では畳まない（「用賀 用賀スタジオ」を作らない）
  const group = rooms.length > 1 && !!shared
    && rooms.every((r) => !clean(r.room_name).includes(shared));

  const names = group ? rooms.map((r) => clean(r.room_name)) : rooms.map(roomLabel);
  const rest = Math.max(0, names.length - max);
  const roomSeg = names.length === 0 ? null
    : `${group ? `${shared} ` : ''}${names.slice(0, max).join('・')}${rest ? ` +${rest}` : ''}`;

  const line = [roomSeg, note || null].filter(Boolean).join('・');
  return line || null;
}
