import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { useCgAudio } from '@/hooks/useCgAudio';
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

  // ?audio=1 を付けた URL でのみ演出SEを鳴らす (多重再生防止: OBS のプログラム送出用 1 枚だけ)
  const audioParam = (searchParams.get('audio') ?? '').toLowerCase();
  const audioOn = audioParam === '1' || audioParam === 'on' || audioParam === 'true';

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

  // v2.9.124: アンケート票数確定をリロード無しで反映するため、surveys は 30s 周期の
  // event 全体 fetch とは別に軽量エンドポイントを 3s ごとにポーリングする。
  const { data: polledSurveys } = useQuery({
    queryKey: ['awards-output-surveys', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}/surveys`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json.data ?? []) as CgSurvey[];
    },
    refetchInterval: 3000,
  });

  const { setCategories, setSurveys } = useAwardsStore();
  useEffect(() => {
    if (event?.categories) setCategories(event.categories);
  }, [event, setCategories]);
  useEffect(() => {
    if (polledSurveys) setSurveys(polledSurveys);
    else if (event) setSurveys(event.surveys ?? []);
  }, [polledSurveys, event, setSurveys]);

  useAwardsCue(isNaN(eventId) ? null : eventId);

  // 演出SE: ステップ遷移 (= TAKE) のたびに割り当てSEを再生 (前の音はカットアウト)
  const { play } = useCgAudio(isNaN(eventId) ? null : eventId, audioOn);
  const cue = useAwardsStore((s) => s.cue);
  const categories = useAwardsStore((s) => s.categories);
  const prevStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!audioOn) return;
    const step = cue.step;
    // 初回 (リロード時など) は鳴らさない。実際の遷移のみ再生。
    if (prevStepRef.current === null) { prevStepRef.current = step; return; }
    if (prevStepRef.current === step) return;
    prevStepRef.current = step;
    if (step === 'idle') { play('ranking', 'idle'); return; } // idle = カットアウト(割り当て無ければ無音)
    // RANKS (ranks52) は開始順位別SE。現カテゴリの実在順位 (2〜5) の最上位を rankStart に。
    let rankStart: number | null = null;
    if (step === 'ranks52') {
      const cat = categories.find((c) => c.id === cue.categoryId);
      const ranks = (cat?.entries ?? []).map((e) => e.rank ?? 99).filter((r) => r >= 2 && r <= 5);
      rankStart = ranks.length ? Math.max(...ranks) : 5;
    }
    play('ranking', step, rankStart);
  }, [cue.step, cue.categoryId, audioOn, categories, play]);

  if (!event) return null;

  return <Stage eventName={event.name} eventSubtitle={event.subtitle} lang={lang} transparent={!withBg} />;
}
