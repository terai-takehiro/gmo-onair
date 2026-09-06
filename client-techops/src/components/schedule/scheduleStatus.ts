// スケジュール表の状態（下書き／確定／保管）— 画面の言い回しだけ。
// 14-schedule-v2-plan.md §4-4「状態は人が付ける札。サーバーは判定しない」。
//
// サーバーの `SCHEDULE_STATUSES`（`schedule.service.ts`）と値は同じだが、ここは
// 日本語ラベルとバッジの色という**画面だけの話**なので、複製の対象（`kinds.ts` 等）
// には入れていない。
import type { ScheduleStatus } from "@gmo-onair/shared/src/schedule/types";

export const SCHEDULE_STATUS_ORDER: ScheduleStatus[] = ["draft", "fixed", "archived"];

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  draft: "下書き",
  fixed: "確定",
  archived: "保管",
};

/** 一覧・見出しのバッジ色。「確定」だけ目立たせ、「保管」は控えめにする */
export const SCHEDULE_STATUS_BADGE_VARIANT: Record<ScheduleStatus, "secondary" | "success" | "outline"> = {
  draft: "secondary",
  fixed: "success",
  archived: "outline",
};
