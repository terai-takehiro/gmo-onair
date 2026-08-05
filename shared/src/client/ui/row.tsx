/**
 * 行の骨格 (docs/design/v4/_rules.md「1. 縦の整列」)
 *
 * ── なぜ部品にするか ────────────────────────────────────────
 *
 * 「同じ意味のものが縦に並んだとき、桁と端がそろっていること」が v4 の中核です。
 * ところがこれは**書き方の規約にすると必ず破れます**。73画面それぞれで
 * `flex` と幅を手で書けば、どこかで `min-w-0` が落ちて名前が長い行だけ
 * 右側の列が押し出され、どこかで 120px のような一回限りの幅が入ります。
 *
 * そこで**構造で強制**します:
 *
 *   ・`<RowMain>` が **`min-w-0` + `flex-1` を持つ唯一の子**。
 *     伸びるのは名前列だけ、が部品の形として決まる
 *   ・`<RowSlot w={...}>` は **7段の幅しか受け付けない** (型で弾く)。
 *     120px のような一回限りの幅を作れないので、同じ意味の列がページごとに
 *     違う幅にならない
 *   ・値が無い行も `<RowSlot>` が**同じ幅の空きスロット**を置くので列が保たれる
 *
 * ── 実際に何がばらついていたか (v4 着手時に数えた) ────────────
 *
 * 手書きの列幅が **97 か所**あり、**7段に乗っているのは 32 か所 (33%) だけ**でした。
 * 残りは 80 / 90 / 100 / 120 / 130 / 140 / 150 / 180px … と、
 * 「そのとき中身が入る幅」で決められています。同じ「ステータス」の列が
 * 画面によって 90px と 100px なので、並べて見ると端がそろいません。
 *
 * ── 7段の幅はここが正 ──────────────────────────────────────
 *
 * `MoneyCell` (P1) も `TableBadge` もこの `SlotWidth` を読みます。
 * **金額・バッジ・その他の列が同じ段を共有する**のが要点で、別々に持つと
 * 「金額列は96px・バッジ列は100px」のようにずれます。
 */
import * as React from 'react';
import { cn } from '../utils';

// ───────────────────────────────────────────────────────
// 列幅の段
// ───────────────────────────────────────────────────────

/**
 * 列幅は7段だけ (docs/design/v4/_tokens.md「余白・寸法」)。
 *
 * **56px より下を作らないこと。** 和文2字のバッジ (62px の均等割り付け) が
 * 入る最小幅がここで、これより狭い段を作るとバッジが列からはみ出します。
 * いまデイリーニュースの表頭に 52px (AI活用) と 64px (採用) の直書きが
 * ありますが、どちらもこの理由で 56 / 72 に寄せます。
 *
 * ── コメントに幅のクラス名を書かないこと ────────────────────
 * Tailwind は**コメントも走査**します。説明のために任意値のクラス名を
 * そのまま書くと、**そのクラスの CSS が全7アプリに生成されます**
 * (実際に一度書いて、凍結アプリの CSS に 3 規則増えたのをビルド出力の
 *  突き合わせで見つけました)。幅は素の数字で書くこと。
 */
export const SLOT_WIDTHS = [56, 72, 96, 128, 160, 200, 240] as const;

export type SlotWidth = (typeof SLOT_WIDTHS)[number];

// ───────────────────────────────────────────────────────
// 行
// ───────────────────────────────────────────────────────

/** 行の詰まり具合。padding は docs/design/v4/_tokens.md の確定値 */
const DENSITY = {
  /** 一覧の行 (`11px 16px`)。行高 42〜48px */
  list: 'px-4 py-[11px]',
  /** 表の行 (`9px 16px`)。一覧より1行あたり4px低い */
  table: 'px-4 py-[9px]',
} as const;

export interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 行の詰まり具合。既定は一覧 */
  density?: keyof typeof DENSITY;
  /**
   * 縦の位置。既定は中央。
   * 名前列が複数行になる一覧 (件名 + 本文 + 補足) では `start` にする
   * — 中央にすると1行の行と複数行の行でバッジの高さがそろわない。
   */
  align?: 'center' | 'start';
  /** 行の下に区切り線を引く (最後の行には引かない) */
  divider?: boolean;
  /** hover で背景を変える。**`transform` は使わない** (_rules.md「操作したときの決めごと」) */
  interactive?: boolean;
  /**
   * スマホ (640px 未満) で**縦積みにする**。
   *
   * 固定列を全部横に並べると 375px には入りません
   * (例: 種別 56 + ステータス 96 + 金額 128 + 隙間 = 292px。
   *  余白を引いた実効幅 279px を超えるので名前列に残るのが 0px になる)。
   * `_rules.md`「3. スマホ」は**PC の情報をそのまま縮小しない**と決めているので、
   * 名前列だけ行を独占させて、固定列はその上下に折り返します。
   *
   * **`RowMain` 側に何も書かなくてよいのが要点。** 画面ごとに
   * `basis-full sm:basis-auto` を書かせると必ず書き忘れる行が出るため、
   * ここから子の `data-row-main` を狙って当てています。
   */
  stackOnMobile?: boolean;
}

