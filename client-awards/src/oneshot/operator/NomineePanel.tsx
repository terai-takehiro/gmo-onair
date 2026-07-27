import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Tv, User, Filter, ChevronDown } from 'lucide-react';
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

// v2.8.88+ NomineePanel リデザイン:
//   ・賞: プルダウン (select) で 1 行に圧縮
//   ・部門: 2-col grid 固定、ボタン高 h-9 で押しやすく、長文は letter-spacing 詰めで長体風
//   ・人: 2-col grid 固定、部門 + 名前のみ (写真・会社・ノー削除)、一覧性重視

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
    return <div className="text-xs text-muted-foreground text-center py-6">ノミネートなし</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── 賞 (プルダウン) ─────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-muted-foreground uppercase px-0.5">
          <Tv className="h-3 w-3 text-warning-strong" />
          賞 · Award
          <span className="text-muted-foreground normal-case font-medium tracking-wide">
            ({awards.length})
          </span>
        </div>
        <div className="relative">
          <select
            value={selectedAwardIdx}
            onChange={(e) => onSelectAward(parseInt(e.target.value, 10))}
            className="w-full appearance-none rounded-md border border-warning/40 bg-warning/5 hover:bg-warning/10 text-warning-strong text-sm font-bold pl-3 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-warning/40 transition-colors"
          >
            {awards.map((a, i) => {
              const total = a.divisions.reduce((s, d) => s + d.items.length, 0);
              return (
                <option key={a.award} value={i} className="bg-background text-foreground">
                  {a.award} ({total}名)
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-warning-strong pointer-events-none" />
        </div>
      </div>

      {/* ── 部門 (2-col grid 固定) ────────────────── */}
      {currentAward && currentAward.divisions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-muted-foreground uppercase px-0.5">
            <Filter className="h-3 w-3 text-warning-strong" />
            部門 · Division
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <DivisionButton
              label="すべて"
              count={currentAward.divisions.reduce((s, d) => s + d.items.length, 0)}
              active={selectedDivision == null}
              onClick={() => onSelectDivision(null)}
            />
            {currentAward.divisions.map((d) => (
              <DivisionButton
                key={d.division}
                label={d.division}
                count={d.items.length}
                active={selectedDivision === d.division}
                onClick={() => onSelectDivision(d.division)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 人 / Nominee (2-col grid, 部門 + 名前のみ) ─ */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-muted-foreground uppercase px-0.5">
          <User className="h-3 w-3 text-warning-strong" />
          人 · Nominee
          <span className="text-muted-foreground normal-case font-medium tracking-wide">
            ({filtered.length})
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-5 border border-dashed border-border rounded">
            該当なし
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((n) => {
              const active = n.id === previewId;
              const live = n.id === liveId;
              const displayName =
                n.type === 'team'
                  ? isJa
                    ? n.projectName ?? n.name
                    : n.projectNameEn ?? n.nameEn
                  : isJa
                  ? n.name
                  : n.nameEn;
              const division = isJa ? n.subcategory : n.subcategoryEn;
              const isLong = (displayName ?? '').length > 9;
              return (
                <button
                  key={n.id}
                  onClick={() => onSelectNominee(n.id)}
                  className={cn(
                    'relative text-left rounded-md border px-2 py-1.5 transition-all min-w-0 min-h-[44px] flex flex-col justify-center gap-0.5',
                    active
                      ? 'bg-warning/15 border-warning ring-1 ring-warning/30'
                      : 'bg-card/60 border-border/50 hover:bg-muted hover:border-border',
                  )}
                  title={`${division ? division + ' · ' : ''}${displayName}${n.type === 'team' && n.teamSize ? ` (${n.teamSize}名)` : ''}`}
                >
                  {division && (
                    <div className="text-[9px] font-bold tracking-wider uppercase text-warning-strong truncate leading-none">
                      {division}
                    </div>
                  )}
                  <div
                    className="text-xs font-bold text-foreground leading-tight truncate"
                    style={isLong ? { letterSpacing: '-0.04em', fontFeatureSettings: '"palt"' } : undefined}
                  >
                    {displayName}
                  </div>
                  {live && (
                    <span className="absolute top-0.5 right-0.5 text-[8px] font-black tracking-widest text-destructive px-1 py-0.5 rounded bg-destructive/80 border border-destructive/60 leading-none">
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

// ── 部門ボタン (2-col grid 固定、長文は letter-spacing で長体風に圧縮) ──
function DivisionButton({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  const isLong = label.length > 7;
  return (
    <button
      onClick={onClick}
      title={`${label} (${count}名)`}
      className={cn(
        'rounded-md border h-9 px-2 text-sm font-bold transition-all flex items-center justify-between gap-1 min-w-0',
        active
          ? 'border-warning bg-warning/15 text-warning-strong ring-1 ring-warning/30'
          : 'border-border/60 bg-card/40 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span
        className="truncate min-w-0 flex-1 text-left"
        style={isLong ? { letterSpacing: '-0.04em', fontFeatureSettings: '"palt"' } : undefined}
      >
        {label}
      </span>
      <span className="text-[10px] opacity-70 tabular-nums shrink-0">{count}</span>
    </button>
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
