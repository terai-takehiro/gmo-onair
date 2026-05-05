import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Radio, Subtitles } from 'lucide-react';

import OneShotStage from '../oneshot/OneShotStage';
import LangPicker from '../oneshot/operator/LangPicker';
import NomineePanel from '../oneshot/operator/NomineePanel';
import ModulePickerRow from '../oneshot/operator/ModulePickerRow';
import TickerControlRow from '../oneshot/operator/TickerControlRow';
import SendActionRow from '../oneshot/operator/SendActionRow';
import ShortcutHints from '../oneshot/operator/ShortcutHints';

import { useOneShotCue } from '../oneshot/hooks/useOneShotCue';
import { useTakeFlow } from '../oneshot/hooks/useTakeFlow';
import { useTickerToggle } from '../oneshot/hooks/useTickerToggle';
import { useShortcuts } from '../oneshot/hooks/useShortcuts';
import { getModules } from '../oneshot/modules/getModules';
import { groupNomineesForTicker } from '../oneshot/lib/groupNominees';
import { mapEventToNominees, type AwardsCategoryRow } from '../oneshot/lib/mapEntryToNominee';
import type { Lang, ModuleKey } from '../oneshot/types';

import '../oneshot/styles/index.css';

const CG_W = 1920;
const CG_H = 1080;
const LANG_KEY = 'awards-oneshot-preview-lang';

interface OneShotEventDetail {
  id: number;
  name: string;
  subtitle: string | null;
  categories: AwardsCategoryRow[];
}

interface LiveSnapshot {
  nomineeIdx: number;
  moduleKey: ModuleKey;
  lang: Lang;
}

