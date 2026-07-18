import path from 'path';
import fs from 'fs';

// server/fonts をこのファイル位置から一意に解決する (呼び出し側のディレクトリ階層に依存しない)。
// 従来は各 PDF 生成コードが個別に相対パス (../../../fonts / ../../../../fonts) を組み立てていた。
// dist でも server/dist/shared/utils → ../../../fonts = server/fonts で一致する。
const FONTS_DIR = path.resolve(__dirname, '../../../fonts');
export const NOTO_REGULAR = path.join(FONTS_DIR, 'NotoSansJP-Regular.ttf');
export const NOTO_BOLD = path.join(FONTS_DIR, 'NotoSansJP-Bold.ttf');

/**
 * PDFDocument に NotoSansJP (Regular / Bold) を登録する。
 * フォントファイルが無い環境では標準の Helvetica にフォールバックする。
 * @param aliases 登録するフォント名 (呼び出し側で doc.font() に渡す別名)
 * @returns 実際に使えるフォント名 { regular, bold }
 */
export function registerNotoFonts(
  doc: PDFKit.PDFDocument,
  aliases: { regular: string; bold: string },
): { regular: string; bold: string } {
  if (fs.existsSync(NOTO_REGULAR)) {
    doc.registerFont(aliases.regular, NOTO_REGULAR);
    doc.registerFont(aliases.bold, fs.existsSync(NOTO_BOLD) ? NOTO_BOLD : NOTO_REGULAR);
    return aliases;
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}
