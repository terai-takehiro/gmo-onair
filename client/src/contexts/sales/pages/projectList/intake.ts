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

/**
 * リード経路の名前。**並びがそのままプルダウンの並び**になります
 * （`Object.entries` の順）。モックの並び（メール／電話／内覧会／紹介／Webフォーム）に
 * 寄せてあります。
 *
 * ── 「WEBフォーム」は `web` の名前を変えたもの ──────────────
 *
 * ご要望は「内覧会と WEBフォームの2つを足す」でしたが、**WEBフォームに当たる値は
 * すでにありました**（`web`・旧ラベル「Web」）。別の値として `webform` を足すと、
 * プルダウンに「Web」と「WEBフォーム」が並んで**誰も違いを説明できず**、
 * **同じ意味の引き合いが2つの値に分かれて集計できなくなります**。
 * → **名前だけ変えました。既存データは1行も書き換えていません**（migration 183 に理由）。
 *
 * `inview`（内覧会）は本当に別の入口です — 来場予約フォームから申し込みが入り、
 * そこで話した相手が後日そのまま案件になるので、`web` とも `meeting` とも別に数えます。
 */
export const INTAKE_CHANNEL_LABEL: Record<string, string> = {
  mail: 'メール',
  phone: '電話',
  inview: '内覧会',
  referral: '紹介',
  web: 'WEBフォーム',
  meeting: '打合せ',
  // **人が選ぶ値ではありません**（migration 182）。お客様が取引先マスターで
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
