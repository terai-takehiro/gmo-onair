/**
 * 営業時間の外かどうか（休日・営業時間 ⑥）
 *
 * ── 止めない。印を付けて拾えるようにする ────────────────────
 *
 * ご判断のとおり**予約は通します**。強く止めると、当日いま入れたい予約が
 * 入らなくなって業務が止まります。代わりに「時間外である」印を返し、
 * 画面が注意を出し、あとから一覧で拾えるようにします。
 *
 * ── 判定は純粋関数にする ────────────────────────────────────
 *
 * 「20:00 までの日に 19:00〜21:00 で入れたら時間外」のような境目は、
 * **間違っても画面には何も出ません**（注意が出ないだけ）。
 * DB も時計も触らない形にして、素で試せるようにしてあります。
 */

/** 受付の3段（モックの `over`）*/
export type OverPolicy = 'accept' | 'consult' | 'reject';

export interface DayHours {
  /** 0=日 … 6=土 */
  weekday: number;
  /** `HH:MM`。休みの日は null */
  open_time: string | null;
  /** `HH:MM`。24:00 を超える営業（翌 2:00 まで等）は `26:00` のように書く */
  close_time: string | null;
  /** 営業時間外の受付をどうするか */
  over_policy: OverPolicy;
  note: string | null;
}

/** 休業日（期間）*/
export interface ClosedDay {
  /** `YYYY-MM-DD` */
  from_date: string;
  to_date: string;
  name: string;
  /**
   * 'open' 営業する（注意も出さない）/ 'consult' 相談のうえ /
   * 'partial' 一部のみ / 'none' 受け付けない
   *
   * **祝日は初期値が `open`。** 放送・制作は祝日こそ稼働することがあり、
   * いきなり注意を出すと祝日の予約すべてがうるさくなります。
   */
  availability: 'open' | 'none' | 'consult' | 'partial';
}

export interface HoursCheck {
  /** 営業時間の外か（休業日を含む） */
  outside: boolean;
  /** 画面に出す1行。`outside` が false のときは空 */
  reason: string;
  /** 受付の段。強さ順に reject > consult > accept */
  policy: OverPolicy;
  /** 当たった休業日の名前（あれば） */
  closedDayName: string | null;
}

const OK: HoursCheck = { outside: false, reason: '', policy: 'accept', closedDayName: null };

/** `HH:MM` → 分。`26:00` のような 24 超えも受ける */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** `YYYY-MM-DDTHH:MM…` から日付と分を取り出す。**時差を持ち込まない** */
function parseAt(iso: string): { date: string; minutes: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) };
}

function weekdayOf(date: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const AVAIL_LABEL: Record<ClosedDay['availability'], string> = {
  open: '', none: '受け付けていません', consult: '事前の相談が要ります', partial: '一部の部屋だけ使えます',
};
const AVAIL_POLICY: Record<ClosedDay['availability'], OverPolicy> = {
  open: 'accept', none: 'reject', consult: 'consult', partial: 'consult',
};

/**
 * 予約が営業時間の外かを見る。
 *
 * @param start `2026-08-08T19:00` の形
 * @param end   同上。空なら開始だけで見る
 * @param hours その拠点の曜日7行
 * @param closed その拠点に効く休業日（全社ぶんを含めて渡す）
 */
export function checkHours(
  start: string,
  end: string | null,
  hours: DayHours[],
  closed: ClosedDay[],
): HoursCheck {
  const s = parseAt(start);
  // **読めない日時は「時間外ではない」にする。** 読めないことを理由に
  // 注意を出すと、形式の違う予約すべてに毎回警告が出る
  if (!s) return OK;

  // ── 休業日が先。営業時間より強い ──────────────────────────
  // **`open` の休業日は無視する。** 祝日を表に並べただけの行がここに来るので、
  // 拾ってしまうと「元日は営業します」という注意が毎回出る
  const hit = closed.find((c) => c.availability !== 'open' && c.from_date <= s.date && s.date <= c.to_date);
  if (hit) {
    return {
      outside: true,
      reason: `${s.date.replace(/-/g, '/')} は「${hit.name}」で${AVAIL_LABEL[hit.availability]}`,
      policy: AVAIL_POLICY[hit.availability],
      closedDayName: hit.name,
    };
  }

  const day = hours.find((h) => h.weekday === weekdayOf(s.date));
  if (!day) return OK; // 決めていない曜日は止めない

  if (!day.open_time || !day.close_time) {
    return {
      outside: true,
      reason: `${WD[weekdayOf(s.date)]}曜は休みです`,
      policy: day.over_policy,
      closedDayName: null,
    };
  }

  const open = toMinutes(day.open_time);
  const close = toMinutes(day.close_time);
  if (open === null || close === null) return OK;

  const e = end ? parseAt(end) : null;
  // 終了が翌日にまたぐときは 24:00 を足して同じ物差しに乗せる
  const endMin = e ? (e.date > s.date ? e.minutes + 24 * 60 : e.minutes) : s.minutes;

  const before = s.minutes < open;
  const after = endMin > close;
  if (!before && !after) return OK;

  const range = `${day.open_time}〜${day.close_time}`;
  return {
    outside: true,
    reason: before && after
      ? `${WD[weekdayOf(s.date)]}曜の受付は ${range} です（前後にはみ出しています）`
      : before
        ? `${WD[weekdayOf(s.date)]}曜の受付は ${day.open_time} からです`
        : `${WD[weekdayOf(s.date)]}曜の受付は ${day.close_time} までです`,
    policy: day.over_policy,
    closedDayName: null,
  };
}
