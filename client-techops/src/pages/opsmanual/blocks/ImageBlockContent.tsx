// 自由ブロック「画像」の中身（段B）。選択中は右下に「差し替え」ボタンを出し、
// 押すとファイル選択→アップロード→`content.url` の差し替えまでを行う
// （`EntryImageButton.tsx` のアップロード処理をこの用途向けに書き直したもの）。
import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { notifyError } from "@/lib/notify";
import type { ManualImageContent } from "@gmo-onair/shared/src/opsmanual/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface Props {
  content: ManualImageContent;
  selected: boolean;
  onCommit: (content: ManualImageContent) => void;
}

export default function ImageBlockContent({ content, selected, onCommit }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const replace = async (file: File) => {
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
      onCommit({ ...content, url });
    } catch {
      notifyError("画像を取り込めませんでした。", { description: "少し待ってから、もう一度選び直してください。" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {content.url ? (
        <img src={content.url} alt={content.alt ?? ""} className="h-full w-full" style={{ objectFit: content.fit ?? "contain" }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted text-sub-sm text-muted-foreground">画像未設定</div>
      )}
      {selected && (
        <button
          type="button"
          // ManualBlockView の「つかんで動かす」は pointerdown 起点なので、ここで止める
          // （mousedown より前に発火するため mousedown で止めても手遅れ）。
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          disabled={uploading}
          className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-control border border-border bg-card/90 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-accent"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
          差し替え
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) replace(file);
          e.target.value = ""; // 同じファイルの再選択を許可
        }}
      />
    </div>
  );
}
