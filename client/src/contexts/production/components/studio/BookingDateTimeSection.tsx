import type { MutableRefObject } from "react";
import { Switch } from "@/components/ui/switch";
import { addDaysToDateStr, addMinutesToTimeStr } from "@/lib/format";

const inputCls = "text-[15px] text-primary bg-transparent border-none outline-none cursor-pointer";

interface Props {
  /** 本番/リハーサルのように既定が単日の種別か（「複数日」トグルの有無を決める） */
  isSingleDateType: boolean;
  allDay: boolean;
  setAllDay: (v: boolean) => void;
  multiDay: boolean;
  setMultiDay: (v: boolean) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  /** 終了時刻を手で直したか（`StudioBookingDialog.tsx` が持つ。開始→終了の自動追従の on/off） */
  endTimeTouchedRef: MutableRefObject<boolean>;
}

/**
 * `StudioBookingDialog.tsx` の「⑤ 日時」セクション（`StudioBookingDialog.tsx` から
 * 1ファイル400行のラチェットのために切り出し）。
 *
 * ロジックは元のまま:
 * - 複数日にした瞬間・開始日を動かした結果として終了日が開始日以前になったら、
 *   開始日の**翌日**へ押し出す（デフォルト値・前後関係の両方を兼ねる）
 * - 終了時刻を手で直していなければ、開始時刻を動かすと**開始の1時間後**に追従する
 * - `min` 属性はカレンダー UI の選択しか止めない（キーボードで直接打ち直した値は
 *   すり抜ける）ため、`onChange` 側でも開始日以前の終了日を弾く
 */
export function BookingDateTimeSection({
  isSingleDateType, allDay, setAllDay, multiDay, setMultiDay,
  startDate, setStartDate, endDate, setEndDate, startTime, setStartTime, endTime, setEndTime,
  endTimeTouchedRef,
}: Props) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">日時</p>
      <div className="rounded-xl border bg-muted/30 divide-y overflow-hidden">
        {/* 終日 toggle */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-[15px]">終日</span>
          <Switch checked={allDay} onCheckedChange={setAllDay} />
        </div>

        {/* 複数日 toggle (本番/リハーサルのみ)。
            **開始・終了より前に置く**（`docs/design/v4/_form-order.md` 2-1）。
            このトグルが終了「日」欄の有無を決める（下の `!isSingleDateType || multiDay`）ので、
            下に置くと「終了に日付が入れられない」と詰まってから戻ることになる。
            同じ性質の「終日」と並べれば、日付の欄が出る条件がひと目で分かる */}
        {isSingleDateType && (
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-[15px]">複数日</span>
            <Switch
              checked={multiDay}
              onCheckedChange={(c) => {
                setMultiDay(c);
                if (!c) setEndDate(startDate);
                // **複数日にした瞬間のデフォルトは開始日の翌日。** 終了日欄が
                // 出た直後の値が「開始日と同じ（＝実質1日のまま）」だと、
                // ここで一度延ばす操作を挟まないと複数日にした意味が無い
                else if (endDate <= startDate) setEndDate(addDaysToDateStr(startDate, 1));
              }}
            />
          </div>
        )}

        {/* 開始 */}
        <div className="flex items-center px-4 py-3.5 gap-2">
          <span className="text-[15px] w-8 shrink-0">開始</span>
          <div className="flex flex-1 justify-end items-center gap-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                if (isSingleDateType && !multiDay) {
                  setEndDate(v);
                } else if (isSingleDateType && multiDay) {
                  // 複数日: 終了日は開始日より後を維持する（同日以下なら翌日へ押し出す）
                  if (endDate <= v) setEndDate(addDaysToDateStr(v, 1));
                } else {
                  // **非単日タイプ（相談・下見・設営・保守・社内利用など）は同日の
                  // 終了日を許す**（同日の時刻指定予約が普通にある）。開始日より
                  // 前になったときだけ開始日に揃える（Codex レビュー指摘・P1）
                  if (endDate < v) setEndDate(v);
                }
              }}
              className={inputCls}
              style={{ fontSize: "16px", colorScheme: "light" }}
            />
            {!allDay && (
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartTime(v);
                  // **終了時刻を手で直していなければ「開始の1時間後」に追従。**
                  // 直していたら上書きしない（決めた終了時刻が黙って動くと困る）
                  if (!endTimeTouchedRef.current) setEndTime(addMinutesToTimeStr(v, 60));
                }}
                className={inputCls}
                style={{ fontSize: "16px" }}
              />
            )}
          </div>
        </div>

        {/* 終了
            単日タイプ (本番/リハ) でも時刻指定 (!allDay) なら「同日の終了時刻」を
            入力できるよう終了行を表示する。終了「日」は複数日/非単日タイプのみ、
            終了「時刻」は時刻指定時は常に表示 (= 8:00〜20:00 のような同日枠に対応)。 */}
        {(!isSingleDateType || multiDay || !allDay) && (
          <div className="flex items-center px-4 py-3.5 gap-2">
            <span className="text-[15px] w-8 shrink-0">終了</span>
            <div className="flex flex-1 justify-end items-center gap-3">
              {(!isSingleDateType || multiDay) && (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    // **`min` はカレンダー UI の選択しか止めない。** 日付欄を
                    // キーボードで直接打ち直すと `min` 未満でも `onChange` は
                    // 普通に発火するため、ここでも弾く。
                    // 複数日モードは同日以下を翌日へ押し出す（デフォルト値の趣旨）が、
                    // **非単日タイプは同日の終了日を許す**（同日の時刻指定予約がある。
                    // Codex レビュー指摘・P1）— 弾くのは開始日より前だけ
                    setEndDate(
                      isSingleDateType && multiDay
                        ? (v <= startDate ? addDaysToDateStr(startDate, 1) : v)
                        : (v < startDate ? startDate : v)
                    );
                  }}
                  min={isSingleDateType && multiDay ? addDaysToDateStr(startDate, 1) : startDate}
                  className={inputCls}
                  style={{ fontSize: "16px", colorScheme: "light" }}
                />
              )}
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => { endTimeTouchedRef.current = true; setEndTime(e.target.value); }}
                  className={inputCls}
                  style={{ fontSize: "16px" }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
