import { useState, useRef, useCallback } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { notifyError } from '@/lib/notify';

interface Props {
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
}

export default function ImageDropZone({ imageUrl, onImageChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      notifyError("ファイルサイズが5MBを超えています");
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const res = await api.post("/qsheet/upload-image", {
        data: dataUrl,
        filename: file.name,
        mimeType: file.type,
      });
      onImageChange(res.data.data.url);
    } catch {
      notifyError("画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }, [onImageChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  if (imageUrl) {
    return (
      <div className="relative group">
        <img
          src={imageUrl}
          alt=""
          className="w-full h-20 object-contain rounded border bg-muted"
        />
        <button
          className="absolute top-1 right-1 p-0.5 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onImageChange(null)}
        >
          <X className="h-3 w-3 text-destructive" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center w-full h-16 rounded border-2 border-dashed cursor-pointer transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border hover:border-border"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <ImagePlus className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mt-0.5">画像</span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
