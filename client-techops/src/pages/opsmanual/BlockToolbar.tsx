// キャンバスに自由ブロックを置く「＋」ツールバー（段B・production-manual.md §4-3）。
// 文字・図形・画像・表・QR・体制図 の6つを押すと、キャンバスの中央付近に既定サイズ・既定中身の
// ブロックを1つ追加する（id・z の決定はここで行う。並べ方・伸縮・回転は
// ManualCanvas 側の仕事）。
import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Network, QrCode, Square, Table as TableIcon, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { notifyError } from "@/lib/notify";
import {
  PAGE_WIDTH_MM,
  PAGE_HEIGHT_MM,
  type ManualBlock,
  type ManualFreeBlockType,
} from "@gmo-onair/shared/src/opsmanual/types";
// id の発番はキャンバスの複製（Ctrl+D）と同じ関数を使う（`manualCanvasGeometry.ts` が唯一の正）。
import { genBlockId } from "./manualCanvasGeometry";
// 階層・チーム・人の id はブロックの id とは別物（`genBlockId` と混ぜない）
import { genId } from "@/lib/stableIds";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function nextZ(blocks: ManualBlock[]): number {
  return blocks.reduce((max, b) => Math.max(max, b.z), 0) + 1;
}

/** キャンバスの中央に置いたときの x/y（mm・左上原点） */
function centered(w: number, h: number): { x: number; y: number } {
  return { x: Math.max(0, (PAGE_WIDTH_MM - w) / 2), y: Math.max(0, (PAGE_HEIGHT_MM - h) / 2) };
}

interface DefaultSize { w: number; h: number }
const DEFAULT_SIZE: Record<ManualFreeBlockType, DefaultSize> = {
  text: { w: 60, h: 15 },
  shape: { w: 40, h: 40 },
  image: { w: 60, h: 40 },
  table: { w: 80, h: 30 },
  qr: { w: 30, h: 30 },
  // A4横の左2/3ほど（production-manual-orgchart.md §4）
  orgchart: { w: 180, h: 90 },
};

function buildBlock(type: Exclude<ManualFreeBlockType, "image">, z: number): ManualBlock {
  const { w, h } = DEFAULT_SIZE[type];
  const base = { id: genBlockId(), kind: "free" as const, ...centered(w, h), w, h, z, style: {} };
  switch (type) {
    case "text":
      return { ...base, style: { "font-size": 12, "font-weight": 400, color: "#0f172a" }, free: { type: "text", content: { text: "", align: "left" } } };
    case "shape":
      return { ...base, style: { "border-color": "#0f172a", "border-width": 1 }, free: { type: "shape", content: { shape: "rect" } } };
    case "table":
      return { ...base, free: { type: "table", content: { rows: [["", ""], ["", ""]] } } };
    case "qr":
      return { ...base, free: { type: "qr", content: { value: "", label: "" } } };
    // 置いた直後は**空**（名前の無い階層が1つだけ）。既定の階層名のテンプレートは持たない
    // （production-manual-orgchart.md §10-1・2026-09-13 の利用者の判断）
    case "orgchart":
      return { ...base, free: { type: "orgchart", content: { tiers: [{ id: genId("tier"), label: "", boxes: [] }] } } };
  }
}

function buildImageBlock(z: number, url: string): ManualBlock {
  const { w, h } = DEFAULT_SIZE.image;
  return { id: genBlockId(), kind: "free", ...centered(w, h), w, h, z, style: {}, free: { type: "image", content: { url, fit: "contain" } } };
}

interface Props {
  blocks: ManualBlock[];
  onAdd: (block: ManualBlock) => void;
}

export default function BlockToolbar({ blocks, onAdd }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addSimple = (type: Exclude<ManualFreeBlockType, "image">) => {
    onAdd(buildBlock(type, nextZ(blocks)));
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      notifyError("画像ファイルを選んでください。");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      notifyError("画像が大きすぎます。", { description: "5MB までの画像を選び直してください。" });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await api.post("/techops/upload-image", { data: dataUrl, filename: file.name, mimeType: file.type });
      const url = res.data?.data?.url as string | undefined;
      if (!url) throw new Error("upload-image: url が返りませんでした");
      onAdd(buildImageBlock(nextZ(blocks), url));
    } catch {
      notifyError("画像を取り込めませんでした。", { description: "少し待ってから、もう一度選び直してください。" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-card p-2">
      <span className="px-1 text-sub-sm text-muted-foreground">追加:</span>
      <Button type="button" variant="outline" size="sm" onClick={() => addSimple("text")}>
        <Type className="mr-1 h-3.5 w-3.5" aria-hidden="true" />文字
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => addSimple("shape")}>
        <Square className="mr-1 h-3.5 w-3.5" aria-hidden="true" />図形
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImageIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
        画像
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => addSimple("table")}>
        <TableIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />表
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => addSimple("qr")}>
        <QrCode className="mr-1 h-3.5 w-3.5" aria-hidden="true" />QR
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => addSimple("orgchart")}>
        <Network className="mr-1 h-3.5 w-3.5" aria-hidden="true" />体制図
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file);
          e.target.value = ""; // 同じファイルの再選択を許可
        }}
      />
    </div>
  );
}
