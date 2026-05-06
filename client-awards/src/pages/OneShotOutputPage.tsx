import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import OneShotStage from '../oneshot/OneShotStage';
import { useOneShotCue } from '../oneshot/hooks/useOneShotCue';
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

// 放送送出ページ (HTML5 Graphics):
//   ・1920×1080px **固定** (ブラウザソースは 1920×1080 で作成すること)
//   ・背景は **常に透過** (operator の透過トグルは preview 用、実出力には影響なし)
//   ・operator から socket で受けた cue だけを描画
export default function OneShotOutputPage() {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>();
  const eventId = parseInt(eventIdStr!);
  const [searchParams] = useSearchParams();
  const langParam = searchParams.get('lang');
  const initialLang: Lang = langParam === 'en' ? 'en' : 'ja';

  // Body class for transparent OBS browser source (常に有効)
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
  const { data: moduleConfig } = useEventModuleConfig(isNaN(eventId) ? null : eventId);

  // Cue.entryId はDB-backed のとき有効。seed データでは null なので、
  // null の場合は先頭ノミネートを表示。
  const liveNominee = useMemo(() => {
    if (cue.entryId == null) return nominees[0] ?? null;
    const matched = nominees.find((n) => n.id === `entry-${cue.entryId}`);
    return matched ?? nominees[0] ?? null;
  }, [cue.entryId, nominees]);

  // v2.8.84+: URL ?lang= パラメータを優先 (= 言語別 URL を 2 本立てで運用可能)。
  // cue.lang はフォールバックとして機能 (URL に lang 無しのとき operator の選択を反映)。
  const lang: Lang =
    langParam === 'en' || langParam === 'ja' ? langParam : (cue.lang ?? initialLang);
  const moduleKey: ModuleKey = cue.moduleKey ?? 'none';
  const tickerOn = cue.tickerOn;
  const showPortrait = cue.showPortrait ?? true;
  const useDynamicRenderer =
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('awards-cg-renderer')
      : null) !== 'legacy';

  const tickerCats = useMemo(() => groupNomineesForTicker(nominees, lang), [nominees, lang]);
  const currentTicker = tickerCats[cue.tickerCatIdx % Math.max(tickerCats.length, 1)] ?? null;

  if (!event) return null;

  // v2.8.84+: HTML5 Graphics は 1920×1080 固定、scaling 無し。
  // ブラウザソース (OBS 等) を 1920×1080 で作成すれば native 表示。
  return (
    <div
      style={{
        width: CG_W,
        height: CG_H,
        position: 'fixed',
        top: 0,
        left: 0,
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      <OneShotStage
        nominee={liveNominee}
        lang={lang}
        moduleKey={moduleKey}
        // v2.8.84+: 実出力は **常に透過固定**。cue.transparent は operator preview 用のみ。
        transparent={true}
        lowerThirdMounted={cue.isLive}
        lowerThirdExiting={false}
        tickerMounted={tickerOn}
        tickerExiting={false}
        tickerOn={tickerOn}
        tickerCategory={currentTicker}
        showPortrait={showPortrait}
        useDynamicRenderer={useDynamicRenderer}
        // v2.8.83+: in-CG bilingual stacking は廃止 (横並びは operator preview のみ)。
        bilingual={false}
        moduleConfig={moduleConfig}
      />
    </div>
  );
}
