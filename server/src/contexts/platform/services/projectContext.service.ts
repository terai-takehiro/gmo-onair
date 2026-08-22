/**
 * 案件1件の「台本を作るのに要る事実」だけを集める。
 *
 * ── なぜ必要になったか ──────────────────────────────────
 *
 * 制作技術支援の「新規台本作成」は、番組名・撮影場所・放送日・収録日・リハ日を
 * **人が手で打ち直していました**。同じ事実は案件管理側（`projects` /
 * `project_dates` / `studio_bookings`）に既に入っているのに、
 * qsheet の利用者は権限の都合で `GET /projects`（`requirePermission('sales')`）も
 * `GET /studios/bookings`（同）も叩けません。
 *
 * そこで **認証だけで通る `lookup` 経路**（`../routes/lookup.routes.ts`）に、
 * 案件を1件選んだ瞬間に1回だけ叩く単発の取得を足します。
 *
 * ── 決めごと ────────────────────────────────────────────
 *
 * - **日付をコピーしない。** `top.routes.ts` と同じで、案件管理が持っている
 *   日付をそのつど引く（唯一の情報源はあちら）。ここで qsheet 側の表に
 *   写すと、案件管理で日程が動いた日に黙って食い違う
 * - **営業情報は絶対に返さない。** 金額（`expected_amount`）・ステージ
 *   （`stage`）・失注理由（`lost_reason` / `lost_reason_note`）・BOX の URL
 *   （`box_url_internal` / `box_url_external`）・担当者・メモは**取ってこない**。
 *   この経路は `sales` 権限を要求しないので、**返した時点で全社員に見える**のと
 *   同じ意味になる。台本の下書きに要るのは「名前・顧客名・場所・日付」だけ
 * - **一覧（`/lookup/gls-options`）には足さない。** 全案件ぶんこの JOIN を
 *   引くと、セレクターを開くだけで重くなる。**選んだあとの単発**にする
 * - **クエリは2本だけ**（案件の見出し ＋ 日程と予約の UNION）。予約ごとに
 *   部屋を引き直す作り（N+1）にしない
 */
import { queryAll, queryOne } from '../../../shared/db/connection';

/** `GET /lookup/:projectId/context` が返す形 */
export interface ProjectContext {
  id: string;
  /** 案件名。qsheet では番組名の候補として使う */
  name: string;
  glsNumber: string | null;
  /** 取引先マスター（`companies`）から。紐づいていなければ `null` */
  customerName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  /** 整形済みの会場（部屋 ＋ 外現場）。押さえていなければ `null` */
  venue: string | null;
  /** 本番日（昇順・重複なし・`YYYY-MM-DD`） */
  performanceDates: string[];
  /** リハーサル日（同上） */
  rehearsalDates: string[];
}

/**
 * 仮スケジュール（`project_dates.label`）が実際に持つ文字。
 * 出典: `client/src/contexts/sales/pages/projectForm/useProjectSchedule.ts` の
 * `buildDates()`（本番・本番（最終日）・リハ・リハ（最終日）の4つだけを書く）。
 *
 * ⚠️ **前方一致（`LIKE '本番%'`）で拾わない。** 「追加の日程」はラベルを
 * 自由に打てるので、「本番前日搬入」まで本番日に混ざる。
 */
const PERFORMANCE_LABEL = '本番';
const PERFORMANCE_LAST_LABEL = '本番（最終日）';
const REHEARSAL_LABEL = 'リハ';
const REHEARSAL_LAST_LABEL = 'リハ（最終日）';

/** 期間を日で埋めるときの上限。壊れた日付・打ち間違いで無限に伸びるのを止める */
const MAX_SPAN_DAYS = 62;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

/**
 * `from`〜`to` を1日刻みで埋める（両端を含む）。
 * 形が `YYYY-MM-DD` でないものは捨て、`to` が `from` より前なら `from` だけ返す。
 */
