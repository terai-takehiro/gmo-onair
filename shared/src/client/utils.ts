// shared/src/client/utils.ts — Common utility shared across all client apps
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * v4 で足した独自の段。**tailwind-merge に教えておかないと上書きが効かない。**
 *
 * `tailwind-merge` は「後から渡したクラスが前のクラスを打ち消す」ための道具だが、
 * **判断は既定の Tailwind のクラス名一覧に基づく**。`text-badge` のような
 * 独自の名前は一覧に無いので、`text-...` を**色の指定**だと解釈してしまい、
 * `text-xs`（サイズ）と衝突しないと判断する。結果**両方が残り、CSS の順番で
 * 組み込みの `text-xs` が勝つ**。
 *
 * 実際に踏んだ: `<Badge>` の既定 `text-xs`(12px) に `text-badge`(11px) を重ねたのに
 * **12px のまま描かれ**、和文4字のバッジが幅 62px の枠に収まらず2行になった
 * （実ブラウザで font-size を測って気づいた。型でも lint でも出ない）。
 *
 * **段を足したらここにも足すこと。** `npm run lint` の `check-tokens.mjs` が
 * `tailwind.preset.ts` との食い違いを検査して止める。
 */
const V4_FONT_SIZES = ['h1', 'h2', 'cardtitle', 'list', 'sub', 'sub-sm', 'th', 'badge', 'note'];
const V4_RADII = ['badge-xs', 'badge', 'control', 'control-md', 'control-lg', 'note', 'card', 'app', 'chip'];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: V4_FONT_SIZES }],
      rounded: [{ rounded: V4_RADII }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
