import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../utils";

/**
 * ToggleCard — 1 個分のトグルボタンカード。
 * v2.7.5 のスタジオ予約 UI を汎用化したもの。
 *
 * 単独でも使えるし、ToggleButtonGroup から内部的に呼ばれる。
 *
 * 使用想定:
 * - 多選択リスト (フィルタ / カテゴリ / 表示列など) の各項目
 * - 動的データのリスト行選択 (シミュレーションの費用項目等)
 */
export interface ToggleCardProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  selected: boolean;
  onToggle: () => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** 選択時の背景色 (省略時 primary) */
  color?: string;
  /** 左端のアイコン (色ドットなど) */
  leftSlot?: React.ReactNode;
  /** 右端の追加情報 (金額・件数など) */
  rightSlot?: React.ReactNode;
  /** role: switch (単一 boolean) or checkbox (多選択) */
  role?: 'switch' | 'checkbox';
  size?: 'sm' | 'md';
}

export const ToggleCard = React.forwardRef<HTMLButtonElement, ToggleCardProps>(
  ({ selected, onToggle, label, description, color, leftSlot, rightSlot, role = 'checkbox', size = 'md', className, disabled, ...rest }, ref) => {
    const minH = size === 'sm' ? 'min-h-[40px]' : 'min-h-[44px]';
    const padding = size === 'sm' ? 'px-2.5 py-1.5' : 'px-3 py-2';
    return (
      <button
        ref={ref}
        type="button"
        role={role}
        aria-checked={selected}
        aria-pressed={role === 'switch' ? selected : undefined}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          minH,
          padding,
          'flex items-start gap-2 rounded-xl border-2 text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          selected
            ? 'border-transparent text-white shadow-sm'
            : 'border-input bg-background hover:border-primary/40 hover:bg-muted/30',
          className,
        )}
        style={selected ? { background: color ?? 'hsl(var(--primary))' } : undefined}
        {...rest}
      >
        {leftSlot && (
          <span className="shrink-0 flex items-center pt-0.5">{leftSlot}</span>
        )}
        <span className="flex-1 min-w-0 self-center">
          <span className={cn('block font-medium leading-snug whitespace-normal break-words', size === 'sm' ? 'text-xs' : 'text-sm')}>
            {label}
          </span>
          {description && (
            <span className={cn('block leading-snug whitespace-normal break-words', selected ? 'text-white/85' : 'text-muted-foreground', 'text-[11px] mt-0.5')}>
              {description}
            </span>
          )}
        </span>
        {rightSlot && (
          <span className="shrink-0 self-center">{rightSlot}</span>
        )}
        {selected && !rightSlot && (
          <Check className="h-4 w-4 shrink-0 self-center" aria-hidden="true" />
        )}
      </button>
    );
  }
);
ToggleCard.displayName = 'ToggleCard';

// ──────────────────────────────────────────────────────────────

export interface ToggleOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  description?: React.ReactNode;
  color?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  disabled?: boolean;
}

export interface ToggleButtonGroupProps<V extends string = string> {
  options: ToggleOption<V>[];
  value: V[];
  onChange: (next: V[]) => void;
  /** false で単一選択 (= ラジオ風) */
  multi?: boolean;
  /** Tailwind grid 列指定 (固定の文字列リテラルから組み立てるので動的でも安全) */
  cols?: { base?: 1 | 2 | 3 | 4; sm?: 1 | 2 | 3 | 4; md?: 1 | 2 | 3 | 4; lg?: 1 | 2 | 3 | 4 | 5 };
  /** 全て選択 / 全て解除のチップを表示 (multi=true 時のみ意味あり) */
  showSelectAll?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}

const COL_BASE: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
const COL_SM:   Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };
const COL_MD:   Record<number, string> = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };
const COL_LG:   Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' };

/**
 * ToggleButtonGroup — 複数の ToggleCard をグリッドで並べる UI。
 *
 * 使用例:
 *   <ToggleButtonGroup
 *     options={[
 *       { value: 'customer', label: '顧客' },
 *       { value: 'vendor',   label: '仕入先' },
 *     ]}
 *     value={selected}
 *     onChange={setSelected}
 *     multi
 *     cols={{ base: 2, sm: 3 }}
 *     showSelectAll
 *   />
 */
export function ToggleButtonGroup<V extends string = string>({
  options,
  value,
  onChange,
  multi = true,
  cols = { base: 2, sm: 3, lg: 4 },
  showSelectAll = false,
  size = 'md',
  ariaLabel,
  className,
}: ToggleButtonGroupProps<V>) {
  const allSelected = options.length > 0 && options.every(o => value.includes(o.value));
  const toggle = (v: V) => {
    if (multi) {
      onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
    } else {
      onChange(value.includes(v) ? [] : [v]);
    }
  };
  const toggleAll = () => {
    onChange(allSelected ? [] : options.map(o => o.value));
  };

  const gridCols = [
    cols.base && COL_BASE[cols.base],
    cols.sm   && COL_SM[cols.sm],
    cols.md   && COL_MD[cols.md],
    cols.lg   && COL_LG[cols.lg],
  ].filter(Boolean).join(' ');

  return (
    <div className={cn('space-y-2', className)} role="group" aria-label={ariaLabel}>
      {showSelectAll && multi && options.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
              allSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-accent',
            )}
          >
            {allSelected ? '全て解除' : '全て選択'}
          </button>
        </div>
      )}
      <div className={cn('grid gap-2', gridCols)}>
        {options.map(opt => (
          <ToggleCard
            key={opt.value}
            selected={value.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
            label={opt.label}
            description={opt.description}
            color={opt.color}
            leftSlot={opt.leftSlot}
            rightSlot={opt.rightSlot}
            disabled={opt.disabled}
            role={multi ? 'checkbox' : 'switch'}
            size={size}
          />
        ))}
      </div>
    </div>
  );
}
