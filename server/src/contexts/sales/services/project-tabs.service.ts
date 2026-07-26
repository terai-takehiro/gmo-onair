/**
 * 案件の「お金」「予定」タブ (デザイン 13章 7a / 仕様書 §7.12)
 *
 * 案件の中で往復がいちばん多いのが**お金と予定**なので、この2つを先にタブにする
 * (やり取り・タスク・書類はあとで、現場の道具はリンクのまま)。
 *
 * ── なぜタブごとに1本の口を置くか ────────────────────────
 *
 * お金の4つの数字を画面から集めると、売上・仕入・見積で3〜4往復になる。
 * 1本にまとめると開いた瞬間に揃う。**数字の出しかたも1か所**になるので、
 * 案件一覧と案件の中で違う数字が出ることがない。
 *
 * ── 予定を案件の口から返す理由 ──────────────────────────
 *
 * 予約の一覧 (`/studios/bookings`) は `studio` 権限。案件を見るのは営業なので、
 * そのままでは自分の案件の日程すら読めない (v2.9.280 で読める形にはしたが、
 * **案件に紐づく予約だけ**を返す口を案件側に置くほうが素直)。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { projectService } from './project.service';

/** 仮押さえを本予約に切り替える目安 (本番日の何日前まで) */
export const HOLD_DEADLINE_DAYS = 45;

/** 予約の種別 (studio_bookings の CHECK と同じ値)。画面に出す日本語 */
const BOOKING_LABELS: Record<string, string> = {
  performance: '本番',
  rehearsal: 'リハーサル',
  hold: '仮押さえ',
  setup: '仕込み',
  tour: '見学',
  consultation: '打合せ',
  maintenance: '保守',
  internal: '社内利用',
  other: 'その他',
};

async function assertProject(id: string) {
  const p = (await queryOne(
    `SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`, [id]
  )) as any;
  if (!p) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  return p;
}

// ───────────────────────────────────────────────────────
// お金タブ
// ───────────────────────────────────────────────────────

/**
 * 見積 → 売上 → 仕入 の4つの数字。**すべて税抜**
 * (消費税と支払額は表示のときに足す。ここで混ぜると案件一覧と数字が合わなくなる)。
 */
export async function getProjectMoney(id: string) {
  const project = await assertProject(id);
  const summary = await projectService.getSummary(id) as any;

  // 見積 (30章)。確定前の下書きも「想定金額」の裏付けとして出す
  const estimate = (await queryOne(
    `SELECT id, amount, discount_amount, estimate_confirmed_at, estimate_sent_at,
            (SELECT COUNT(*) FROM revenue_items i WHERE i.revenue_id = r.id) AS item_count
       FROM revenues r
      WHERE r.project_id = ? AND r.status = 'estimate' AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC LIMIT 1`,
    [id]
  )) as any;

  // 仕入。**仮 (見込み) の件数を別に出す** — 「まだ確定していない数字が入っている」
  // ことが分からないと粗利を信じてしまう
  const purchases = (await queryOne(
    `SELECT COUNT(*) AS c,
            COUNT(*) FILTER (WHERE is_provisional) AS provisional,
            COALESCE(SUM(amount), 0) AS total
       FROM purchases WHERE project_id = ? AND deleted_at IS NULL`,
    [id]
  )) as any;

  const expected = Number(project.expected_amount ?? 0);
  const revenue = Number(summary.total_revenue ?? 0);
  const purchase = Number(summary.total_purchase ?? 0);

  // 粗利は「確定売上があればそれで、無ければ想定金額で」見込む。
  // 受注前は確定売上が 0 なので、想定で見ないと粗利が常にマイナスに見える。
  const base = revenue > 0 ? revenue : expected;
  const gross = base - purchase;

  return {
    project_id: id,
    // 4つの数字。note は「その数字がどこから来たか」
    rows: [
      {
        key: 'expected', label: '想定金額', value: expected,
        note: estimate ? '見積から' : (expected > 0 ? '手で入れた金額' : '見積提案のときに聞きます'),
      },
      {
        key: 'revenue', label: '確定売上', value: revenue,
        note: revenue > 0 ? '登録済みの売上' : '受注後に登録します',
      },
      {
        key: 'purchase', label: '仕入', value: purchase,
        note: Number(purchases?.c ?? 0) === 0
          ? 'まだありません'
          : `${Number(purchases.c)}件${Number(purchases.provisional) > 0 ? ` ・ ${Number(purchases.provisional)}件は仮` : ''}`,
      },
      {
        key: 'gross', label: revenue > 0 ? '粗利' : '粗利（見込み）', value: gross,
        note: base > 0 ? `${Math.round((gross / base) * 1000) / 10}%` : '—',
      },
    ],
    // 画面が出す4つの操作。ここで「できるか」を判定して返す
    // (画面側で条件を書くと、条件が2か所になる)
    actions: [
      { key: 'estimate_items', label: '見積の明細を見る', enabled: true },
      { key: 'estimate_pdf', label: '見積書PDFを出す', enabled: Boolean(estimate) },
      { key: 'add_purchase', label: '仕入を足す', enabled: true },
      { key: 'from_pricing', label: '料金表から組む', enabled: true },
    ],
    estimate: estimate
      ? {
          id: estimate.id,
          amount: Number(estimate.amount ?? 0),
          discount_amount: Number(estimate.discount_amount ?? 0),
          item_count: Number(estimate.item_count ?? 0),
          confirmed: Boolean(estimate.estimate_confirmed_at),
          sent: Boolean(estimate.estimate_sent_at),
        }
      : null,
    provisional_purchase_count: Number(purchases?.provisional ?? 0),
  };
}

