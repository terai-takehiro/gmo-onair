/**
 * ① 予定 — 置き方の計算（画面を持たない部分）
 *
 * ── なぜ素の関数に切り出すか ────────────────────────────────
 *
 * v4 の ① 予定は **FullCalendar をやめて自分で描いています**（下の理由）。
 * そうすると「マスの並べ方」「重なった予定を横にどう分けるか」を自分で持つ
 * ことになり、**間違えると予定が消えます**（描画の外に飛ぶ・幅 0 になる）。
 * 画面を見ても「無い」としか分からない壊れ方なので、素で試せる形にしました。
 * 固定しているのは `shared/tests/calendarLayout.test.ts`。
 *
 * ── FullCalendar をやめた理由 ───────────────────────────────
 *
 * モックの月マスは **17px の帯に「3px の色棒 + 時刻 + 題名」**、週・日は
 * **重なりを横に割った角丸の札**で、FullCalendar の DOM とは組み立てが違います。
 * CSS で上書きしていくと、あちらの内部クラス名（`.fc-*`）に依存した規則が
 * 何十行も積み上がり、**版が上がるたびに黙って崩れます**。
 * ここは v4 の見た目そのものが要件なので、描く側を自分で持つほうが確かです。
 *
 * **ほかの3画面（旧スタジオ・パートナー・マイ）は FullCalendar のままです。**
 * 作り直し前の画面なので、同じ回で触りません。
 */

/** 表示する時間帯。**② 部屋の空きと同じ 8:00〜22:00**（画面ごとに変えない） */
export const DAY_START_H = 8;
export const DAY_END_H = 22;

const WIN_FROM = DAY_START_H * 60;
const WIN_SPAN = (DAY_END_H - DAY_START_H) * 60;

/** `tasks` = タスクの期限（根源整理 §3-5 で足した4層目。`taskLayer.ts`） */
export type CalLayer = 'studio' | 'partner' | 'my' | 'tasks';

/** 4つの取得元を1つの形に畳んだもの。**画面はこれしか見ない** */
export interface CalEvent {
  /** `bk-<id>` のように取得元の頭文字を付ける（元の id とぶつからないように） */
  key: string;
  id: string;
  layer: CalLayer;
  title: string;
  /** 行の色。種別ごとの色をそのまま持つ */
  color: string;
  /** 種別の札（「本番」「代休」など）。無いときは空 */
  typeLabel: string;
  /** 部屋・人など、題名の下に出す1行 */
  sub: string;
  /** `Google` / `Outlook` / `ICS` / `ONAiR`。取込元が分からないときは空 */
  source: string;
  allDay: boolean;
  /** `YYYY-MM-DDTHH:MM` */
  start: string;
  end: string;
  /** 仮押さえ。**破線で出す**（モックの指定） */
  tentative: boolean;
}

// ───────────────────────────────────────────────────────────
// 日付のこまごま（Date を跨がせない）
// ───────────────────────────────────────────────────────────

const p2 = (n: number) => String(n).padStart(2, '0');

/** `Date` → `YYYY-MM-DD`。**`toISOString` を使わないこと** — UTC に寄って1日ずれる */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

export function addMonths(day: string, n: number): string {
  const [y, m] = day.split('-').map(Number);
  return `${y + Math.floor((m - 1 + n) / 12)}-${p2(((m - 1 + n) % 12 + 12) % 12 + 1)}-01`;
}

/** その日を含む週の日曜。モックの月表は日曜始まり */
export function startOfWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return ymd(new Date(y, m - 1, d - dt.getDay()));
}

export function dowOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * 月表のマス。**6週ぶんに固定しない。**
 *
 * 常に 6 行にすると、5 週で収まる月に**まるごと空の行**が出て、
 * その下の「今日の予定」が画面外へ押し出されます。必要な週だけ返します。
 */
export function monthWeeks(anchor: string): string[][] {
  const [y, m] = anchor.split('-').map(Number);
  const first = startOfWeek(`${y}-${p2(m)}-01`);
  const last = ymd(new Date(y, m, 0));
  const weeks: string[][] = [];
  let cur = first;
  while (true) {
    const row: string[] = [];
    for (let i = 0; i < 7; i++) { row.push(cur); cur = addDays(cur, 1); }
    weeks.push(row);
    if (row[6] >= last) break;
    // 走り続ける形を作らない（読めない日付を渡されたときの保険）
    if (weeks.length >= 6) break;
  }
  return weeks;
}

