/**
 * 件数つきの絞り込みチップ (v4 モック「案件一覧」の上段)
 *
 * ```tsx
 * <FilterChips
 *   items={[{ key: 'all', label: 'すべて', count: 58 }, …]}
 *   value={stage}
 *   onChange={setStage}
 * />
 * ```
 *
 * ── なぜ件数を必ず持たせるか ────────────────────────────────
 *
 * 押してみないと 0 件だと分からない絞り込みは、**押す前に諦められません**。
 * 「D 仮押さえ 0」と出ていれば押さずに済みます。
 * だから `count` は任意ではなく**必須**にしてあります (無いときは `null` を渡す ＝
 * 「まだ数えられていない」を意味し、`—` ではなく何も出しません)。
 *
 * ── 見た目の決めごと ────────────────────────────────────────
 *
 * ・**1つの枠に隙間なく並べる**(セグメント)。バラバラのピルにすると
 *   「複数選べる」ように見えます。ここは**1つだけ選ぶ**場所です
 * ・選んだものは背景 `--primary-surface` ＋ 文字 `--primary`。
 *   罫線の色を変えるだけだと、隣り合っているのでどれが選ばれているか分かりません
 * ・高さは 34px … ではなく **44px 以上** (`min-h-tap`)。
 *   モックは 34px ですが、**スマホでも同じチップを指で押します**
 *   (_rules.md「3. スマホ」タップ対象は最低 44px)。PC では 36px に下げます
 * ・横に入りきらないときは**折り返さず横スクロール**します。折り返すと
 *   チップの段が増えて一覧の始まる位置が行ごとに動きます
 */
import { cn } from '../utils';

export interface FilterChipItem<K extends string = string> {
  key: K;
  label: string;
  /** 件数。`null` は「まだ数えていない」= 数字を出さない */
  count: number | null;
}

export interface FilterChipsProps<K extends string = string> {
  items: FilterChipItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** 読み上げ用の名前 (「ステージで絞り込む」など) */
  label: string;
  className?: string;
}

export function FilterChips<K extends string = string>({
  items,
  value,
  onChange,
  label,
  className,
}: FilterChipsProps<K>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full shrink-0 overflow-x-auto rounded-control border border-border bg-card',
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'min-h-tap inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap px-3.5 py-2 text-sub lg:min-h-[36px]',
              i > 0 && 'border-l border-border',
              active
                ? 'bg-primary-surface font-bold text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {item.label}
            {item.count !== null && (
              <span className={cn('font-number text-sub-sm', !active && 'text-muted-foreground')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
