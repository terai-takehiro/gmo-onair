import { useMemo, useState, useEffect, useRef } from 'react';
import type { CgCueState, CgCategory, CgMappedEntry } from './types';
import CGBackground from './components/CGBackground';
import PersistentHeader from './components/PersistentHeader';
import PhotoStage from './components/PhotoStage';
import StepTitle from './steps/StepTitle';
import StepRanking from './steps/StepRanking';
import StepTop3 from './steps/StepTop3';
import StepOneShot from './steps/StepOneShot';
import StepPoll from './steps/StepPoll';
import StepVoteReveal from './steps/StepVoteReveal';

interface Props {
  cue: CgCueState;
  category: CgCategory | null;
  eventName: string;
  eventSubtitle?: string | null;
  lang?: 'ja' | 'en';
  transparent?: boolean;
}

/** Map API entry to the shape CG components consume. */
function mapEntry(e: CgCategory['entries'][number]): CgMappedEntry {
  return {
    id: String(e.id),
    rank: e.rank ?? 99,
    name: e.name,
    nameEn: e.name_en ?? undefined,
    company: e.org ?? '',
    orgEn: e.org_en ?? undefined,
    points: e.points ?? 0,
    ownPoints: e.own_points ?? undefined,
    voteCount: e.vote_count ?? 0,
    photo: e.photo_url ?? undefined,
    is_winner: e.is_winner,
  };
}

const STEP_ORDER = ['idle', 'title', 'nominees', 'ranks52', 'top3', 'winner-bar', 'oneshot'] as const;

export default function CGSequence({ cue, category, eventName, eventSubtitle, lang = 'ja', transparent }: Props) {
  const stepKey = cue.step;

  // Map entries
  const entries = useMemo<CgMappedEntry[]>(
    () => (category?.entries ?? []).map(mapEntry),
    [category],
  );
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.rank - b.rank),
    [entries],
  );

  // sessionKey: increments when we restart a sequence (go back to title or
  // change category), causing persistent components to remount cleanly.
  const [sessionKey, setSessionKey] = useState(0);
  const prevCatRef = useRef(cue.categoryId);
  const prevStepRef = useRef(cue.step);
  useEffect(() => {
    const catChanged = cue.categoryId !== prevCatRef.current;
    const backToTitle =
      cue.step === 'title' &&
      prevStepRef.current !== 'title' &&
      prevStepRef.current !== 'idle';
    if (catChanged || backToTitle) setSessionKey((k) => k + 1);
    prevCatRef.current = cue.categoryId;
    prevStepRef.current = cue.step;
  }, [cue.categoryId, cue.step]);

  const persistKey = `${cue.categoryId ?? 'none'}-${sessionKey}`;

  const tweaks = {
    eventTitle: eventName,
    categoryParent:
      lang === 'en'
        ? (category?.description_en || category?.description || eventSubtitle || '')
        : (category?.description || eventSubtitle || ''),
    categoryChild:
      lang === 'en'
        ? (category?.name_en || category?.name || '')
        : (category?.name ?? ''),
  };

  // Ranking reveal parameters
  const revealLevel: Record<string, number> = {
    ranks52: 4,
    'winner-bar': 5,
    oneshot: 5,
  };
  const onRankingBoard = ['ranks52', 'winner-bar', 'oneshot'].includes(stepKey);
  const showWinnerBar = stepKey === 'winner-bar' || stepKey === 'oneshot';
  const onPhotoStage = ['nominees', 'ranks52', 'top3', 'winner-bar', 'oneshot'].includes(stepKey);
  const showTop3 = stepKey === 'top3';
  const showPoll = stepKey === 'poll';
  const showVoteReveal = stepKey === 'vote-reveal';

  if (stepKey === 'idle') return null;

  const winner = sorted.find((e) => e.rank === 1) ?? null;
  // vote-reveal の winner は vote_count 最大値で決まる
  const voteWinner = useMemo(() => {
    if (!sorted.length) return null;
    const top3 = sorted.filter((e) => e.rank >= 1 && e.rank <= 3);
    const pool = top3.length ? top3 : sorted;
    return pool.reduce((a, b) => ((b.voteCount ?? 0) > (a.voteCount ?? 0) ? b : a));
  }, [sorted]);

  // Suppress unused import warning from layout.ts
  void STEP_ORDER;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'transparent',
        overflow: 'hidden',
        fontFamily: "'Noto Sans JP', sans-serif",
        fontFeatureSettings: "'palt' 1",
        color: '#fff',
        perspective: '2400px',
      }}
    >
      <CGBackground transparent={transparent} />

      {/* Persistent morphing header — poll / vote-reveal は専用レイアウトのため非表示 */}
      {stepKey !== 'poll' && stepKey !== 'vote-reveal' && (
        <PersistentHeader key={`hdr-${persistKey}`} tweaks={tweaks} stepKey={stepKey} />
      )}

      {/* Title step — remounts per session */}
      {stepKey === 'title' && <StepTitle key={`title-${persistKey}`} />}

      {/* Ranking + photo scene (blurred/dimmed when oneshot is active) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter:
            stepKey === 'oneshot'
              ? 'blur(10px) brightness(0.55)'
              : 'none',
          transition: 'filter 700ms ease',
          willChange: 'filter',
        }}
      >
        {onRankingBoard && (
          <StepRanking
            key={`ranking-${persistKey}`}
            entries={sorted}
            revealLevel={revealLevel[stepKey] ?? 0}
            showWinnerBar={showWinnerBar}
            stepKey={stepKey}
            lang={lang}
          />
        )}

        {showTop3 && (
          <StepTop3
            key={`top3-${persistKey}`}
            entries={sorted}
            lang={lang}
          />
        )}

        {onPhotoStage && (
          <PhotoStage
            key={`photos-${persistKey}`}
            nominees={entries}
            rankings={sorted}
            stepKey={stepKey}
            lang={lang}
          />
        )}
      </div>

      {/* OneShot overlay — remounts per session */}
      {stepKey === 'oneshot' && (
        <StepOneShot
          key={`oneshot-${persistKey}`}
          entry={winner}
          style={cue.oneshotStyle}
          categoryParent={tweaks.categoryParent}
          categoryChild={tweaks.categoryChild}
          lang={lang}
        />
      )}

      {/* Poll — アンケート投票画面 (vote パターン) */}
      {showPoll && (
        <StepPoll
          key={`poll-${persistKey}-${cue.pollStartedAt ?? 'idle'}`}
          category={category}
          entries={sorted}
          startedAt={cue.pollStartedAt}
          lang={lang}
        />
      )}

      {/* Vote reveal — 投票結果棒グラフ → 大賞 */}
      {showVoteReveal && (
        <StepVoteReveal
          key={`vote-${persistKey}`}
          entries={sorted}
          winner={voteWinner}
          phase={cue.revealPhase}
          display={cue.voteDisplay}
          categoryParent={tweaks.categoryParent}
          categoryChild={tweaks.categoryChild}
          lang={lang}
        />
      )}
    </div>
  );
}
