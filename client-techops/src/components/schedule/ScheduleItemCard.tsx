// PC グリッドの項目カード1枚（列の中の項目・横串の項目のどちらもこれで描く）。
// `ScheduleGrid.tsx` から切り出した（1ファイル400行の上限・`scripts/check-file-size.mjs`）。
//
// 2026-09-06 のご依頼で変えたこと:
//  - **左罫のアクセント（列の色の縦線）をやめた**。列の色は見出しの丸だけで示す
//  - **カードの中に「開始–終了」と所要（1時間30分）を出す**。高さが足りない短い項目は
//    題名の右に所要だけを添える（何時間何分の予定なのかがカードだけで分かるように）
//  - **ドラッグ中・下端リサイズ中は、いまの時刻を吹き出しで出す**。カードの中に置くと
//    短い項目で切れてしまうので、カードの外（上／下の隣）に置く
//  - **かぶったところに文字を出さない**（追加のご依頼）。手前に重なるカードの上端までしか
//    文字を描かない（`textMaxHeight`。決めるのは `scheduleCardLayout.ts`）。
//    0 が来たら文字は1文字も出さない — 隠れる位置に置いても読めないため
import { fmtHmPad, fmtSpan } from "@gmo-onair/shared/src/schedule/time";
import { itemKindColor } from "@gmo-onair/shared/src/schedule/kinds";
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { cn } from "@/lib/utils";

// 下端リサイズのつまみの高さ。押せるボタンではない（onClick を持たない）ので
// 44px のタップ領域規則の対象外（`scripts/check-ui-tokens.mjs` の tap-target の但し書き）
const RESIZE_HANDLE_PX = 8;
// 「開始–終了 ・ 所要」を2行目に出せる高さ。これ未満は題名の行に所要だけ添える
const TWO_LINE_MIN_PX = 34;
// カードの上端から文字までの隙間（枠1px＋`py-0.5`）。文字の入れ物の高さから差し引く
const CARD_TOP_PAD_PX = 3;

export interface ScheduleItemCardProps {
  item: ScheduleItem;
  top: number;
  height: number;
  /** CSS の値（列の中は `%`、横串は px 計算）。左端と幅 */
  left: string;
  width: string;
  /** 文字を描いてよい高さ。0 なら文字を出さない（`scheduleCardLayout.ts` が決める） */
  textMaxHeight: number;
  conflicted: boolean;
  /** この項目をいまドラッグ中か。`kind` は移動か下端リサイズか */
  dragging: boolean;
  dragKind: "move" | "resize" | null;
  /** 横串（列をまたぐ項目）。ラベルを1つ添える */
  spanLabel?: string | null;
  onSelect: () => void;
  /** 無ければドラッグを始めない（閲覧だけの画面） */
  onPointerDownMove?: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerDownResize?: (e: React.PointerEvent<HTMLElement>) => void;
}

export default function ScheduleItemCard({
  item, top, height, left, width, textMaxHeight, conflicted, dragging, dragKind, spanLabel,
  onSelect, onPointerDownMove, onPointerDownResize,
}: ScheduleItemCardProps) {
  const durationMin = item.end_min - item.start_min;
  // 2行目（開始–終了 ・ 所要）は、カードの高さと「文字を描いてよい高さ」の両方が足りるときだけ
  const twoLine = height >= TWO_LINE_MIN_PX && textMaxHeight >= TWO_LINE_MIN_PX;
  // 吹き出しはカードの外側（移動中は上・リサイズ中は動いている下端の隣）に出す
  const readoutTop = dragKind === "resize" ? top + height + 4 : Math.max(0, top - 22);

  return (
    <>
      {dragging && (
        <div
          className="pointer-events-none absolute z-30 whitespace-nowrap rounded-badge bg-foreground px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-background shadow-md"
          style={{ top: readoutTop, left }}
        >
          {dragKind === "resize"
            ? `終了 ${fmtHmPad(item.end_min)}`
            : `${fmtHmPad(item.start_min)}–${fmtHmPad(item.end_min)}`}
          {" ・ "}
          {fmtSpan(durationMin)}
        </div>
      )}
      <button
        type="button"
        onPointerDown={onPointerDownMove}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className={cn(
          "absolute overflow-hidden rounded border px-1.5 py-0.5 text-left leading-tight shadow-sm",
          conflicted ? "border-destructive ring-1 ring-destructive" : "border-black/10",
          onPointerDownMove && "cursor-grab touch-none",
          dragging && "z-20 cursor-grabbing opacity-90 shadow-md",
        )}
        style={{ top, height, left, width, backgroundColor: `#${itemKindColor(item.kind)}` }}
        title={`${item.title}（${fmtHmPad(item.start_min)}–${fmtHmPad(item.end_min)} ・ ${fmtSpan(durationMin)}）`}
      >
        {/* 文字はここに閉じ込める。手前に重なるカードが来る所より下へは描かない */}
        {textMaxHeight > 0 && (
          <span className="block overflow-hidden" style={{ maxHeight: Math.max(0, textMaxHeight - CARD_TOP_PAD_PX) }}>
            <span className="flex items-baseline gap-1">
              {spanLabel && (
                <span className="shrink-0 rounded-badge-xs border border-border px-1 text-[9px] text-muted-foreground">{spanLabel}</span>
              )}
              <span className="truncate text-[11px] font-medium">{item.title || "（無題）"}</span>
              {!twoLine && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtSpan(durationMin)}</span>
              )}
              {item.link_broken && <span className="shrink-0 text-destructive">⚠</span>}
            </span>
            {twoLine && (
              <span className="mt-0.5 block truncate text-[10px] tabular-nums text-muted-foreground">
                {fmtHmPad(item.start_min)}–{fmtHmPad(item.end_min)} ・ {fmtSpan(durationMin)}
              </span>
            )}
          </span>
        )}
        {onPointerDownResize && (
          <div
            onPointerDown={onPointerDownResize}
            className="absolute inset-x-0 bottom-0 cursor-ns-resize touch-none"
            style={{ height: RESIZE_HANDLE_PX }}
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}
