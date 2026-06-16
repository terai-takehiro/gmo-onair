import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Tv, Subtitles, HelpCircle, ExternalLink, Maximize2, Minimize2, OctagonX } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useFullscreen } from '@/hooks/useFullscreen';
import ControlPage from './ControlPage';
import OneShotControlPage from './OneShotControlPage';
import QuizStackControlPage from './QuizStackControlPage';

// v2.9.88: 統合送出コックピット。出力URL・各レイヤーの送出ロジック・socket は据え置き、
//   operator の「制御」を 1 画面に集約。上部タブでレイヤー切替。各操作ページは embedded で
//   自前ヘッダーを隠して埋め込む。アクティブなレイヤーのみマウント。
// v2.9.89 (Phase 2): 全レイヤーの ON-AIR 状態を常時表示 (cg-status を 2 秒ポーリング) +
//   全レイヤー一括CLEAR (パニック)。状態取得/一括CLEAR はサーバー HTTP で行い、
//   各操作ページの client socket ライフサイクルとは干渉しない。

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

export default function CgCockpitPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [layer, setLayer] = useState<Layer>('oneshot');
  const [clearing, setClearing] = useState(false);

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => (await api.get(`/awards/events/${eventId}`)).data.data as { id: number; name: string },
    enabled: !isNaN(eventId),
  });

  // 全レイヤー ON-AIR 状態 (2 秒ポーリング)
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['cg-status', eventId],
    queryFn: async () => (await api.get(`/awards/events/${eventId}/cg-status`)).data.data as CgStatus,
    enabled: !isNaN(eventId),
    refetchInterval: 2000,
  });

  const liveOf = (k: Layer): boolean =>
    k === 'ranking' ? !!status?.ranking.live : k === 'oneshot' ? !!status?.oneshot.live : !!status?.quiz.live;
  const anyLive = LAYERS.some((l) => liveOf(l.key));

  const urls = outputUrls(layer, eventId);

  const clearAll = async () => {
    if (!window.confirm('全レイヤー (字幕スーパー / ランキングCG / クイズ・アンケート) を一括で OFF にします。よろしいですか？')) return;
    setClearing(true);
    try {
      await api.post(`/awards/events/${eventId}/cg-clear-all`);
      await refetchStatus();
    } catch { /* network — ignore */ } finally {
      setClearing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      {/* ── 統合ヘッダー (全レイヤー共通) ───────────────────────── */}
      <header className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 h-14 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          title="イベント編集へ戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <span className="hidden lg:block text-sm font-bold text-slate-200 truncate max-w-[160px]">
          {event?.name ?? '送出'}
        </span>

        {/* レイヤー切替タブ (各タブに ON-AIR バッジ) */}
        <div className="flex-1 flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
          {LAYERS.map((l) => {
            const Icon = l.icon;
            const active = layer === l.key;
            const live = liveOf(l.key);
            return (
              <button
                key={l.key}
                onClick={() => setLayer(l.key)}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 h-9 text-xs sm:text-sm font-bold transition-colors border',
                  active
                    ? 'bg-slate-700 text-slate-50 border-slate-500'
                    : 'bg-slate-900/60 text-slate-400 border-transparent hover:bg-slate-800 hover:text-slate-200',
                  live && 'ring-1 ring-red-500/70',
                )}
                title={`${l.label}${live ? ' — ON AIR' : ''}`}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? l.color : '')} />
                <span className="hidden sm:inline">{l.label}</span>
                <span className="sm:hidden">{l.short}</span>
                {/* ON-AIR ドット */}
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full shrink-0',
                    live ? 'bg-red-500 animate-pulse' : 'bg-slate-600/50',
                  )}
                  aria-label={live ? 'ON AIR' : 'OFF'}
                />
              </button>
            );
          })}
        </div>

        {/* アクティブレイヤーの出力URL (JA/EN) */}
        <a href={urls.ja} target="_blank" rel="noreferrer" title="OA 出力 (JA)"
          className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />JA
        </a>
        <a href={urls.en} target="_blank" rel="noreferrer" title="OA 出力 (EN)"
          className="hidden sm:flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />EN
        </a>

        {/* 全レイヤー一括CLEAR (パニック) */}
        <button
          onClick={clearAll}
          disabled={clearing || !anyLive}
          title="全レイヤーを一括で OFF にする (パニック)"
          className={cn(
            'flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-black transition-colors',
            anyLive
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-slate-800/60 text-slate-500 cursor-not-allowed',
          )}
        >
          <OctagonX className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{clearing ? '消去中…' : '一括CLEAR'}</span>
        </button>

        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '全画面解除 (F)' : '全画面 (F)'}
          className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4 text-slate-300" /> : <Maximize2 className="h-4 w-4 text-slate-300" />}
        </button>
      </header>

      {/* ── アクティブレイヤーの操作本体 (自前ヘッダーは embedded で非表示) ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {layer === 'oneshot' && <OneShotControlPage embedded />}
        {layer === 'ranking' && <ControlPage embedded />}
        {layer === 'quiz' && <QuizStackControlPage embedded />}
      </div>
    </div>
  );
}
