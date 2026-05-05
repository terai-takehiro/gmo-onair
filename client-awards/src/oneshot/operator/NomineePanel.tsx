import { cn } from '@/lib/utils';
import { User, Users } from 'lucide-react';
import type { Lang, Nominee } from '../types';

interface Props {
  nominees: Nominee[];
  selectedIdx: number;
  liveIdx: number | null;
  lang: Lang;
  onSelect: (idx: number) => void;
}

export default function NomineePanel({ nominees, selectedIdx, liveIdx, lang, onSelect }: Props) {
  if (!nominees.length) {
    return <div className="text-xs text-slate-600 text-center py-6">ノミネートなし</div>;
  }
  return (
    <div className="space-y-1.5">
      {nominees.map((n, i) => {
        const active = i === selectedIdx;
        const live = i === liveIdx;
        const Icon = n.type === 'team' ? Users : User;
        const displayName =
          n.type === 'team'
            ? lang === 'ja'
              ? n.projectName ?? n.name
              : n.projectNameEn ?? n.nameEn
            : lang === 'ja'
            ? n.name
            : n.nameEn;
        return (
          <button
            key={n.id}
            onClick={() => onSelect(i)}
            className={cn(
              'w-full text-left rounded-md border px-2.5 py-2 transition-all flex items-start gap-2',
              active
                ? 'bg-amber-500/10 border-amber-400 ring-1 ring-amber-500/30'
                : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700 hover:border-slate-600'
            )}
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-900 ring-1 ring-slate-700">
              {n.image ? (
                <img src={n.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon className="h-4 w-4 text-slate-500 absolute inset-0 m-auto" />
              )}
              {live && (
                <div className="absolute inset-0 ring-2 ring-red-500 ring-offset-1 ring-offset-slate-900 rounded" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="text-[10px] font-bold tracking-wider uppercase text-amber-500/90 truncate">
                No.{n.entryNo} · {lang === 'ja' ? n.category : n.categoryEn}
              </div>
              <div className="text-xs font-bold text-slate-100 truncate">{displayName}</div>
              <div className="text-[10px] text-slate-400 truncate">
                {lang === 'ja' ? n.company : n.companyEn}
                {n.type === 'team' && n.teamSize ? ` · ${n.teamSize} members` : ''}
              </div>
            </div>
            {live && (
              <span className="text-[9px] font-black tracking-widest text-red-400 px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800/60 shrink-0">
                LIVE
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
