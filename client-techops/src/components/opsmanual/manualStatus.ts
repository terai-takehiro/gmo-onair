// 運営マニュアルの状態（下書き／確定／過去の版）— 画面の言い回しだけ。
// `scheduleStatus.ts` と同じ形（値はサーバー・DB の CHECK 制約と同じ・ラベルと色は画面だけの話）。
// 段Aでは常に draft のまま（確定・過去の版に進める操作は段Bで作る）。
import type { ManualStatus } from "@gmo-onair/shared/src/opsmanual/types";

export const MANUAL_STATUS_LABEL: Record<ManualStatus, string> = {
  draft: "下書き",
  fixed: "確定",
  archived: "過去の版",
};

export const MANUAL_STATUS_BADGE_VARIANT: Record<ManualStatus, "secondary" | "success" | "outline"> = {
  draft: "secondary",
  fixed: "success",
  archived: "outline",
};
