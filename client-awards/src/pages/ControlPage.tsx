import { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Trophy, Radio } from 'lucide-react';
import type { CgStep, OneshotStyle, CgCategory } from '@/cg/types';
import CGSequence from '@/cg/CGSequence';
import { CG_W, CG_H } from '@/cg/types';

interface AwardsEventDetail {
  id: number;
  name: string;
  subtitle: string | null;
  categories: CgCategory[];
}

interface AwardGroup { name: string; divisions: CgCategory[] }

function groupByAward(cats: CgCategory[]): AwardGroup[] {
  const map = new Map<string, CgCategory[]>();
  const order: string[] = [];
  for (const c of cats) {
    if (!map.has(c.name)) { map.set(c.name, []); order.push(c.name); }
    map.get(c.name)!.push(c);
  }
  return order.map((name) => ({ name, divisions: map.get(name)! }));
}

const STEPS: { step: CgStep; label: string; desc: string; color: 'neutral' | 'live' | 'award' }[] = [
  { step: 'idle',       label: 'IDLE',        desc: '透過（何も表示しない）', color: 'neutral' },
  { step: 'title',      label: 'TITLE',       desc: '賞タイトルカード',        color: 'neutral' },
  { step: 'nominees',   label: 'NOMINEES',    desc: 'ノミネート一覧',          color: 'live'    },
  { step: 'ranks52',    label: 'RANKS 5→2',   desc: 'ランキングバー',          color: 'live'    },
  { step: 'winner-bar', label: 'WINNER BAR',  desc: '大賞前の引きバー',        color: 'award'   },
  { step: 'oneshot',    label: 'ONE SHOT',    desc: '大賞フルスクリーン',      color: 'award'   },
];

const ONESHOT_STYLES: { style: OneshotStyle; label: string }[] = [
  { style: 'classic',   label: 'Classic'   },
  { style: 'shards',    label: 'Shards'    },
  { style: 'spotlight', label: 'Spotlight' },
  { style: 'slit',      label: 'Slit'      },
];

const LIVE_STEPS: CgStep[] = ['nominees', 'ranks52', 'winner-bar', 'oneshot'];

export default function ControlPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });

  const { cue, sendCue } = useAwardsCue(eventId);
  const awardGroups = useMemo(() => groupByAward(event?.categories ?? []), [event]);
  const selectedCat = event?.categories.find((c) => c.id === cue.categoryId) ?? event?.categories[0];
  const isLive = LIVE_STEPS.includes(cue.step);

  // CG preview scaling
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.35);
  useEffect(() => {
    const update = () => {
      if (previewRef.current) setPreviewScale(previewRef.current.offsetWidth / CG_W);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const currentStep = STEPS.find((s) => s.step === cue.step);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/event/${eventId}`)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-slate-300" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-200 truncate">送出コントロール</h1>
            {event && <p className="text-xs text-slate-500 truncate">{event.name}</p>}
          </div>
          <a
            href={`/awards/output/${eventId}?transparent=1`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            出力画面
          </a>
        </div>

        {/* ── CG Preview ────────────────────────────────────── */}
        <div
          ref={previewRef}
          className="rounded-xl overflow-hidden border border-slate-800 bg-black"
          style={{ height: Math.round(CG_H * previewScale) }}
        >
          <div style={{
            width: CG_W, height: CG_H,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
            position: 'relative',
            background: '#000',
          }}>
            {event && (
              <CGSequence
                cue={cue}
                category={selectedCat ?? null}
                eventName={event.name}
                eventSubtitle={event.subtitle}
              />
            )}
          </div>
        </div>

        {/* ── Status panel ──────────────────────────────────── */}
        <div className={cn(
          'rounded-xl p-4 border transition-all duration-300',
          isLive
            ? 'bg-red-950/60 border-red-800/50 ring-1 ring-red-700/40'
            : 'bg-slate-900 border-slate-800'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              isLive ? 'bg-red-600' : 'bg-slate-700'
            )}>
              <Radio className={cn('h-4 w-4', isLive ? 'text-white animate-pulse' : 'text-slate-500')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-bold tracking-widest uppercase',
                  isLive ? 'text-red-400' : 'text-slate-600'
                )}>
                  {isLive ? 'ON AIR' : 'STANDBY'}
                </span>
                <span className="text-base font-bold text-slate-100">{currentStep?.label ?? cue.step}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {selectedCat && (
                  <span className="flex items-center gap-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                    <Trophy className="h-2.5 w-2.5" />{selectedCat.name}
                  </span>
                )}
                {selectedCat?.description && (
                  <span className="text-xs text-slate-500">{selectedCat.description}</span>
                )}
                {cue.step === 'oneshot' && (
                  <span className="text-xs text-slate-600">
                    {ONESHOT_STYLES.find((s) => s.style === cue.oneshotStyle)?.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Category selector ─────────────────────────────── */}
        {awardGroups.length > 0 && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800">
              <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Category</p>
            </div>
            <div className="p-3 space-y-3">
              {awardGroups.map((group) => (
                <div key={group.name}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-amber-400">{group.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-4">
                    {group.divisions.map((cat) => {
                      const active = cue.categoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => sendCue('idle', cat.id)}
                          className={cn(
                            'rounded-lg px-4 py-2.5 text-sm font-semibold transition-all border',
                            active
                              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-900/30'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
                          )}
                        >
                          {cat.description || cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step buttons ──────────────────────────────────── */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800">
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Step</p>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STEPS.map(({ step, label, desc, color }) => {
              const active = cue.step === step;
              return (
                <button
                  key={step}
                  onClick={() => sendCue(step)}
                  className={cn(
                    'flex flex-col items-start rounded-xl border-2 p-3.5 text-left transition-all min-h-[72px]',
                    active && color === 'live'   && 'border-red-500 bg-red-950/50 ring-2 ring-red-700/30',
                    active && color === 'award'  && 'border-amber-500 bg-amber-950/50 ring-2 ring-amber-700/30',
                    active && color === 'neutral'&& 'border-slate-500 bg-slate-800 ring-2 ring-slate-600/30',
                    !active && 'border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700',
                  )}
                >
                  <span className={cn(
                    'text-xs font-black tracking-wider',
                    active && color === 'live'    && 'text-red-400',
                    active && color === 'award'   && 'text-amber-400',
                    active && color === 'neutral' && 'text-slate-300',
                    !active && 'text-slate-400',
                  )}>
                    {label}
                  </span>
                  <span className="text-[11px] text-slate-600 mt-1 leading-tight">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── OneShot style ─────────────────────────────────── */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800">
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">One Shot Style</p>
          </div>
          <div className="p-3 grid grid-cols-4 gap-2">
            {ONESHOT_STYLES.map(({ style, label }) => {
              const active = cue.oneshotStyle === style;
              return (
                <button
                  key={style}
                  onClick={() => sendCue(cue.step, undefined, style)}
                  className={cn(
                    'rounded-lg border py-3 text-center text-xs font-bold transition-all',
                    active
                      ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                      : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
