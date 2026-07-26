import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAwardsNextCue } from '@/hooks/useAwardsCue';
import { useAwardsStore } from '@/cg/useStore';
import CGFrame, { type CgLang } from '@/cg/CGFrame';
import { CG_W, CG_H } from '@/cg/types';
import type { CgCategory, CgSurvey } from '@/cg/types';

interface EventData {
  id: number;
  name: string;
  subtitle: string | null;
  categories: CgCategory[];
  surveys?: CgSurvey[];
}

// v2.8.98+: NEXT (送出予約) を表示する独立した出力 URL。
// PROGRAM (LIVE) URL は /awards/output/:eventId、こちらは /awards/output/:eventId/next。
// operator が ControlPage で操作中の preview 状態が socket 経由でリアルタイム反映される。
// 用途: 副調整室の director が「次に送出する CG」を別モニターで確認する。
export default function OutputNextPage() {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>();
  const eventId = parseInt(eventIdStr!);
  const [searchParams] = useSearchParams();
  const langParam = searchParams.get('lang');
  const lang: CgLang =
    langParam === 'en' ? 'en' :
    langParam === 'both' ? 'both' :
    'ja';

  // Always transparent
  useEffect(() => {
    document.body.setAttribute('data-output-transparent', '');
    return () => document.body.removeAttribute('data-output-transparent');
  }, []);

  const { data: event } = useQuery({
    queryKey: ['awards-output-event-next', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}/output`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as EventData;
    },
    refetchInterval: 30000,
  });

  // 書き込む関数だけを選ぶ (引数なしだとストア全体を見て毎回描き直される)
  const setCategories = useAwardsStore((s) => s.setCategories);
  const setSurveys = useAwardsStore((s) => s.setSurveys);
  useEffect(() => {
    if (event?.categories) setCategories(event.categories);
    if (event) setSurveys(event.surveys ?? []);
  }, [event, setCategories, setSurveys]);

  const { nextCue } = useAwardsNextCue(isNaN(eventId) ? null : eventId);
  const activeCategory =
    event?.categories.find((c) => c.id === nextCue.categoryId) ??
    event?.categories[0] ??
    null;

  // Viewport scale (ranking output と同じ)
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setScale(Math.min(w / CG_W, h / CG_H));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  if (!event) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ width: '100vw', height: '100vh' }}
    >
      <div
        className="cg-stage"
        style={{
          transform: `scale(${scale})`,
          left: `${(window.innerWidth - CG_W * scale) / 2}px`,
          top: `${(window.innerHeight - CG_H * scale) / 2}px`,
        }}
      >
        <CGFrame
          lang={lang}
          cue={nextCue}
          category={activeCategory}
          allCategories={event.categories}
          surveys={event.surveys ?? []}
          eventName={event.name}
          eventSubtitle={event.subtitle}
          transparent
        />
      </div>
    </div>
  );
}
