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

/**
 * 版の見せ方。**全画面でこの1本を使う**（一覧・編集画面・書き出し・運営マニュアルの札）。
 *   - 確定 → 「第{rev}版」
 *   - 下書きで rev 0（一度も確定していない）→ ""（版は出さない）
 *   - 下書きで rev ≥ 1（確定を解いて直している）→ 「第{rev}版（編集中）」
 * `rev` は確定のたびに +1 される（サーバーの `fixTechDoc`）。以前は一覧・編集画面が `rev + 1`、
 * 書き出し・札が `rev` を出していたため、最初の確定のあと一覧は「第2版」・PDF は「第1版」と食い違った。
 */
export function revLabel(doc: { status: string; rev: number }): string {
  const rev = typeof doc.rev === "number" && Number.isFinite(doc.rev) ? doc.rev : 0;
  if (rev <= 0) return "";
  return doc.status === "fixed" ? `第${rev}版` : `第${rev}版（編集中）`;
}