function expandRange(from: string, to: string): string[] {
  if (!YMD.test(from)) return [];
  if (!YMD.test(to) || to < from) return [from];

  const out: string[] = [];
  // UTC で数える（コンテナは tzdata を持たない。日付だけを扱うのでずれない）
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return [];

  for (let i = 0; i <= MAX_SPAN_DAYS && cur.getTime() <= end.getTime(); i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * 部屋1つの書き方。**拠点の略称があれば前に付ける**（「用賀 WORLD STUDIO」）。
 *
 * 出典: `client/src/contexts/sales/pages/projectDetail/venue.ts` の `roomLabel()`。
 * ⚠️ あちらは client 側なので server からは import できない。**同じ振る舞いを
 * 書き写している** — 片方を直したらもう片方も直すこと。
 * - 略称を決めていない拠点は**部屋名だけ**（正式名「GMOサムライスタジオ用賀」は
 *   長すぎて枠が壊れる。略称は設定 → 拠点・部屋で人が決めるもの）
 * - 略称が部屋名にすでに入っているときは重ねない（「用賀 用賀スタジオ」を作らない）
 */
function roomLabel(roomName: string, locationAbbreviation: string): string {
  if (!roomName) return '';
  if (!locationAbbreviation || roomName.includes(locationAbbreviation)) return roomName;
  return `${locationAbbreviation} ${roomName}`;
}

/** UNION で引いてきた1行（日程 or 予約×部屋） */
interface ContextRow {
  source: 'date' | 'booking';
  /** 日程なら `project_dates.label`、予約なら `studio_bookings.booking_type` */
  kind: string | null;
  start_date: string | null;
  end_date: string | null;
  room_id: string | null;
  room_name: string | null;
  location_abbreviation: string | null;
  location_note: string | null;
}

/**
 * 押さえている場所を1つの文字にする。
 *
 * 出典は `venue.ts` の `venuesOf()`。**部屋も外現場（`location_note`）も
 * 同じ並びに入れる**（予約は ①部屋だけ ②外現場だけ ③両方 の3通りあり、
 * どれかを落とすと「押さえたのに画面に出ない場所」ができる）。
 * **数える鍵は部屋の id ＋ 名前**（名前だけで数えると、別の拠点にある同名の
 * 部屋が消える）。並べ替えはせず、SQL が返した 拠点 → 部屋 の順のまま。
 *
 * ⚠️ **`venue.ts` の `venueLine()` のような「3つで畳んで +N」はしない。**
 * ここが返す文字は**入力欄の初期値**として使われるので、`+2` が入ると
 * 利用者が消して打ち直すことになる（帯の1行に収める都合はここには無い）。
 */
function formatVenue(rows: ContextRow[]): string | null {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const r of rows) {
    if (r.source !== 'booking') continue;

    const name = roomLabel(clean(r.room_name), clean(r.location_abbreviation));
    if (name) {
      const key = `room:${clean(r.room_id)}|${name}`;
      if (!seen.has(key)) { seen.add(key); names.push(name); }
    }

    const note = clean(r.location_note);
    if (note) {
      const key = `place:${note}`;
      if (!seen.has(key)) { seen.add(key); names.push(note); }
    }
  }

  return names.length ? names.join('・') : null;
}

/**
 * 仮スケジュール（`project_dates`）から日付を拾う。
 *
 * **「（最終日）」の行があるときだけ期間として埋める。** 多日程の本番・リハは
 * 初日と最終日の2行しか保存されない（`buildDates()`）ので、そのまま返すと
 * **中日が丸ごと落ちます**。逆に「（最終日）」が無いときは飛び日の並びなので、
 * 埋めると**やっていない日が本番日になります**。
 */
function datesFromLabels(rows: ContextRow[], label: string, lastLabel: string): string[] {
  const pick = (l: string) =>
    rows.filter((r) => r.source === 'date' && r.kind === l)
      .map((r) => clean(r.start_date))
      .filter((d) => YMD.test(d));

  const starts = pick(label);
  const lasts = pick(lastLabel);
  if (lasts.length === 0) return starts;

  const all = [...starts, ...lasts].sort();
  return expandRange(all[0], all[all.length - 1]);
}

/** スタジオ予約から日付を拾う。予約は日をまたげるので開始〜終了を埋める */
function datesFromBookings(rows: ContextRow[], bookingType: string): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.source !== 'booking' || r.kind !== bookingType) continue;
    const from = clean(r.start_date);
    out.push(...expandRange(from, clean(r.end_date) || from));
  }
  return out;
}

