/**
 * カレンダーの予約 → 案件の「実施日」の書き戻し
 *
 * ── なぜこれが要るか ──────────────────────────────────────────
 *
 * 案件の「実施日」(`projects.event_start` / `event_end`) は、**案件を作るときに
 * 入れたスタジオの日程からしか入っていませんでした**。予約は作ったあと
 * カレンダー（`/studios/bookings`）から動かせるのに、**動かしても案件側は
 * 一度も書き変わりません**。
 *
 * 直す画面はもともと「予約ができたあとは登録済みの予約が唯一のもと」
 * （`client/.../projectForm/ScheduleSection.tsx` の冒頭）と決めて日程の欄を
 * 隠しています。**唯一のもとにしたのに書き戻す道が無かった**ので、
 * カレンダーを直した時点から案件詳細の「実施日」は必ず古いままになります。
 *
 * 実測（検証用 Postgres）: 実施日 2026/08/13 の案件にカレンダーから
 * 8/20〜8/22 の本番を登録しても、案件は `event_start=2026-08-13` /
 * `event_end=null`（画面は「2026/08/13 〜 —」）のままでした。
 *
 * ── どの予約を数えるか ────────────────────────────────────────
 *
 * **本番・リハーサル・仮押さえの3つだけ**（`EVENT_BOOKING_TYPES`）。
 * 予約の種別は9つあり、相談（打合せ）・内覧・メンテナンス・社内利用・その他は
 * **その案件の実施日ではありません**。数えると「3か月前の打合せ」で実施日の
 * 開始が3か月前に伸び、しかも画面からは理由が読めません。
 *
 * この3つは、予約ダイアログが**案件名で題名を自動生成する種別**
 * （`StudioBookingDialog.tsx` の `bookingType === performance | rehearsal | hold`）
 * と同じ組で、「その案件がスタジオを使う日」を表します。
 *
 * ⚠️ **同じ組を画面側も持っています**（`client/.../projectForm/eventBookings.ts`）。
 * サーバーは `shared/` を import できない（`server/tsconfig.json` の `rootDir`）ので
 * 二重に持たざるを得ません。**ずれると「日程の欄が出ないのに実施日も直らない」
 * 案件ができる**ので、`shared/tests/projectEventDates.test.ts` が両方を読んで
 * 突き合わせています。
 *
 * ── 数える予約が1件も無いときは触らない ──────────────────────
 *
 * 予約を全部消しても実施日は**そのまま残します**。消した瞬間に実施日まで
 * 空にすると、Excel 取込・MCP・案件作成で入れた日付が予約の削除だけで
 * 消えます（消えたことは画面のどこにも出ません）。予約が無くなれば直す画面に
 * 「スタジオの日程」の欄が戻るので、そこから直せます。
 */
import { withTransaction } from '../../../shared/db/connection';

/** 実施日として数える予約の種別。**画面側の同名の表と揃えること** */
export const EVENT_BOOKING_TYPES = ['performance', 'rehearsal', 'hold'] as const;

