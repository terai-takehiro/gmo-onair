// 運営マニュアル — 段D「出す」の印刷ドキュメント本体。
// production-manual.md §6⑤・§8「PDF の出し方」・設計判断1〜3（このタスクの SHARED_CONTEXT）。
//
// この冊子（`ManualDetail`）1件を、書き出し設定（`ManualExportSettings`）に従って
// 「物理ページの並び」に組み直して描くだけの純粋な表示コンポーネント。API は呼ばない
// （`resolved` は呼び出し側——`manualPrintExport.ts`——が先に取得したものをそのまま渡される）。
//
// **1 `ManualPage` = 1物理ページ**（設計判断2）。書き出し設定の「範囲」（`settings.range`）
// はまず紙面そのもの（表紙・目次を含まない `ManualPage` の並び）に効かせ、そのあとに
// 表紙?→目次?→（絞り込んだ）紙面ページ…の順で並べて通し番号を振る（`ManualExportSettingsPanel.tsx`
// の `pageCount`＝紙面の枚数・「範囲」欄の入力もこの基準に合わせてある——表紙・目次の
// ON/OFF で「5ページ目」の意味が変わらないようにするため）。ページ番号（X / Y）は
// 最終的に実際に刷る物理ページだけを数えた値になる（§6⑤「目次・表紙も1物理ページとして数える」）。
//
// ⚠️ 紙面のブロック描画は `ManualBlockContent.tsx` の `renderManualBlockContent` を
// **そのまま** 呼ぶ（selected:false を渡すので中身コンポーネントは自動的に読み取り専用の
// 見た目になる——中身コンポーネントを作り直さない。設計判断1）。
//
// 確定（fix）・版（rev）は段Eで実装済み。`fixManual()`（`manual.service.ts`）が
// `status='fixed'`・`rev=rev+1` を実際に書き込むので、`manualPrintStatusLabel` の
// 'fixed'/'archived' 側の分岐にもここから到達する。
import type { CSSProperties, ReactNode } from "react";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, type ManualBlock, type ManualDetail, type ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualResolveEntry } from "@/lib/manualResolveApi";
import renderManualBlockContent from "./ManualBlockContent";
import { pagesSorted } from "@/components/opsmanual/pageOrder";
import { isOverflowingManualBlock } from "./manualPreExportChecks";
import { manualBlockCssStyle } from "./manualBlockStyle";
import ManualPrintHeader from "./ManualPrintHeader";
import ManualPrintCover from "./ManualPrintCover";
import ManualPrintToc, { type ManualPrintTocEntry } from "./ManualPrintToc";

/** 書き出す範囲。`mode: 'all'` のときは `from`/`to` を無視する。
 *  `from`/`to` は **紙面そのもの**（表紙・目次を含まない `ManualPage` の並び）の1始まりの
 *  ページ番号——`ManualExportSettingsPanel.tsx` の「範囲」欄・`pageCount` と同じ基準 */
export interface ManualExportRange {
  mode: "all" | "range";
  from: number;
  to: number;
}

/** 書き出し設定（§6⑤の6項目）。preview-screen 側（仕上がり・出す前の検査の画面）もこの型を使う */
export interface ManualExportSettings {
  range: ManualExportRange;
  cover: boolean;
  toc: boolean;
  pageNumbers: boolean;
  /** 柱の「◯月◯日時点」表示自体を出すかどうか */
  showAsOf: boolean;
  /** 色を使わない（白黒で刷る） */
  grayscale: boolean;
}

/** 物理ページ1枚のCSSクラス。`manualPrintExport.ts` が同じ名前で改ページのスタイルを当てる */
export const MANUAL_PRINT_SHEET_CLASS = "manual-print-sheet";

export interface ManualPrintDocumentProps {
  manual: ManualDetail;
  resolved: Record<string, ManualResolveEntry>;
  settings: ManualExportSettings;
  /** 書き出した瞬間の日時（柱の「時点」表示に使う）。省略時は**レンダーのたびに**「いま」を
   *  取り直す（画面内プレビュー用途。マウント時点に固定するものではない——`exportManualToPdf`
   *  側は書き出しボタンを押した瞬間の1つの `Date` をここへ渡し、以後の再描画でも値が
   *  変わらないようにする。§6⑤・設計判断3） */
  exportedAt?: Date;
  /** true の間、紙からはみ出すブロックへ赤い斜線のオーバーレイを重ねる（§6⑤「紙面の外に
   *  はみ出た分は赤い斜線で出す」）。**画面内の「仕上がり」プレビューだけで true にする**——
   *  実際に印刷・PDF化する側（`manualPrintExport.ts`）は渡さない（省略時 false）ので、
   *  配る紙そのものに斜線が印刷されることはない */
  highlightOverflow?: boolean;
}

