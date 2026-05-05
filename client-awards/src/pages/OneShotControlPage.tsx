import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Radio, Subtitles, Tv2, Languages, Database, Image as ImageIcon, ImageOff, Cpu } from 'lucide-react';

import OneShotStage from '../oneshot/OneShotStage';
import LangPicker, { fromLangMode, type LangMode } from '../oneshot/operator/LangPicker';
import NomineePanel, { filterNominees } from '../oneshot/operator/NomineePanel';
import ModulePickerRow from '../oneshot/operator/ModulePickerRow';
import TickerControlRow from '../oneshot/operator/TickerControlRow';
import SendActionRow from '../oneshot/operator/SendActionRow';
import ShortcutHints from '../oneshot/operator/ShortcutHints';
import I18nDictDialog from '../oneshot/operator/I18nDictDialog';
import OneShotDataEditor from '../oneshot/operator/OneShotDataEditor';
import { loadOverrides, type I18nOverrides } from '../oneshot/lib/i18nOverrides';

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
// v2.8.72+: 動的レンダラ (ModuleDef 駆動) と旧ハードコード版の A/B 切替フラグ。
// 段階2 検証用。段階2.1 で旧版を削除した時点で本フラグも撤去予定。
const RENDERER_KEY = 'awards-cg-renderer';

interface OneShotEventDetail {
  id: number;
  name: string;
  subtitle: string | null;
  categories: AwardsCategoryRow[];
}

interface LiveSnapshot {
  nomineeId: string;
  moduleKey: ModuleKey;
  lang: Lang;
}

