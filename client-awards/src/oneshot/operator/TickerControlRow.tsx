import { cn } from '@/lib/utils';
import { Megaphone } from 'lucide-react';
import type { TickerCategory } from '../types';

interface Props {
  on: boolean;
  categories: TickerCategory[];
  selectedIdx: number;
  onToggle: () => void;
  onSelect: (idx: number) => void;
}

export default function TickerControlRow({ on, categories, selectedIdx, onToggle, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-all shrink-0',
          on
            ? 'bg-amber-500 border-amber-400 text-slate-950'
            : 'border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
        )}
      >
        <Megaphone className="h-3.5 w-3.5" />
        {on ? 'TICKER ON' : 'TICKER OFF'}
      </button>
      <div className="flex gap-1.5 flex-wrap min-w-0">
        {categories.map((c, i) => {
          const active = i === selectedIdx;
          return (
            <button
              key={c.category}
              onClick={() => onSelect(i)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-semibold transition-all',
                active
                  ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                  : 'border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              {c.category}
              <span className="ml-1.5 text-[10px] opacity-60 tabular-nums">{c.items.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
