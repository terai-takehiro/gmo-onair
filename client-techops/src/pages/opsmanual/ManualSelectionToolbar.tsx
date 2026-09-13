// 複数選択したブロックの整列・等間隔・重ね順操作（production-manual.md §6-2
// 「複数選択｜ドラッグで囲む・Shift で足す。整列・等間隔・重ね順」）。
// ManualCanvas が2つ以上選んでいるときだけキャンバスの左上に浮かせて出す。
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, BringToFront, SendToBack,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlignMode, DistributeAxis, ZOrderMode } from "./manualCanvasGeometry";

interface Props {
  count: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onZOrder: (mode: ZOrderMode) => void;
}

const ICON = "h-3.5 w-3.5";
const SEP = <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />;

export default function ManualSelectionToolbar({ count, onAlign, onDistribute, onZOrder }: Props) {
  const canDistribute = count >= 3;
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 flex flex-wrap items-center gap-1 rounded-card border border-border bg-card p-1.5 shadow">
      <span className="px-1 text-sub-sm text-muted-foreground">{count}個選択中</span>
      {SEP}
      <Button type="button" variant="ghost" size="icon-sm" title="左そろえ" aria-label="左そろえ" onClick={() => onAlign("left")}>
        <AlignStartVertical className={ICON} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="左右中央そろえ" aria-label="左右中央そろえ" onClick={() => onAlign("h-center")}>
        <AlignCenterVertical className={ICON} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="右そろえ" aria-label="右そろえ" onClick={() => onAlign("right")}>
        <AlignEndVertical className={ICON} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="上そろえ" aria-label="上そろえ" onClick={() => onAlign("top")}>
        <AlignStartHorizontal className={ICON} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="上下中央そろえ" aria-label="上下中央そろえ" onClick={() => onAlign("v-middle")}>
        <AlignCenterHorizontal className={ICON} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="下そろえ" aria-label="下そろえ" onClick={() => onAlign("bottom")}>
        <AlignEndHorizontal className={ICON} aria-hidden="true" />
      </Button>
      {SEP}
      <Button type="button" variant="ghost" size="sm" disabled={!canDistribute} title="横方向のすき間をそろえる（3個以上）" onClick={() => onDistribute("horizontal")}>
        横等間隔
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={!canDistribute} title="縦方向のすき間をそろえる（3個以上）" onClick={() => onDistribute("vertical")}>
        縦等間隔
      </Button>
      {SEP}
      <Button type="button" variant="ghost" size="icon-sm" title="最前面へ" aria-label="最前面へ" onClick={() => onZOrder("front")}>
        <BringToFront className={ICON} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="最背面へ" aria-label="最背面へ" onClick={() => onZOrder("back")}>
        <SendToBack className={ICON} aria-hidden="true" />
      </Button>
    </div>
  );
}
