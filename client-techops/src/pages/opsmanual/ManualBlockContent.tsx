// `ManualCanvas` の `renderBlockContent` にそのまま渡す関数。ブロックの「中身」の
// 描画は type ごとに `blocks/*.tsx` の専用コンポーネントへ振り分けるだけで、
// 紙面の操作（つかむ・伸縮・回転・すいつき・undo/redo）は一切知らない（段Bのスコープ分担）。
import type { ReactNode } from "react";
import type { ManualBlock } from "@gmo-onair/shared/src/opsmanual/types";
import TextBlockContent from "./blocks/TextBlockContent";
import ShapeBlockContent from "./blocks/ShapeBlockContent";
import ImageBlockContent from "./blocks/ImageBlockContent";
import TableBlockContent from "./blocks/TableBlockContent";
import QrBlockContent from "./blocks/QrBlockContent";

interface RenderCtx {
  selected: boolean;
  onContentCommit: (content: ManualBlock["free"]["content"]) => void;
}

export default function renderManualBlockContent(block: ManualBlock, ctx: RenderCtx): ReactNode {
  const { selected, onContentCommit } = ctx;
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
