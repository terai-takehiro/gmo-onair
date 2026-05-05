import { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Trophy, Radio } from 'lucide-react';
import type { CgStep, OneshotStyle, CgCategory, CgCueState } from '@/cg/types';
import CGFrame from '@/cg/CGFrame';
import { CG_W, CG_H } from '@/cg/types';

type PreviewLang = 'ja' | 'en' | 'both';

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

const STEPS: { step: CgStep; label: string; desc: string; color: 'neutral' | 'live' | 'award' }[] = [
  { step: 'idle',       label: 'IDLE',       desc: '透過',              color: 'neutral' },
  { step: 'title',      label: 'TITLE',      desc: 'タイトルカード',    color: 'neutral' },
  { step: 'nominees',   label: 'NOMINEES',   desc: 'ノミネート一覧',    color: 'live'    },
  { step: 'ranks52',    label: 'RANKS 5→2',  desc: 'ランキングバー',    color: 'live'    },
  { step: 'top3',       label: 'BEST 3',     desc: '一覧から TOP3 一気発表', color: 'award' },
  { step: 'winner-bar', label: 'WINNER BAR', desc: '大賞引きバー',      color: 'award'   },
  { step: 'oneshot',    label: 'ONE SHOT',   desc: '大賞フルスクリーン', color: 'award'  },
];
const ONESHOT_STYLES: { style: OneshotStyle; label: string }[] = [
  { style: 'classic',   label: 'Classic'   },
  { style: 'shards',    label: 'Shards'    },
  { style: 'spotlight', label: 'Spotlight' },
  { style: 'slit',      label: 'Slit'      },
];
const LIVE_STEPS: CgStep[] = ['nominees', 'ranks52', 'top3', 'winner-bar', 'oneshot'];

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

  // プレビュー / 出力用 言語選択（localStorage で永続化）
  const [previewLang, setPreviewLang] = useState<PreviewLang>(() => {
    const v = localStorage.getItem('awards-preview-lang');
    return v === 'en' || v === 'both' ? v : 'ja';
  });
  useEffect(() => { localStorage.setItem('awards-preview-lang', previewLang); }, [previewLang]);

  // CG preview: scale to fit container (letterbox)
  const previewRef = useRef<HTMLDivElement>(null);
  const [cgScale, setCgScale] = useState(0.3);
  const [cgOff, setCgOff] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setCgScale(s);
      setCgOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">CONTROL</span>
        {event && <span className="text-xs text-slate-600 truncate hidden sm:block">{event.name}</span>}
        <div className="flex-1" />
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all',
          isLive
            ? 'bg-red-950/70 text-red-400 border border-red-800/50'
            : 'bg-slate-800/70 text-slate-500 border border-slate-700/50',
        )}>
          <Radio className={cn('h-3 w-3 shrink-0', isLive && 'animate-pulse')} />
          {isLive ? 'ON AIR' : 'STANDBY'}
        </div>
        <LangPicker value={previewLang} onChange={setPreviewLang} />
        <a
          href={`/awards/output/${eventId}?lang=${previewLang}`}
          target="_blank"
          rel="noreferrer"
          title={`出力 (${previewLang.toUpperCase()})`}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />出力
        </a>
      </header>

      {/* ── Middle: CG Preview (left) + Category (right) ─── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

        {/* CG Preview — fills flex space, inner content is absolute */}
        <div
          ref={previewRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800"
        >
          {event && (
            <div
              style={{
                position: 'absolute',
                left: cgOff.x,
                top: cgOff.y,
                width: CG_W * cgScale,
                height: CG_H * cgScale,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: CG_W,
                  height: CG_H,
                  transform: `scale(${cgScale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                }}
              >
                <CGFrame
                  lang={previewLang}
                  cue={cue}
                  category={selectedCat ?? null}
                  eventName={event.name}
                  eventSubtitle={event.subtitle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Status + Category */}
        <div className="w-full lg:w-72 xl:w-80 flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <StatusBar isLive={isLive} currentStep={currentStep} selectedCat={selectedCat} />
          <div className="flex-1 overflow-y-auto p-3">
            <CategoryPanel awardGroups={awardGroups} cue={cue} sendCue={sendCue} />
          </div>
        </div>
      </div>

      {/* ── Bottom: Step selection + OneShot style ────────── */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3 space-y-2">
        <StepRow steps={STEPS} cue={cue} sendCue={sendCue} />
        <StyleRow styles={ONESHOT_STYLES} cue={cue} sendCue={sendCue} />
      </div>
    </div>
  );
}

// ── StatusBar (compact, inside right panel top) ───────────
function StatusBar({ isLive, currentStep, selectedCat }: {
  isLive: boolean;
  currentStep: typeof STEPS[number] | undefined;
  selectedCat: CgCategory | undefined;
}) {
  return (
    <div className={cn(
      'shrink-0 px-3 py-2 border-b border-slate-800 transition-all',
      isLive ? 'bg-red-950/30' : 'bg-slate-900/30',
    )}>
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-sm font-black tracking-wider',
          isLive ? 'text-red-400' : 'text-slate-500',
        )}>
          {currentStep?.label ?? '—'}
        </span>
        <span className="text-xs text-slate-600">{currentStep?.desc}</span>
      </div>
      {selectedCat && (
        <div className="flex items-center gap-1.5 mt-1">
          <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-400 font-semibold truncate">{selectedCat.name}</span>
          {selectedCat.description && (
            <span className="text-xs text-slate-500 truncate">/ {selectedCat.description}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── CategoryPanel ─────────────────────────────────────────
function CategoryPanel({ awardGroups, cue, sendCue }: {
  awardGroups: AwardGroup[];
  cue: CgCueState;
  sendCue: (step: CgStep, catId?: number, style?: OneshotStyle) => void;
}) {
  if (!awardGroups.length) return (
    <div className="text-xs text-slate-600 text-center py-6">カテゴリなし</div>
  );
  return (
    <div className="space-y-3">
      {awardGroups.map((g) => (
        <div key={g.name}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-[11px] font-bold text-amber-500 tracking-wide">{g.name}</span>
          </div>
          <div className="flex flex-col gap-1 pl-4">
            {g.divisions.map((cat) => (
              <button
                key={cat.id}
                onClick={() => sendCue('idle', cat.id)}
                className={cn(
                  'w-full text-left rounded-md px-3 py-2 text-xs font-semibold transition-all border',
                  cue.categoryId === cat.id
                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                    : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700 hover:border-slate-600',
                )}
              >
                {cat.description || cat.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── StepRow (bottom bar) ──────────────────────────────────
function StepRow({ steps, cue, sendCue }: {
  steps: typeof STEPS;
  cue: CgCueState;
  sendCue: (step: CgStep, catId?: number, style?: OneshotStyle) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
      {steps.map(({ step, label, desc, color }) => {
        const active = cue.step === step;
        return (
          <button
            key={step}
            onClick={() => sendCue(step)}
            className={cn(
              'flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-all',
              active && color === 'live'    && 'border-red-500 bg-red-950/60 ring-1 ring-red-700/40',
              active && color === 'award'   && 'border-amber-500 bg-amber-950/50 ring-1 ring-amber-700/40',
              active && color === 'neutral' && 'border-slate-500 bg-slate-800',
              !active && 'border-slate-800 bg-slate-900/40 hover:bg-slate-800 hover:border-slate-700',
            )}
          >
            <span className={cn(
              'text-[10px] font-black tracking-wider leading-none',
              active && color === 'live'    && 'text-red-400',
              active && color === 'award'   && 'text-amber-400',
              active && color === 'neutral' && 'text-slate-300',
              !active && 'text-slate-500',
            )}>
              {label}
            </span>
            <span className="text-[9px] text-slate-700 mt-0.5 leading-tight">{desc}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── StyleRow (bottom bar) ─────────────────────────────────
function StyleRow({ styles, cue, sendCue }: {
  styles: typeof ONESHOT_STYLES;
  cue: CgCueState;
  sendCue: (step: CgStep, catId?: number, style?: OneshotStyle) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-slate-600 font-bold tracking-widest uppercase shrink-0">Style</span>
      <div className="flex gap-1.5 flex-wrap">
        {styles.map(({ style, label }) => (
          <button
            key={style}
            onClick={() => sendCue(cue.step, undefined, style)}
            className={cn(
              'rounded-md border px-3 py-1 text-xs font-bold transition-all',
              cue.oneshotStyle === style
                ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                : 'border-slate-800 text-slate-600 hover:bg-slate-800 hover:text-slate-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── LangPicker (header) ───────────────────────────────────
function LangPicker({ value, onChange }: {
  value: PreviewLang;
  onChange: (v: PreviewLang) => void;
}) {
  const opts: { v: PreviewLang; label: string }[] = [
    { v: 'ja',   label: 'JA'    },
    { v: 'en',   label: 'EN'    },
    { v: 'both', label: 'JA/EN' },
  ];
  return (
    <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900/50 p-0.5 text-[10px] font-black tracking-widest" role="group" aria-label="プレビュー言語">
      {opts.map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'px-2 py-1 rounded-md transition-colors',
            value === v
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300',
          )}
          aria-pressed={value === v}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
