/**
 * スライドの中の見た目（GMO流会議フォーマット Ver.2.5 の色と寸法）— **ここ1か所だけ**
 *
 * ── なぜ inline style で、なぜトークンではないのか ────────────────
 *
 * キャンバスは **PowerPoint の絵をそのまま写す**もので、画面の部品ではない。
 * 題の青（#005BAC）・表の紺・帯の水色は資料の決まり（`shared/src/keepReport/templates.ts` の
 * `FORMAT_COLORS`。pptx 出力と同じ値）なので、画面のトークン（`--primary` など）に
 * 寄せると**画面で見た色と出力した資料の色が違う**ことになる。
 *
 * ── 寸法の出どころ ────────────────────────────────────────
 * ヘッダー・フッターの位置は**実物の pptx から読んだインチ**（`FORMAT_CHROME`）を `px()` で px にする
 * （13.333in × 7.5in を 1280×720 に置くと 1in = 96px・1pt = 1.333px）。pptx 出力（server の
 * `keep-pptx-chrome.service.ts`）は同じインチをそのまま使うので、画面と資料で枠の位置が一致する。
 * 部品の位置は 1280×720 の仮想キャンバスに対する % で、これも pptx と共通。
 *
 * 資料の色・書体・寸法を書くのはこのファイルと、ここから style を受け取る
 * `renderers/` だけにする。画面側（一覧・パネル・ボタン）はいつもどおりトークンで書く。
 */
import { FORMAT_CHROME, FORMAT_COLORS, FORMAT_FONT, SLIDE_IN, type InchBox } from '@gmo-onair/shared/src/keepReport/templates';
import type { CSSProperties } from 'react';

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

const hex = (v: string) => `#${v}`;

/** 資料の色（`FORMAT_COLORS` を CSS の形にしたもの） */
export const C = {
  title: hex(FORMAT_COLORS.title),
  tableHead: hex(FORMAT_COLORS.tableHead),
  band: hex(FORMAT_COLORS.band),
  positive: hex(FORMAT_COLORS.positive),
  /** 総括カードの地（2026-09 刷新の「総括＋成果」）。`FORMAT_COLORS.positiveLight` そのまま */
  positiveLight: hex(FORMAT_COLORS.positiveLight),
  negative: hex(FORMAT_COLORS.negative),
  confidential: hex(FORMAT_COLORS.confidential),
  marker: hex(FORMAT_COLORS.marker),
  kgi: hex(FORMAT_COLORS.kgi),
  kpi: hex(FORMAT_COLORS.kpi),
  talkBlue: hex(FORMAT_COLORS.talkBlue),
  talkGreen: hex(FORMAT_COLORS.talkGreen),
  text: hex(FORMAT_COLORS.text),
  muted: hex(FORMAT_COLORS.muted),
  pageNo: hex(FORMAT_COLORS.pageNo),
  line: hex(FORMAT_COLORS.line),
  /** 資料の中の淡い面（写真の枠・空の部品）。フォーマットに決まりは無い */
  paper: '#ffffff',
  soft: '#eef2f7',
  softLine: '#cfd8e3',
  /** 稼働カレンダーの予定の色（種類ごと。意味は資料側の慣習: 本番＝紺・リハ＝水色・仮＝灰・メンテ＝赤・内覧＝緑） */
  cal: {
    performance: '#1F4E9C',
    rehearsal: '#78B4DF',
    hold: '#9AA1AB',
    maintenance: '#D1202A',
    tour: '#2E9E5B',
    setup: '#A6CEEB',
    internal: '#6D28D9',
    consultation: '#E0A800',
    other: '#B8C2CC',
  } as Record<string, string>,
} as const;

export const FONT_FAMILY = `'${FORMAT_FONT.family}', 'BIZ UDPGothic', 'Meiryo', 'Hiragino Sans', sans-serif`;

/**
 * 文の見た目の種類（`binding.ts` が binding から決め、`TextRenderer` が描く）。
 * 表紙（会議名／部署名と日付／青い箱／注意書き）と Appendix は実物の書式そのまま
 */
export type TextTone = 'plain' | 'band' | 'confidence' | 'cover' | 'cover-sub' | 'cover-note' | 'cover-guide' | 'appendix' | 'heading';

/** pt → px（PowerPoint の 13.333in × 7.5in を 1280×720 に置くと 1pt = 1.333px） */
export const pt = (v: number) => Math.round(v * 1.333);
/** インチ → px（同じ置き方で 1in = 96px） */
export const px = (inch: number) => Math.round((inch / SLIDE_IN.w) * SLIDE_W);
/** px → インチ（部品の幅から文字の大きさを見積もるとき） */
export const toInch = (v: number) => (v / SLIDE_W) * SLIDE_IN.w;

/** インチの箱（`FORMAT_CHROME`）→ 絶対配置の px */
export function boxPx(b: InchBox): CSSProperties {
  return { position: 'absolute', left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h), boxSizing: 'border-box' };
}

/**
 * 文字数から「箱の幅に収まる大きさ」を px で決める。server の `fitPt`（keep-pptx.service.ts）と**同じ見積もり**
 * — 全角 1em・半角 0.65em・4% の余裕・左右の余白 0.2in。題（PowerPoint では normAutofit）と表紙の会議名に使う
 */
