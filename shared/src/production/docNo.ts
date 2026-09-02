/**
 * 資料番号（`doc_no`）の書式・表示整形。
 *
 * 実際の採番はサーバー（`docNo.service.ts` → `generateSequenceNumber()`）が行う。
 * ここは**画面が表示のために触ってよい純関数だけ**を置く場所で、採番ロジックは持たない。
 * 書式は `SB-202608-0001`（接頭辞 - 年月6桁 - 連番4桁）。
 */
const DOC_NO_RE = /^[A-Z]{2,4}-\d{6}-\d{4}$/;

/** `doc_no` の書式に合っているか（表示前のガード。壊れた値をそのまま出さない） */
function isDocNo(value: unknown): value is string {
  return typeof value === 'string' && DOC_NO_RE.test(value);
}

/** 表示用に整える。書式に合わない値・未採番（null）は空文字にする（「番号なし」を無理に埋めない） */
export function formatDocNo(value: string | null | undefined): string {
  return isDocNo(value) ? value : '';
}
