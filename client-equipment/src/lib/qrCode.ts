/**
 * QR / 手打ちの文字列から機材を割り出す
 *
 * `ScanPage`（⑥）の中に private で書いてあったものを出しました。
 * ⑨ 現場のスキャンでも**同じ読み方**をする必要があるためです
 * （写すと、片方だけシールの形を足したときに読めない端末ができます）。
 *
 * 読める形:
 *   URL `…/equipment/items/<uuid>`  → id
 *   URL `?eq=Y-C-00001`             → 機材ID
 *   `Y-C-00001` 直接 ／ UUID 直接
 */
export interface ScannedCode {
  type: 'id' | 'eq_code';
  value: string;
}

export function extractCode(raw: string): ScannedCode | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const u = new URL(text);
    const m = u.pathname.match(/\/equipment\/items\/([^/?#]+)/);
    if (m) return { type: 'id', value: m[1] };
    const eq = u.searchParams.get('eq');
    if (eq) return { type: 'eq_code', value: eq };
  } catch { /* URL ではない */ }
  if (/^[A-Z]+-[A-Z0-9]+-[0-9]{5}$/i.test(text)) return { type: 'eq_code', value: text.toUpperCase() };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return { type: 'id', value: text };
  return null;
}