/** 重複を除いて昇順に */
const uniqSorted = (dates: string[]): string[] => [...new Set(dates)].sort();

/**
 * 案件が見つからなければ `null`（呼ぶ側が 404 にする）。
 */
export async function getProjectContext(projectId: string): Promise<ProjectContext | null> {
  /*
   * ① 見出し。**取ってくるのはここに並ぶ7項目だけ** — `SELECT p.*` にすると
   * 金額・ステージ・失注理由・BOX URL まで、この権限では見えてはいけない値が
   * 黙って混ざる（列が増えた日に誰も気づけない）。
   */
  const head = await queryOne(
    `SELECT p.id, p.name, p.gls_number, p.event_start, p.event_end, c.name AS customer_name
       FROM projects p
       LEFT JOIN companies c ON c.id = p.customer_id
      WHERE p.id = ? AND p.deleted_at IS NULL`,
    [projectId],
  );
  if (!head) return null;

  /*
   * ② 日程（`project_dates`）と予約（`studio_bookings` ＋ 部屋）を1本で。
   * 予約ごとに部屋を引き直すと N+1 になるので、部屋は JOIN で平らに広げて
   * JavaScript 側でまとめ直す（`studio-booking.service.ts` の `listBookings` と同じ考え方）。
   *
   * 予約は `status`（confirmed / tentative）で絞らない。仮押さえの本番も
   * 台本を書き始める日付の候補としては正しく、**絞ると候補が消えたことに
   * 気づけない**（多く出すほうに倒す）。
   */
  const rows = (await queryAll(
    `SELECT 'date'::text AS source,
            pd.label      AS kind,
            pd.date       AS start_date,
            pd.date       AS end_date,
            NULL::text    AS room_id,
            NULL::text    AS room_name,
            NULL::text    AS location_abbreviation,
            NULL::text    AS location_note,
            0             AS location_sort_order,
            0             AS room_sort_order
            -- ↑ 日程の行は会場に使わないので、並びの値は 0 のままでよい
       FROM project_dates pd
      WHERE pd.project_id = ?
      UNION ALL
     SELECT 'booking'::text,
            b.booking_type,
            substr(b.start_time, 1, 10),
            substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10),
            r.id,
            r.name,
            l.abbreviation,
            b.location_note,
            -- 部屋を持たない予約（外現場のメモだけ）は**最後に回す**。
            -- 押さえた部屋より先に手入力の地名が出ると、会場の文字が読みにくい
            COALESCE(l.sort_order, 999999),
            COALESCE(r.sort_order, 0)
       FROM studio_bookings b
       LEFT JOIN studio_booking_rooms br ON br.booking_id = b.id
       LEFT JOIN studio_rooms r         ON r.id = br.room_id AND r.deleted_at IS NULL
       LEFT JOIN studio_locations l     ON l.id = r.location_id AND l.deleted_at IS NULL
      WHERE b.project_id = ? AND b.deleted_at IS NULL
      ORDER BY 9, 10, 6, 3`,
    [projectId, projectId],
  )) as unknown as ContextRow[];

  return {
    id: String(head.id),
    name: String(head.name ?? ''),
    glsNumber: (head.gls_number as string | null) ?? null,
    customerName: (head.customer_name as string | null) ?? null,
    eventStart: (head.event_start as string | null) ?? null,
    eventEnd: (head.event_end as string | null) ?? null,
    venue: formatVenue(rows),
    performanceDates: uniqSorted([
      ...datesFromLabels(rows, PERFORMANCE_LABEL, PERFORMANCE_LAST_LABEL),
      ...datesFromBookings(rows, 'performance'),
    ]),
    rehearsalDates: uniqSorted([
      ...datesFromLabels(rows, REHEARSAL_LABEL, REHEARSAL_LAST_LABEL),
      ...datesFromBookings(rows, 'rehearsal'),
    ]),
  };
}
