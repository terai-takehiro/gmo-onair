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
  const transparent = searchParams.get('transparent') === '1';
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'ja';

  // Set transparent body for alpha output (OBS / vMix)
  useEffect(() => {
    if (transparent) {
      document.body.setAttribute('data-output-transparent', '');
    }
    return () => {
      document.body.removeAttribute('data-output-transparent');
    };
  }, [transparent]);

  // Fetch event data (no auth required for output)
  const { data: event } = useQuery({
    queryKey: ['awards-output-event', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as EventData;
    },
    refetchInterval: 30000, // Refresh every 30s in case data changes
  });

  // Sync categories to store
  const { setCategories } = useAwardsStore();
  useEffect(() => {
    if (event?.categories) {
      setCategories(event.categories);
    }
  }, [event, setCategories]);

  // Connect to Socket.IO and listen for cue changes
  useAwardsCue(isNaN(eventId) ? null : eventId);

  if (!event) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: transparent ? 'transparent' : '#0a0a1a' }}
      >
        {!transparent && (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
        )}
      </div>
    );
  }

  return (
    <Stage
      eventName={event.name}
      eventSubtitle={event.subtitle}
      lang={lang}
    />
  );
}
