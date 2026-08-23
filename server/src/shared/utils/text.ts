/**
 * 全角/半角の表記ゆれの正規化。
 *
 * 半角カナ（例:「ｷﾞﾌﾞﾃｯﾄﾞ」「ｽﾀｼﾞｵ」）が案件名等にそのまま入って化けて見える不具合の対策。
 * 発生源は Box の OCR/`extracted_text`（PDF取込）や AI 起票の抽出結果など、外部由来の
 * テキストに半角カナが含まれるケース（`xpoint-parse.service.ts` 参照）。
 *
 * `excel.ts` の `normalizeHeader` と違い、**空白は詰めない**（案件名等の表示文字列は
 * 空白そのものが意味を持つことがあるため、NFKC 変換だけを行い前後の空白のみ落とす）。
 */
export const normalizeJaText = (v: unknown): string => String(v ?? '').normalize('NFKC').trim();
