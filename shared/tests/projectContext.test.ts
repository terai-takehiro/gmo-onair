/**
 * 案件の事実を1件だけ引く経路（`server/.../platform/services/projectContext.service.ts`）
 *
 * ── なぜここを試すのか ──────────────────────────────────────
 *
 * この経路が返す日付は、`client-techops` の「新規台本作成」で
 * **`<input type="date">` の初期値**になります。つまり間違えたときの見え方は
 * 「日付の欄が空」か「知らない日が入っている」のどちらかで、**どちらも
 * 画面を見ただけでは案件管理の中身が違うのか、拾い方が違うのかが分かりません**。
 *
 * とくに次の3つは目で気づけません:
 * - 多日程の**中日**（`project_dates` は初日と最終日の2行しか持たない）
 * - **飛び日**（埋めてはいけない並び）
 * - 押さえた場所が**1つだけ画面から消える**（重複を除く鍵の取り違え）
 *
 * ── サーバーのファイルをここから読んでいる理由 ────────────────
 *
 * サーバーは `shared/` を import できない構成（`server/tsconfig.json` の `rootDir`）
 * なので、**突き合わせはテスト側から行います**。DB も HTTP も触らない純関数だけを
 * 読むこと（触るものを入れると `npm test` に DB が要るようになる）。
 * `projectEventDates.test.ts` と同じやり方です。
 */
import { describe, it, expect } from 'vitest';
import {
  PERFORMANCE_LABEL,
  PERFORMANCE_LAST_LABEL,
  REHEARSAL_LABEL,
  REHEARSAL_LAST_LABEL,
  ymdOrNull,
  expandRange,
  roomLabel,
  formatVenue,
  datesFromLabels,
  datesFromBookings,
  uniqSorted,
  type ContextRow,
} from '../../server/src/contexts/platform/services/projectContext.service';
import { roomLabel as clientRoomLabel } from '../../client/src/contexts/sales/pages/projectDetail/venue';

/** `project_dates` の1行（UNION の `source='date'` 側） */
const dateRow = (label: string, date: string): ContextRow => ({
  source: 'date',
  kind: label,
  start_date: date,
  end_date: date,
  room_id: null,
  room_name: null,
  location_abbreviation: null,
  location_note: null,
});

/** `studio_bookings` ×部屋 の1行（UNION の `source='booking'` 側） */
const bookingRow = (
  kind: string,
  start: string,
  end: string | null,
  place: { roomId?: string; room?: string; abbr?: string; note?: string } = {},
): ContextRow => ({
  source: 'booking',
  kind,
  start_date: start,
  end_date: end,
  room_id: place.roomId ?? null,
  room_name: place.room ?? null,
  location_abbreviation: place.abbr ?? null,
  location_note: place.note ?? null,
});

describe('拾うラベル — 前方一致にしない', () => {
  /*
   * 出典は `client/.../projectForm/useProjectSchedule.ts` の `buildDates()`。
   * あちらが書くのはこの4つだけで、「追加の日程」はラベルを自由に打てる。
   */
  it('仮スケジュールが実際に書く4つ', () => {
    expect([PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL, REHEARSAL_LABEL, REHEARSAL_LAST_LABEL])
      .toEqual(['本番', '本番（最終日）', 'リハ', 'リハ（最終日）']);
  });
});

describe('ymdOrNull — eventStart / eventEnd も同じ濾し方を通す', () => {
  /*
   * ここが素通しだと、`YYYY-MM-DD` でない値が `<input type="date">` に入り、
   * **欄は空に見えるのに値は非空**（＝必須チェックが通り、押せないはずの
   * ボタンが押せる）という、画面を見ても理由の分からない壊れ方になる。
   */
  it('`YYYY-MM-DD` はそのまま通す', () => {
    expect(ymdOrNull('2026-09-01')).toBe('2026-09-01');
  });
  it('前後の空白は落とす（`clean()` と同じ扱い）', () => {
    expect(ymdOrNull('  2026-09-01  ')).toBe('2026-09-01');
  });
  it('**書式が違うものは null**（入力欄が空に見えるのに値が入る状態を作らない）', () => {
    expect(ymdOrNull('2026/09/01')).toBeNull();
    expect(ymdOrNull('2026-9-1')).toBeNull();
    expect(ymdOrNull('2026-09-01T00:00:00Z')).toBeNull();
    expect(ymdOrNull('未定')).toBeNull();
  });
  it('空・未入力・文字でない値は null', () => {
    expect(ymdOrNull('')).toBeNull();
    expect(ymdOrNull('   ')).toBeNull();
    expect(ymdOrNull(null)).toBeNull();
    expect(ymdOrNull(undefined)).toBeNull();
    expect(ymdOrNull(new Date('2026-09-01'))).toBeNull();
  });
});

