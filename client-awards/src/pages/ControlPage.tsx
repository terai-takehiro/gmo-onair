import { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Trophy, Radio } from 'lucide-react';
import type { CgStep, OneshotStyle, CgCategory, CgCueState } from '@/cg/types';
import CGSequence from '@/cg/CGSequence';
import { CG_W, CG_H } from '@/cg/types';

interface AwardsEventDetail {
  id: number; name: string; subtitle: string | null; categories: CgCategory[];
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

const STEPS: { step: CgStep; label: string; desc: string; color: 'neutral'|'live'|'award' }[] = [
  { step: 'idle',       label: 'IDLE',       desc: '透過',           color: 'neutral' },
  { step: 'title',      label: 'TITLE',      desc: 'タイトルカード', color: 'neutral' },
  { step: 'nominees',   label: 'NOMINEES',   desc: 'ノミネート一覧', color: 'live'    },
  { step: 'ranks52',    label: 'RANKS 5→2',  desc: 'ランキングバー', color: 'live'    },
  { step: 'winner-bar', label: 'WINNER BAR', desc: '大賞引きバー',   color: 'award'   },
  { step: 'oneshot',    label: 'ONE SHOT',   desc: '大賞フルスクリーン', color: 'award' },
];
const ONESHOT_STYLES: { style: OneshotStyle; label: string }[] = [
  { style: 'classic',   label: 'Classic'   },
  { style: 'shards',    label: 'Shards'    },
  { style: 'spotlight', label: 'Spotlight' },
  { style: 'slit',      label: 'Slit'      },
];
const LIVE_STEPS: CgStep[] = ['nominees','ranks52','winner-bar','oneshot'];

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
  const currentStep = STEPS.find((s) => s.step === cue.step);

