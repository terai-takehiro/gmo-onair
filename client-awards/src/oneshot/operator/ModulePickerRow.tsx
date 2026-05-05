import { cn } from '@/lib/utils';
import type { ModuleKey } from '../types';
import type { ModuleMap } from '../modules/getModules';

interface Props {
  modules: ModuleMap;
  selected: ModuleKey;
  onSelect: (k: ModuleKey) => void;
}

const ORDER: ModuleKey[] = ['title', 'respect', 'skills', 'comment', 'members', 'recComment', 'none'];

export default function ModulePickerRow({ modules, selected, onSelect }: Props) {
  const items = ORDER.map((k) => modules[k]).filter((m): m is NonNullable<typeof m> => Boolean(m));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
      {items.map((m) => {
        const active = m.key === selected;
        return (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            className={cn(
              'flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all',
              active
                ? 'border-amber-500 bg-amber-950/50 ring-1 ring-amber-700/40'
                : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800 hover:border-slate-700'
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-black tracking-wider leading-none">
              <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded border border-slate-700 bg-slate-800 text-[11px] font-bold text-amber-400">
                {m.keyHint}
              </kbd>
              <span className={active ? 'text-amber-300' : 'text-slate-300'}>{m.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
