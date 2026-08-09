/**
 * 引き合いの「入口」と「確信」の見せ方 (v4 ③ ネタの見え方・migration 165)
 *
 * ── 値は DB の CHECK と同じ集合 ─────────────────────────────
 *
 * `projects.intake_channel` / `intake_confidence` は DB 側で値を縛ってあります。
 * ここに無い値が来ることは無いはずですが、来ても落とさず「—」で出します
 * （画面が落ちるより、分からないと書くほうがよい）。
 *
 * ── 確信の色 ────────────────────────────────────────────────
 *
 * モックの実測値（`onair-data.js` の `inMailQueue`）:
 *   高 = 緑 `#197a4b` / 地 `#e7f6ee`
 *   中 = 琥珀 `#92400e` / 地 `#fffbeb`
 *   低 = 赤 `#b91c1c` / 地 `#fef6f7`
 *
 * ここでの赤は「危ない」ではなく**「まだ何も分かっていない」**の意味です。
 * 受付はこの色で読む順を決めるので、状態の色を当てて差し支えありません。
 *
 * ── 「未記入」を色で目立たせない ────────────────────────────
 *
 * AI が根拠なく埋めないことにしている（`create_project` の説明）ので、
 * **空は普通にあります**。空を赤くすると「低い確信」と見分けが付きません。
 */

export const INTAKE_CHANNEL_LABEL: Record<string, string> = {
  mail: 'メール',
  phone: '電話',
  meeting: '打合せ',
  web: 'Web',
  referral: '紹介',
  // **人が選ぶ値ではありません**（migration 181）。お客様が取引先マスターで
  // グループ会社になっているとき、案件作成が固定でこの値を入れます
  group: 'グループ案件',
  other: 'その他',
};

export const INTAKE_CONFIDENCE_LABEL: Record<string, string> = {
  high: '高',
  mid: '中',
  low: '低',
};

export const INTAKE_CONFIDENCE_TONE: Record<string, string> = {
  high: 'border-transparent bg-success-surface text-success',
  mid: 'border-transparent bg-warning-surface text-warning',
  low: 'border-transparent bg-destructive-surface text-destructive',
};

export function channelLabel(v: string | null | undefined): string {
  return v ? (INTAKE_CHANNEL_LABEL[v] ?? v) : '—';
}

export function confidenceLabel(v: string | null | undefined): string {
  return v ? (INTAKE_CONFIDENCE_LABEL[v] ?? v) : '—';
}

export function confidenceTone(v: string | null | undefined): string {
  return (v && INTAKE_CONFIDENCE_TONE[v]) || 'border-transparent bg-muted text-fg-disabled';
}
