import { cn } from '@/lib/utils';
import type { Lang } from '../types';

interface Props {
  value: Lang;
  onChange: (v: Lang) => void;
}

export default function LangPicker({ value, onChange }: Props) {
  const opts: { v: Lang; label: string }[] = [
    { v: 'ja', label: 'JA' },
    { v: 'en', label: 'EN' },
  ];
  return (
    <div
      className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900/50 p-0.5 text-[10px] font-black tracking-widest"
      role="group"
      aria-label="プレビュー言語"
    >
      {opts.map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'px-2 py-1 rounded-md transition-colors',
            value === v ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
          )}
          aria-pressed={value === v}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
