import { useMemo } from 'react';
import type { StandalonePollState } from './types';
import StepPoll from '@/cg/steps/StepPoll';
import StepVoteReveal from '@/cg/steps/StepVoteReveal';
import type { CgCategory, CgMappedEntry } from '@/cg/types';

interface Props {
  state: StandalonePollState;
}

/** 標準 (表彰DB と独立) ポール CG レンダラ。
 *  StepPoll / StepVoteReveal を CgCategory / CgMappedEntry に変換して再利用。 */
export default function StandalonePollCG({ state }: Props) {
  const lang = state.lang;

  const synthCategory: CgCategory = useMemo(() => ({
    id: 0,
    name: state.title,
    name_en: state.titleEn || null,
    description: null,
    description_en: null,
    award_pattern: 'vote',
    poll_title: state.title,
    poll_title_en: state.titleEn || null,
    poll_question: state.question,
    poll_question_en: state.questionEn || null,
    entries: [],
  }), [state.title, state.titleEn, state.question, state.questionEn]);

  const synthEntries: CgMappedEntry[] = useMemo(() => {
    return state.choices.slice(0, 3).map((c, i) => ({
      id: `poll-${i + 1}`,
      rank: i + 1,
      name: c.name || `選択肢${i + 1}`,
      nameEn: c.nameEn || undefined,
      company: c.company || '',
      orgEn: c.companyEn || undefined,
      points: 0,
      voteCount: c.voteCount,
      photo: c.photoDataUrl || undefined,
    }));
  }, [state.choices]);

  const winner = useMemo(() => {
    if (!synthEntries.length) return null;
    return synthEntries.reduce((a, b) => ((b.voteCount ?? 0) > (a.voteCount ?? 0) ? b : a));
  }, [synthEntries]);

  if (state.step === 'idle') return null;

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: "'Noto Sans JP', sans-serif", color: '#fff' }}>
      {state.step === 'poll' && (
        <StepPoll
          key={`poll-${state.pollStartedAt ?? 'pre'}`}
          category={synthCategory}
          entries={synthEntries}
          startedAt={state.pollStartedAt}
          lang={lang}
        />
      )}
      {state.step === 'reveal' && (
        <StepVoteReveal
          key="reveal"
          entries={synthEntries}
          winner={winner}
          phase={state.revealPhase < 2 ? state.revealPhase : 1}
          display={state.display}
          categoryParent={state.titleEn && lang === 'en' ? state.titleEn : state.title}
          categoryChild=""
          lang={lang}
        />
      )}
      {state.step === 'winner' && (
        <StepVoteReveal
          key="winner"
          entries={synthEntries}
          winner={winner}
          phase={2}
          display={state.display}
          categoryParent={state.titleEn && lang === 'en' ? state.titleEn : state.title}
          categoryChild=""
          lang={lang}
        />
      )}
    </div>
  );
}