describe('expandRange — 期間を日で埋める', () => {
  it('同じ日なら1件', () => {
    expect(expandRange('2026-09-01', '2026-09-01')).toEqual(['2026-09-01']);
  });
  it('両端を含めて埋める', () => {
    expect(expandRange('2026-09-01', '2026-09-03'))
      .toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
  it('月をまたいでも数えられる（UTC で数えているので日付だけならずれない）', () => {
    expect(expandRange('2026-08-30', '2026-09-02'))
      .toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  });
  it('**終了が開始より前でも開始は返す**（0 件にすると日付が丸ごと消える）', () => {
    expect(expandRange('2026-09-03', '2026-09-01')).toEqual(['2026-09-03']);
  });
  it('終了が読めなければ開始だけ', () => {
    expect(expandRange('2026-09-01', '')).toEqual(['2026-09-01']);
    expect(expandRange('2026-09-01', '2026/09/03')).toEqual(['2026-09-01']);
  });
  it('開始が読めなければ空（`YYYY-MM-DD` でない値は捨てる）', () => {
    expect(expandRange('2026/09/01', '2026-09-03')).toEqual([]);
    expect(expandRange('', '2026-09-03')).toEqual([]);
  });
  /*
   * **暦に無い日をここで弾いてはいない**（実測して分かった振る舞いを記録する）。
   * `new Date('2026-02-30T00:00:00Z')` は Node では 3/2 に繰り上がるので、
   * 書式さえ合っていれば近い日として通る。**弾くほうが良いとは限らない** —
   * 元の値は `project_dates` に人が入れた文字で、捨てると日付が丸ごと消える。
   * 月や日がそもそもありえない値だけが `Number.isNaN` の番人に引っかかる。
   */
  it('暦に無い日は Date の繰り上げに従う（2/30 → 3/2）', () => {
    expect(expandRange('2026-02-30', '2026-03-02')).toEqual(['2026-03-02']);
  });
  it('**読めない値は空**（`9999-99-99` は Date が NaN を返す）', () => {
    expect(expandRange('9999-99-99', '9999-99-99')).toEqual([]);
  });
  /*
   * 打ち間違い（`2026` を `20260` と打つ等）で期間が何年にもなることがある。
   * **止めないと応答が数万件になり、画面には「重い」としか見えない。**
   */
  it('**62日で打ち切る**（両端を含めて63件・無限ループしない）', () => {
    const long = expandRange('2026-01-01', '2999-12-31');
    expect(long).toHaveLength(63);
    expect(long[0]).toBe('2026-01-01');
    expect(long[long.length - 1]).toBe('2026-03-04');
  });
});

describe('datesFromLabels — 「（最終日）」があるときだけ中日を埋める', () => {
  /*
   * 多日程の本番は**初日と最終日の2行しか保存されない**（`buildDates()`）。
   * そのまま返すと中日が落ち、埋めすぎると**やっていない日が本番日**になる。
   * どちらも画面を見ても正しいかどうか判断できない。
   */
  it('多日程は中日が埋まる（09-01 と 09-03（最終日）→ 3日）', () => {
    const rows = [
      dateRow(PERFORMANCE_LABEL, '2026-09-01'),
      dateRow(PERFORMANCE_LAST_LABEL, '2026-09-03'),
    ];
    expect(datesFromLabels(rows, PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL))
      .toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('**飛び日は埋めない**（最終日の行が無ければそのまま）', () => {
    const rows = [
      dateRow(PERFORMANCE_LABEL, '2026-09-01'),
      dateRow(PERFORMANCE_LABEL, '2026-09-05'),
    ];
    expect(datesFromLabels(rows, PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL))
      .toEqual(['2026-09-01', '2026-09-05']);
  });

  it('**自由入力のラベルは混ざらない**（完全一致で拾う）', () => {
    const rows = [
      dateRow('本番前日搬入', '2026-08-31'),
      dateRow('本番終わり', '2026-09-04'),
      dateRow(PERFORMANCE_LABEL, '2026-09-01'),
    ];
    expect(datesFromLabels(rows, PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL))
      .toEqual(['2026-09-01']);
  });

  it('リハも同じ拾い方（ラベルを渡し替えるだけ）', () => {
    const rows = [
      dateRow(REHEARSAL_LABEL, '2026-08-30'),
      dateRow(REHEARSAL_LAST_LABEL, '2026-08-31'),
      dateRow(PERFORMANCE_LABEL, '2026-09-01'),
    ];
    expect(datesFromLabels(rows, REHEARSAL_LABEL, REHEARSAL_LAST_LABEL))
      .toEqual(['2026-08-30', '2026-08-31']);
  });

  it('予約の行は拾わない（種別が同じ文字でも `source` で分ける）', () => {
    const rows = [bookingRow(PERFORMANCE_LABEL, '2026-09-01', '2026-09-01')];
    expect(datesFromLabels(rows, PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL)).toEqual([]);
  });

  it('`YYYY-MM-DD` でない日付は捨てる', () => {
    const rows = [
      dateRow(PERFORMANCE_LABEL, '2026/09/01'),
      dateRow(PERFORMANCE_LABEL, '2026-09-02'),
    ];
    expect(datesFromLabels(rows, PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL))
      .toEqual(['2026-09-02']);
  });

  it('1件も無ければ空', () => {
    expect(datesFromLabels([], PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL)).toEqual([]);
  });
});

describe('datesFromBookings — 予約は日をまたぐので埋める', () => {
  it('またぐ予約は間の日も本番日', () => {
    const rows = [bookingRow('performance', '2026-09-01', '2026-09-03')];
    expect(datesFromBookings(rows, 'performance'))
      .toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
  it('終了が空でも開始だけで数える', () => {
    const rows = [bookingRow('performance', '2026-09-01', '')];
    expect(datesFromBookings(rows, 'performance')).toEqual(['2026-09-01']);
  });
  it('別の種別は拾わない（リハの日が本番日にならない）', () => {
    const rows = [
      bookingRow('rehearsal', '2026-08-31', '2026-08-31'),
      bookingRow('performance', '2026-09-01', '2026-09-01'),
    ];
    expect(datesFromBookings(rows, 'performance')).toEqual(['2026-09-01']);
    expect(datesFromBookings(rows, 'rehearsal')).toEqual(['2026-08-31']);
  });
  it('日程の行は拾わない', () => {
    expect(datesFromBookings([dateRow(PERFORMANCE_LABEL, '2026-09-01')], 'performance'))
      .toEqual([]);
  });
});

describe('uniqSorted — 昇順・重複なし', () => {
  /*
   * 仮スケジュールと予約の両方に同じ日が入っているのが普通なので、
   * **重ねたまま返すと同じ日が2回並ぶ**（画面では候補が二重に出る）。
   */
  it('同じ日は1つに、並びは昇順', () => {
    expect(uniqSorted(['2026-09-03', '2026-09-01', '2026-09-03', '2026-09-02']))
      .toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
  it('空はそのまま空', () => {
    expect(uniqSorted([])).toEqual([]);
  });
});

describe('roomLabel — 画面側（`projectDetail/venue.ts`）の写し', () => {
  it('略称があれば前に付ける', () => {
    expect(roomLabel('WORLD STUDIO', '用賀')).toBe('用賀 WORLD STUDIO');
  });
  it('略称を決めていない拠点は部屋名だけ（正式名で代用しない）', () => {
    expect(roomLabel('WORLD STUDIO', '')).toBe('WORLD STUDIO');
  });
  it('部屋名に略称が入っていれば重ねない（「用賀 用賀スタジオ」を作らない）', () => {
    expect(roomLabel('用賀スタジオ', '用賀')).toBe('用賀スタジオ');
  });
  it('部屋名が無ければ空（呼ぶ側が落とす）', () => {
    expect(roomLabel('', '用賀')).toBe('');
  });

  /*
   * **画面側と同じ答えを返すこと。** server は client を import できないので
   * 振る舞いを書き写してあり、**片方だけ直すと同じ案件でも
   * 画面と台本の初期値で会場の書き方が変わる**（見比べないと気づけない）。
   */
  it('**画面側の `roomLabel()` と1文字も違わない**（写しがずれていない）', () => {
    const cases: Array<[string, string]> = [
      ['WORLD STUDIO', '用賀'],
      ['WORLD STUDIO', ''],
      ['用賀スタジオ', '用賀'],
      ['第1スタジオ', '渋谷'],
      ['', '用賀'],
      ['', ''],
    ];
    for (const [room, abbr] of cases) {
      expect(roomLabel(room, abbr))
        .toBe(clientRoomLabel({ room_name: room, location_abbreviation: abbr }));
    }
  });
});

describe('formatVenue — 押さえた場所を1つの文字にする', () => {
  it('部屋 → 外現場の順で並べる', () => {
    const rows = [
      bookingRow('performance', '2026-09-01', '2026-09-01', { roomId: 'r1', room: 'WORLD STUDIO', abbr: '用賀' }),
      bookingRow('performance', '2026-09-01', '2026-09-01', { note: '幕張メッセ' }),
    ];
    expect(formatVenue(rows)).toBe('用賀 WORLD STUDIO・幕張メッセ');
  });

  it('同じ行の部屋と外現場はどちらも落とさない（部屋が先）', () => {
    const rows = [
      bookingRow('performance', '2026-09-01', '2026-09-01', { roomId: 'r1', room: 'WORLD STUDIO', note: '幕張メッセ' }),
    ];
    expect(formatVenue(rows)).toBe('WORLD STUDIO・幕張メッセ');
  });

  it('**同じ部屋を本番とリハで押さえても1回だけ**', () => {
    const rows = [
      bookingRow('performance', '2026-09-01', '2026-09-01', { roomId: 'r1', room: 'WORLD STUDIO' }),
      bookingRow('rehearsal', '2026-08-31', '2026-08-31', { roomId: 'r1', room: 'WORLD STUDIO' }),
    ];
    expect(formatVenue(rows)).toBe('WORLD STUDIO');
  });

  /*
   * **数える鍵は部屋の id ＋ 名前。** 名前だけで数えると、略称を決めていない
   * 別の拠点にある同名の部屋が同じものと見なされ、**押さえた部屋が
   * 1つ画面から消える**（消えたことは画面に出ない）。
   */
  it('別の拠点にある同じ名前の部屋は消さない', () => {
    const rows = [
      bookingRow('performance', '2026-09-01', '2026-09-01', { roomId: 'r1', room: '第1スタジオ' }),
      bookingRow('performance', '2026-09-01', '2026-09-01', { roomId: 'r2', room: '第1スタジオ' }),
    ];
    expect(formatVenue(rows)).toBe('第1スタジオ・第1スタジオ');
  });

  it('同じ外現場のメモは1回だけ', () => {
    const rows = [
      bookingRow('performance', '2026-09-01', '2026-09-01', { note: '幕張メッセ' }),
      bookingRow('rehearsal', '2026-08-31', '2026-08-31', { note: '幕張メッセ' }),
    ];
    expect(formatVenue(rows)).toBe('幕張メッセ');
  });

  it('日程の行は会場に使わない', () => {
    expect(formatVenue([dateRow(PERFORMANCE_LABEL, '2026-09-01')])).toBeNull();
  });

  it('**押さえていなければ null**（呼ぶ側が「未設定」の書き方を決める）', () => {
    expect(formatVenue([])).toBeNull();
    expect(formatVenue([bookingRow('performance', '2026-09-01', '2026-09-01')])).toBeNull();
  });
});
