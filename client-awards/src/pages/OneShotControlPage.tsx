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
import { mapEventToNominees, nomineeDbId, type AwardsCategoryRow } from '../oneshot/lib/mapEntryToNominee';
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
      entryId: nomineeDbId(nominees[previewIdx]),
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

  // ── Letterbox helpers ──────────────────────────────────────
  const programRef = useRef<HTMLDivElement>(null);
  const previewThumbRef = useRef<HTMLDivElement>(null);
  const [programScale, setProgramScale] = useState(0.3);
  const [programOff, setProgramOff] = useState({ x: 0, y: 0 });
  const [thumbScale, setThumbScale] = useState(0.1);
  const [thumbOff, setThumbOff] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = programRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setProgramScale(s);
      setProgramOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = previewThumbRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setThumbScale(s);
      setThumbOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
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

      {/* ── Middle: PROGRAM (live mirror) + Nominee panel ─────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <div
          ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800"
        >
          <div
            style={{
              position: 'absolute',
              left: programOff.x,
              top: programOff.y,
              width: CG_W * programScale,
              height: CG_H * programScale,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: CG_W,
                height: CG_H,
                transform: `scale(${programScale})`,
                transformOrigin: 'top left',
                position: 'absolute',
              }}
            >
              {/* PROGRAM = output mirror. lower-third only mounts when isLive
                  so CLEAR truly clears the screen (matches what the broadcast
                  output shows). */}
              <OneShotStage
                nominee={liveNominee}
                lang={liveFlow.live?.lang ?? lang}
                moduleKey={liveFlow.live?.moduleKey ?? 'title'}
                transparent={transparent}
                lowerThirdMounted={liveFlow.mounted}
                lowerThirdExiting={liveFlow.exiting}
                tickerMounted={tickerFlow.mounted}
                tickerExiting={tickerFlow.exiting}
                tickerOn={tickerFlow.on}
                tickerCategory={currentTicker}
              />
            </div>
          </div>
          <div
            className={cn(
              'absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase border',
              isLive
                ? 'bg-red-950/70 border-red-800/60 text-red-400'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-500'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-red-500 animate-pulse' : 'bg-slate-600')} />
            {isLive ? 'PROGRAM · ON AIR' : 'PROGRAM · OFF'}
          </div>
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

      {/* ── Bottom: PREVIEW thumb + Module / Ticker / Send ────── */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3">
        <div className="flex flex-col xl:flex-row gap-3">
          {/* PREVIEW thumbnail (queued state — what the next TAKE will send) */}
          <div className="flex flex-col gap-1.5 shrink-0 w-full xl:w-[320px]">
            <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              PREVIEW · NEXT TAKE
            </div>
            <div
              ref={previewThumbRef}
              className="relative w-full aspect-video bg-black rounded border border-slate-800 overflow-hidden"
            >
              <div
                style={{
                  position: 'absolute',
                  left: thumbOff.x,
                  top: thumbOff.y,
                  width: CG_W * thumbScale,
                  height: CG_H * thumbScale,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: CG_W,
                    height: CG_H,
                    transform: `scale(${thumbScale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                  }}
                >
                  <OneShotStage
                    nominee={previewNominee}
                    lang={lang}
                    moduleKey={previewModule}
                    transparent={transparent}
                    lowerThirdMounted={true}
                    lowerThirdExiting={false}
                    tickerMounted={tickerFlow.on}
                    tickerExiting={false}
                    tickerOn={tickerFlow.on}
                    tickerCategory={currentTicker}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Controls column */}
          <div className="flex-1 min-w-0 space-y-2">
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
      </div>
    </div>
  );
}
