// テロップCG — 差し込みフィールドの日英切替（`${field}En` 規約）共通ヘルパー。
//
// docs/design/v4/graphics.md §6「差し込みソース」の取り決めどおり、英語版は対応する
// 日本語キーに `En` を足したキー（例: `mainText` → `mainTextEn`）に持たせる。出力URLの
// `?lang=en`（graphics.md §7・旧 client-awards から継承した契約）で切り替える。
//
// 各部品レンダラー（nameParts/outputParts/outputPartsExtra/scoreParts/voteParts）は
// 読み方をバラバラにせず、必ずこの1本のヘルパーを通す（部品ごとに読み方が割れると、
// 「この部品だけ英語が出ない」という気づきにくい不整合を生む）。
//
// **欠落を機械的に隠さない**: 英語版が空なら日本語版へフォールバックする
// （「英語ページのはずなのに空欄」より、日本語のまま出る方が安全側）。
export type GraphicsLang = 'ja' | 'en';

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/**
 * `fields[key]` を読む。`lang==='en'` かつ `fields[\`${key}En\`]` に値があればそちらを優先する。
 * `page.fields`（`Record<string, unknown>`）を直接読む部品レンダラーから使う。
 */
export function pickLang(fields: Record<string, unknown>, key: string, lang: GraphicsLang | undefined): string {
  return pickLangValue(str(fields[key]), str(fields[`${key}En`]), lang);
}

/**
 * `ja`/`en` 2値のどちらを出すか決める素の版。スコアのエントリー名・投票の選択肢ラベルなど、
 * `fields` を経由しない可変長配列の要素（`ScoreEntry.nameEn`/`VoteChoice.labelEn`）向けに分離してある。
 */
export function pickLangValue(ja: string, en: string, lang: GraphicsLang | undefined): string {
  return lang === 'en' && en !== '' ? en : ja;
}
