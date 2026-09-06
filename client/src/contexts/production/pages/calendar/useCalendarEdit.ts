/**
 * ① 予定 / ダイアログへの持ち込みとドラッグ延長のロジック（v4.5.2）
 *
 * `UnifiedCalendarPage` から切り出した（1ファイル400行の上限）。
 * 週表のドラッグ操作そのもの（マウスの追跡）は `useGridDrag.ts`、
 * ここは「選んだ時間をどのダイアログへどう渡すか」と「延長の保存」。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { invalidateBookingQueries } from '@/lib/bookingQueries';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { PersonalEvent } from '../../components/schedule/scheduleShared';
import type { CalEvent } from './calendarLayout';

export function useCalendarEdit({
  selected, koubanDate, canStudioEdit, canPartnerEdit, mine, onSelectDay, onOpenChooser, onDeleted,
}: {
  /** 選んでいる日（新規の既定日） */
  selected: string;
  /** 香盤のマス押下の下書き（あればこちらが勝つ） */
  koubanDate: { start: string; end: string; allDay: boolean } | null;
  canStudioEdit: boolean;
  canPartnerEdit: boolean;
  /** 自分の予定の生の行（延長できるか＝手入力かの判定に使う） */
  mine: PersonalEvent[];
  onSelectDay: (day: string) => void;
  onOpenChooser: () => void;
  /** 予約を消せたとき（詳細ダイアログを閉じる） */
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  // 週表の空きマスをなぞって選んだ時間（`YYYY-MM-DDTHH:MM`）。
  // チューザー経由で部屋・自分のダイアログに持ち込む（パートナーは日単位なので日付だけ）
  const [timePreset, setTimePreset] = useState<{ start: string; end: string } | null>(null);

  /**
   * ダイアログへ渡す preset は**同一性を保つ**（useMemo）。
   * インラインで作ると毎レンダー新規オブジェクトになり、ダイアログの初期化
   * useEffect（preset が依存配列に入っている）が背後のクエリ解決のたびに走って、
   * **入力中のフォームが黙って白紙に戻る**（机上トレースで確認済みの実在バグ）。
   */
  const studioPreset = useMemo(
    () => (koubanDate ?? (timePreset
      ? { ...timePreset, allDay: false }
      : { start: selected, end: selected, allDay: false })),
    [koubanDate, timePreset, selected],
  );
  const personalPreset = useMemo(
    () => (timePreset ? { ...timePreset, allDay: false } : { start: selected, end: selected, allDay: false }),
    [timePreset, selected],
  );
  // パートナーの予定も**なぞった時刻をそのまま渡す**。代休・有給など日単位が主なので
  // 日付だけのときは今までどおり終日で開くが、週表で時間をなぞってから選んだときに
  // その時刻が黙って捨てられる（終日 09:00–18:00 に戻る）のは「消えた」としか見えなかった。
  // 受け取る側（`PartnerScheduleDialog`）が `T` の有無で終日/時刻指定を切り替える
  const partnerPreset = useMemo(
    () => (timePreset ?? { start: selected, end: selected }),
    [timePreset, selected],
  );

  /** 週表の空きマスの選択が確定した → その時間で「予定を入れる」を開く */
  const createFromRange = (day: string, start: string, end: string) => {
    onSelectDay(day);
    setTimePreset({ start: `${day}T${start}`, end: `${day}T${end}` });
    onOpenChooser();
  };

  /**
   * 札の下端ドラッグで終了時刻だけ変える。更新 API は3系統とも
   * **渡さなかった項目は今の値を保つ**部分更新なので、`end_time` だけ送る
   * （全項目を写して送り直すと、この画面が持っていない項目を壊しかねない）
   */
  const resize = useMutation({
    mutationFn: ({ ev, end }: { ev: CalEvent; end: string }) => {
      const endIso = `${ev.start.slice(0, 10)}T${end}`;
      return ev.layer === 'studio'
        ? api.put(`/studios/bookings/${ev.id}`, { end_time: endIso })
        : api.put(`/schedule/personal/${ev.id}`, { end_time: endIso });
    },
    onSuccess: (_r, { ev, end }) => {
      if (ev.layer === 'studio') invalidateBookingQueries(qc);
      else qc.invalidateQueries({ queryKey: ['personal-events'] });
      notifySuccess(`終了を ${end} にしました`);
    },
    onError: (e) => notifyApiError('終了時刻を変えられませんでした', e),
  });

  /** その札を下端ドラッグで延ばせるか。外部同期（Google 等）の予定は API が編集を拒む */
  const canResizeEvent = (e: CalEvent) => {
    if (e.layer === 'studio') return canStudioEdit;
    if (e.layer === 'my') return canPartnerEdit && mine.find((x) => x.id === e.id)?.source === 'manual';
    return false;
  };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => {
      // 案件詳細の予約一覧も読み直す（消したのに残って見えると、もう一度消しに行く）。
      // **案件の実施日も残った予約から引き直される**ので案件側も落とす（`lib/bookingQueries.ts`）
      invalidateBookingQueries(qc);
      onDeleted();
      notifySuccess('予約を削除しました');
    },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  return {
    studioPreset, personalPreset, partnerPreset,
    createFromRange, resize, canResizeEvent, del,
    clearTimePreset: () => setTimePreset(null),
  };
}
