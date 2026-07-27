/**
 * 表の中のバッジ (デザイン README「寸法」/ 6章 33a)
 *
 * ── なぜ幅を固定するか ──────────────────────────────────
 *
 * ステージ列に「ネタ」「見積提案」「口頭決定」が縦に並ぶとき、幅を中身に任せると
 * **バッジの右端が行ごとにずれる**。目は左端ではなく「色の塊の形」で行を追うので、
 * 形がそろっていないと縦に流し読みできない。だから**列ごとに幅を固定**する。
 *
 * ── 和文2字と3字を同じ幅で見せる ────────────────────────
 *
 * 幅を固定しただけだと「ネタ」(2字) と「見積提案」(4字) で字の詰まり方が違って
 * 見える。**和文2字以上は 62px で均等割り付け**（`text-align-last: justify`）に
 * すると、2字は広がり4字はそのままで、どちらも同じ帯に収まる。
 * 1字とラテン略語 (AI・GLS) は割り付けると不自然なので中央寄せのまま。
 */
import { cn } from '../utils';
import { Badge, type BadgeProps } from './badge';

/** 表の列幅は7段だけ (README「寸法」)。ステージ列は 96px */
export const COL_W = {
  1: 56,
  2: 72,
  3: 96,
  4: 128,
  5: 160,
  6: 200,
  7: 240,
} as const;

export type ColStep = keyof typeof COL_W;

/** 均等割り付けにする幅。README で 62px と決めてある */
const JUSTIFY_W = 62;

/** 和文 (ひらがな・カタカナ・漢字) を2字以上含むか */
function isJapanese(text: string): boolean {
  const jp = text.match(/[぀-ゟ゠-ヿ一-龯]/g);
  return (jp?.length ?? 0) >= 2;
}

export interface TableBadgeProps extends Omit<BadgeProps, 'children'> {
  /** バッジに出す文字。均等割り付けの判定に使うので**文字列で渡す** */
  label: string;
  /** 列幅の段。省略すると中身に合わせず 96px (ステージ列と同じ) */
  col?: ColStep;
}

export function TableBadge({ label, col = 3, className, style, ...rest }: TableBadgeProps) {
  const justify = isJapanese(label);
  return (
    <span className="inline-flex shrink-0 justify-center" style={{ width: COL_W[col] }}>
      <Badge
        className={cn('max-w-full', className)}
        style={
          justify
            ? {
                // 均等割り付け。`text-align-last` は最終行 (= 1行なのでこの行) に効く
                width: JUSTIFY_W,
                textAlign: 'justify',
                textAlignLast: 'justify',
                ...style,
              }
            : style
        }
        {...rest}
      >
        {label}
      </Badge>
    </span>
  );
}
