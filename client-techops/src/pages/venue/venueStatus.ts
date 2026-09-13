// 会場図面の状態（下書き／確定／過去の版）— 画面の言い回しだけ。
// `manualStatus.ts` と同じ形（値はサーバー・DB の CHECK 制約と同じ・ラベルと色は画面だけの話）。
// 設計: docs/design/v4/venue-layout.md §1「見せる5語」・§6①一覧の「状態」列。
import type { VenueLayoutStatus } from "@gmo-onair/shared/src/venue/types";

export const VENUE_STATUS_LABEL: Record<VenueLayoutStatus, string> = {
  draft: "下書き",
  fixed: "確定",
  archived: "過去の版",
};

export const VENUE_STATUS_BADGE_VARIANT: Record<VenueLayoutStatus, "secondary" | "success" | "outline"> = {
  draft: "secondary",
  fixed: "success",
  archived: "outline",
};
