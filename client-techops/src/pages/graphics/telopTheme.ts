// テロップCG — テーマ（配色・書体・造形の束）の共通定義。
//
// 放送に出る絵の共通語彙（docs/design/v4/graphics-design-specs.md §9.5）:
//   ・語彙は「面・エッジ（袋文字）・罫」の3つだけ。全周枠線のカード化はしない
//   ・**罫は1要素1本まで**。第2の分離は明度差で行う（細罫の多用は AI 臭の筆頭）
//   ・金はベタ塗りしない（文字グラデ・1〜2px罫のみ）。白は #F5F5F5・疑似ボールド禁止
import type { CSSProperties } from 'react';

/** テーマの鍵。graphics_projects.theme に保存される値と一致させる */
export type TelopThemeKey = 'ceremony-gold' | 'news-navy' | 'corporate-light' | 'variety-pop';

export function resolveTelopTheme(v: unknown): TelopThemeKey {
  return v === 'news-navy' || v === 'corporate-light' || v === 'variety-pop' ? v : 'ceremony-gold';
}

export const SAFE_X = 96;
export const SAFE_Y = 54;
export const WHITE = '#f5f5f5';
export const GOLD = '#d4af37';

export const SERIF = "'Noto Serif JP', 'Noto Sans JP', serif";
export const GOTHIC = "'Noto Sans JP', sans-serif";

/** 式典の暗紺面（真っ黒ベタにしない・紺寄りの縦グラデ） */
export const NAVY_PLATE =
  'linear-gradient(180deg, rgba(20, 28, 46, 0.94) 0%, rgba(10, 15, 28, 0.92) 55%, rgba(7, 10, 18, 0.94) 100%)';

/** 報道の肩書タブ・帯の紺。実物の報道面は**ベタ・不透明**（実測 §9.7 — グラデも透過も無い） */
export const NEWS_NAVY = '#102c54';

/** コーポレートのアクセント（下罫1本型の罫色） */
export const CORPORATE_ACCENT = '#2f6fed';

/** 袋文字（座布団を敷かない要素の可読性はエッジで取る。ぼかさない） */
export const EDGE_DARK: CSSProperties = {
  WebkitTextStroke: '6px rgba(6, 9, 15, 0.92)',
  paintOrder: 'stroke fill',
  textShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
};

/** 式典系の短距離ソフト影（面に載る文字用） */
export const SOFT_SHADOW = '0 3px 8px rgba(0, 0, 0, 0.45)';