export function fitPx(text: string, maxPt: number, widthIn: number, minPt = 20): number {
  const longest = text.split(/\r?\n/).reduce((m, l) => Math.max(m, [...l].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : 0.65), 0)), 0);
  if (longest === 0) return pt(maxPt);
  return pt(Math.max(minPt, Math.min(maxPt, Math.floor(((widthIn - 0.2) * 72) / (longest * 1.04)))));
}

/** pptxgenjs の文字箱の既定の余白（margin 4pt ≒ 0.056in ≒ 5px） */
const INSET = 5;

export const frameStyle: CSSProperties = {
  width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden',
  background: C.paper, color: C.text, fontFamily: FONT_FAMILY, boxSizing: 'border-box',
  fontFeatureSettings: '"palt" 1',
};

/** 題（レイアウトの title placeholder・36pt・太字・青・上詰め）。長い題は `fitPx` で 1 行に収める */
export const titleStyle: CSSProperties = {
  ...boxPx(FORMAT_CHROME.title), padding: INSET, fontSize: pt(FORMAT_FONT.title), lineHeight: 1.2, fontWeight: 700,
  color: C.title, whiteSpace: 'nowrap', overflow: 'hidden',
};

/**
 * トークスクリプトの帯（角丸の長方形・18pt）。`index` は上から何本目か（実物は 0.86in と 1.422in）。
 * 文の前はアイコンの分を空ける — pptx は全角空白 3 つ（18pt × 3 ＝ 0.75in）＋箱の余白 0.1in
 */
export function bandStyle(tone: 'blue' | 'green', index: number): CSSProperties {
  const B = FORMAT_CHROME.band;
  const top = B.top[index] ?? B.top[0] + index * (B.top[1] - B.top[0]);
  return {
    position: 'absolute', left: px(B.x), top: px(top), width: px(B.w), height: px(B.h), borderRadius: px(B.radius),
    background: tone === 'blue' ? C.talkBlue : C.talkGreen, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', padding: `0 ${px(0.1)}px 0 ${px(0.85)}px`,
    fontSize: pt(FORMAT_FONT.band), lineHeight: 1.2, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden',
  };
}

/** 帯の左端のスピーカー（`formatAssets` の talkIcon・帯の中で縦中央） */
export function bandIconStyle(index: number): CSSProperties {
  const B = FORMAT_CHROME.band;
  const I = FORMAT_CHROME.bandIcon;
  const top = (B.top[index] ?? B.top[0]) + (B.h - I.size) / 2;
  return { position: 'absolute', left: px(I.x), top: px(top), width: px(I.size), height: px(I.size), display: 'block' };
}

/** 帯の注記（赤・右寄せ） */
export const bandNoteStyle: CSSProperties = { marginLeft: 'auto', color: C.negative, fontSize: pt(FORMAT_FONT.band) };

const F = FORMAT_CHROME.footer;
/**
 * フッター（実物のスライドマスターと同じ位置）: ワードマークは <img>（`formatAssets` の wordmark）／
 * タグは青地に白 10pt／Strictly confidential は赤 12pt 右寄せ／ページ番号は太字の灰 24pt。罫線は無い。表紙にも出る
 */
export const footer = {
  logo: { ...boxPx(F.logo), display: 'block' } as CSSProperties,
  tag: {
    ...boxPx(F.tag), display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: C.positive, color: '#fff', fontSize: pt(FORMAT_FONT.footerTag), lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden',
  } as CSSProperties,
  confidential: {
    ...boxPx(F.confidential), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: `0 ${INSET}px`,
    fontSize: pt(FORMAT_FONT.confidential), lineHeight: 1, color: C.confidential, whiteSpace: 'nowrap',
  } as CSSProperties,
  pageNo: {
    ...boxPx(F.pageNo), display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    fontSize: pt(FORMAT_FONT.pageNo), lineHeight: 1, fontWeight: 700, color: C.pageNo, fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
};

/** 数字は等幅で右にそろえる（千円の表・ヨミ表） */
export const num: CSSProperties = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' };

export const tableBase: CSSProperties = { borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' };
export const cellBase: CSSProperties = { border: `1px solid ${C.line}`, padding: '0.32em 0.6em', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
export const headCell: CSSProperties = { ...cellBase, background: C.tableHead, color: '#fff', textAlign: 'center' };

/** 帯（案件ページ・実施報告の「お客様／イベント名／日付」） */
export const bandTitle: CSSProperties = {
  width: '100%', height: '100%', background: C.band, color: '#fff', fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
  textOverflow: 'ellipsis', padding: '0 12px', boxSizing: 'border-box',
};

/** 人が上書きした文は赤（§6.3「変更点は赤字」） */
export const overrideColor = C.negative;

/** 中身が無い部品の枠（キャンバスだけに出す。出力には出ない） */
export const emptyBox: CSSProperties = {
  width: '100%', height: '100%', boxSizing: 'border-box', border: `2px dashed ${C.softLine}`, borderRadius: 6,
  color: C.muted, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  padding: 12, background: C.soft,
};