export default function OneShotControlPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const [lang, setLang] = useState<Lang>(() => {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'en' ? 'en' : 'ja';
  });
  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  const { data: event } = useQuery({
    queryKey: ['awards-oneshot-state', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}/oneshot/state`);
      return res.data.data as OneShotEventDetail;
    },
  });

  const nominees = useMemo(() => mapEventToNominees(event), [event]);
  const tickerCats = useMemo(() => groupNomineesForTicker(nominees, lang), [nominees, lang]);

  // Preview state (operator pre-roll)
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewModule, setPreviewModule] = useState<ModuleKey>('title');
  const [tickerCatIdx, setTickerCatIdx] = useState(0);
  const [transparent, setTransparent] = useState(false);

  const previewNominee = nominees[previewIdx] ?? nominees[0] ?? null;
  const previewModules = useMemo(
    () => (previewNominee ? getModules(previewNominee, lang) : {}),
    [previewNominee, lang]
  );
  // Reset to title if currently selected module isn't available for new nominee
  useEffect(() => {
    if (!previewModules[previewModule]) setPreviewModule('title');
  }, [previewModules, previewModule]);

  // Live state (TAKE pushes a snapshot here, also synced via socket)
  const initialSnapshot: LiveSnapshot = { nomineeIdx: 0, moduleKey: 'title', lang };
  const liveFlow = useTakeFlow<LiveSnapshot>(initialSnapshot);
  const tickerFlow = useTickerToggle(false);

  const { cue, sendCue } = useOneShotCue(isNaN(eventId) ? null : eventId);

  // Send live state on take/clear/lang change
  const take = () => {
    const snap: LiveSnapshot = { nomineeIdx: previewIdx, moduleKey: previewModule, lang };
    liveFlow.take(snap);
    sendCue({
      entryId: nominees[previewIdx]?.id != null ? hashId(nominees[previewIdx].id) : null,
      moduleKey: previewModule,
      tickerOn: tickerFlow.on,
      tickerCatIdx,
      transparent,
      lang,
      isLive: true,
    });
  };
  const clear = () => {
    liveFlow.clear();
    sendCue({ ...cue, isLive: false });
  };

  const onToggleTicker = () => {
    tickerFlow.toggle();
    sendCue({ ...cue, tickerOn: !tickerFlow.on });
  };
  const onSelectTickerCat = (i: number) => {
    setTickerCatIdx(i);
    sendCue({ ...cue, tickerCatIdx: i });
  };
  const onToggleTransparent = () => {
    const v = !transparent;
    setTransparent(v);
    sendCue({ ...cue, transparent: v });
  };
  const onChangeLang = (v: Lang) => {
    setLang(v);
    sendCue({ ...cue, lang: v });
  };

  useShortcuts({
    modules: previewModules,
    setModuleKey: setPreviewModule,
    prevNominee: () => setPreviewIdx((i) => (nominees.length ? (i - 1 + nominees.length) % nominees.length : 0)),
    nextNominee: () => setPreviewIdx((i) => (nominees.length ? (i + 1) % nominees.length : 0)),
    take,
    clear,
  });

  // CG preview letterbox
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

  const liveNominee = liveFlow.live ? nominees[liveFlow.live.nomineeIdx] ?? null : null;
  const isLive = liveFlow.mounted;

  const currentTicker = tickerCats[tickerCatIdx % Math.max(tickerCats.length, 1)] ?? null;

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <Subtitles className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">1S CG</span>
        {event && (
          <span className="text-xs text-slate-600 truncate hidden sm:block">{event.name}</span>
        )}
        <div className="flex-1" />
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase transition-all',
            isLive
              ? 'bg-red-950/70 text-red-400 border border-red-800/50'
              : 'bg-slate-800/70 text-slate-500 border border-slate-700/50'
          )}
        >
          <Radio className={cn('h-3 w-3 shrink-0', isLive && 'animate-pulse')} />
          {isLive ? 'ON AIR' : 'STANDBY'}
        </div>
        <LangPicker value={lang} onChange={onChangeLang} />
        <a
          href={`/awards/output/${eventId}/oneshot?lang=${lang}`}
          target="_blank"
          rel="noreferrer"
          title={`1S CG 出力 (${lang.toUpperCase()})`}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          出力
        </a>
      </header>

      {/* ── Middle: CG Preview (left) + Nominee panel (right) ───── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <div
          ref={previewRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800"
        >
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
              <OneShotStage
                nominee={isLive ? liveNominee : previewNominee}
                lang={isLive && liveFlow.live ? liveFlow.live.lang : lang}
                moduleKey={isLive && liveFlow.live ? liveFlow.live.moduleKey : previewModule}
                transparent={transparent}
                lowerThirdMounted={isLive ? liveFlow.mounted : true}
                lowerThirdExiting={liveFlow.exiting}
                tickerMounted={tickerFlow.mounted}
                tickerExiting={tickerFlow.exiting}
                tickerOn={tickerFlow.on}
                tickerCategory={currentTicker}
              />
            </div>
          </div>
          {!isLive && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-slate-900/80 border border-slate-700/60 text-amber-400">
              ◇ PREVIEW
            </div>
          )}
        </div>

        <div className="w-full lg:w-72 xl:w-80 flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/30">
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
              Nominee · ↑/↓
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <NomineePanel
              nominees={nominees}
              selectedIdx={previewIdx}
              liveIdx={isLive && liveFlow.live ? liveFlow.live.nomineeIdx : null}
              lang={lang}
              onSelect={setPreviewIdx}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom: Module / Ticker / Send ────────────── */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3 space-y-2">
        <ModulePickerRow modules={previewModules} selected={previewModule} onSelect={setPreviewModule} />
        <TickerControlRow
          on={tickerFlow.on}
          categories={tickerCats}
          selectedIdx={tickerCatIdx}
          onToggle={onToggleTicker}
          onSelect={onSelectTickerCat}
        />
        <SendActionRow
          isLive={isLive}
          transparent={transparent}
          onTake={take}
          onClear={clear}
          onToggleTransparent={onToggleTransparent}
        />
        <ShortcutHints />
      </div>
    </div>
  );
}

// Convert Nominee.id (string) to a stable numeric hash.
// 1S CG cue payload uses entryId as int (DB column awards_oneshot_cue_state.entry_id).
// For seed data we don't have a real DB id, so we hash. For real entries the
// mapper would set id = `entry-{dbId}`, which we can detect.
function hashId(id: string): number | null {
  const m = id.match(/^entry-(\d+)$/);
  if (m) return parseInt(m[1], 10);
  // Otherwise: not a real DB row (seed data) — keep null
  return null;
}
