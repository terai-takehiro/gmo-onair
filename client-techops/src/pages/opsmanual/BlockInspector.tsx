// 選択中のブロックの基本的な書式パネル（段B・右パネル）。
// 文字（大きさ・太さ・色・そろえ）と図形（種類・線の色/太さ）だけを持つ
// （長体の自動フィット・袋文字・影・グラデーション・縦書きは段Bのスコープ外）。
// 画像・表・QR の中身編集は紙面上のブロック自体（`blocks/*.tsx`）で完結するので、
// ここでは案内文だけを出す。
//
// `onCommit` は呼び出し側（`ManualDetailPage`）が `ManualCanvas` の
// `useManualHistory.commit`（ref 経由）に配線している。ここで直接 `ManualCanvas` を
// 経由しているわけではないが、結果としてここでの変更も undo 履歴の1手として積まれる
// （Ctrl+Z で取り消せる）。
import { AlignCenter, AlignLeft, AlignRight, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, type ManualBlock, type ManualShapeKind } from "@gmo-onair/shared/src/opsmanual/types";
import { genBlockId } from "./manualCanvasGeometry";

const SHAPE_LABEL: Record<ManualShapeKind, string> = {
  rect: "矩形",
  "rounded-rect": "角丸",
  ellipse: "円",
  line: "線",
  arrow: "矢印",
  callout: "吹き出し",
};
const SHAPE_KEYS = Object.keys(SHAPE_LABEL) as ManualShapeKind[];

// LINE Seed JP は 400/700/800 の3段だけ（shared/CLAUDE.md）
const FONT_WEIGHTS: { value: number; label: string }[] = [
  { value: 400, label: "標準" },
  { value: 700, label: "太字" },
  { value: 800, label: "極太" },
];

const FIELD_LABEL = "flex items-center justify-between gap-2 text-sub-sm text-muted-foreground";
const FIELD_INPUT = "w-24 rounded border border-input bg-background px-2 py-1 text-sub-sm text-foreground";

interface Props {
  blocks: ManualBlock[];
  selectedBlockId: string | null;
  onCommit: (nextBlocks: ManualBlock[]) => void;
}

export default function BlockInspector({ blocks, selectedBlockId, onCommit }: Props) {
  const block = blocks.find((b) => b.id === selectedBlockId);

  if (!block) {
    return (
      <div className="rounded-card border border-dashed border-border bg-muted/20 p-3 text-sub-sm text-muted-foreground">
        ブロックを選ぶと、ここに書式が出ます。
      </div>
    );
  }

  const patchStyle = (patch: Record<string, string | number>) => {
    onCommit(blocks.map((b) => (b.id === block.id ? { ...b, style: { ...b.style, ...patch } } : b)));
  };
  const patchContent = (content: ManualBlock["free"]["content"]) => {
    onCommit(blocks.map((b) => (b.id === block.id ? ({ ...b, free: { ...b.free, content } } as ManualBlock) : b)));
  };
  const remove = () => onCommit(blocks.filter((b) => b.id !== block.id));
  const duplicate = () => {
    const maxZ = blocks.reduce((m, b) => Math.max(m, b.z), 0);
    const dup: ManualBlock = {
      ...block,
      id: genBlockId(),
      x: Math.min(block.x + 5, Math.max(0, PAGE_WIDTH_MM - block.w)),
      y: Math.min(block.y + 5, Math.max(0, PAGE_HEIGHT_MM - block.h)),
      z: maxZ + 1,
    };
    onCommit([...blocks, dup]);
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sub-sm font-medium text-foreground">選択中のブロック</span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={duplicate} aria-label="複製" title="複製（Ctrl+D）">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={remove} aria-label="削除" title="削除（Delete）">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {block.free.type === "text" && (
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL}>
            大きさ(pt)
            <input
              type="number"
              min={6}
              max={96}
              value={Number(block.style["font-size"] ?? 12)}
              onChange={(e) => patchStyle({ "font-size": Number(e.target.value) || 12 })}
              className={FIELD_INPUT}
            />
          </label>
          <div className="flex items-center gap-1">
            {FONT_WEIGHTS.map((w) => (
              <Button
                key={w.value}
                type="button"
                variant={Number(block.style["font-weight"] ?? 400) === w.value ? "default" : "outline"}
                size="sm"
                onClick={() => patchStyle({ "font-weight": w.value })}
              >
                {w.label}
              </Button>
            ))}
          </div>
          <label className={FIELD_LABEL}>
            色
            <input
              type="color"
              value={String(block.style.color ?? "#0f172a")}
              onChange={(e) => patchStyle({ color: e.target.value })}
              className="h-8 w-14 rounded border border-input bg-background"
            />
          </label>
          <div className="flex items-center gap-1">
            <Button type="button" variant={(block.free.content.align ?? "left") === "left" ? "default" : "outline"} size="icon-sm" onClick={() => patchContent({ ...block.free.content, align: "left" })} aria-label="左そろえ">
              <AlignLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button type="button" variant={block.free.content.align === "center" ? "default" : "outline"} size="icon-sm" onClick={() => patchContent({ ...block.free.content, align: "center" })} aria-label="中央そろえ">
              <AlignCenter className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button type="button" variant={block.free.content.align === "right" ? "default" : "outline"} size="icon-sm" onClick={() => patchContent({ ...block.free.content, align: "right" })} aria-label="右そろえ">
              <AlignRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {block.free.type === "shape" && (
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL}>
            種類
            <select
              value={block.free.content.shape}
              onChange={(e) => patchContent({ shape: e.target.value as ManualShapeKind })}
              className={FIELD_INPUT}
            >
              {SHAPE_KEYS.map((k) => (
                <option key={k} value={k}>{SHAPE_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className={FIELD_LABEL}>
            線の色
            <input
              type="color"
              value={String(block.style["border-color"] ?? "#0f172a")}
              onChange={(e) => patchStyle({ "border-color": e.target.value })}
              className="h-8 w-14 rounded border border-input bg-background"
            />
          </label>
          <label className={FIELD_LABEL}>
            線の太さ(mm)
            <input
              type="number"
              min={0.2}
              max={5}
              step={0.2}
              value={Number(block.style["border-width"] ?? 1)}
              onChange={(e) => patchStyle({ "border-width": Number(e.target.value) || 1 })}
              className={FIELD_INPUT}
            />
          </label>
        </div>
      )}

      {block.free.type === "image" && <p className="text-sub-sm text-muted-foreground">差し替えは紙面上の画像ブロックから行えます。</p>}
      {block.free.type === "table" && <p className="text-sub-sm text-muted-foreground">セル・行列の編集は紙面上の表ブロックから行えます。</p>}
      {block.free.type === "qr" && <p className="text-sub-sm text-muted-foreground">宛先・ラベルの編集は紙面上のQRブロックから行えます。</p>}
    </div>
  );
}
