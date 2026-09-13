// `ManualCanvas` の `renderBlockContent` にそのまま渡す関数。ブロックの「中身」の
// 描画は kind:'free' なら type ごとに `blocks/*.tsx` の専用コンポーネントへ、
// kind:'linked'（段C・差し込みブロック）なら `LinkedBlockContent.tsx` へ振り分けるだけで、
// キャンバスの操作（つかむ・伸縮・回転・スナップ・undo/redo）は一切知らない（段Bのスコープ分担）。
import type { ReactNode } from "react";
import type { ManualBlock, ManualFreeBlockContent } from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualResolveEntry } from "@/lib/manualResolveApi";
import TextBlockContent from "./blocks/TextBlockContent";
import ShapeBlockContent from "./blocks/ShapeBlockContent";
import ImageBlockContent from "./blocks/ImageBlockContent";
import TableBlockContent from "./blocks/TableBlockContent";
import QrBlockContent from "./blocks/QrBlockContent";
import LinkedBlockContent from "./LinkedBlockContent";

interface RenderCtx {
  selected: boolean;
  onContentCommit: (content: ManualFreeBlockContent) => void;
}

/**
 * `resolved`（段C）は `kind:'linked'` のときだけ使う（`GET .../resolve` の1ブロックぶんの結果）。
 * `kind:'free'` のブロックは今までどおり `onContentCommit` で中身を編集する。
 */
export default function renderManualBlockContent(block: ManualBlock, ctx: RenderCtx, resolved?: ManualResolveEntry): ReactNode {
  const { selected, onContentCommit } = ctx;

  if (block.kind === "linked") {
    return <LinkedBlockContent block={block} resolved={resolved} />;
  }

  switch (block.free.type) {
    case "text":
      return <TextBlockContent content={block.free.content} style={block.style} selected={selected} onCommit={onContentCommit} />;
    case "shape":
      return <ShapeBlockContent content={block.free.content} style={block.style} />;
    case "image":
      return <ImageBlockContent content={block.free.content} selected={selected} onCommit={onContentCommit} />;
    case "table":
      return <TableBlockContent content={block.free.content} selected={selected} onCommit={onContentCommit} />;
    case "qr":
      return <QrBlockContent content={block.free.content} selected={selected} onCommit={onContentCommit} />;
    default:
      return null;
  }
}