export default function OneShotControlPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  // v2.8.74+: 3-mode 化 ('ja'|'en'|'both')
  const [langMode, setLangMode] = useState<LangMode>(() => {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'en' || v === 'both' ? v : 'ja';
  });
  useEffect(() => {
    localStorage.setItem(LANG_KEY, langMode);
  }, [langMode]);
  // 内部用: primary 言語 + bilingual フラグに分解
  const { lang, bilingual } = fromLangMode(langMode);

  // v2.8.72+: 動的レンダラ vs ハードコード版の A/B 切替 (localStorage)
  const [useDynamicRenderer, setUseDynamicRenderer] = useState<boolean>(() => {
    const v = localStorage.getItem(RENDERER_KEY);
    return v !== 'legacy'; // default: dynamic
  });
  useEffect(() => {
    localStorage.setItem(RENDERER_KEY, useDynamicRenderer ? 'dynamic' : 'legacy');
  }, [useDynamicRenderer]);

  const { data: event } = useQuery({
    queryKey: ['awards-oneshot-state', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}/oneshot/state`);
      return res.data.data as OneShotEventDetail;
    },
  });

  // i18n override 辞書 (localStorage) — 賞・部門の英訳を DB と独立に保持
  const [i18nOverrides, setI18nOverrides] = useState<I18nOverrides>(() => loadOverrides());

  const nominees = useMemo(() => mapEventToNominees(event, i18nOverrides), [event, i18nOverrides]);
  const awards = useMemo(() => groupNomineesForTicker(nominees, lang), [nominees, lang]);

  // モーダル開閉
  const [dictOpen, setDictOpen] = useState(false);
  const [dataEditorOpen, setDataEditorOpen] = useState(false);

  // ── 階層選択 state ──────────────────────────────────────
  const [selectedAwardIdx, setSelectedAwardIdx] = useState(0);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  // PREVIEW にロードするノミネートは id ベースで保持 (フィルタ変更でも追える)
  const [previewId, setPreviewId] = useState<string | null>(null);

  // 賞が変わったら部門選択をリセット
  useEffect(() => {
    setSelectedDivision(null);
  }, [selectedAwardIdx]);

  const currentAward = awards[selectedAwardIdx] ?? null;

  // フィルタされたノミネート (賞 + 部門)
  const filteredNominees = useMemo(
    () => filterNominees(nominees, currentAward?.award ?? null, selectedDivision, lang),
    [nominees, currentAward, selectedDivision, lang]
  );

  // previewId が現在のフィルタに含まれていなければ先頭にリセット
  useEffect(() => {
    if (!filteredNominees.length) {
      setPreviewId(null);
      return;
    }
    if (previewId == null || !filteredNominees.find((n) => n.id === previewId)) {
      setPreviewId(filteredNominees[0].id);
    }
  }, [filteredNominees, previewId]);

  const previewNominee = useMemo(
    () => nominees.find((n) => n.id === previewId) ?? null,
    [nominees, previewId]
  );

  // v2.8.70+: デフォルト送出は「情報なし」(none)
  const [previewModule, setPreviewModule] = useState<ModuleKey>('none');
  const [transparent, setTransparent] = useState(false);
  // v2.8.70+: 画像 (Portrait) 表示 ON/OFF
  const [showPortrait, setShowPortrait] = useState(true);

  const previewModules = useMemo(
    () => (previewNominee ? getModules(previewNominee, lang) : {}),
    [previewNominee, lang]
  );
  // モジュールがフィルタ後に存在しなければ none に戻す
  useEffect(() => {
    if (!previewModules[previewModule]) setPreviewModule('none');
  }, [previewModules, previewModule]);

  // Live state — 1S CG 出力中のスナップショット
  const liveFlow = useTakeFlow<LiveSnapshot>({ nomineeId: '', moduleKey: 'none', lang });
  const tickerFlow = useTickerToggle(false);

  const { cue, sendCue } = useOneShotCue(isNaN(eventId) ? null : eventId);

  // ── 操作ハンドラ ────────────────────────────────────────
  const take = () => {
    if (!previewNominee) return;
    const snap: LiveSnapshot = { nomineeId: previewNominee.id, moduleKey: previewModule, lang };
    liveFlow.take(snap);
    sendCue({
      entryId: nomineeDbId(previewNominee),
      moduleKey: previewModule,
      tickerOn: tickerFlow.on,
      tickerCatIdx: selectedAwardIdx,
      transparent,
      lang,
      isLive: true,
      showPortrait,
      bilingual,
    });
  };
  const clear = () => {
    liveFlow.clear();
    sendCue({ ...cue, isLive: false });
  };

  const onToggleTicker = () => {
    tickerFlow.toggle();
    sendCue({ ...cue, tickerOn: !tickerFlow.on, tickerCatIdx: selectedAwardIdx });
  };
  const onSelectAward = (i: number) => {
    setSelectedAwardIdx(i);
    sendCue({ ...cue, tickerCatIdx: i });
  };
  const onToggleTransparent = () => {
    const v = !transparent;
    setTransparent(v);
    sendCue({ ...cue, transparent: v });
  };
  const onTogglePortrait = () => {
    const v = !showPortrait;
    setShowPortrait(v);
    sendCue({ ...cue, showPortrait: v });
  };
  const onChangeLangMode = (mode: LangMode) => {
    setLangMode(mode);
    const next = fromLangMode(mode);
    sendCue({ ...cue, lang: next.lang, bilingual: next.bilingual });
  };

  // ↑↓ で フィルタ済みノミネート間を循環
  const goPrev = () => {
    if (!filteredNominees.length) return;
    const i = filteredNominees.findIndex((n) => n.id === previewId);
    const next = (i - 1 + filteredNominees.length) % filteredNominees.length;
    setPreviewId(filteredNominees[next].id);
  };
  const goNext = () => {
    if (!filteredNominees.length) return;
    const i = filteredNominees.findIndex((n) => n.id === previewId);
    const next = (i + 1) % filteredNominees.length;
    setPreviewId(filteredNominees[next].id);
  };

  useShortcuts({
    modules: previewModules,
    setModuleKey: setPreviewModule,
    prevNominee: goPrev,
    nextNominee: goNext,
    take,
    clear,
  });

  // ── Letterbox ──────────────────────────────────────────
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

  const liveNominee = useMemo(() => {
    if (!liveFlow.live?.nomineeId) return null;
    return nominees.find((n) => n.id === liveFlow.live!.nomineeId) ?? null;
  }, [liveFlow.live, nominees]);

  const isLive = liveFlow.mounted;
  const tickerCategory = currentAward;

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          title="イベント編集に戻る"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <Subtitles className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-[11px] font-black text-slate-300 tracking-widest">下位置CG</span>
        {event && (
          <span className="text-xs text-slate-600 truncate hidden sm:block">{event.name}</span>
        )}
        <div className="flex-1" />
        {/* DB → CG マッピング インスペクタ + oneshot_data 編集 */}
        <button
          onClick={() => setDataEditorOpen(true)}
          disabled={!previewNominee || !nomineeDbId(previewNominee)}
          className={cn(
            'hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black tracking-widest uppercase transition-colors',
            previewNominee && nomineeDbId(previewNominee)
              ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              : 'bg-slate-900/40 text-slate-700 cursor-not-allowed'
          )}
          title="現在の PREVIEW ノミネートの DB ↔ CG マッピングを確認/編集"
        >
          <Database className="h-3 w-3" />
          データ
        </button>
        {/* 賞・部門 英訳辞書 (localStorage) */}
        <button
          onClick={() => setDictOpen(true)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          title="賞・部門の英訳辞書 (localStorage 保存、DB と独立)"
        >
          <Languages className="h-3 w-3" />
          英訳辞書
        </button>
        {/* 回遊性: 同イベントのランキングCGコントロールへ直接ジャンプ */}
        <button
          onClick={() => navigate(`/event/${eventId}/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          title="ランキングCG コントロールへ"
        >
          <Tv2 className="h-3 w-3" />
          ランキングCG
        </button>
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
        {/* v2.8.72+: 動的レンダラ A/B 切替 (段階2 検証用、段階2.1 で削除予定) */}
        <button
          onClick={() => setUseDynamicRenderer((v) => !v)}
          className={cn(
            'hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black tracking-widest uppercase transition-colors',
            useDynamicRenderer
              ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-800/60'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700/50'
          )}
          title={useDynamicRenderer
            ? '動的レンダラ (ModuleDef 駆動 / 段階2) を使用中。クリックで旧レンダラに切替'
            : '旧レンダラ (ハードコード版) を使用中。クリックで動的レンダラに切替'}
        >
          <Cpu className="h-3 w-3" />
          {useDynamicRenderer ? 'Dynamic' : 'Legacy'}
        </button>
        <LangPicker value={langMode} onChange={onChangeLangMode} />
        <a
          href={`/awards/output/${eventId}/oneshot?lang=${lang}`}
          target="_blank"
          rel="noreferrer"
          title={`下位置CG 出力 (${lang.toUpperCase()})`}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          出力
        </a>
      </header>

      {/* ── Middle: PROGRAM + Nominee panel ─────────────── */}
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
              <OneShotStage
                nominee={liveNominee}
                lang={liveFlow.live?.lang ?? lang}
                moduleKey={liveFlow.live?.moduleKey ?? 'none'}
                transparent={transparent}
                lowerThirdMounted={liveFlow.mounted}
                lowerThirdExiting={liveFlow.exiting}
                tickerMounted={tickerFlow.mounted}
                tickerExiting={tickerFlow.exiting}
                tickerOn={tickerFlow.on}
                tickerCategory={tickerCategory}
                showPortrait={showPortrait}
                useDynamicRenderer={useDynamicRenderer}
                bilingual={bilingual}
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
            {isLive ? `PROGRAM · ON AIR (${lang.toUpperCase()})` : `PROGRAM · OFF (${lang.toUpperCase()})`}
          </div>
          {!isLive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-slate-700">
                <div className="text-[10px] font-black tracking-widest uppercase mb-1">PROGRAM OFF</div>
                <div className="text-[9px] tracking-widest">Press TAKE to send</div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full lg:w-80 xl:w-96 flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            <NomineePanel
              nominees={nominees}
              awards={awards}
              selectedAwardIdx={selectedAwardIdx}
              selectedDivision={selectedDivision}
              previewId={previewId}
              liveId={isLive && liveFlow.live ? liveFlow.live.nomineeId : null}
              lang={lang}
              onSelectAward={onSelectAward}
              onSelectDivision={setSelectedDivision}
              onSelectNominee={setPreviewId}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom: PREVIEW thumb + Module / Ticker / Send ────── */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3">
        <div className="flex flex-col xl:flex-row gap-3">
          {/* PREVIEW thumbnail */}
          <div className="flex flex-col gap-1.5 shrink-0 w-full xl:w-[320px]">
            <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              PREVIEW · NEXT TAKE ({lang.toUpperCase()})
            </div>
            <div
              ref={previewThumbRef}
              className="relative w-full aspect-video bg-black rounded border border-slate-800 overflow-hidden"
            >
              {previewNominee ? (
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
                      tickerCategory={tickerCategory}
                      showPortrait={showPortrait}
                      useDynamicRenderer={useDynamicRenderer}
                    />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">
                  ノミネート未選択
                </div>
              )}
            </div>
          </div>

          {/* Controls column */}
          <div className="flex-1 min-w-0 space-y-2">
            <ModulePickerRow modules={previewModules} selected={previewModule} onSelect={setPreviewModule} />
            <TickerControlRow
              on={tickerFlow.on}
              currentAward={currentAward}
              onToggle={onToggleTicker}
            />
            {/* 画像 ON/OFF (送出CGに画像を含めるか) */}
            <div className="flex items-center gap-2">
              <button
                onClick={onTogglePortrait}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-semibold transition-all',
                  showPortrait
                    ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                )}
                title="送出CGに画像 (Portrait) を含めるか切替"
              >
                {showPortrait ? <ImageIcon className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
                {showPortrait ? '画像 ON' : '画像 OFF'}
              </button>
              <span className="text-[11px] text-slate-500">
                {showPortrait ? '左に写真を表示' : '写真エリアを畳んでコンパクト表示'}
              </span>
            </div>
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

      {/* ── Modals ─────────────────────────────────────────── */}
      <I18nDictDialog
        open={dictOpen}
        onClose={() => setDictOpen(false)}
        categories={
          event?.categories.map((c) => ({
            id: c.id,
            name: c.name,
            name_en: c.name_en,
            description: c.description,
            description_en: c.description_en,
          })) ?? []
        }
        onSaved={(next) => setI18nOverrides(next)}
      />
      <OneShotDataEditor
        open={dataEditorOpen}
        onClose={() => setDataEditorOpen(false)}
        nominee={previewNominee}
        entryId={nomineeDbId(previewNominee)}
        refetchKey={['awards-oneshot-state', eventId]}
        lang={lang}
      />
    </div>
  );
}
