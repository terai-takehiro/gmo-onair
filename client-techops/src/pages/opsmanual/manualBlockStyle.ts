// 運営マニュアル — `ManualBlock.style`（BlockInspector.tsx がケバブケースの CSS
// プロパティ名で書き込む `Record<string, string | number>`。types.ts のコメントどおり
// 「CSS に落ちる値だけを持つ（font-size・font-weight・color・…）」）を、
// React の `style` prop（キャメルケース）へ変換する。
//
// なぜ要るか（レビュー指摘・blocking）: `block.style` は `BlockInspector.tsx` の
// `patchStyle({ "font-size": … })` のように "font-size" / "font-weight" のような
// ケバブケースのキーで保存されている。React の `style` prop はキャメルケースの名前しか
// 認識せず、`--` で始まらないハイフン付きキーをそのまま渡しても
// `element.style["font-size"] = value` という単なる（CSS に効かない）プロパティ代入に
// なるだけで、実際の見た目には一切反映されない。この関数はここで認識するキーだけを
// キャメルケースへ変換して返す。
//
// ⚠️ `border-color` / `border-width` はここでは**変換しない**。この2つは
// `ShapeBlockContent.tsx` が `style` を生のまま別途受け取り、自分で
// `style["border-color"]`/`style["border-width"]` を読んで SVG の `stroke`/`stroke-width`
// に渡す専用の値（図形の枠線）——ブロックの外枠 div の CSS `border` として二重に
// 出してしまうと、図形ブロックで実際の輪郭（SVG）とは別にもう1本、見当違いの矩形の
// 枠線が出てしまう事故になる。図形以外のブロック種類はこの2キーを使わないため、
// ここで変換しなくても失うものは無い。
import type { CSSProperties } from "react";

export function manualBlockCssStyle(style: Record<string, string | number> | undefined): CSSProperties {
  if (!style) return {};
  const out: CSSProperties = {};

  if (style["font-size"] != null) {
    const n = Number(style["font-size"]);
    if (Number.isFinite(n)) out.fontSize = `${n}pt`; // BlockInspector の「大きさ(pt)」欄は単位無しの pt 数値
  }
  if (style["font-weight"] != null) {
    const n = Number(style["font-weight"]);
    if (Number.isFinite(n)) out.fontWeight = n;
  }
  if (typeof style.color === "string" && style.color.trim() !== "") {
    out.color = style.color;
  }
  if (typeof style["background-color"] === "string" && style["background-color"].trim() !== "") {
    out.backgroundColor = style["background-color"];
  }
  if (style.opacity != null) {
    const n = Number(style.opacity);
    if (Number.isFinite(n)) out.opacity = n;
  }

  return out;
}
