import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Radio, Subtitles, Tv, Languages, Database, Maximize2, Minimize2, HelpCircle } from 'lucide-react';
import { useFullscreen } from '@/hooks/useFullscreen';

import OneShotStage from '../oneshot/OneShotStage';
import LangPicker, { fromLangMode, toLangMode, type LangMode } from '../oneshot/operator/LangPicker';
import NomineePanel, { filterNominees } from '../oneshot/operator/NomineePanel';
import ModulePickerRow from '../oneshot/operator/ModulePickerRow';
import TickerControlRow from '../oneshot/operator/TickerControlRow';
import SendActionRow from '../oneshot/operator/SendActionRow';
import CountdownControlPanel from '../oneshot/operator/CountdownControlPanel';
import I18nDictDialog from '../oneshot/operator/I18nDictDialog';
import OneShotDataEditor from '../oneshot/operator/OneShotDataEditor';
import { loadOverrides, type I18nOverrides } from '../oneshot/lib/i18nOverrides';

import { useOneShotCue } from '../oneshot/hooks/useOneShotCue';
import { useTakeFlow } from '../oneshot/hooks/useTakeFlow';
import { useTickerToggle } from '../oneshot/hooks/useTickerToggle';
import { groupNomineesForTicker } from '../oneshot/lib/groupNominees';
import { mapEventToNominees, nomineeDbId, type AwardsCategoryRow } from '../oneshot/lib/mapEntryToNominee';
import { useEventModuleConfig, getOrderedVisibleModules } from '../oneshot/lib/moduleConfig';
import { findModuleByCueKey } from '../oneshot/lib/moduleKeyMap';
import type { Lang, ModuleKey } from '../oneshot/types';

import '../oneshot/styles/index.css';

const CG_W = 1920;
const CG_H = 1080;
const LANG_KEY = 'awards-oneshot-preview-lang';
// v2.8.88+: Dynamic/Legacy トグルを廃止 — 常に dynamic renderer 使用。
// (Legacy は v2.8.71 までのハードコード版で、モジュール編集に未対応のため
//  ユーザー視点でメリットがない)

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

