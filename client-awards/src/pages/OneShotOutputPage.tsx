import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import OneShotStage from '../oneshot/OneShotStage';
import { useOneShotCue } from '../oneshot/hooks/useOneShotCue';
import { groupNomineesForTicker } from '../oneshot/lib/groupNominees';
import { mapEventToNominees, type AwardsCategoryRow } from '../oneshot/lib/mapEntryToNominee';
import type { Lang, ModuleKey } from '../oneshot/types';

import '../oneshot/styles/index.css';

const CG_W = 1920;
const CG_H = 1080;

interface OneShotEventOutput {
  id: number;
  name: string;
  subtitle: string | null;
  categories: AwardsCategoryRow[];
}

// 放送送出ページ: 背景透過、operator から socket で受けた cue だけを描画
export default function OneShotOutputPage() {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>();
  const eventId = parseInt(eventIdStr!);
  const [searchParams] = useSearchParams();
  const langParam = searchParams.get('lang');
  const initialLang: Lang = langParam === 'en' ? 'en' : 'ja';

  // Body class for transparent OBS browser source
  useEffect(() => {
    document.body.setAttribute('data-output-transparent', '');
    return () => document.body.removeAttribute('data-output-transparent');
  }, []);

  const { data: event } = useQuery({
    queryKey: ['awards-oneshot-output', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}/oneshot/output`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as OneShotEventOutput;
    },
    refetchInterval: 30000,
  });

  const nominees = useMemo(() => mapEventToNominees(event), [event]);
  const { cue } = useOneShotCue(isNaN(eventId) ? null : eventId);

  // Cue.entryId はDB-backed のとき有効。seed データでは null なので、
  // null の場合は先頭ノミネートを表示。
  const liveNominee = useMemo(() => {
    if (cue.entryId == null) return nominees[0] ?? null;
    const matched = nominees.find((n) => n.id === `entry-${cue.entryId}`);
    return matched ?? nominees[0] ?? null;
  }, [cue.entryId, nominees]);

  const lang: Lang = cue.lang ?? initialLang;
  const moduleKey: ModuleKey = cue.moduleKey ?? 'none';
  const transparent = cue.transparent;
  const tickerOn = cue.tickerOn;
  const showPortrait = cue.showPortrait ?? true;
  // v2.8.72+: 動的レンダラ A/B (per-device localStorage、段階2.1 で削除予定)
  const useDynamicRenderer =
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('awards-cg-renderer')
      : null) !== 'legacy';

  const tickerCats = useMemo(() => groupNomineesForTicker(nominees, lang), [nominees, lang]);
  const currentTicker = tickerCats[cue.tickerCatIdx % Math.max(tickerCats.length, 1)] ?? null;

  // Letterbox 1920×1080 to viewport
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  if (!event) return null;

  return (
    <div ref={wrapRef} className="fixed inset-0 bg-transparent overflow-hidden">
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
          <OneShotStage
            nominee={liveNominee}
            lang={lang}
            moduleKey={moduleKey}
            transparent={transparent}
            lowerThirdMounted={cue.isLive}
            lowerThirdExiting={false}
            tickerMounted={tickerOn}
            tickerExiting={false}
            tickerOn={tickerOn}
            tickerCategory={currentTicker}
            showPortrait={showPortrait}
            useDynamicRenderer={useDynamicRenderer}
          />
        </div>
      </div>
    </div>
  );
}
