import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { useAwardsStore } from '@/cg/useStore';
import Stage from '@/cg/Stage';
import type { CgCategory } from '@/cg/types';

interface EventData {
  id: number;
  name: string;
  subtitle: string | null;
  categories: CgCategory[];
}

export default function OutputPage() {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>();
  const eventId = parseInt(eventIdStr!);
  const [searchParams] = useSearchParams();
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'ja';

  // Always transparent — single alpha-channel output
  useEffect(() => {
    document.body.setAttribute('data-output-transparent', '');
    return () => document.body.removeAttribute('data-output-transparent');
  }, []);

  const { data: event } = useQuery({
    queryKey: ['awards-output-event', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as EventData;
    },
    refetchInterval: 30000,
  });

  const { setCategories } = useAwardsStore();
  useEffect(() => {
    if (event?.categories) setCategories(event.categories);
  }, [event, setCategories]);

  useAwardsCue(isNaN(eventId) ? null : eventId);

  if (!event) return null;

  return <Stage eventName={event.name} eventSubtitle={event.subtitle} lang={lang} />;
}
