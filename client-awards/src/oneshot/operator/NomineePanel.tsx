import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Trophy, User, Users, Filter } from 'lucide-react';
import type { Lang, Nominee, TickerCategory } from '../types';

interface Props {
  nominees: Nominee[];
  awards: TickerCategory[];
  selectedAwardIdx: number;
  /** null = 全部門, それ以外 = 該当部門のみ表示 */
  selectedDivision: string | null;
  /** 現在 PREVIEW にロードされているノミネートの id */
  previewId: string | null;
  /** 現在 LIVE 中のノミネートの id (or null) */
  liveId: string | null;
  lang: Lang;
  onSelectAward: (idx: number) => void;
  onSelectDivision: (division: string | null) => void;
  onSelectNominee: (id: string) => void;
}

export default function NomineePanel({
  nominees,
  awards,
  selectedAwardIdx,
  selectedDivision,
  previewId,
  liveId,
  lang,
  onSelectAward,
  onSelectDivision,
  onSelectNominee,
}: Props) {
  const isJa = lang === 'ja';
  const currentAward = awards[selectedAwardIdx] ?? null;

  // 賞 + 部門 で絞り込んだノミネート
  const filtered = useMemo(() => {
    if (!currentAward) return [];
    return nominees.filter((n) => {
      const a = isJa ? n.category : n.categoryEn;
      if (a !== currentAward.award) return false;
      if (selectedDivision == null) return true;
      const d = isJa ? n.subcategory : n.subcategoryEn;
      return d === selectedDivision;
    });
  }, [nominees, currentAward, selectedDivision, isJa]);

  if (!awards.length) {
    return (
      <div className="text-xs text-slate-600 text-center py-6">
        ノミネートなし
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── 賞ピッカー ─────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-slate-300 uppercase px-0.5">
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          賞 · Award
          <span className="text-slate-500 normal-case font-medium tracking-wide">
            ({awards.length})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {awards.map((a, i) => {
            const active = i === selectedAwardIdx;
            const totalItems = a.divisions.reduce((s, d) => s + d.items.length, 0);
            return (
              <button
                key={a.award}
                onClick={() => onSelectAward(i)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-all flex items-center gap-1.5',
                  active
                    ? 'border-amber-400 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                    : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                )}
                title={`${a.award} · ${a.divisions.length}部門 · ${totalItems}名`}
              >
                <span className="font-bold">{a.award}</span>
                <span className="text-xs opacity-70 tabular-nums">{totalItems}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 部門ピッカー (選択した賞の部門のみ) ──── */}
      {currentAward && currentAward.divisions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-slate-300 uppercase px-0.5">
            <Filter className="h-3.5 w-3.5 text-amber-500/70" />
            部門 · Division
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onSelectDivision(null)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-sm transition-all',
                selectedDivision == null
                  ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                  : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              )}
            >
              すべて
              <span className="ml-1 text-xs opacity-70 tabular-nums">
                {currentAward.divisions.reduce((s, d) => s + d.items.length, 0)}
              </span>
            </button>
            {currentAward.divisions.map((d) => {
              const active = selectedDivision === d.division;
              return (
                <button
                  key={d.division}
                  onClick={() => onSelectDivision(d.division)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-sm transition-all',
                    active
                      ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                      : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                  )}
                  title={`${d.division} (${d.items.length}名)`}
                >
                  {d.division}
                  <span className="ml-1 text-xs opacity-70 tabular-nums">{d.items.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ノミネート (フィルタ済み) ────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-slate-300 uppercase px-0.5">
          <User className="h-3.5 w-3.5 text-amber-500/70" />
          人 · Nominee · ↑/↓
          <span className="text-slate-500 normal-case font-medium tracking-wide">
            ({filtered.length})
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-5 border border-dashed border-slate-800 rounded">
            該当なし
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((n) => {
              const active = n.id === previewId;
              const live = n.id === liveId;
              const Icon = n.type === 'team' ? Users : User;
              const displayName =
                n.type === 'team'
                  ? isJa
                    ? n.projectName ?? n.name
                    : n.projectNameEn ?? n.nameEn
                  : isJa
                  ? n.name
                  : n.nameEn;
              return (
                <button
                  key={n.id}
                  onClick={() => onSelectNominee(n.id)}
                  className={cn(
                    'w-full text-left rounded-md border px-3 py-2.5 transition-all flex items-start gap-2.5',
                    active
                      ? 'bg-amber-500/10 border-amber-400 ring-1 ring-amber-500/30'
                      : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700 hover:border-slate-600'
                  )}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-900 ring-1 ring-slate-700">
                    {n.image ? (
                      <img src={n.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-5 w-5 text-slate-500 absolute inset-0 m-auto" />
                    )}
                    {live && (
                      <div className="absolute inset-0 ring-2 ring-red-500 ring-offset-1 ring-offset-slate-900 rounded" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="text-xs font-bold tracking-wider uppercase text-amber-500/90 truncate">
                      No.{n.entryNo}
                      {(isJa ? n.subcategory : n.subcategoryEn) && (
                        <> · {isJa ? n.subcategory : n.subcategoryEn}</>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-100 truncate">{displayName}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {isJa ? n.company : n.companyEn}
                      {n.type === 'team' && n.teamSize ? ` · ${n.teamSize} members` : ''}
                    </div>
                  </div>
                  {live && (
                    <span className="text-[10px] font-black tracking-widest text-red-400 px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800/60 shrink-0">
                      LIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Helper for parents: filter `nominees` matching the same predicate as the panel. */
export function filterNominees(
  nominees: Nominee[],
  award: string | null,
  division: string | null,
  lang: Lang,
): Nominee[] {
  const isJa = lang === 'ja';
  return nominees.filter((n) => {
    if (award) {
      const a = isJa ? n.category : n.categoryEn;
      if (a !== award) return false;
    }
    if (division) {
      const d = isJa ? n.subcategory : n.subcategoryEn;
      if (d !== division) return false;
    }
    return true;
  });
}