/** 表紙と柱に出す「取扱注意」。§7-2: 冊子のどこかに伏せ字を解除したブロックが1つでもあれば true */
export function manualHasRevealedSecret(pages: ManualPage[]): boolean {
  return pages.some((page) => page.blocks.some((block) => block.kind === "linked" && !!block.link.reveal));
}

/** 柱の状態表示。§10-3「確定したあと直すときは版を上げる」。
 *  'draft' は「下書き」、'fixed'/'archived'（段E・`fixManual()`）は rev.N 表示に切り替わる */
export function manualPrintStatusLabel(manual: Pick<ManualDetail, "status" | "rev">): string {
  if (manual.status === "draft") return "下書き";
  return `rev.${manual.rev}`;
}

/** 柱の「時点」表示。§6⑤の例「2026/08/22 14:00 時点」・`formatDate()`（YYYY/MM/DD）と
 *  同じ桁の並びで年を含める——紙で配られ、年をまたいで読まれうる資料のため年を落とさない */
export function manualPrintAsOfLabel(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi} 時点`;
}

/**
 * 書き出し設定の「範囲」に従って、紙面そのもの（表紙・目次を含まない配列）を絞り込む。
 * `ManualExportSettingsPanel.tsx` の同名関数と**同じ規則**（範囲外・逆転は空配列を返す
 * ——「書き出すページがありません」の分岐へつながる）。プレビュー・出す前の検査・
 * インクの目安（preview-screen 側）とここ（実際に刷る本体）が同じ並びを見るよう、
 * どちらもこの1つの関数を使う（Integrate: `ManualExportSettingsPanel.tsx` はこの
 * 関数を re-export するだけにする）。
 */
export function selectPagesInRange<T>(pages: T[], range: ManualExportRange): T[] {
  if (range.mode === "all") return pages;
  const from = clampPageNumber(range.from, pages.length);
  const to = clampPageNumber(range.to, pages.length);
  if (to < from) return [];
  return pages.slice(from - 1, to);
}

function clampPageNumber(n: number, pageCount: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, pageCount));
}

interface ContentUnit {
  kind: "content";
  page: ManualPage;
}
type PrintUnit = { kind: "cover" } | { kind: "toc" } | ContentUnit;

export default function ManualPrintDocument({ manual, resolved, settings, exportedAt, highlightOverflow }: ManualPrintDocumentProps) {
  const now = exportedAt ?? new Date();
  const hasSecrets = manualHasRevealedSecret(manual.pages);
  const statusLabel = manualPrintStatusLabel(manual);
  const asOfLabel = settings.showAsOf ? manualPrintAsOfLabel(now) : null;

  // 「範囲」は紙面そのもの（表紙・目次を含まない）に先に効かせる——表紙・目次の ON/OFF で
  // 「5ページ目」の意味が変わらないようにするため（`ManualExportSettingsPanel.tsx` と同じ規則）
  const printedContentPages = selectPagesInRange(pagesSorted(manual.pages), settings.range);

  // 表紙?→目次?→（絞り込み後の）紙面ページ…の順に並べ、この並びのまま通し番号を振る
  // （§6⑤「目次・表紙も1物理ページとして数える」）。ページ番号（X）・総数（Y）は
  // 実際に刷る物理ページだけを数えた値になる
  const units: PrintUnit[] = [
    ...(settings.cover ? [{ kind: "cover" } as const] : []),
    ...(settings.toc ? [{ kind: "toc" } as const] : []),
    ...printedContentPages.map((page): ContentUnit => ({ kind: "content", page })),
  ];
  const total = units.length;
  const numbered = units.map((unit, i) => ({ unit, number: i + 1 }));

  const tocEntries: ManualPrintTocEntry[] = numbered
    .filter((n): n is { unit: ContentUnit; number: number } => n.unit.kind === "content")
    .filter((n) => !!n.unit.page.chapter && n.unit.page.chapter.trim() !== "")
    .map((n) => ({ chapter: n.unit.page.chapter as string, pageNumber: n.number }));

  return (
    <div style={settings.grayscale ? { filter: "grayscale(1)" } : undefined}>
      {numbered.map(({ unit, number }) => (
        <PrintSheet key={unit.kind === "content" ? unit.page.id : `${unit.kind}-${number}`}>
          <ManualPrintHeader
            docNo={manual.doc_no}
            statusLabel={statusLabel}
            asOfLabel={asOfLabel}
            pageLabel={settings.pageNumbers ? `${number} / ${total}` : null}
            hasSecrets={hasSecrets}
          />
          {unit.kind === "cover" && <ManualPrintCover manual={manual} hasSecrets={hasSecrets} />}
          {unit.kind === "toc" && <ManualPrintToc entries={tocEntries} />}
          {unit.kind === "content" && (
            <ManualPrintPageBody page={unit.page} resolved={resolved} highlightOverflow={highlightOverflow} />
          )}
        </PrintSheet>
      ))}
    </div>
  );
}

/** 物理ページ1枚（A4横=297×210mm）の紙そのもの。改ページの指定はここではなく
 *  `manualPrintExport.ts` が書き込むスタイルシート側で行う（inline style だと
 *  :last-child の打ち消しが効かない——previewExport.ts と同じ理由・§8-2） */
function PrintSheet({ children }: { children: ReactNode }) {
  return (
    <div
      className={MANUAL_PRINT_SHEET_CLASS}
      style={{
        position: "relative",
        width: `${PAGE_WIDTH_MM}mm`,
        height: `${PAGE_HEIGHT_MM}mm`,
        overflow: "hidden", // 紙からはみ出す分はここで切れる（実物の印刷と同じ）
        background: "#fff",
        color: "#111827",
      }}
    >
      {children}
    </div>
  );
}

/** 紙面ページ本体。ManualCanvas の読み取り専用版——つかむ・伸縮・すいつき等の操作は
 *  一切持たず、`block.{x,y,w,h,z,rotation,style}` をそのまま静的に置くだけ
 *  （ManualBlockView.tsx の style 計算と同じ考え方。操作用の枠・つまみは出さない） */
function ManualPrintPageBody({
  page,
  resolved,
  highlightOverflow,
}: {
  page: ManualPage;
  resolved: Record<string, ManualResolveEntry>;
  highlightOverflow?: boolean;
}) {
  const sorted = [...page.blocks].sort((a, b) => a.z - b.z);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {sorted.map((block) => (
        <PrintBlock key={block.id} block={block} resolved={resolved[block.id]} highlightOverflow={highlightOverflow} />
      ))}
    </div>
  );
}

// 「紙からはみ出すブロック」の視覚表現（§6⑤「紙面の外にはみ出た分は赤い斜線で出す」）。
// 斜め45度の縞（クロスハッチではなく単方向の斜線——「凝りすぎない」設計判断どおり）を
// 半透明の赤で重ねる。判定は `manualPreExportChecks.ts` の `isOverflowingManualBlock` と
// 完全に同じ関数（出す前の検査の一覧とここでずれない）。
const OVERFLOW_HATCH_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  outline: "0.6mm solid rgba(185, 28, 28, 0.85)",
  outlineOffset: "-0.3mm",
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(185, 28, 28, 0.35) 0mm, rgba(185, 28, 28, 0.35) 1.2mm, transparent 1.2mm, transparent 3mm)",
};

function PrintBlock({
  block,
  resolved,
  highlightOverflow,
}: {
  block: ManualBlock;
  resolved?: ManualResolveEntry;
  highlightOverflow?: boolean;
}) {
  const style: CSSProperties = {
    // `block.style` はケバブケースの CSS プロパティ名（BlockInspector.tsx の patchStyle）。
    // 素通しすると font-size/font-weight 等が効かないため変換する（manualBlockStyle.ts）
    ...manualBlockCssStyle(block.style),
    position: "absolute",
    left: `${block.x}mm`,
    top: `${block.y}mm`,
    width: `${block.w}mm`,
    height: `${block.h}mm`,
    zIndex: block.z,
    transform: block.rotation ? `rotate(${block.rotation}deg)` : (block.style?.transform as string | undefined),
    transformOrigin: "center center",
  };
  return (
    <div style={style}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {renderManualBlockContent(block, { selected: false, onContentCommit: () => {} }, resolved)}
      </div>
      {/* 画面内プレビューだけ（`highlightOverflow` は実際の印刷・PDF化には渡さない）。
          紙面（PrintSheet）が overflow:hidden なので、実際にはみ出た部分は他のブロックと
          同様にここで切れる——縁に接する可視部分にハッチを見せることで「ここで事故っている」
          と気づかせる、という割り切り（回転を考慮した正確なはみ出し範囲の算出はしない） */}
      {highlightOverflow && isOverflowingManualBlock(block) && <div style={OVERFLOW_HATCH_STYLE} aria-hidden="true" />}
    </div>
  );
}
