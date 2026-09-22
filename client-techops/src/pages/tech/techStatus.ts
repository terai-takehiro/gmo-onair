// 技術資料の状態（下書き／確定）— 画面の言い回しだけ。
// `venueStatus.ts` と同じ形（値はサーバー・DB の CHECK 制約と同じ・ラベルと色は画面だけの話）。
// 設計: docs/design/v4/tech-docs.md §1「見せる語」・§6①一覧の「状態」。
import type { TechDocStatus } from "@gmo-onair/shared/src/tech/types";

export const TECH_STATUS_LABEL: Record<TechDocStatus, string> = {
  draft: "下書き",
  fixed: "確定",
};

export const TECH_STATUS_BADGE_VARIANT: Record<TechDocStatus, "secondary" | "success"> = {
  draft: "secondary",
  fixed: "success",
};
