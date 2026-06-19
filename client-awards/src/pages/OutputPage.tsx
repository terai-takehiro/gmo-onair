import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { useAwardsStore } from '@/cg/useStore';
import Stage from '@/cg/Stage';
import type { CgCategory, CgSurvey } from '@/cg/types';
import type { CgLang } from '@/cg/CGFrame';

interface EventData {
  id: number;
  name: string;
  subtitle: string | null;
  categories: CgCategory[];
  surveys?: CgSurvey[];
}

export default function OutputPage() {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>();
  const eventId = parseInt(eventIdStr!);
  const [searchParams] = useSearchParams();
  const langParam = searchParams.get('lang');
  const lang: CgLang =
    langParam === 'en' ? 'en' :
    langParam === 'both' ? 'both' :
    'ja';

  // ?bg=1 で背景あり版を出力 (既定は透過 — 単一アルファチャンネル出力)
  const bgParam = (searchParams.get('bg') ?? '').toLowerCase();
  const withBg = bgParam === '1' || bgParam === 'on' || bgParam === 'true';

  useEffect(() => {
    if (withBg) {
      // 背景あり: body を不透明 (黒) にしてレターボックスも黒に
      const prev = document.body.style.background;
      document.body.style.background = '#000';
      return () => { document.body.style.background = prev; };
    }
    // 既定: 透過出力 (Browser Source の「透明度を許可」用)
    document.body.setAttribute('data-output-transparent', '');
    return () => document.body.removeAttribute('data-output-transparent');
  }, [withBg]);

  const { data: event } = useQuery({
    queryKey: ['awards-output-event', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}/output`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as EventData;
    },
    refetchInterval: 30000,
  });

  const { setCategories, setSurveys } = useAwardsStore();
  useEffect(() => {
    if (event?.categories) setCategories(event.categories);
    if (event) setSurveys(event.surveys ?? []);
  }, [event, setCategories, setSurveys]);

  useAwardsCue(isNaN(eventId) ? null : eventId);

  if (!event) return null;

  return <Stage eventName={event.name} eventSubtitle={event.subtitle} lang={lang} transparent={!withBg} />;
}
