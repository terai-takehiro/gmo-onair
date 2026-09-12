// 運営マニュアル — 出す前の検査（段D・production-manual.md §6⑤「出す前の検査」）。
//
// 書き出しボタンを押す前に4種の検査結果を画面に出す。**止めない**——
// 呼び出し側はこの結果を見せた上で「このまま書き出す」を必ず押せるようにする
// （§6⑤「止めはしない」）。DOM を一切測定しない純粋関数。
import type { ManualBlock, ManualFreeBlock, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualResolveEntry } from "@/lib/manualResolveApi";

export interface ManualPreExportIssue {
  pageId: string;
  pageTitle: string;
  blockId: string;
}

export interface ManualPreExportChecks {
  /** 紙からはみ出すブロック */
  overflowing: ManualPreExportIssue[];
  /** 中身が空のブロック */
  emptyBlocks: ManualPreExportIssue[];
  /** 元の資料が消えたブロック（差し込みブロックのみ） */
  missingSource: ManualPreExportIssue[];
  /** 差し込み元が変わったまま（確定済み＝ `link.frozen` があるブロックのみ。
   *  段Dでは `frozen` が常に null のためこの配列は常に空になる ——
   *  それが正しい挙動。段Eで `frozen` が入るようになった瞬間に効き始める） */
  staleSource: ManualPreExportIssue[];
}

/**
 * 紙からはみ出すブロックの判定（§6⑤の表の1つ目）。`ManualPrintDocument.tsx` の
 * プレビュー画面（出す前の検査の視覚表現・赤い斜線）も同じ判定を使う（Integrate:
 * この関数1つが正——検査の一覧とプレビューのハイライトで判定がずれないようにする）。
 *
 * ⚠️ 回転は無視した外接矩形（x/y/w/h）で判定する。回転を考慮した厳密な判定
 * （回転後の実際の頂点座標から外接矩形を求め直す）は今回の範囲外の割り切り
 * ——段Dの設計判断どおり。
 */
export function isOverflowingManualBlock(block: ManualBlock): boolean {
  return block.x < 0 || block.y < 0 || block.x + block.w > PAGE_WIDTH_MM || block.y + block.h > PAGE_HEIGHT_MM;
}

/**
 * 自由ブロックの「空」判定。種類ごとに定義が違う（設計判断の「5. 出す前の検査」の
 * とおり）。図形には「空」の概念が無いので対象外（常に false）。
 */
function isFreeBlockEmpty(block: ManualFreeBlock): boolean {
  switch (block.free.type) {
    case "text":
      return block.free.content.text.trim() === "";
    case "image":
      return block.free.content.url.trim() === "";
    case "table":
      return block.free.content.rows.every((row) => row.every((cell) => cell.trim() === ""));
    case "qr":
      return block.free.content.value.trim() === "";
    case "shape":
      return false;
    default:
      return false;
  }
}

/**
 * 差し込みブロックの「空」判定。`resolved.data` が null/空配列/中身の無い
 * オブジェクトのとき（設計判断の「5. 出す前の検査」の2.）。文字列や数値など
 * それ以外の型は対象外（空文字を「空」とは見なさない——仕様が明示するのは
 * null・空配列・空オブジェクトの3つだけ）。
 */
function isResolvedDataEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") return Object.keys(data as Record<string, unknown>).length === 0;
  return false;
}

/**
 * 出す前の検査（4種・production-manual.md §6⑤）。呼び出し側はこの結果を
 * 見せるだけで、書き出しボタン自体は常に押せる状態のままにする。
 */
export function runManualPreExportChecks(
  pages: ManualPage[],
  resolved: Record<string, ManualResolveEntry>,
): ManualPreExportChecks {
  const overflowing: ManualPreExportIssue[] = [];
  const emptyBlocks: ManualPreExportIssue[] = [];
  const missingSource: ManualPreExportIssue[] = [];
  const staleSource: ManualPreExportIssue[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      const issue: ManualPreExportIssue = { pageId: page.id, pageTitle: page.title, blockId: block.id };

      if (isOverflowingManualBlock(block)) overflowing.push(issue);

      if (block.kind === "free") {
        if (isFreeBlockEmpty(block)) emptyBlocks.push(issue);
        continue;
      }

      // ここから kind === 'linked'（差し込みブロック）
      const entry = resolved[block.id];

      if (entry?.error) {
        // 元の資料が消えた（source_missing・access_denied 等）。種類を問わず「消えた」扱い
        missingSource.push(issue);
      } else if (isResolvedDataEmpty(entry?.data)) {
        emptyBlocks.push(issue);
      }

      // 差し込み元が変わったまま。`link.frozen` がある（=確定済み）ときだけ見る
      // （今回`frozen`は常にnullのため、この分岐には到達しない＝常に0件。正しい挙動）
      if (block.link.frozen && entry?.updatedAt) {
        const frozenAt = new Date(block.link.frozen.at).getTime();
        const updatedAt = new Date(entry.updatedAt).getTime();
        if (Number.isFinite(frozenAt) && Number.isFinite(updatedAt) && updatedAt > frozenAt) {
          staleSource.push(issue);
        }
      }
    }
  }

  return { overflowing, emptyBlocks, missingSource, staleSource };
}
