import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { cn } from '@/lib/utils';
import { ChevronLeft, Tv2, Trophy, ExternalLink } from 'lucide-react';
import type { CgStep, OneshotStyle, CgCategory } from '@/cg/types';

interface AwardsEventDetail {
  id: number;
  name: string;
  subtitle: string | null;
  categories: CgCategory[];
}

const STEPS: { step: CgStep; label: string; desc: string }[] = [
  { step: 'idle',       label: 'アイドル',       desc: '透過（何も表示しない）' },
  { step: 'title',      label: 'タイトル',       desc: '賞タイトルカード' },
  { step: 'nominees',   label: 'ノミニー',       desc: 'ノミネート一覧' },
  { step: 'ranks52',    label: '5→2位 バー',     desc: 'ランキングバー順に表示' },
  { step: 'winner-bar', label: '大賞 バー',       desc: '大賞発表前の引きバー' },
  { step: 'oneshot',    label: '一発表示',        desc: '大賞をフルスクリーン表示' },
];

const ONESHOT_STYLES: { style: OneshotStyle; label: string }[] = [
  { style: 'classic',   label: 'クラシック' },
  { style: 'shards',    label: 'シャーズ' },
  { style: 'spotlight', label: 'スポットライト' },
  { style: 'slit',      label: 'スリット' },
];

export default function ControlPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/internal/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });

  const { cue, sendCue } = useAwardsCue(eventId);

  const selectedCategory = event?.categories.find((c) => c.id === cue.categoryId)
    ?? event?.categories[0];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/event/${eventId}`)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/10">
            <Tv2 className="h-4 w-4 text-red-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">送出コントロール</h1>
            {event && <p className="text-xs text-muted-foreground truncate">{event.name}</p>}
          </div>
        </div>
        <a
          href={`/awards/output/${eventId}?transparent=1`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors text-muted-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          出力画面
        </a>
      </div>

      {/* Current state indicator */}
      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-1">現在の送出状態</p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-bold text-primary">
            {STEPS.find((s) => s.step === cue.step)?.label ?? cue.step}
          </span>
          {selectedCategory && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Trophy className="h-3 w-3" />
              {selectedCategory.name}
            </span>
          )}
          {cue.step === 'oneshot' && (
            <span className="text-xs text-muted-foreground">
              スタイル: {ONESHOT_STYLES.find((s) => s.style === cue.oneshotStyle)?.label}
            </span>
          )}
        </div>
      </div>

      {/* Category selector */}
      {event?.categories && event.categories.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium mb-2">カテゴリ</p>
          <div className="flex flex-wrap gap-2">
            {event.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => sendCue(cue.step, cat.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-all border',
                  cue.categoryId === cat.id
                    ? 'bg-primary text-white border-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step buttons */}
      <div className="mb-5">
        <p className="text-sm font-medium mb-2">ステップ</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STEPS.map(({ step, label, desc }) => (
            <button
              key={step}
              onClick={() => sendCue(step)}
              className={cn(
                'flex flex-col items-start rounded-xl border p-3 text-left transition-all',
                cue.step === step
                  ? 'border-red-500 bg-red-500/5 ring-2 ring-red-500/30'
                  : 'border-border hover:border-primary/40 hover:bg-muted'
              )}
            >
              <span className={cn(
                'text-sm font-semibold',
                cue.step === step ? 'text-red-600' : 'text-foreground'
              )}>
                {label}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5 leading-tight">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* OneShot style (shown when oneshot selected or as preview) */}
      <div>
        <p className="text-sm font-medium mb-2">一発表示スタイル</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ONESHOT_STYLES.map(({ style, label }) => (
            <button
              key={style}
              onClick={() => sendCue(cue.step, undefined, style)}
              className={cn(
                'rounded-xl border p-3 text-center text-sm font-medium transition-all',
                cue.oneshotStyle === style
                  ? 'border-amber-500 bg-amber-500/10 text-amber-700'
                  : 'border-border hover:border-amber-400/50 hover:bg-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
