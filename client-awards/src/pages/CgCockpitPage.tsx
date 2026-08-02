import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Tv, Subtitles, HelpCircle, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useFullscreen } from '@/hooks/useFullscreen';
import ControlPage from './ControlPage';
import OneShotControlPage from './OneShotControlPage';
import QuizStackControlPage from './QuizStackControlPage';

// v2.9.88: 統合送出コックピット。出力URL・各レイヤーの送出ロジック・socket は据え置き、
//   operator の「制御」を 1 画面に集約。各操作ページは embedded で自前ヘッダーを隠して埋め込む。
// v2.9.89 (Phase 2): 全レイヤーの ON-AIR 状態を常時表示 (cg-status を 2 秒ポーリング)。
// v2.9.91: PC (lg+) はタブではなく **複数レイヤーを横並びで一覧表示** (同時に見える)。
//   モバイル (< lg) は従来どおりタブ (1 レイヤーのみ表示)。
// v2.9.96: キーボードショートカットを全廃 (フォーカス式ショートカット・`[`/`]` 切替も撤去)。

type Layer = 'oneshot' | 'ranking' | 'quiz';

// 並び順: 字幕スーパー → ランキングCG → クイズ・アンケート
const LAYERS: { key: Layer; label: string; short: string; icon: typeof Tv; color: string }[] = [
  { key: 'oneshot', label: '字幕スーパー', short: '字幕', icon: Subtitles, color: 'text-amber-400' },
  { key: 'ranking', label: 'ランキングCG', short: 'ランキング', icon: Tv, color: 'text-red-400' },
  { key: 'quiz', label: 'クイズ/アンケート', short: 'クイズ', icon: HelpCircle, color: 'text-purple-400' },
];

interface CgStatus {
  ranking: { live: boolean; step: string };
  oneshot: { live: boolean };
  quiz: { live: boolean; step: string };
}

function outputUrls(layer: Layer, eventId: number): { ja: string; en: string } {
  switch (layer) {
    case 'ranking':
      return { ja: `/awards/output/${eventId}?lang=ja`, en: `/awards/output/${eventId}?lang=en` };
    case 'oneshot':
      return { ja: `/awards/output/${eventId}/oneshot?lang=ja`, en: `/awards/output/${eventId}/oneshot?lang=en` };
    case 'quiz':
      return { ja: `/awards/output/quiz-stack/${eventId}?lang=ja`, en: `/awards/output/quiz-stack/${eventId}?lang=en` };
  }
}

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatch(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return match;
}

