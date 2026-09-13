// 運営マニュアル — キャンバスの「インクの目安」（段D・production-manual.md §6-6・§8-3）。
//
// 「描いた絵を測るのではなく、ブロックの値から計算する」（§6-5-1と同じ理由 ——
// 測って書き戻す処理を入れない）。DOM を一切測定しない純粋関数。
//
// ページ1枚ぶんの塗り面積を、ブロックの `w × h × 塗り係数` の合計 ÷ キャンバスの面積
// （PAGE_WIDTH_MM × PAGE_HEIGHT_MM）で見積もる。書き出し画面（⑤）はこれが 40% を
// 超えたら知らせるが、**止めない**（「このまま書き出す」を必ず押せる）。
//
// ⚠️ サーバーは複製しない。`shared/src/opsmanual/types.ts` と同じ理由
// （サーバーは表示用の計算をこのまま使わないため）。
import type { ManualBlock, ManualShapeKind } from "./types";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./types";

/** 塗りつぶし系の図形（§6-6「6. インクの目安」）。line/arrow は常に0（線は面積として無視できる） */
const FILLABLE_SHAPES: ReadonlySet<ManualShapeKind> = new Set(["rect", "rounded-rect", "ellipse", "callout"]);

/**
 * `style` から色を読むときに見るキー。このアプリの実際の書き方は
 * `background-color`（`ShapeBlockContent.tsx` 参照・ケバブケースの CSS プロパティ名）。
 * `background`/`backgroundColor` は将来の書き方や外部データ向けの保険で、
 * どれか最初に見つかった非空文字列を採用する。
 */
const BACKGROUND_KEYS = ["background-color", "background", "backgroundColor"];

/** 透明・白とみなす値（小文字・前後空白を除いた形で比較） */
const TRANSPARENT_OR_WHITE = new Set(["transparent", "none", "white", "#fff", "#ffffff", "rgb(255,255,255)", "rgba(255,255,255,1)"]);

function readStyleString(style: Record<string, string | number> | undefined, keys: string[]): string | undefined {
  if (!style) return undefined;
  for (const key of keys) {
    const v = style[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

/** 背景色が「塗り面」として数えるべき色かどうか（透明・白・alpha=0 は数えない） */
function isFilledColor(color: string | undefined): boolean {
  if (!color) return false;
  const normalized = color.toLowerCase();
  if (TRANSPARENT_OR_WHITE.has(normalized)) return false;
  const rgba = normalized.match(/^rgba\(([^)]+)\)$/);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => p.trim());
    if (parts.length === 4 && Number(parts[3]) === 0) return false;
  }
  return true;
}

/** `style.opacity`（0〜1）。無ければ 1 として扱う */
function readOpacity(style: Record<string, string | number> | undefined): number {
  const raw = style?.opacity;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/** 1ブロックの塗り係数（0〜1）。§6-6「6. インクの目安」の目安どおり */
function inkCoefficient(block: ManualBlock): number {
  if (block.kind === "linked") {
    // 差し込みは既定で罫ベース（§6-6の既定＝罫と文字だけの組み方ならほぼ0という前提と一致する）
    return isFilledColor(readStyleString(block.style, BACKGROUND_KEYS)) ? 1 : 0;
  }

  switch (block.free.type) {
    case "text": {
      // 文字の色そのものは面積扱いしない（§6-6「文字の色に使うのは可」）。
      // 背景が透明・白以外に設定されていれば、その部分だけ塗り面として数える
      const bg = readStyleString(block.style, BACKGROUND_KEYS);
      return isFilledColor(bg) ? readOpacity(block.style) : 0;
    }
    case "shape": {
      if (!FILLABLE_SHAPES.has(block.free.content.shape)) return 0; // line/arrow
      const bg = readStyleString(block.style, BACKGROUND_KEYS);
      return isFilledColor(bg) ? 1 : 0;
    }
    case "image":
      // 写真は塗り面と同程度にインクを食う、という目安（厳密な画像解析はしない）
      return 0.5;
    case "table": {
      const bg = readStyleString(block.style, BACKGROUND_KEYS);
      return isFilledColor(bg) ? 1 : 0;
    }
    case "qr":
      // QRは黒が多いが小さく置かれることが多い、という目安
      return 0.3;
    case "orgchart": {
      // 体制図は枠線と文字だけ ＝ ほぼ0（production-manual-orgchart.md §4「チームは枠線だけ。
      // 塗らない」・§7）。表・差し込みと同じ罫ベースの扱いにし、背景を敷いたときだけ
      // 塗り面として数える。
      // ⚠️ `default: return 0` に任せず明示の case を置く ——
      // 「意図して0」と「書き忘れて0」がコード上で区別できなくなるため。
      const bg = readStyleString(block.style, BACKGROUND_KEYS);
      return isFilledColor(bg) ? 1 : 0;
    }
    default:
      return 0;
  }
}

/**
 * 1ページぶんの塗り面積の見当（0〜1）。ブロックの `w × h × 塗り係数` の合計を
 * キャンバスの面積（PAGE_WIDTH_MM × PAGE_HEIGHT_MM）で割る。DOM を測定しない純粋関数。
 * 重なるブロックの合計がキャンバスの面積を超えても構わない（見当なので）が、
 * 返り値自体は 0〜1 に丸める。
 */
export function estimatePageInkCoverage(blocks: ManualBlock[]): number {
  const pageArea = PAGE_WIDTH_MM * PAGE_HEIGHT_MM;
  if (pageArea <= 0) return 0;

  const inkedArea = blocks.reduce((sum, block) => {
    const coefficient = inkCoefficient(block);
    if (coefficient <= 0) return sum;
    return sum + block.w * block.h * coefficient;
  }, 0);

  return Math.max(0, Math.min(1, inkedArea / pageArea));
}
