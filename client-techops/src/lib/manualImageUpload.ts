// 運営マニュアルの各所（画像ブロック・体制図の顔写真）が使う画像アップロードの共通処理。
// `BlockToolbar.tsx`（画像ブロックの新規追加）・`ImageBlockContent.tsx`（差し替え）・
// 体制図の人の顔写真アップロードが同じ検査・同じ API 呼び出しを3か所に複製していたのをまとめた。
import api from "@/lib/api";

export const MAX_MANUAL_IMAGE_BYTES = 5 * 1024 * 1024;

/** ファイルの種類・大きさが取り込める形か。だめなときは理由の文字列を返す（OKなら null） */
export function manualImageUploadError(file: File): string | null {
  if (!file.type.startsWith("image/")) return "画像ファイルを選んでください。";
  if (file.size > MAX_MANUAL_IMAGE_BYTES) return "画像が大きすぎます。5MB までの画像を選び直してください。";
  return null;
}

/** ファイルを `/techops/upload-image` へ送り、保存された URL を返す */
export async function uploadManualImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const res = await api.post("/techops/upload-image", { data: dataUrl, filename: file.name, mimeType: file.type });
  const url = res.data?.data?.url as string | undefined;
  if (!url) throw new Error("upload-image: url が返りませんでした");
  return url;
}