export interface EventRangeBooking {
  booking_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

/** `2026-08-20T10:00` も `2026-08-20` も `2026-08-20` にする */
function ymd(value: string | null | undefined): string | null {
  const m = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * 予約の並びから実施日の期間を出す。**SQL と同じ規則**を素の関数にしたもので、
 * `shared/tests/projectEventDates.test.ts` が境目（終了なし・終了が開始より前・
 * 数えない種別だけ）をここで固定している。
 *
 * @returns 数える予約が1件も無ければ `null`（＝案件の実施日を触らない）
 */
export function deriveEventRange(
  bookings: EventRangeBooking[],
): { start: string; end: string } | null {
  const days: string[] = [];
  for (const b of bookings) {
    if (!EVENT_BOOKING_TYPES.includes(b.booking_type as typeof EVENT_BOOKING_TYPES[number])) continue;
    const start = ymd(b.start_time);
    if (!start) continue;                       // 開始が読めない行は数えない
    days.push(start);
    // **終了が開始より前の行は終了を捨てる。** 拾うと実施日が逆さまになる
    const end = ymd(b.end_time);
    if (end && end >= start) days.push(end);
  }
  if (days.length === 0) return null;
  days.sort();
  return { start: days[0], end: days[days.length - 1] };
}

/**
 * 案件の実施日を、その案件に紐づく予約から引き直す。
 *
 * **値が変わるときだけ書く。** 予約を保存し直すたびに `updated_at` が動くと、
 * 案件一覧の「止まっている」（7日動いていない）が予約の開き直しで消えてしまう。
 *
 * ── 同じ案件を2人が同時に触ったとき ────────────────────────
 *
 * 集計と書き込みを別々に流すと、**あとから来た予約の変更が古い期間で
 * 上書きされます**（レビューでの指摘 #164・P2）:
 *
 *   A: 8/20 の本番を消す → 集計（8/22 だけ）… ここで一息
 *   B: 8/25 のリハを足す → 集計（8/22〜8/25）→ 書く
 *   A: さっき数えた 8/22 を書く  ← **B の 8/25 が消える**
 *
 * ⚠️ **消えたことは画面のどこにも出ません。** カレンダーには 8/25 の予約が
 * 見えているのに案件の実施日だけが古く、**どちらが本当かは予約を1件ずつ
 * 開くまで分かりません**（この書き戻しを足した理由そのものに戻る）。
 *
 * そこで**案件の行を掴んでから数えます**（`FOR UPDATE`）。順番が要点で、
 * **先に掴む**と、待たされた側は**相手が書き終えた後の予約**を数えることになり、
 * 最後に残る期間が必ず「いまある予約」と一致します。
 * 逆（数えてから掴む）にすると、掴めた時点で手元の集計はもう古いので直りません。
 *
 * **案件をまたぐ取り合いは起きません** — 掴むのは1件だけで、
 * 付け替え（案件 A → B）はこの関数を**2回**呼ぶ形なので、
 * 1回目の取引を閉じてから2回目に入ります（両側から掴み合って止まることがない）。
 *
 * @returns 書き変えたときだけ新しい期間を返す（触らなかったときは `null`）
 */
export async function syncProjectEventDates(
  projectId: string | null | undefined,
  actorId: string,
): Promise<{ start: string; end: string } | null> {
  if (!projectId) return null;

  return withTransaction(async (tx) => {
    // **先に案件を掴む。** 同じ案件を同時に触った要求はここで順番待ちになる
    const project = await tx.queryOne(
      'SELECT event_start, event_end FROM projects WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [projectId],
    ) as { event_start: string | null; event_end: string | null } | undefined;
    if (!project) return null;

    // 掴んだあとに数える（待たされた側は、相手が書き終えた後の予約を数える）
    const range = await tx.queryOne(
      `SELECT MIN(substr(b.start_time, 1, 10)) AS start_day,
              MAX(GREATEST(substr(b.start_time, 1, 10),
                           substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10))) AS end_day
         FROM studio_bookings b
        WHERE b.project_id = ?
          AND b.deleted_at IS NULL
          AND b.booking_type IN (${EVENT_BOOKING_TYPES.map(() => '?').join(', ')})`,
      [projectId, ...EVENT_BOOKING_TYPES],
    ) as { start_day: string | null; end_day: string | null } | undefined;

    const start = range?.start_day ?? null;
    const end = range?.end_day ?? null;
    if (!start || !end) return null;            // 数える予約が無い → 触らない

    // 列は TEXT (YYYY-MM-DD) だが、古い行に時刻付きが混ざっていても比べられるように揃える
    if (ymd(project.event_start) === start && ymd(project.event_end) === end) return null;

    await tx.execute(
      `UPDATE projects SET event_start = ?, event_end = ?, updated_at = NOW(), updated_by = ?
        WHERE id = ? AND deleted_at IS NULL`,
      [start, end, actorId, projectId],
    );
    return { start, end };
  });
}