export default function OneShotControlPage({ embedded = false }: { embedded?: boolean } = {}) {
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
  // 内部用: primary 言語 (bilingual flag は v2.8.83 で廃止 — 'both' は side-by-side preview に)
  const { lang } = fromLangMode(langMode);


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
  // v2.8.85+: 'both' mode のサイドバイサイド時は EN 側にも EN 版ティッカーが必要なため、
  // JA / EN 別々にティッカーカテゴリを計算しておく。
  const awardsJa = useMemo(() => groupNomineesForTicker(nominees, 'ja'), [nominees]);
  const awardsEn = useMemo(() => groupNomineesForTicker(nominees, 'en'), [nominees]);

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

  // v2.8.122+: コントロール列のタブ ('main' = モジュール/ティッカー / 'countdown' = カウントダウン)
  const [controlTab, setControlTab] = useState<'main' | 'countdown'>('main');

  // v2.8.121+: カウントダウンテロップ (独立 CG レイヤー)
  const [countdownOn, setCountdownOn] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState<string | null>(null);
  const [countdownPrefixJa, setCountdownPrefixJa] = useState('アワードまであと');
  const [countdownPrefixEn, setCountdownPrefixEn] = useState('Awards starts in');
  const [countdownX, setCountdownX] = useState(50);
  const [countdownY, setCountdownY] = useState(40);
  const [countdownScale, setCountdownScale] = useState(1);

  const countdownStage = useMemo(
    () => ({
      on: countdownOn,
      target: countdownTarget,
      prefixJa: countdownPrefixJa,
      prefixEn: countdownPrefixEn,
      x: countdownX,
      y: countdownY,
      scale: countdownScale,
    }),
    [countdownOn, countdownTarget, countdownPrefixJa, countdownPrefixEn, countdownX, countdownY, countdownScale]
  );


  // v2.8.76+: イベント別 EventModuleConfig を取得 (DB → react-query)
  const { data: moduleConfig } = useEventModuleConfig(isNaN(eventId) ? null : eventId);

  // 表示すべきモジュール (visibility 適用 + order 昇順)
  const previewModules = useMemo(() => {
    if (!moduleConfig) return [];
    return getOrderedVisibleModules(moduleConfig, previewNominee);
  }, [moduleConfig, previewNominee]);

  // 選択中モジュールがフィルタ後に存在しなければ none に戻す
  useEffect(() => {
    if (!moduleConfig) return;
    const found = findModuleByCueKey(moduleConfig, previewModule);
    if (!found || !previewModules.some((m) => m.id === found.id)) {
      setPreviewModule('none');
    }
  }, [moduleConfig, previewModules, previewModule]);

  // Live state — 1S CG 出力中のスナップショット
  const liveFlow = useTakeFlow<LiveSnapshot>({ nomineeId: '', moduleKey: 'none', lang });
  const tickerFlow = useTickerToggle(false);

  const { cue, sendCue, sendNextCue } = useOneShotCue(isNaN(eventId) ? null : eventId);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  // v2.8.84+: 初期マウント時に DB に保存された cue (= 直前の broadcast 状態) を operator
  // 側に同期。これがないと operator UI は default (PROGRAM OFF) で開くのに、output URL は
  // 直前の TAKE 内容を放送し続けるという「送出と出力が連動してない」状態になる。
  // 比較ロジックで mismatch のときだけ liveFlow / 内部 state を更新 (operator 自身の TAKE
  // で発火する cue 更新には反応しない)。
  useEffect(() => {
    if (!nominees.length) return;
    if (cue.isLive && cue.entryId != null) {
      const nominee = nominees.find((n) => n.id === `entry-${cue.entryId}`);
      if (!nominee) return;
      const liveSame =
        liveFlow.live?.nomineeId === nominee.id &&
        liveFlow.live?.moduleKey === cue.moduleKey &&
        liveFlow.live?.lang === cue.lang &&
        liveFlow.mounted === true;
      if (!liveSame) {
        liveFlow.setExternal(
          { nomineeId: nominee.id, moduleKey: cue.moduleKey, lang: cue.lang },
          true,
        );
        // local UI state も追従 (operator 画面の picker / toggle 表示を broadcast に揃える)
        setPreviewId(nominee.id);
        setPreviewModule(cue.moduleKey);
        setLangMode(toLangMode(cue.lang, false));
        setTransparent(cue.transparent);
        setShowPortrait(cue.showPortrait);
        if (cue.tickerOn && !tickerFlow.on) tickerFlow.turnOn();
      }
    }
    // 注: cue.isLive=false への sync down (CLEAR) は operator 側で liveFlow.clear() の
    // 退場アニメを尊重するため行わない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue, nominees]);

  // v2.8.121+: 初期マウント時に DB の countdown_* 値を operator state に同期
  const countdownSyncedRef = useRef(false);
  useEffect(() => {
    if (countdownSyncedRef.current) return;
    if (cue.countdownTarget !== null || cue.countdownOn) {
      setCountdownOn(cue.countdownOn);
      setCountdownTarget(cue.countdownTarget);
      setCountdownPrefixJa(cue.countdownPrefixJa);
      setCountdownPrefixEn(cue.countdownPrefixEn);
      setCountdownX(cue.countdownX);
      setCountdownY(cue.countdownY);
      setCountdownScale(cue.countdownScale);
      countdownSyncedRef.current = true;
    }
  }, [cue]);

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
      bilingual: false,
      countdownOn,
      countdownTarget,
      countdownPrefixJa,
      countdownPrefixEn,
      countdownX,
      countdownY,
      countdownScale,
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
  const onChangeCountdown = (patch: Partial<{
    countdownOn: boolean;
    countdownTarget: string | null;
    countdownPrefixJa: string;
    countdownPrefixEn: string;
    countdownX: number;
    countdownY: number;
    countdownScale: number;
  }>) => {
    if (patch.countdownOn !== undefined) setCountdownOn(patch.countdownOn);
    if (patch.countdownTarget !== undefined) setCountdownTarget(patch.countdownTarget);
    if (patch.countdownPrefixJa !== undefined) setCountdownPrefixJa(patch.countdownPrefixJa);
    if (patch.countdownPrefixEn !== undefined) setCountdownPrefixEn(patch.countdownPrefixEn);
    if (patch.countdownX !== undefined) setCountdownX(patch.countdownX);
    if (patch.countdownY !== undefined) setCountdownY(patch.countdownY);
    if (patch.countdownScale !== undefined) setCountdownScale(patch.countdownScale);
    sendCue({ ...cue, ...patch });
  };

  const onChangeLangMode = (mode: LangMode) => {
    setLangMode(mode);
    const next = fromLangMode(mode);
    sendCue({ ...cue, lang: next.lang, bilingual: false });
  };

  // v2.8.98+: NEXT (送出予約) を broadcast。preview 状態が変化するたびに socket emit。
  // NEXT 出力 URL (/awards/output/:eventId/oneshot/next) はこの sync を購読して描画。
  useEffect(() => {
    if (!previewNominee) return;
    sendNextCue({
      entryId: nomineeDbId(previewNominee),
      moduleKey: previewModule,
      tickerOn: tickerFlow.on,
      tickerCatIdx: selectedAwardIdx,
      transparent,
      lang,
      isLive: true, // NEXT 出力では常に表示
      showPortrait,
      bilingual: false,
      countdownOn,
      countdownTarget,
      countdownPrefixJa,
      countdownPrefixEn,
      countdownX,
      countdownY,
      countdownScale,
    });
  }, [previewNominee, previewModule, tickerFlow.on, selectedAwardIdx, transparent, lang, showPortrait, sendNextCue, countdownOn, countdownTarget, countdownPrefixJa, countdownPrefixEn, countdownX, countdownY, countdownScale]);

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
  // v2.8.85+: side-by-side ('both' mode) 用 — JA / EN 各々の ticker
  const tickerCategoryJa = awardsJa[selectedAwardIdx] ?? null;
  const tickerCategoryEn = awardsEn[selectedAwardIdx] ?? null;

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-y-auto lg:overflow-hidden">
      {/* モバイル: スクロール許可 (v2.9.35). lg+ では従来通り overflow-hidden で固定レイアウト。 */}
      {/* ── Header (v2.9.34 統一: h-14 / アイコン h-9 w-9 / text-sm + 3-way 回遊ナビ) ──── */}
      {/* v2.9.88: 統合コックピットに埋め込む場合 (embedded) はヘッダーを隠す */}
      {!embedded && (
      <header className="flex items-center gap-2 px-4 h-14 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          title="イベント詳細へ戻る"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <Subtitles className="h-4 w-4 text-amber-500" />
          <span className="hidden sm:inline text-sm font-black text-slate-200 tracking-wider">字幕スーパー</span>
        </div>
        {event && (
          <span className="text-xs text-slate-400 truncate hidden md:block">{event.name}</span>
        )}
        <div className="flex-1" />
        {/* DB → CG マッピング インスペクタ + oneshot_data 編集 */}
        <button
          onClick={() => setDataEditorOpen(true)}
          disabled={!previewNominee || !nomineeDbId(previewNominee)}
          className={cn(
            'hidden lg:flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors',
            previewNominee && nomineeDbId(previewNominee)
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              : 'bg-slate-900/40 text-slate-500 cursor-not-allowed'
          )}
          title="現在の PREVIEW ノミネートの DB ↔ CG マッピングを確認/編集"
        >
          <Database className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">データ</span>
        </button>
        {/* 賞・部門 英訳辞書 (localStorage) */}
        <button
          onClick={() => setDictOpen(true)}
          className="hidden lg:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="賞・部門の英訳辞書 (localStorage 保存、DB と独立)"
        >
          <Languages className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">英訳辞書</span>
        </button>
        {/* ── 3-way 回遊ナビ (v2.9.34): リアルタイムCG / クイズ・アンケートCG へジャンプ ── */}
        <button
          onClick={() => navigate(`/event/${eventId}/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="ランキングCG コントロールへ"
        >
          <Tv className="h-3.5 w-3.5" />
          <span className="hidden md:inline">ランキングCG</span>
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="クイズ / アンケートCG コントロールへ"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden md:inline">クイズ</span>
        </button>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-full text-xs font-black tracking-widest uppercase transition-all shrink-0',
            isLive
              ? 'bg-red-950/70 text-red-400 border border-red-800/50'
              : 'bg-slate-800/70 text-slate-300 border border-slate-700/50'
          )}
        >
          <Radio className={cn('h-3 w-3 shrink-0', isLive && 'animate-pulse')} />
          <span className="hidden sm:inline">{isLive ? 'ON AIR' : 'STANDBY'}</span>
        </div>
        <LangPicker value={langMode} onChange={onChangeLangMode} />
        <a
          href={`/awards/output/${eventId}/oneshot?lang=${lang}`}
          target="_blank"
          rel="noreferrer"
          title={`字幕スーパー 出力 (${lang.toUpperCase()})`}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 h-9 w-9 sm:w-auto sm:px-3 sm:py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors shrink-0"
        >
          <ExternalLink className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">出力</span>
        </a>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '全画面解除' : '全画面表示'}
          className="hidden sm:flex items-center justify-center h-9 w-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors shrink-0"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </header>
      )}

      {/* ── Middle: PROGRAM + Nominee panel ─────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden min-h-0">
        <div
          ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 max-h-[35vh] lg:max-h-none relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 lg:shrink"
        >
          {/* v2.8.83+: langMode='both' のとき JA + EN を別々の CG として横並びプレビュー */}
          {langMode === 'both' ? (
            <div className="absolute inset-0 flex">
              <div className="flex-1 relative">
                <span className="absolute top-1 left-2 z-10 text-[9px] font-black tracking-widest uppercase text-slate-300">JA</span>
                <ScaledStage
                  lang="ja"
                  nominee={liveNominee}
                  moduleKey={liveFlow.live?.moduleKey ?? 'none'}
                  transparent={transparent}
                  lowerThirdMounted={liveFlow.mounted}
                  lowerThirdExiting={liveFlow.exiting}
                  tickerMounted={tickerFlow.mounted}
                  tickerExiting={tickerFlow.exiting}
                  tickerOn={tickerFlow.on}
                  tickerCategory={tickerCategoryJa}
                  showPortrait={showPortrait}
                  moduleConfig={moduleConfig}
                  countdown={countdownStage}
                />
              </div>
              <div className="w-px bg-slate-800/80 self-stretch" />
              <div className="flex-1 relative">
                <span className="absolute top-1 left-2 z-10 text-[9px] font-black tracking-widest uppercase text-slate-300">EN</span>
                <ScaledStage
                  lang="en"
                  nominee={liveNominee}
                  moduleKey={liveFlow.live?.moduleKey ?? 'none'}
                  transparent={transparent}
                  lowerThirdMounted={liveFlow.mounted}
                  lowerThirdExiting={liveFlow.exiting}
                  tickerMounted={tickerFlow.mounted}
                  tickerExiting={tickerFlow.exiting}
                  tickerOn={tickerFlow.on}
                  tickerCategory={tickerCategoryEn}
                  showPortrait={showPortrait}
                  moduleConfig={moduleConfig}
                  countdown={countdownStage}
                />
              </div>
            </div>
          ) : (
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
                  moduleConfig={moduleConfig}
                  countdown={countdownStage}
                />
              </div>
            </div>
          )}
          <div
            className={cn(
              'absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase border',
              isLive
                ? 'bg-red-950/70 border-red-800/60 text-red-400'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-300'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-red-500 animate-pulse' : 'bg-slate-600')} />
            {isLive ? `OA · ON AIR (${lang.toUpperCase()})` : `OA · OFF (${lang.toUpperCase()})`}
          </div>
          {/* v2.8.82: TICKER ON 時は overlay 非表示。ティッカーだけ流している状態を
              「白線が出てる」と誤認させないため、ティッカーの存在をそのまま見せる。 */}
          {!isLive && !tickerFlow.on && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-slate-300">
                <div className="text-[10px] font-black tracking-widest uppercase mb-1">OA OFF</div>
                <div className="text-[9px] font-medium tracking-widest">Press TAKE to send</div>
              </div>
            </div>
          )}
          {!isLive && tickerFlow.on && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-amber-950/60 border border-amber-800/60 text-amber-300 pointer-events-none">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              TICKER ONLY
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
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/50">
        {/* v2.8.77+: モバイル/タブレット (< xl) でのみ表示する PREVIEW info strip
            (PREVIEW thumbnail を非表示にする代わりに、現在 queue されている
            ノミネート + モジュールをテキストで簡潔に表示) */}
        <div className="xl:hidden flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-800/80 bg-black/30">
          <span className="font-black tracking-widest uppercase text-amber-500 shrink-0">
            NEXT · 送出予約 ({langMode === 'both' ? 'JA+EN' : lang.toUpperCase()})
          </span>
          {previewNominee ? (
            <>
              <span className="text-slate-200 truncate font-bold">
                {previewNominee.type === 'team'
                  ? (lang === 'ja' ? previewNominee.projectName ?? previewNominee.name : previewNominee.projectNameEn ?? previewNominee.nameEn)
                  : (lang === 'ja' ? previewNominee.name : previewNominee.nameEn)}
              </span>
              <span className="text-slate-400 shrink-0">·</span>
              <span className="text-slate-400 truncate">
                {previewModules.find((m) => m.id === `preset:${previewModule}` || m.id === previewModule)?.label[lang === 'en' ? 'en' : 'ja'] ?? '—'}
              </span>
            </>
          ) : (
            <span className="text-slate-300">ノミネート未選択</span>
          )}
        </div>

        <div className="p-3">
        <div className="flex flex-col xl:flex-row gap-3">
          {/* PREVIEW thumbnail (xl+ only) — v2.8.83+: 'both' で 2 つ横並び */}
          <div className={cn(
            "hidden xl:flex flex-col gap-1.5 shrink-0 w-full",
            langMode === 'both' ? 'xl:w-[480px]' : 'xl:w-[320px]'
          )}>
            <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              NEXT · 送出予約 ({langMode === 'both' ? 'JA + EN' : lang.toUpperCase()})
            </div>
            <div
              ref={previewThumbRef}
              className="relative w-full aspect-video bg-black rounded border border-slate-800 overflow-hidden"
            >
              {previewNominee ? (
                langMode === 'both' ? (
                  <div className="absolute inset-0 flex">
                    <div className="flex-1 relative">
                      <span className="absolute top-0.5 left-1 z-10 text-[8px] font-black tracking-widest uppercase text-slate-300">JA</span>
                      <ScaledStage
                        lang="ja"
                        nominee={previewNominee}
                        moduleKey={previewModule}
                        transparent={transparent}
                        lowerThirdMounted={true}
                        lowerThirdExiting={false}
                        tickerMounted={tickerFlow.on}
                        tickerExiting={false}
                        tickerOn={tickerFlow.on}
                        tickerCategory={tickerCategoryJa}
                        showPortrait={showPortrait}
                        moduleConfig={moduleConfig}
                  countdown={countdownStage}
                      />
                    </div>
                    <div className="w-px bg-slate-800/80 self-stretch" />
                    <div className="flex-1 relative">
                      <span className="absolute top-0.5 left-1 z-10 text-[8px] font-black tracking-widest uppercase text-slate-300">EN</span>
                      <ScaledStage
                        lang="en"
                        nominee={previewNominee}
                        moduleKey={previewModule}
                        transparent={transparent}
                        lowerThirdMounted={true}
                        lowerThirdExiting={false}
                        tickerMounted={tickerFlow.on}
                        tickerExiting={false}
                        tickerOn={tickerFlow.on}
                        tickerCategory={tickerCategoryEn}
                        showPortrait={showPortrait}
                        moduleConfig={moduleConfig}
                  countdown={countdownStage}
                      />
                    </div>
                  </div>
                ) : (
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
                        countdown={countdownStage}
                      />
                    </div>
                  </div>
                )
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400">
                  ノミネート未選択
                </div>
              )}
            </div>
          </div>

          {/* Controls column — v2.8.122+: タブで送出/カウントダウンを切替 */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-1 border-b border-slate-800">
              {([
                { id: 'main', label: '1SHOT' },
                { id: 'countdown', label: 'カウントダウン', live: countdownOn },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setControlTab(t.id)}
                  className={cn(
                    'relative px-3 py-1.5 text-[11px] font-black tracking-widest uppercase transition-colors -mb-px border-b-2',
                    controlTab === t.id
                      ? 'text-amber-400 border-amber-500'
                      : 'text-slate-400 border-transparent hover:text-slate-200'
                  )}
                >
                  {t.label}
                  {('live' in t && t.live) && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>
              ))}
            </div>

            {/* v2.8.124+: TAKE/CLEAR は 1SHOT タブ専用。カウントダウンは ON/OFF をパネル側に内蔵 */}
            {controlTab === 'main' ? (
              <>
                <ModulePickerRow
                  modules={previewModules}
                  selected={previewModule}
                  onSelect={setPreviewModule}
                  lang={lang}
                />
                <TickerControlRow
                  on={tickerFlow.on}
                  currentAward={currentAward}
                  onToggle={onToggleTicker}
                />
                <SendActionRow
                  isLive={isLive}
                  transparent={transparent}
                  showPortrait={showPortrait}
                  onTake={take}
                  onClear={clear}
                  onToggleTransparent={onToggleTransparent}
                  onTogglePortrait={onTogglePortrait}
                />
              </>
            ) : (
              <CountdownControlPanel
                on={countdownOn}
                target={countdownTarget}
                prefixJa={countdownPrefixJa}
                prefixEn={countdownPrefixEn}
                x={countdownX}
                y={countdownY}
                scale={countdownScale}
                onChange={onChangeCountdown}
              />
            )}
          </div>
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

// ── ScaledStage ─────────────────────────────────────────────
// v2.8.83+: 親コンテナのサイズに合わせて 1920×1080 CG をレターボックスする内部コンポーネント。
// langMode='both' で 2 つ並べる用途で使用。container size を ResizeObserver で計測。
interface ScaledStageProps {
  nominee: import('../oneshot/types').Nominee | null;
  lang: Lang;
  moduleKey: ModuleKey;
  transparent: boolean;
  lowerThirdMounted: boolean;
  lowerThirdExiting: boolean;
  tickerMounted: boolean;
  tickerExiting: boolean;
  tickerOn: boolean;
  tickerCategory: import('../oneshot/types').TickerCategory | null;
  showPortrait?: boolean;
  moduleConfig?: import('../oneshot/types').EventModuleConfig;
  countdown?: import('../oneshot/OneShotStage').CountdownStageProps;
}

function ScaledStage(props: ScaledStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.18);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0">
      <div
        style={{
          position: 'absolute',
          left: off.x,
          top: off.y,
          width: CG_W * scale,
          height: CG_H * scale,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: CG_W,
            height: CG_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
          }}
        >
          <OneShotStage {...props} />
        </div>
      </div>
    </div>
  );
}
