import { useMemo, useState, useEffect, useRef } from 'react';
import type { CgCueState, CgCategory, CgMappedEntry, CgSurvey } from './types';
import CGBackground from './components/CGBackground';
import PersistentHeader from './components/PersistentHeader';
import PhotoStage from './components/PhotoStage';
import StepTitle from './steps/StepTitle';
import StepRanking from './steps/StepRanking';
import StepTop3 from './steps/StepTop3';
import StepOneShot from './steps/StepOneShot';
import StepFinalPitch from './steps/StepFinalPitch';
import StepCelebration from './steps/StepCelebration';
import StepSurveyReveal from './steps/StepSurveyReveal';

interface Props {
  cue: CgCueState;
  category: CgCategory | null;
  allCategories?: CgCategory[];   // celebration ステップで使用
  surveys?: CgSurvey[];           // survey-oneshot ステップで使用 (連動アンケート)
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
    // 字幕スーパー (1S) と同じソースを優先: oneshot_data.title / titleEn
    nominationTitle: (e.oneshot_data?.title as string | undefined) ?? e.nomination_title ?? undefined,
    nominationTitleEn: (e.oneshot_data?.titleEn as string | undefined) ?? e.nomination_title_en ?? undefined,
    photo: e.photo_url ?? undefined,
    is_winner: e.is_winner,
  };
}

const STEP_ORDER = ['idle', 'title', 'nominees', 'ranks52', 'top3', 'winner-bar', 'oneshot'] as const;

export default function CGSequence({ cue, category, allCategories, surveys, eventName, eventSubtitle, lang = 'ja', transparent }: Props) {
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

  // vote パターン で poll_title を使うのは final-pitch 以降のステップのみ。
  // それ以前 (title / nominees / top3) は通常通り DB の部門/賞を表示する。
  const isVote = category?.award_pattern === 'vote';
  const usePollTitle = isVote && stepKey === 'final-pitch';
  const pollTitle = lang === 'en'
    ? (category?.poll_title_en || category?.poll_title || '')
    : (category?.poll_title || '');
  // 部門 (description) = 大きい金文字(parent) / 賞 (name) = 小さい白文字(child)。
  const division = lang === 'en'
    ? (category?.description_en || category?.description || '')
    : (category?.description || '');
  const award = lang === 'en'
    ? (category?.name_en || category?.name || '')
    : (category?.name ?? '');
  const hasDivision = !!(division && division.trim());
  const tweaks = {
    eventTitle: eventName,
    // 部門があれば 部門=大 / 賞=小。
    // 部門が無いときは 賞 を「部門のサイズ・色 (大きい金文字)」に昇格させ、小文字行は出さない。
    categoryParent: usePollTitle
      ? ''
      : (hasDivision ? division : (award || eventSubtitle || '')),
    categoryChild: usePollTitle && pollTitle
      ? pollTitle
      : (hasDivision ? award : ''),
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
  const showFinalPitch = stepKey === 'final-pitch';
  const showCelebration = stepKey === 'celebration';
  const showSurveyOneshot = stepKey === 'survey-oneshot';

  // survey-oneshot: 現カテゴリに紐づく連動アンケートを探す
  const linkedSurvey = showSurveyOneshot && category
    ? (surveys ?? []).find((s) => s.link_category_id === category.id) ?? null
    : null;

  // 手動選択 No.1 (winnerEntryId) があればそれを優先、無ければ rank=1。
  const winner =
    (cue.winnerEntryId != null ? sorted.find((e) => e.id === String(cue.winnerEntryId)) : undefined) ??
    sorted.find((e) => e.rank === 1) ?? null;

  if (stepKey === 'idle') return null;

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

      {/* v2.9.125: ランキング演出は背景が無いと視認性が厳しいため、半透明の黒ベースを敷く。
          No.1発表系 (oneshot / celebration) は専用フルスクリーン演出のため対象外。
          v2.9.129: survey-oneshot (アンケートNo.1) は票数/%表示中 (phase 0/1) はスクリムを生かし、
          No.1 が出る瞬間 (phase 2 = StepOneShot フルスクリーン) だけスクリムを解除する。
          v2.9.128: 濃さ (中心値 cue.scrimOpacity) を操作画面のスライダーでライブ調整。
          上 -0.10 / 中央 base / 下 +0.10 のグラデ (0〜0.95 にクランプ)。 */}
      {!['oneshot', 'celebration'].includes(stepKey) &&
        !(stepKey === 'survey-oneshot' && cue.revealPhase >= 2) && (() => {
        const base = Math.max(0, Math.min(0.95, cue.scrimOpacity ?? 0.72));
        const clamp = (v: number) => Math.max(0, Math.min(0.95, v)).toFixed(3);
        return (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                `linear-gradient(180deg, rgba(0,0,0,${clamp(base - 0.1)}) 0%, rgba(0,0,0,${clamp(base)}) 55%, rgba(0,0,0,${clamp(base + 0.1)}) 100%)`,
              pointerEvents: 'none',
              animation: 'cgFadeIn 500ms ease both',
            }}
          />
        );
      })()}


      {/* Persistent morphing header — final-pitch / celebration / survey-oneshot は専用レイアウトで非表示 */}
      {stepKey !== 'final-pitch' && stepKey !== 'celebration' && stepKey !== 'survey-oneshot' && (
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
            key={`top3-${persistKey}-${cue.revealPhase}`}
            entries={sorted}
            lang={lang}
            hidePoints={category?.award_pattern === 'vote'}
            hideRankBadge={category?.award_pattern === 'vote'}
            simultaneousReveal={category?.award_pattern === 'vote' && cue.revealPhase >= 1}
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

      {/* Final Pitch — TOP3 → 1名ピックアップ */}
      {showFinalPitch && (
        <StepFinalPitch
          key={`pitch-${persistKey}`}
          entries={sorted}
          pickedIndex={cue.revealPhase as 0 | 1 | 2 | 3}
          categoryChild={tweaks.categoryChild}
          lang={lang}
        />
      )}

      {/* Celebration — 同じ賞グループの全部門 No.1 を横並び + Congratulations */}
      {showCelebration && (
        <StepCelebration
          key={`celeb-${persistKey}`}
          categories={
            // 同じ award name (category.name) を持つカテゴリのみ抽出
            // allCategories が無ければ現カテゴリ単独
            allCategories && category
              ? allCategories.filter((c) => c.name === category.name)
              : (category ? [category] : [])
          }
          awardName={lang === 'en' ? (category?.name_en || category?.name || '') : (category?.name ?? '')}
          winnerOverride={cue.winnerEntryId != null && cue.categoryId != null
            ? { categoryId: cue.categoryId, entryId: cue.winnerEntryId }
            : null}
          lang={lang}
        />
      )}

      {/* Survey No.1 — 連動アンケートの最多得票をフルスクリーン発表 (賞の最後) */}
      {showSurveyOneshot && linkedSurvey && (
        <StepSurveyReveal
          key={`survey-${persistKey}`}
          choices={linkedSurvey.choices.slice(0, linkedSurvey.choice_count)}
          title={lang === 'en' ? (linkedSurvey.title_en || linkedSurvey.title) : linkedSurvey.title}
          display={linkedSurvey.display}
          phase={Math.min(2, cue.revealPhase) as 0 | 1 | 2}
          oneshotStyle={cue.oneshotStyle}
          lang={lang}
          transparent={transparent}
        />
      )}

      {/* v2.9.2: poll / vote-reveal は アンケート/クイズCG モジュールに移管 (この CG では表示しない) */}
    </div>
  );
}
