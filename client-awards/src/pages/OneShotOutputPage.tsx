import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import OneShotStage from '../oneshot/OneShotStage';
import { LT_EXIT_MS } from '../oneshot/animation/timings';
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
//   ・OBS 等のブラウザソースを 1920×1080 で作成すれば 1:1 (scale=1) で native 表示
//   ・通常ブラウザで開いた場合は viewport にフィットさせて縮小プレビュー (ranking CG と同じ挙動)
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

  // v2.8.95: viewport にフィットさせるスケール (ranking CG OutputPage / Stage と同じ方式)。
  // OBS browser source = 1920×1080 のときは scale=1 で 1:1、それ以外は最小縮小率で中央寄せ。
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

  const tickerCats = useMemo(() => groupNomineesForTicker(nominees, lang), [nominees, lang]);
  const currentTicker = tickerCats[cue.tickerCatIdx % Math.max(tickerCats.length, 1)] ?? null;

  // v2.9.125: CLEAR (cue.isLive=false) でカットアウトせず TAKE と同じくフェードアウト
  // (.lt-exit) させる。cue.isLive の true→false を検知して exiting を立て、LT_EXIT_MS 後に
  // unmount する。退場中は最後に live だった nominee を保持して表示する。
  const [ltMounted, setLtMounted] = useState(false);
  const [ltExiting, setLtExiting] = useState(false);
  const ltExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNomineeRef = useRef(liveNominee);
  if (cue.isLive && liveNominee) lastNomineeRef.current = liveNominee;
  useEffect(() => {
    if (cue.isLive) {
      if (ltExitTimer.current) { clearTimeout(ltExitTimer.current); ltExitTimer.current = null; }
      setLtExiting(false);
      setLtMounted(true);
    } else if (ltMounted && !ltExiting) {
      setLtExiting(true);
      ltExitTimer.current = setTimeout(() => {
        setLtMounted(false);
        setLtExiting(false);
        ltExitTimer.current = null;
      }, LT_EXIT_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue.isLive]);
  useEffect(() => () => { if (ltExitTimer.current) clearTimeout(ltExitTimer.current); }, []);
  const displayNominee = cue.isLive ? liveNominee : lastNomineeRef.current;

  if (!event) return null;

  // v2.8.95: 1920×1080 の論理キャンバスを viewport にフィットさせて表示。
  // OBS の 1920×1080 browser source では scale=1 で 1:1 ネイティブ表示、
  // それ以外のブラウザでは縮小して中央配置 (ranking CG と同じ挙動)。
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
          nominee={displayNominee}
          lang={lang}
          moduleKey={moduleKey}
          // v2.8.84+: 実出力は **常に透過固定**。cue.transparent は operator preview 用のみ。
          transparent={true}
          lowerThirdMounted={ltMounted}
          lowerThirdExiting={ltExiting}
          tickerMounted={tickerOn}
          tickerExiting={false}
          tickerOn={tickerOn}
          tickerCategory={currentTicker}
          showPortrait={showPortrait}
          moduleConfig={moduleConfig}
          countdown={{
            on: cue.countdownOn,
            target: cue.countdownTarget,
            prefixJa: cue.countdownPrefixJa,
            prefixEn: cue.countdownPrefixEn,
            x: cue.countdownX,
            y: cue.countdownY,
            scale: cue.countdownScale,
          }}
        />
      </div>
    </div>
  );
}
