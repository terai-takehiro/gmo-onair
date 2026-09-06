/**
 * スライドの中の見た目（GMO流会議フォーマット Ver.2.5 の色と寸法）— **ここ1か所だけ**
 *
 * ── なぜ inline style で、なぜトークンではないのか ────────────────
 *
 * キャンバスは **PowerPoint の絵をそのまま写す**もので、画面の部品ではない。
 * 題の青（#0B62C8）・表の紺・帯の水色は資料の決まり（`shared/src/keepReport/templates.ts` の
 * `FORMAT_COLORS`。pptx 出力と同じ値）なので、画面のトークン（`--primary` など）に
 * 寄せると**画面で見た色と出力した資料の色が違う**ことになる。
 * 位置は 1280×720 の仮想キャンバスに対する % で、これも pptx と共通。
 *
 * 資料の色・書体・寸法を書くのはこのファイルと、ここから style を受け取る
 * `renderers/` だけにする。画面側（一覧・パネル・ボタン）はいつもどおりトークンで書く。
 */
import { FORMAT_COLORS, FORMAT_FONT } from '@gmo-onair/shared/src/keepReport/templates';
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
  negative: hex(FORMAT_COLORS.negative),
  marker: hex(FORMAT_COLORS.marker),
  kgi: hex(FORMAT_COLORS.kgi),
  kpi: hex(FORMAT_COLORS.kpi),
  talkBlue: hex(FORMAT_COLORS.talkBlue),
  talkGreen: hex(FORMAT_COLORS.talkGreen),
  text: hex(FORMAT_COLORS.text),
  muted: hex(FORMAT_COLORS.muted),
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

/** pt → px（PowerPoint の 13.333in × 7.5in を 1280×720 に置くと 1pt = 1.333px） */
export const pt = (v: number) => Math.round(v * 1.333);

export const frameStyle: CSSProperties = {
  width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden',
  background: C.paper, color: C.text, fontFamily: FONT_FAMILY, boxSizing: 'border-box',
  fontFeatureSettings: '"palt" 1',
};

export const titleStyle: CSSProperties = {
  position: 'absolute', left: 34, top: 18, right: 120, fontSize: pt(FORMAT_FONT.title) * 0.8,
  lineHeight: 1.2, fontWeight: 700, color: C.title, letterSpacing: '.01em', whiteSpace: 'nowrap', overflow: 'hidden',
};

export function bandStyle(tone: 'blue' | 'green', top: number): CSSProperties {
  return {
    position: 'absolute', left: 26, right: 26, top, height: 34, borderRadius: 17,
    background: tone === 'blue' ? C.talkBlue : C.talkGreen,
    display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', fontSize: 16, fontWeight: 700,
    boxSizing: 'border-box',
  };
}

export const footer = {
  logo: { position: 'absolute', left: 26, bottom: 12, fontSize: 19, fontWeight: 800, letterSpacing: '.02em', color: '#1a1d24' } as CSSProperties,
  tag: {
    position: 'absolute', left: 270, bottom: 14, height: 22, display: 'inline-flex', alignItems: 'center',
    padding: '0 9px', background: C.title, color: '#fff', fontSize: 12, whiteSpace: 'nowrap',
  } as CSSProperties,
  confidential: { position: 'absolute', right: 62, bottom: 14, fontSize: 14, color: C.negative, whiteSpace: 'nowrap' } as CSSProperties,
  pageNo: { position: 'absolute', right: 22, bottom: 6, fontSize: 26, color: '#8a8f98', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
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