  // CG preview scaling
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);
  useEffect(() => {
    const update = () => {
      if (previewRef.current) setScale(previewRef.current.offsetWidth / CG_W);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 h-12 shrink-0 border-b border-slate-800">
        <button onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">CONTROL</span>
          {event && <span className="text-xs text-slate-600 ml-2 truncate">{event.name}</span>}
        </div>
        <a href={`/awards/output/${eventId}?lang=ja`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
          <ExternalLink className="h-3 w-3" />出力
        </a>
      </header>

      {/* ── Main: preview left / controls right ─────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* CG Preview */}
        <div className="shrink-0 lg:flex-1 flex items-center justify-center p-3 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950">
          <div ref={previewRef} className="w-full max-h-[32vh] lg:max-h-none rounded-xl overflow-hidden bg-black"
            style={{ aspectRatio: '16/9' }}>
            <div style={{ width: CG_W, height: CG_H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative', background: '#000' }}>
              {event && <CGSequence cue={cue} category={selectedCat ?? null} eventName={event.name} eventSubtitle={event.subtitle} />}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="w-full lg:w-80 xl:w-96 flex flex-col gap-2.5 p-3 overflow-y-auto">
          <StatusPanel isLive={isLive} currentStep={currentStep} selectedCat={selectedCat} />
          <CategoryPanel awardGroups={awardGroups} cue={cue} sendCue={sendCue} />
          <StepPanel steps={STEPS} cue={cue} sendCue={sendCue} />
          <OneshotPanel styles={ONESHOT_STYLES} cue={cue} sendCue={sendCue} />
        </div>
      </div>
    </div>
  );
}

// ── StatusPanel ──────────────────────────────────────────────
function StatusPanel({ isLive, currentStep, selectedCat }: {
  isLive: boolean;
  currentStep: typeof STEPS[number] | undefined;
  selectedCat: CgCategory | undefined;
}) {
  return (
    <div className={cn('rounded-lg p-3 border transition-all', isLive ? 'bg-red-950/50 border-red-800/50' : 'bg-slate-900 border-slate-800')}>
      <div className="flex items-center gap-2">
        <Radio className={cn('h-3.5 w-3.5 shrink-0', isLive ? 'text-red-400 animate-pulse' : 'text-slate-600')} />
        <span className={cn('text-[10px] font-black tracking-widest uppercase', isLive ? 'text-red-500' : 'text-slate-600')}>{isLive ? 'ON AIR' : 'STANDBY'}</span>
        <span className="text-sm font-bold text-slate-200 ml-1">{currentStep?.label}</span>
      </div>
      {selectedCat && (
        <div className="flex items-center gap-1.5 mt-1.5 pl-5">
          <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-400 font-medium truncate">{selectedCat.name}</span>
          {selectedCat.description && <span className="text-xs text-slate-500 truncate">/ {selectedCat.description}</span>}
        </div>
      )}
    </div>
  );
}

// ── CategoryPanel ─────────────────────────────────────────────
function CategoryPanel({ awardGroups, cue, sendCue }: {
  awardGroups: AwardGroup[];
  cue: CgCueState;
  sendCue: (step: CgStep, catId?: number, style?: OneshotStyle) => void;
}) {
  if (!awardGroups.length) return null;
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-600 border-b border-slate-800">Category</p>
      <div className="p-2 space-y-2">
        {awardGroups.map((g) => (
          <div key={g.name}>
            <div className="flex items-center gap-1 mb-1 px-1">
              <Trophy className="h-2.5 w-2.5 text-amber-500 shrink-0" />
              <span className="text-[10px] font-bold text-amber-500 tracking-wide">{g.name}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-3">
              {g.divisions.map((cat) => (
                <button key={cat.id} onClick={() => sendCue('idle', cat.id)}
                  className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-all border',
                    cue.categoryId === cat.id
                      ? 'bg-amber-500 border-amber-400 text-slate-950'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700')}>
                  {cat.description || cat.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── StepPanel ─────────────────────────────────────────────────
function StepPanel({ steps, cue, sendCue }: {
  steps: typeof STEPS;
  cue: CgCueState;
  sendCue: (step: CgStep, catId?: number, style?: OneshotStyle) => void;
}) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-600 border-b border-slate-800">Step</p>
      <div className="p-2 grid grid-cols-3 gap-1.5">
        {steps.map(({ step, label, desc, color }) => {
          const active = cue.step === step;
          return (
            <button key={step} onClick={() => sendCue(step)}
              className={cn('flex flex-col items-start rounded-lg border p-2 text-left transition-all',
                active && color === 'live'    && 'border-red-500 bg-red-950/60 ring-1 ring-red-700/40',
                active && color === 'award'   && 'border-amber-500 bg-amber-950/50 ring-1 ring-amber-700/40',
                active && color === 'neutral' && 'border-slate-500 bg-slate-800',
                !active && 'border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700')}>
              <span className={cn('text-[10px] font-black tracking-wider',
                active && color === 'live'    && 'text-red-400',
                active && color === 'award'   && 'text-amber-400',
                active && color === 'neutral' && 'text-slate-300',
                !active && 'text-slate-500')}>
                {label}
              </span>
              <span className="text-[10px] text-slate-700 mt-0.5 leading-tight">{desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── OneshotPanel ──────────────────────────────────────────────
function OneshotPanel({ styles, cue, sendCue }: {
  styles: typeof ONESHOT_STYLES;
  cue: CgCueState;
  sendCue: (step: CgStep, catId?: number, style?: OneshotStyle) => void;
}) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-600 border-b border-slate-800">One Shot Style</p>
      <div className="p-2 grid grid-cols-4 gap-1.5">
        {styles.map(({ style, label }) => (
          <button key={style} onClick={() => sendCue(cue.step, undefined, style)}
            className={cn('rounded-md border py-2 text-center text-xs font-bold transition-all',
              cue.oneshotStyle === style
                ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                : 'border-slate-800 text-slate-600 hover:bg-slate-800 hover:text-slate-300')}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
