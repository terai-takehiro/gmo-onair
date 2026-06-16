import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Tv, Subtitles, HelpCircle, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useFullscreen } from '@/hooks/useFullscreen';
import ControlPage from './ControlPage';
import OneShotControlPage from './OneShotControlPage';
import QuizStackControlPage from './QuizStackControlPage';

// v2.9.88: 統合送出コックピット (Phase 1)。
//   出力URL・各レイヤーの送出ロジック・socket は据え置き。operator の「制御」を
//   1 画面に集約し、上部タブでレイヤー (ランキングCG / 字幕スーパー / クイズ・アンケートCG)
//   を切り替える。各操作ページは embedded で自前ヘッダーを隠して埋め込む。
//   ※ Phase 1 はアクティブなレイヤーのみマウント (= そのレイヤーの socket だけ購読)。
//      全レイヤー同時の ON-AIR 可視化 / マスターCLEAR は Phase 2 で対応。

type Layer = 'ranking' | 'oneshot' | 'quiz';

const LAYERS: { key: Layer; label: string; short: string; icon: typeof Tv; color: string }[] = [
  { key: 'ranking', label: 'ランキングCG', short: 'ランキング', icon: Tv, color: 'text-red-400' },
  { key: 'oneshot', label: '字幕スーパー', short: '字幕', icon: Subtitles, color: 'text-amber-400' },
  { key: 'quiz', label: 'クイズ/アンケート', short: 'クイズ', icon: HelpCircle, color: 'text-purple-400' },
];

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
  const [layer, setLayer] = useState<Layer>('ranking');

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => (await api.get(`/awards/events/${eventId}`)).data.data as { id: number; name: string },
    enabled: !isNaN(eventId),
  });

  const urls = outputUrls(layer, eventId);

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
        <span className="hidden md:block text-sm font-bold text-slate-200 truncate max-w-[200px]">
          {event?.name ?? '送出'}
        </span>

        {/* レイヤー切替タブ */}
        <div className="flex-1 flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
          {LAYERS.map((l) => {
            const Icon = l.icon;
            const active = layer === l.key;
            return (
              <button
                key={l.key}
                onClick={() => setLayer(l.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 h-9 text-xs sm:text-sm font-bold transition-colors',
                  active
                    ? 'bg-slate-700 text-slate-50 ring-1 ring-slate-500'
                    : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                )}
                title={l.label}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? l.color : '')} />
                <span className="hidden sm:inline">{l.label}</span>
                <span className="sm:hidden">{l.short}</span>
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
        {layer === 'ranking' && <ControlPage embedded />}
        {layer === 'oneshot' && <OneShotControlPage embedded />}
        {layer === 'quiz' && <QuizStackControlPage embedded />}
      </div>
    </div>
  );
}
