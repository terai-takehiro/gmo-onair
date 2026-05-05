import { cn } from '@/lib/utils';
import { Megaphone } from 'lucide-react';
import type { TickerCategory } from '../types';

interface Props {
  on: boolean;
  /** 現在ティッカーで送出中の賞 (= 選択中の award)。null ならティッカー利用不可 */
  currentAward: TickerCategory | null;
  onToggle: () => void;
}

export default function TickerControlRow({ on, currentAward, onToggle }: Props) {
  const totalItems = currentAward?.divisions.reduce((s, d) => s + d.items.length, 0) ?? 0;
  const divCount = currentAward?.divisions.length ?? 0;
  const disabled = !currentAward;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-bold transition-all shrink-0',
          on
            ? 'bg-amber-500 border-amber-400 text-slate-950'
            : disabled
            ? 'border-slate-800 text-slate-600 bg-slate-900/40 cursor-not-allowed'
            : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
        )}
      >
        <Megaphone className="h-4 w-4" />
        {on ? 'TICKER ON' : 'TICKER OFF'}
      </button>
      {currentAward && (
        <div className="flex items-center gap-2 text-sm text-slate-300 min-w-0">
          <span className="text-slate-500">流す賞 →</span>
          <span className="font-bold text-amber-300 truncate">{currentAward.award}</span>
          <span className="text-slate-500 text-xs shrink-0">
            {divCount > 1 ? `${divCount}部門ループ · ` : ''}
            <span className="tabular-nums">{totalItems}</span>名
          </span>
        </div>
      )}
    </div>
  );
}
