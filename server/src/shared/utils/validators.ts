/**
 * 共通入力バリデーションユーティリティ
 * 全ルートハンドラーで使用する入力サニタイズ・検証関数
 */

const DEFAULT_MAX_SEARCH = 100;
const DEFAULT_MAX_TITLE = 500;
const DEFAULT_MAX_TEXT = 10000;

/**
 * 検索入力をサニタイズ（長さ制限 + SQLワイルドカードエスケープ）
 * ILIKE検索時は `ESCAPE '\\'` を忘れずに付与すること
 */
export function sanitizeSearch(input: unknown, maxLength = DEFAULT_MAX_SEARCH): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength).replace(/[%_\\]/g, '\\$&');
}

/**
 * 文字列を指定長に切り詰め
 */
export function truncateString(input: unknown, maxLength = DEFAULT_MAX_TITLE, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  return input.slice(0, maxLength);
}

/**
 * テキスト入力のサニタイズ（長さ制限のみ）
 */
export function sanitizeText(input: unknown, maxLength = DEFAULT_MAX_TEXT): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, maxLength);
}

/**
 * ステータスバリデーション
 */
export function validateStatus(status: unknown, validStatuses: readonly string[]): string | null {
  if (typeof status !== 'string') return null;
  return validStatuses.includes(status) ? status : null;
}

/**
 * 正の整数バリデーション（上限付き）
 */
export function validatePositiveInt(value: unknown, max = 10000): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

/**
 * UUID形式の簡易チェック
 */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 36;
}
