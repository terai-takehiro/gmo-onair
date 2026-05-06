import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import OneShotStage from '../oneshot/OneShotStage';
import { useOneShotNextCue } from '../oneshot/hooks/useOneShotCue';
import { groupNomineesForTicker } from '../oneshot/lib/groupNominees';
import { mapEventToNominees, type AwardsCategoryRow } from '../oneshot/lib/mapEntryToNominee';
import { useEventModuleConfig } from '../oneshot/lib/moduleConfig';
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

// v2.8.98+: 下位置CG NEXT (送出予約) 出力 URL。
// PROGRAM (LIVE) は /awards/output/:eventId/oneshot、こちらは .../oneshot/next。
// operator OneShotControlPage で選択中の preview 状態を socket 経由で反映。
// 副調整室で「次に出すテロップ」を確認する用途。
export default function OneShotOutputNextPage() {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>();
  const eventId = parseInt(eventIdStr!);
  const [searchParams] = useSearchParams();
  const langParam = searchParams.get('lang');
  const initialLang: Lang = langParam === 'en' ? 'en' : 'ja';

  useEffect(() => {
    document.body.setAttribute('data-output-transparent', '');
    return () => document.body.removeAttribute('data-output-transparent');
  }, []);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOffset({
        x: Math.max(0, (w - CG_W * s) / 2),
        y: Math.max(0, (h - CG_H * s) / 2),
      });
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const { data: event } = useQuery({
    queryKey: ['awards-oneshot-output-next', eventId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/awards/events/${eventId}/oneshot/output`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as OneShotEventOutput;
    },
    refetchInterval: 30000,
  });

  const nominees = useMemo(() => mapEventToNominees(event), [event]);
  const { nextCue } = useOneShotNextCue(isNaN(eventId) ? null : eventId);
  const { data: moduleConfig } = useEventModuleConfig(isNaN(eventId) ? null : eventId);

  const liveNominee = useMemo(() => {
    if (nextCue.entryId == null) return nominees[0] ?? null;
    const matched = nominees.find((n) => n.id === `entry-${nextCue.entryId}`);
    return matched ?? nominees[0] ?? null;
  }, [nextCue.entryId, nominees]);

  const lang: Lang =
    langParam === 'en' || langParam === 'ja' ? langParam : (nextCue.lang ?? initialLang);
  const moduleKey: ModuleKey = nextCue.moduleKey ?? 'none';
  const tickerOn = nextCue.tickerOn;
  const showPortrait = nextCue.showPortrait ?? true;

  const tickerCats = useMemo(() => groupNomineesForTicker(nominees, lang), [nominees, lang]);
  const currentTicker = tickerCats[nextCue.tickerCatIdx % Math.max(tickerCats.length, 1)] ?? null;

  if (!event) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: offset.y,
          left: offset.x,
          width: CG_W,
          height: CG_H,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        <OneShotStage
          nominee={liveNominee}
          lang={lang}
          moduleKey={moduleKey}
          transparent={true}
          // NEXT 出力では常に表示状態 (operator の操作中はそのまま見せる)
          lowerThirdMounted={!!liveNominee}
          lowerThirdExiting={false}
          tickerMounted={tickerOn}
          tickerExiting={false}
          tickerOn={tickerOn}
          tickerCategory={currentTicker}
          showPortrait={showPortrait}
          moduleConfig={moduleConfig}
        />
      </div>
    </div>
  );
}