// ───────────────────────────────────────────────────────
// 予定タブ
// ───────────────────────────────────────────────────────

/**
 * この案件の日程。**案件に紐づく予約だけ**を返す。
 * 仮押さえが残っていれば「いつまでに本予約へ切り替えるか」も返す
 * (画面が日付を計算すると、案件一覧と違う期限が出る)。
 */
export async function getProjectSchedule(id: string) {
  const project = await assertProject(id);

  const bookings = (await queryAll(
    `SELECT b.id, b.title, b.booking_type, b.status, b.all_day,
            b.start_time, b.end_time,
            COALESCE(
              (SELECT string_agg(r.name, ' / ' ORDER BY r.name)
                 FROM studio_booking_rooms br
                 JOIN studio_rooms r ON r.id = br.room_id
                WHERE br.booking_id = b.id), '') AS rooms
       FROM studio_bookings b
      WHERE b.project_id = ? AND b.deleted_at IS NULL
      ORDER BY b.start_time`,
    [id]
  )) as any[];

  // 案件そのものが持つ日程 (project_dates)。飛び日はここに入る
  const dates = (await queryAll(
    `SELECT date, label FROM project_dates WHERE project_id = ? ORDER BY date`, [id]
  )) as any[];

  const holds = bookings.filter((b) => b.booking_type === 'hold' || b.status === 'tentative');

  // 本予約へ切り替える目安。本番日から逆算する
  let holdDeadline: string | null = null;
  if (holds.length > 0 && project.event_start) {
    const d = new Date(String(project.event_start).slice(0, 10));
    d.setDate(d.getDate() - HOLD_DEADLINE_DAYS);
    holdDeadline = d.toISOString().slice(0, 10);
  }

  return {
    project_id: id,
    event_start: project.event_start,
    event_end: project.event_end,
    bookings: bookings.map((b) => ({
      id: b.id,
      label: BOOKING_LABELS[String(b.booking_type)] ?? String(b.booking_type),
      booking_type: b.booking_type,
      status: b.status,
      all_day: Boolean(b.all_day),
      start_time: b.start_time,
      end_time: b.end_time,
      // 部屋が無い予約は「押さえた」ことにならないので、そう分かるようにする
      rooms: b.rooms || null,
      no_room: !b.rooms,
    })),
    dates,
    hold_count: holds.length,
    hold_deadline: holdDeadline,
    // 部屋の付いていない予約 (14章で紐づけるようにしたが、既存データには残っている)
    missing_room_count: bookings.filter((b) => !b.rooms).length,
  };
}
