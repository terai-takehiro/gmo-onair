import { ImageIcon } from "lucide-react";
import EntryImageButton from "./EntryImageButton";
import type { Block, CueRowData } from "./types";

// スライド (slide) 列の編集 UI。
//
// セルの形は `{ image?: string }` (トップレベル)。scenario / video・audio・telop の
// entries[0].image と違い、slide は「行 = エントリ」の入れ子を持たない
// (05-editor-impl.md §2-1・§5-1)。既存の読み手 PreviewModal.tsx:717 が
// `cell.image` をトップレベルで読むため、書き手もそれに合わせている。
//
// アップロードは既存の EntryImageButton (段5 PR3 で共有部品として抽出済み) を
// そのまま使う。新しい API は無い (`POST /qsheet/upload-image` を呼ぶだけ)。
// 削除は undefined を書く (ydocDiff.ts がそれをセル削除として扱うため。空文字にしない)。
//
// このマークアップは意味トークン (border-border / text-muted-foreground /
// text-destructive) を使う (CLAUDE.md の色トークン方針)。段5 PR7 で枠の
// プレースホルダ部分も生パレット (border-zinc-*) から border-border に揃えた。
interface SlideCellProps {
  blk: Block;
  cellKey?: string;
  row: CueRowData;
  updateCell: (blockId: string, newCell: any) => void;
}

export default function SlideCell({ blk, cellKey, row, updateCell }: SlideCellProps) {
  const cell = row.cells?.[blk.id] || {};
  const imageUrl: string | undefined = cell.image;

  const setImage = (url: string | null) => {
    updateCell(blk.id, { ...cell, image: url || undefined });
  };

  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-border-faint overflow-hidden align-top">
      {imageUrl ? (
        <div className="relative inline-block w-fit group/img">
          <img
            src={imageUrl}
            alt=""
            className="max-h-32 max-w-full rounded-control border border-border object-contain"
          />
          <button
            onClick={() => setImage(null)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive text-xs leading-none flex items-center justify-center shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity"
            title="画像を削除"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center h-16 border border-dashed border-border rounded-control text-muted-foreground text-xs">
          <ImageIcon size={14} className="mr-1" />
          スライド
        </div>
      )}
      <div className="mt-1 flex justify-center">
        <EntryImageButton imageUrl={imageUrl} onChange={setImage} hideThumbnail />
      </div>
    </td>
  );
}
