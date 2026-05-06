import { cn } from '@/lib/utils';
import { Megaphone } from 'lucide-react';
import type { TickerCategory } from '../types';

interface Props {
  on: boolean;
  /** 現在ティッカーで送出中の賞 (= 選択中の award)。null ならティッカー利用不可 */
  currentAward: TickerCategory | null;
  onToggle: () => void;
}

// v2.8.79+: モバイル clutter 削減のため、info テキストは title 属性 (hover/long-press)
// に逃がし、ボタン本体だけをコンパクトに。SM 以上では従来通り info を表示。
export default function TickerControlRow({ on, currentAward, onToggle }: Props) {
  const totalItems = currentAward?.divisions.reduce((s, d) => s + d.items.length, 0) ?? 0;
  const divCount = currentAward?.divisions.length ?? 0;
  const disabled = !currentAward;
  const infoTitle = currentAward
    ? `流す賞 → ${currentAward.award} (${divCount > 1 ? `${divCount}部門ループ · ` : ''}${totalItems}名)`
    : '';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onToggle}
        disabled={disabled}
        title={infoTitle}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs sm:text-sm font-bold transition-all shrink-0',
          on
            ? 'bg-amber-500 border-amber-400 text-slate-950'
            : disabled
            ? 'border-slate-800 text-slate-400 bg-slate-900/40 cursor-not-allowed'
            : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
        )}
      >
        <Megaphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        TICKER {on ? 'ON' : 'OFF'}
      </button>
      {/* sm 以上のみ info を表示 */}
      {currentAward && (
        <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300 min-w-0">
          <span className="text-slate-300">流す賞 →</span>
          <span className="font-bold text-amber-300 truncate">{currentAward.award}</span>
          <span className="text-slate-300 text-xs shrink-0">
            {divCount > 1 ? `${divCount}部門ループ · ` : ''}
            <span className="tabular-nums">{totalItems}</span>名
          </span>
        </div>
      )}
    </div>
  );
}