/** 週表の 7 日。`anchor` を含む週 */
export function weekDays(anchor: string): string[] {
  const s = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

// ───────────────────────────────────────────────────────────
// 時間 → 縦の位置
// ───────────────────────────────────────────────────────────

/** 見ている日の 0:00 からの分。**前日から続くものは 0、翌日まで続くものは 24:00** */
function minutesOnDay(iso: string, day: string, fallback: number): number {
  if (!iso) return fallback;
  const d = iso.slice(0, 10);
  if (d < day) return 0;
  if (d > day) return 24 * 60;
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  if (!Number.isFinite(h)) return fallback;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

export interface Placed {
  ev: CalEvent;
  /** `%`。時間帯（8:00〜22:00）の中の位置 */
  top: number;
  height: number;
  /** `%`。重なったぶんを横に割った位置 */
  left: number;
  width: number;
  /** 表示の外から続いている（上／下が切れている） */
  cutTop: boolean;
  cutBottom: boolean;
  /** 実際の長さ（分）。**札の中身を1行に畳むかの判定に使う**（height は最低値に底上げされるため） */
  minutes: number;
}

/**
 * 札の見た目の最低の長さ（分）。10分の予約が線になると題名が1文字も読めない。
 * 24分 = グリッド616pxで約17.6px。1行の文字（11px×1.4行間 = 15.4px）が
 * 切れずに入る最小値（従来の2.4% = 14.8pxでは1行も入らなかった・実測）。
 * **列割りもこの長さで行う** — 高さだけ底上げすると、連続する短い予約
 * （10:00–10:10 と 10:10–10:20）が同じ列に置かれて**互いに重なって潰れる**。
 */
export const MIN_VIS_MIN = 24;

/**
 * 1日ぶんの札を置く。
 *
 * ── 表示の外から始まる予定を捨てない ────────────────────────
 *
 * 7:00〜9:00 の予定を「8:00 より前だから無い」にすると、**朝から使っている
 * 部屋が空きに見えます**。端で切って必ず出し、切れていることを印で出します
 * （② 部屋の空きと同じ決め方）。
 *
 * ── 重なりは「同時にいくつあるか」で割る ────────────────────
 *
 * 素朴に「1件めは左半分・2件めは右半分」とすると、3件重なった日に
 * **3件めが画面から消えます**。重なりの塊ごとに列を数え、その数で割ります。
 */
export function placeDay(events: CalEvent[], day: string): Placed[] {
  const spans = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const from = minutesOnDay(e.start, day, 0);
      const to0 = minutesOnDay(e.end, day, 24 * 60);
      // 終わりが始まり以前のときは 30 分の札にする（値が壊れているときの保険。
      // タスクの期限＝始まり = 終わりの「点」の予定も意図してこの道を通す —
      // 線にすると題名が1文字も読めない）
      const to = to0 <= from ? Math.min(24 * 60, from + 30) : to0;
      // 見た目の終わり。短い予定は `MIN_VIS_MIN` 分ぶんまで底上げする
      return {
        ev: e, from, to,
        vis: Math.max(to, Math.min(24 * 60, from + MIN_VIS_MIN)),
        // 実際の終わり（切れ判定用）。点の予定の30分底上げに「↓」を付けない —
        // 21:50 の期限が「22:00 の外へ続く」ように見えてしまう
        rawTo: Math.max(from, to0),
      };
    })
    .filter((s) => s.to > WIN_FROM && s.from < WIN_FROM + WIN_SPAN)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  // 重なりの塊ごとに列を割る
  const out: Placed[] = [];
  let group: typeof spans = [];
  let groupEnd = -1;

  const flush = () => {
    if (group.length === 0) return;
    /** 列ごとに「いまどこまで埋まっているか」。**見た目の長さ（`vis`）で埋める** —
        実時間で埋めると、底上げされた短い札どうしが同じ列で重なる */
    const colEnd: number[] = [];
    const colOf = new Map<typeof group[number], number>();
    for (const s of group) {
      let c = colEnd.findIndex((e) => e <= s.from);
      if (c === -1) { c = colEnd.length; colEnd.push(0); }
      colEnd[c] = s.vis;
      colOf.set(s, c);
    }
    const cols = colEnd.length;
    for (const s of group) {
      const a = Math.max(WIN_FROM, s.from);
      const z = Math.min(WIN_FROM + WIN_SPAN, s.vis);
      const c = colOf.get(s) ?? 0;
      // **最低の高さを持たせる。** 15 分の予定が線になると、題名が1文字も読めない
      // （`vis` の底上げが効くが、窓の端で切られた札のための保険として clamp も残す）
      const height = Math.max(2.4, ((z - a) / WIN_SPAN) * 100);
      out.push({
        ev: s.ev,
        // 22:00 際の短い札は底上げで枠の下へはみ出すので、上へ押し戻す
        top: Math.max(0, Math.min(100 - height, ((a - WIN_FROM) / WIN_SPAN) * 100)),
        height,
        left: (c / cols) * 100,
        width: 100 / cols,
        cutTop: s.from < WIN_FROM,
        cutBottom: s.rawTo > WIN_FROM + WIN_SPAN,
        minutes: s.to - s.from,
      });
    }
    group = [];
    groupEnd = -1;
  };

  for (const s of spans) {
    if (group.length > 0 && s.from >= groupEnd) flush();
    group.push(s);
    groupEnd = Math.max(groupEnd, s.vis);
  }
  flush();
  return out;
}

// ───────────────────────────────────────────────────────────
// ドラッグ操作（空きマスで新規・札の下端で延長）の計算
// ───────────────────────────────────────────────────────────

