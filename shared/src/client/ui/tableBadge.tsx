/**
 * 表・一覧の中のバッジ (docs/design/v4/_rules.md「1. 縦の整列」)
 *
 * ── なぜ幅を固定するか ──────────────────────────────────────
 *
 * ステータス列に「受信」「確認中」「処理完了」が縦に並ぶとき、幅を中身に任せると
 * **バッジの右端が行ごとにずれます**。目は文字ではなく「色の塊の形」で行を追うので、
 * 形がそろっていないと縦に流し読みできません。だから**列ごとに幅を固定**します。
 *
 * ── 和文2字と4字を同じ幅で見せる ────────────────────────────
 *
 * 幅を固定しただけだと「受信」(2字) と「処理完了」(4字) で字の詰まり方が違って
 * 見えます。**和文は 62px で均等割り付け** (`text-align-last: justify`) にすると、
 * 2字は広がり4字はそのままで、どちらも同じ帯に収まります。
 * 1字とラテン略語 (AI・GLS) は割り付けると不自然なので中央寄せのままにします。
 *
 * ── 62px という数字の根拠 (変えるときはここを実測し直すこと) ──
 *
 * **和文は割り付けたい幅より自然幅のほうが広いと2行に折り返します**
 * (和文は単語区切りが無いのでどこでも改行される)。折り返すと行高が倍になり
 * 行がそろわないので、**中身に使える幅 ≥ 自然幅**でなければいけません。
 *
 *   `Badge` の既定 `px-2.5` のまま → 62 − 10×2 − 罫線 1×2 = **中身 40px**
 *   `px-0` に上書き            → 62 −  0    − 罫線 1×2 = **中身 60px**
 *
 * 実ブラウザで測った自然幅 (LINE Seed JP 700 / 11px / 字間 0.3px・中身の幅):
 *
 *   2字「受信」22.6px ／ 3字「確認中」33.9px ／ 4字「処理完了」45.2px ／ 6字 67.8px
 *
 * 4字 45.2px は 60px に余裕をもって収まり、6字は入りません。
 * 5字は約 56.5px で数字の上は収まりますが**残りが 3.5px しかなく、書体が
 * 届く前の代替書体では溢れます**。だから割り付けは4字までにして、それ以上は
 * 自然幅 + 折り返し禁止にします (`JUSTIFY_MAX`)。
 * padding は割り付けると見えなくなるので 0 にして構いません。
 *
 * **`text-badge` を効かせるのに `cn()` の設定が要る。** 詳細は
 * `shared/src/client/utils.ts` — 教えていないと `Badge` の既定 `text-xs`(12px) が
 * 勝ち、自然幅が 61.2px になって4字が折り返します (実際に踏んだ)。
 */
import { cn } from '../utils';
import { Badge, type BadgeProps } from './badge';
import { type SlotWidth } from './row';

/** 均等割り付けにする幅 (docs/design/v4 で 62px と決めてある) */
const JUSTIFY_W = 62;

/** 均等割り付けにする文字数の上限。これを超えると 62px に収まらない */
const JUSTIFY_MAX = 4;

/** 和文 (ひらがな・カタカナ・漢字) を2字以上含むか */
function isJapanese(text: string): boolean {
  const jp = text.match(/[぀-ゟ゠-ヿ一-龯]/g);
  return (jp?.length ?? 0) >= 2;
}

export interface TableBadgeProps extends Omit<BadgeProps, 'children'> {
  /** バッジに出す文字。**文字列で渡す** — 均等割り付けの判定に文字数を使うため */
  label: string;
  /**
   * 列幅。`RowSlot` と同じ7段から選ぶ。既定は 96px (ステータス列)。
   * `<RowSlot>` の中に置くときは `w={null}` にして枠を二重にしないこと。
   */
  w?: SlotWidth | null;
}

export function TableBadge({ label, w = 96, className, style, ...rest }: TableBadgeProps) {
  const justify = isJapanese(label) && label.length <= JUSTIFY_MAX;

  const badge = (
    <Badge
      className={cn(
        'text-badge max-w-full font-bold',
        // 均等割り付けのときは padding を落として中身の幅を稼ぐ (上の計算参照)。
        // **`inline-block` にするのが必須。** `Badge` の既定は `inline-flex` で、
        // flex の中の文字には `text-align` が効かない (実測: 2字が 48px の帯に
        // 広がらず 24.6px のままだった)。表示を block 系に変えて初めて割り付く。
        justify ? 'inline-block px-0' : 'whitespace-nowrap',
        className,
      )}
      style={
        justify
          ? {
              // `text-align-last` は「最終行」に効く。1行なのでこの行に効く
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
  );

  // 枠を持たない形。`<RowSlot>` の中に置くときはこちら
  if (w === null) return badge;

  return (
    <span className="inline-flex shrink-0 justify-center" style={{ width: w }}>
      {badge}
    </span>
  );
}
