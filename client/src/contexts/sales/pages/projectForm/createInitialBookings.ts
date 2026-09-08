/**
 * 案件を**新しく作ったとき**、または**まだ予約が1件も無い案件を編集したとき**に、
 * 入力されたスタジオ日程から予約を1度だけ作る
 *
 * ── なぜ別のファイルにしたか ────────────────────────────────
 *
 * `useProjectForm.ts` は 400 行ちょうどで、`npm run lint` の上限に張り付いています。
 * ここは**フォームの状態管理ではなく「保存の後始末」**なので、切り出すのが自然です
 * （中身は1行も変えていません。足したのは最後の読み直しだけ）。
 *
 * ── 直したこと ──────────────────────────────────────────────
 *
 * ⚠️ **作った予約のぶんを読み直していませんでした**（レビューでの指摘 #164・P1）。
 * サーバーは予約から案件の実施日を引き直すので
 * （`server/.../project-event-dates.service.ts`）、落とさないと
 * **いま作った案件の詳細が、リハーサルを含む前の実施日**を出します。
 * 保存の `onSuccess` は先に案件詳細へ移るので、**移った先が古い**という形になります
 * （`staleTime` は 60 秒・focus では読み直さない）。
 *
 * ⚠️ **失敗を黙って握りつぶしていました**（利用者からのご指摘: 会場を選んで案件を
 * 作ったのに、案件詳細を開くと「会場・スタジオを押さえていません」になり、
 * 予約がそもそも作られていなかった）。案件の保存自体は先に成功しており、保存の
 * `onSuccess` が**すぐ案件詳細へ移る**ため、ここで予約作成が失敗しても利用者は
 * 何も見ないまま新しい案件詳細を開くことになる。しかも `catch` が何も出さないので
 * ブラウザのコンソールにすら残らず、**原因を追う手がかりが無い**。予約が無い状態
 * こそ実害（会場を押さえたつもりが押さえられていない）なので、失敗は
 * `notifyApiError` で必ず出す。案件そのものは保存できているので、保存を失敗扱いには
 * しない — 案件詳細の「登録済みの予約」から入れ直せることを伝える。
 */
import type { QueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { invalidateBookingQueries, type Invalidator } from '@/lib/bookingQueries';
import { formatShortDate } from '@/lib/format';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { hasFreshEventBooking } from './eventBookings';
import { saveLocationNote } from './useProjectSchedule';

/** 予約を作るのに要る日程だけ（`useProjectSchedule` の戻り値の一部） */
export interface BookingSchedule {
  roomIds: string[];
  locationNote: string;
  productionStart: string;
  productionLastDay: string;
  hasRehearsal: boolean;
  rehearsalStart: string;
  rehearsalEnd: string;
  rehearsalMultiDay: boolean;
}

/**
 * **実施日を決める予約（`hasEventBooking`）が1件も無いときだけ呼ぶこと。**
 * 1件でもあれば、そこから先は「登録済みの予約」＋ `StudioBookingDialog` で
 * CRUD する（このフォームからは作らない）。
 */
export async function createInitialBookings(
  qc: Invalidator,
  projectName: string,
  projectId: string,
  schedule: BookingSchedule,
): Promise<void> {
  const note = schedule.locationNote.trim();
  // **1件ずつ捕まえる。** 2件を1つの `try` に入れると、本番が通ってリハーサルだけ
  // 失敗したときに「どちらが失敗したか」が分からなくなる（先に投げた例外で後続が
  // 実行されないぶん、通知の理由も本番の分しか出せない）
  let lastError: unknown;
  const post = async (body: Record<string, unknown>) => {
    try {
      await api.post('/studios/bookings', body);
    } catch (e) {
      lastError = e;
    }
  };

  await post({
    title: `${projectName} (${formatShortDate(schedule.productionStart)})`,
    booking_type: 'performance',
    project_id: projectId,
    all_day: true,
    start_time: schedule.productionStart,
    end_time: schedule.productionLastDay || schedule.productionStart,
    room_ids: schedule.roomIds,
    location_note: note || null,
  });
  if (schedule.hasRehearsal && schedule.rehearsalStart) {
    const rehEnd = schedule.rehearsalMultiDay ? schedule.rehearsalEnd : schedule.rehearsalStart;
    await post({
      title: `${projectName} (${formatShortDate(schedule.rehearsalStart)})`,
      booking_type: 'rehearsal',
      project_id: projectId,
      all_day: true,
      start_time: schedule.rehearsalStart,
      end_time: rehEnd || schedule.rehearsalStart,
      room_ids: schedule.roomIds,
      location_note: note || null,
    });
  }

  /*
   * ⚠️ **失敗しても落とす。** 2件目（リハーサル）だけ失敗した回でも1件目のぶんは
   * 実施日に効いているので、ここに置くと**部分的に入ったときだけ古いまま**になる
   */
  invalidateBookingQueries(qc);

  // **黙って諦めない。** 案件そのものは保存済みなので保存を失敗扱いにはしないが、
  // 会場・スタジオが押さえられていないことは必ず伝える（そうしないと「登録した
  // つもり」のまま案件詳細を開き、「会場・スタジオを押さえていません」だけが
  // 残って原因が分からなくなる）
  if (lastError) {
    notifyApiError(
      '会場・スタジオの予約を登録できませんでした',
      lastError,
      '案件は保存されています。案件詳細の「登録済みの予約」から入れ直してください。',
    );
  }
}

/**
 * 保存が成功したあとの「予約の後始末」をまとめて呼ぶ（`useProjectForm.ts` の `onSubmit` から）。
 *
 * ⚠️ **ここは `mutate` の個別コールバックなので、失敗しても react-query は拾わない**
 * （呼び出し側の `onSuccess` はすでに「保存しました」を出したあと）。
 * `hasFreshEventBooking` の取り直し自体が失敗（ネットワーク断・4xx/5xx）したときに
 * 黙って落ちると、予約が押さえられていないことに誰も気づけない（Codex 指摘 #660 P1）。
 * **必ずここで捕まえて知らせる。**
 */
export async function runPostSaveBookingFlow(
  qc: QueryClient,
  isEdit: boolean,
  projectId: string,
  projectName: string,
  schedule: BookingSchedule,
): Promise<void> {
  const wantsBooking = schedule.roomIds.length > 0 || schedule.locationNote.trim();
  if (!wantsBooking || !schedule.productionStart) return;
  try {
    if (isEdit && (await hasFreshEventBooking(qc, projectId))) return;
    // ⚠️ **場所メモの候補履歴（`localStorage`）が書けなくても予約は作る。**
    // ここで投げると下の `createInitialBookings` まで届かず、任意の下書き機能の
    // 失敗（容量不足等）のせいで本命の予約が作られない（Codex 指摘 #660 P2）
    if (schedule.locationNote.trim()) {
      try { saveLocationNote(schedule.locationNote.trim()); } catch { /* 履歴は無くても困らない */ }
    }
    await createInitialBookings(qc, projectName, projectId, schedule);
  } catch (e) {
    notifyApiError(
      '会場・スタジオの予約を確認できませんでした', e,
      '案件は保存されています。案件詳細の「登録済みの予約」から入れ直してください。',
    );
  }
}