/** グリッドの縦位置（0〜1）→ その日の分。**窓（8:00〜22:00）の外に出さない** */
export function fracToMin(frac: number): number {
  return WIN_FROM + Math.min(1, Math.max(0, frac)) * WIN_SPAN;
}

/** 15分刻みに丸める（ドラッグの手ぶれを吸収する。刻みは差し替え可能） */
export function snapMin(min: number, step = 15): number {
  return Math.round(min / step) * step;
}

/** 分 → `HH:MM`（`<input type="time">` と予約 API がそのまま受ける形） */
export function minToHM(min: number): string {
  const m = Math.min(24 * 60 - 1, Math.max(0, Math.round(min)));
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
}

/** 目盛り（8:00 … 22:00）。`top` は `%` */
export function hourMarks(): Array<{ label: string; top: number }> {
  const out = [];
  for (let h = DAY_START_H; h <= DAY_END_H; h++) {
    out.push({ label: `${p2(h)}:00`, top: ((h * 60 - WIN_FROM) / WIN_SPAN) * 100 });
  }
  return out;
}

/**
 * 「いま」の線の位置（`%`）。**時間帯の外なら null**
 * （8:00 より前に上端へ、22:00 より後に下端へ貼り付くと、そこに何かあると読まれる）
 */
export function nowTop(now: Date): number | null {
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < WIN_FROM || m > WIN_FROM + WIN_SPAN) return null;
  return ((m - WIN_FROM) / WIN_SPAN) * 100;
}

/** その日にかかっている予定（終日・日をまたぐものを落とさない） */
export function eventsOn(events: CalEvent[], day: string): CalEvent[] {
  // 終わりが始まりより前の壊れたデータは始まりの日に出す（そのまま比べると
  // どの日の条件も満たせず、全ビューから黙って消える — placeDay の30分の保険にも届かない）
  return events.filter((e) => {
    const end = e.end && e.end >= e.start ? e.end : e.start;
    return e.start.slice(0, 10) <= day && end.slice(0, 10) >= day;
  });
}

/**
 * その月にかかっている予定（一覧ビュー用）。
 * **開始の月だけで絞らない** — 前月末から続く予定が一覧だけから消える
 * （月表は `eventsOn` の重なり判定なので出る。ビューごとに絞り方を変えない）。
 */
export function eventsInMonth(events: CalEvent[], ym: string): CalEvent[] {
  const first = `${ym}-01`;
  const last = addDays(addMonths(first, 1), -1);
  return events.filter((e) => {
    const end = e.end && e.end >= e.start ? e.end : e.start;
    return e.start.slice(0, 10) <= last && end.slice(0, 10) >= first;
  });
}

/**
 * 8:00〜22:00 の窓に**まったくかからない**時刻付きの予定（週表の端の印用）。
 * 窓の外だけの予定（23:00 のタスク期限・早朝の搬入）は札にできないが、
 * 何の印も無いと「無い」と読まれる — 月表・一覧との食い違いがここで起きていた。
 */
export function outsideWindow(events: CalEvent[], day: string): { before: CalEvent[]; after: CalEvent[] } {
  const before: CalEvent[] = [];
  const after: CalEvent[] = [];
  for (const e of events) {
    if (e.allDay) continue;
    const from = minutesOnDay(e.start, day, 0);
    const to0 = minutesOnDay(e.end, day, 24 * 60);
    const to = to0 <= from ? Math.min(24 * 60, from + 30) : to0;
    if (to <= WIN_FROM) before.push(e);
    else if (from >= WIN_FROM + WIN_SPAN) after.push(e);
  }
  return { before, after };
}

/** 一覧・今日の欄の並び。**終日を先頭**にして、あとは時刻順 */
export function sortForList(events: CalEvent[]): CalEvent[] {
  return [...events].sort((a, b) => {
    const d = a.start.slice(0, 10).localeCompare(b.start.slice(0, 10));
    if (d !== 0) return d;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.slice(11, 16).localeCompare(b.start.slice(11, 16));
  });
}

/** 「10:00–18:00」「終日」。**日をまたぐときは日付を付ける**（同じ日に見えてしまう） */
export function timeLabel(e: CalEvent): string {
  if (e.allDay) return '終日';
  const s = e.start.slice(11, 16);
  const t = e.end?.slice(11, 16) ?? '';
  if (!t) return s;
  // 始まり＝終わり（タスクの期限のような「点」の予定）は時刻を1つだけ出す。
  // 「18:00–18:00」と書くと 0 分の会議に見える
  if (e.end === e.start) return s;
  if (e.end.slice(0, 10) !== e.start.slice(0, 10)) {
    // 「翌」は1日またぎだけ。2日以上またぐものに付けると1日短く読める
    if (e.end.slice(0, 10) === addDays(e.start.slice(0, 10), 1)) return `${s}–翌${t}`;
    return `${s}–${Number(e.end.slice(5, 7))}/${Number(e.end.slice(8, 10))} ${t}`;
  }
  return `${s}–${t}`;
}
