/**
 * 送る前に画像を縮める（AI の費用を下げる）
 *
 * ── なぜ効くか ──────────────────────────────────────────────
 *
 * 画像を読ませる費用は**画素数で決まります**（枚数ではありません）。
 * スマホの写真はいまどき 4000×3000 = 1,200 万画素あり、そのまま送ると
 * **1 枚で長い文章より高くつきます**。名刺やホワイトボードを読むだけなら
 * **長辺 1600px もあれば足ります**（文字は十分に読めます）。
 *
 * 実測の目安: 4032×3024 の JPEG（3.5MB）→ 1600×1200（約 250KB）。
 *
 * ── 読めなくしない ──────────────────────────────────────────
 *
 * **拡大はしません**（小さい画像はそのまま）。**元より重くなったら元を使います**
 * （PNG のスクリーンショットなどで起こりうる）。**縮められなかったら元を送ります** —
 * ここで失敗して添付が消えるほうが、費用より高くつきます。
 *
 * ── 置き場所 ────────────────────────────────────────────────
 *
 * `client-v4/` に置いています（`shared/src/client/` に置くと
 * 凍結4アプリの CSS が増えるため。ここは計算だけですが、置き場所の決めごとに合わせます）。
 */

/** 長辺の上限。名刺・ホワイトボード・見積の紙が読める大きさ */
export const MAX_EDGE = 1600;
/** JPEG の品質。0.8 は文字が潰れない範囲でよく縮む */
const QUALITY = 0.8;

/** 縮める価値があるか（画像で、かつ小さすぎないもの） */
export function shouldDownscale(file: File): boolean {
  if (!file.type.startsWith('image/')) return false;
  // GIF は動くことがある。1 コマにすると別物になるので触らない
  if (file.type === 'image/gif') return false;
  // もともと小さいものは触らない（再エンコードで汚すだけ）
  return file.size > 300 * 1024;
}

/**
 * 画像を長辺 {@link MAX_EDGE} まで縮めて JPEG にする。
 * **失敗したら元のファイルをそのまま返します**（添付を落とさない）。
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!shouldDownscale(file)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // 読めない形式。**元を送る**
  }
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    // **拡大しない。** 小さい画像を引き伸ばしても情報は増えず、費用だけ増える
    if (scale >= 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY);
    });
    if (!blob) return file;
    // **元より重くなったら元を使う**（PNG のスクリーンショットで起こりうる）
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
