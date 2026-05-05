import { cn } from '@/lib/utils';
import { Play, Square, EyeOff } from 'lucide-react';

interface Props {
  isLive: boolean;
  transparent: boolean;
  onTake: () => void;
  onClear: () => void;
  onToggleTransparent: () => void;
}

export default function SendActionRow({ isLive, transparent, onTake, onClear, onToggleTransparent }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onTake}
        className="flex items-center gap-1.5 rounded-md bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-black tracking-widest uppercase text-white transition-colors shadow-lg shadow-red-900/30"
      >
        <Play className="h-3.5 w-3.5 fill-current" /> TAKE
      </button>
      <button
        onClick={onClear}
        disabled={!isLive}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-black tracking-widest uppercase transition-colors',
          isLive
            ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
            : 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
        )}
      >
        <Square className="h-3.5 w-3.5 fill-current" /> CLEAR
      </button>
      <div className="flex-1" />
      <button
        onClick={onToggleTransparent}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all',
          transparent
            ? 'border-amber-500 bg-amber-900/30 text-amber-300'
            : 'border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
        )}
        title="本番出力相当 (背景透過)"
      >
        <EyeOff className="h-3.5 w-3.5" />
        {transparent ? '透過 ON' : '透過 OFF'}
      </button>
    </div>
  );
}