/**
 * 一覧・表の1行。**子は `<RowSlot>` と `<RowMain>` だけにする。**
 *
 * ```tsx
 * <Row divider interactive>
 *   <RowSlot w={96}><TableBadge label={stage} /></RowSlot>
 *   <RowMain><RowTitle>{name}</RowTitle></RowMain>
 *   <MoneyCell value={amount} width={128} />
 * </Row>
 * ```
 */
export function Row({
  density = 'list',
  align = 'center',
  divider = false,
  interactive = false,
  stackOnMobile = false,
  className,
  children,
  ...rest
}: RowProps) {
  return (
    <div
      className={cn(
        'flex gap-3',
        align === 'start' ? 'items-start' : 'items-center',
        DENSITY[density],
        // 行間の罫は最も薄い段。外枠 (--border) と同じにすると行が箱に見える
        divider && 'border-b border-border-faint last:border-b-0',
        interactive && 'hover:bg-background',
        stackOnMobile &&
          'flex-wrap sm:flex-nowrap [&>[data-row-main]]:basis-full sm:[&>[data-row-main]]:basis-auto',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * 表頭。**本文の行と同じ `<RowSlot>` を並べる**のが要点で、
 * ヘッダーだけ別の幅指定にすると必ずずれます。
 *
 * 文字色は `--muted-foreground` にしてあります。デザインの確定値は
 * `--fg-disabled` (`#9aa1ab`) ですが、白地でコントラスト 2.61:1 しか無く
 * **読ませる文字には使わない**と決めた色です (docs/design/v4/_tokens.md の注意書き)。
 * 表頭は読む文字なので一段濃くします。
 */
export function RowHeader({ density = 'table', className, children, ...rest }: RowProps) {
  return (
    <Row
      density={density}
      className={cn(
        'text-th border-b border-border-subtle bg-surface-subtle text-muted-foreground',
        className,
      )}
      {...rest}
    >
      {children}
    </Row>
  );
}

// ───────────────────────────────────────────────────────
// 伸びる子 (名前列)
// ───────────────────────────────────────────────────────

/**
 * **行の中で唯一伸びる子。** `min-w-0` を内包しているので、
 * 中の文字が長くても右側の固定列を押し出しません。
 *
 * `min-w-0` が無いと flex の子は「中身の最小幅」より縮まないため、
 * 長い案件名が1つあるだけでその行の金額列が右に飛び出します。
 * **これを画面ごとに書かせないためにこの部品があります。**
 */
export function RowMain({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    // `data-row-main` は `<Row stackOnMobile>` から狙うための印。消さないこと
    <div data-row-main className={cn('min-w-0 flex-1', className)} {...rest}>
      {children}
    </div>
  );
}

/** 名前列の主テキスト。**1行で省略**する (折り返すと行高がそろわない) */
export function RowTitle({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-list truncate text-foreground', className)} {...rest}>
      {children}
    </div>
  );
}

/** 名前列の副テキスト (取引先・GLS番号など)。同じく1行で省略 */
export function RowSub({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-sub truncate text-muted-foreground', className)} {...rest}>
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────
// 固定幅の子 (それ以外の列)
// ───────────────────────────────────────────────────────

const ALIGN = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const;

export interface RowSlotProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 列幅。**7段からしか選べない** */
  w: SlotWidth;
  /** 中身の寄せ。数値・金額は `right`、バッジは `left` か `center` */
  align?: keyof typeof ALIGN;
  /**
   * スマホでは列を落とす。**幅を狭めるのではなく消す**のが v4 の方針
   * (_rules.md「3. スマホ」= 出す情報を絞る)。残った列の幅は変わらないので
   * PC と同じ位置に揃ったままになる。
   */
  hideOnMobile?: boolean;
  /**
   * 中身が無いときに出す文字。**既定でも何か出す**のが要点で、
   * 空にすると「値が無い行」だけ列が詰まって縦の線が消える。
   */
  placeholder?: React.ReactNode;
}

/** 中身が「無い」か。`0` と `false` は値として扱う (0件・未チェックは表示する) */
function isEmpty(children: React.ReactNode): boolean {
  return children === null || children === undefined || children === '';
}

/**
 * 固定幅の列。`shrink-0` なので**中身が長くても幅が変わりません**
 * (はみ出す場合は中身側で省略する)。
 */
export function RowSlot({
  w,
  align = 'left',
  hideOnMobile = false,
  placeholder = '—',
  className,
  children,
  ...rest
}: RowSlotProps) {
  const empty = isEmpty(children);
  return (
    <div
      className={cn(
        'flex shrink-0 items-center',
        ALIGN[align],
        hideOnMobile && 'hidden sm:flex',
        empty && 'text-muted-foreground',
        className,
      )}
      style={{ width: w }}
      {...rest}
    >
      {empty ? placeholder : children}
    </div>
  );
}