export default function CgCockpitPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const wide = useMediaQuery('(min-width: 1024px)');
  // narrow (モバイル) の表示中タブ。wide では横並び一覧のため未使用。
  const [layer, setLayer] = useState<Layer>('oneshot');

  // v2.9.95: wide 表示で横並びにするレイヤーを任意選択 (2 つ / 3 つ)。localStorage に永続化。
  const [visible, setVisible] = useState<Layer[]>(() => {
    try {
      const raw = localStorage.getItem('cg-cockpit-visible-layers');
      if (raw) {
        const arr = (JSON.parse(raw) as string[]).filter((k): k is Layer =>
          k === 'oneshot' || k === 'ranking' || k === 'quiz');
        if (arr.length >= 1) return arr;
      }
    } catch { /* noop */ }
    return ['oneshot', 'ranking', 'quiz'];
  });
  useEffect(() => {
    try { localStorage.setItem('cg-cockpit-visible-layers', JSON.stringify(visible)); } catch { /* noop */ }
  }, [visible]);
  // LAYERS 順を保った表示対象リスト
  const visibleLayers = LAYERS.filter((l) => visible.includes(l.key));
  const toggleVisible = (k: Layer) => {
    setVisible((cur) =>
      cur.includes(k)
        ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur)  // 最低 1 つは残す
        : [...cur, k],
    );
  };

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => (await api.get(`/awards/events/${eventId}`)).data.data as { id: number; name: string },
    enabled: !isNaN(eventId),
  });

  // 全レイヤー ON-AIR 状態 (2 秒ポーリング)
  const { data: status } = useQuery({
    queryKey: ['cg-status', eventId],
    queryFn: async () => (await api.get(`/awards/events/${eventId}/cg-status`)).data.data as CgStatus,
    enabled: !isNaN(eventId),
    refetchInterval: 2000,
  });

  const liveOf = (k: Layer): boolean =>
    k === 'ranking' ? !!status?.ranking.live : k === 'oneshot' ? !!status?.oneshot.live : !!status?.quiz.live;

  // 各レイヤーの操作本体。
  const renderPanel = (key: Layer) => {
    if (key === 'oneshot') return <OneShotControlPage embedded />;
    if (key === 'ranking') return <ControlPage embedded />;
    return <QuizStackControlPage embedded />;
  };

  const OutputLinks = ({ k }: { k: Layer }) => {
    const u = outputUrls(k, eventId);
    return (
      <>
        <a href={u.ja} target="_blank" rel="noreferrer" title="OA 出力 (JA)"
          className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors">
          <ExternalLink className="h-3 w-3" />JA
        </a>
        <a href={u.en} target="_blank" rel="noreferrer" title="OA 出力 (EN)"
          className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors">
          <ExternalLink className="h-3 w-3" />EN
        </a>
      </>
    );
  };

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      {/* ── 統合ヘッダー ─────────────────────────────────── */}
      <header className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 h-14 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          title="イベント編集へ戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <span className="hidden sm:block text-sm font-bold text-slate-200 truncate max-w-[120px] lg:max-w-[220px]">
          {event?.name ?? '送出'}
        </span>

        {/* narrow のみ: レイヤー切替タブ (wide は横並び一覧なので不要) */}
        {!wide && (
          <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
            {LAYERS.map((l) => {
              const Icon = l.icon;
              const active = layer === l.key;
              const live = liveOf(l.key);
              return (
                <button
                  key={l.key}
                  onClick={() => setLayer(l.key)}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-xs font-bold transition-colors border',
                    active ? 'bg-slate-700 text-slate-50 border-slate-500'
                           : 'bg-slate-900/60 text-slate-400 border-transparent hover:bg-slate-800',
                    live && 'ring-1 ring-red-500/70',
                  )}
                  title={`${l.label}${live ? ' — ON AIR' : ''}`}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? l.color : '')} />
                  <span>{l.short}</span>
                  <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', live ? 'bg-red-500 animate-pulse' : 'bg-slate-600/50')} />
                </button>
              );
            })}
          </div>
        )}

        {/* wide のみ: 横並び表示するレイヤーを任意選択 (2 つ / 3 つ) */}
        {wide && (
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">表示</span>
            {LAYERS.map((l) => {
              const Icon = l.icon;
              const on = visible.includes(l.key);
              const live = liveOf(l.key);
              return (
                <button
                  key={l.key}
                  onClick={() => toggleVisible(l.key)}
                  aria-pressed={on}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-xs font-bold transition-colors border',
                    on ? 'bg-slate-700 text-slate-50 border-slate-500'
                       : 'bg-slate-900/60 text-slate-500 border-transparent hover:bg-slate-800',
                  )}
                  title={`${l.label} を${on ? '非表示にする' : '表示する'}`}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', on ? l.color : 'text-slate-600')} />
                  <span>{l.short}</span>
                  <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', live ? 'bg-red-500 animate-pulse' : 'bg-slate-600/50')} />
                </button>
              );
            })}
          </div>
        )}

        {/* narrow のみ: アクティブレイヤーの出力URL (wide は各カラムに表示) */}
        {!wide && <OutputLinks k={layer} />}

        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '全画面解除' : '全画面'}
          className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4 text-slate-300" /> : <Maximize2 className="h-4 w-4 text-slate-300" />}
        </button>
      </header>

      {/* ── 操作本体 ───────────────────────────────────── */}
      {wide ? (
        // PC: 選択したレイヤー (1〜3 つ) を横並びで一覧表示。
        <div className="flex-1 min-h-0 flex flex-row divide-x divide-slate-800">
          {visibleLayers.map((l) => {
            const Icon = l.icon;
            const live = liveOf(l.key);
            return (
              <div key={l.key} className="flex-1 min-w-0 flex flex-col">
                {/* カラム見出し */}
                <div className="flex items-center gap-2 h-9 px-2 shrink-0 border-b border-slate-800 bg-slate-900/50">
                  <Icon className={cn('h-4 w-4 shrink-0', l.color)} />
                  <span className="text-xs font-bold text-slate-100 truncate">{l.label}</span>
                  <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', live ? 'bg-red-500 animate-pulse' : 'bg-slate-600/50')}
                    aria-label={live ? 'ON AIR' : 'OFF'} />
                  <span className="flex-1" />
                  <OutputLinks k={l.key} />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {renderPanel(l.key)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // モバイル: タブで 1 レイヤーのみ表示
        <div className="flex-1 min-h-0 overflow-hidden">
          {renderPanel(layer)}
        </div>
      )}
    </div>
  );
}
