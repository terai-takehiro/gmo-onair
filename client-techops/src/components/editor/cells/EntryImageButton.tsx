import { useState, useRef } from "react";
import { ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import api from "@/lib/api";

// ─── EntryImageButton ───────────────────────────────────
// エントリごとの画像添付ボタン。
// hideThumbnail=true のときは画像が設定されていてもサムネを出さず、
// 「変更」ボタンとして機能する（実プレビューは親側で大きく表示する）。
//
// 段5 PR3 で CueRow.tsx から切り出した共有部品 (挙動は変えていない)。
// scenario / video / audio / telop / slide の各セルから使う。
// `ImageDropZone.tsx` はどこからも import されていない死蔵ファイルなので、
// こちらを正の画像アップロード経路として使うこと (05-editor-impl.md §10-A)。
export default function EntryImageButton({
  imageUrl,
  onChange,
  hideThumbnail = false,
}: {
  imageUrl?: string;
  onChange: (url: string | null) => void;
  hideThumbnail?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("ファイルサイズが5MBを超えています");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await api.post("/techops/upload-image", {
        data: dataUrl,
        filename: file.name,
        mimeType: file.type,
      });
      onChange(res.data.data.url);
    } catch {
      alert("画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  if (imageUrl && !hideThumbnail) {
    return (
      <div className="relative flex-shrink-0 group/img" title="画像">
        <img
          src={imageUrl}
          alt=""
          className="h-6 w-6 rounded-control object-cover border border-border"
        />
        <button
          onClick={() => onChange(null)}
          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
          title="画像を削除"
        >
          ×
        </button>
      </div>
    );
  }

  const hasImage = !!imageUrl;
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className={`flex-shrink-0 w-5 h-5 rounded-control transition-colors mt-[1px] flex items-center justify-center ${
          hasImage
            ? "text-primary hover:bg-primary-surface"
            : "text-muted-foreground hover:text-primary hover:bg-primary-surface opacity-0 group-hover:opacity-100"
        }`}
        title={hasImage ? "画像を変更" : "画像を添付"}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : hasImage ? (
          <ImageIcon size={12} />
        ) : (
          <ImagePlus size={12} />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = ""; // 同ファイルの再選択を許可
        }}
      />
    </>
  );
}
