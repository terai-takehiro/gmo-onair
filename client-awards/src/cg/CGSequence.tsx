import type { CgCueState, CgCategory } from './types';
import StepTitle from './steps/StepTitle';
import StepNominees from './steps/StepNominees';
import StepRanking from './steps/StepRanking';
import StepWinnerBar from './steps/StepWinnerBar';
import StepOneShot from './steps/StepOneShot';

interface CGSequenceProps {
  cue: CgCueState;
  category: CgCategory | null;
  eventName: string;
  eventSubtitle?: string | null;
}

export default function CGSequence({ cue, category, eventName, eventSubtitle }: CGSequenceProps) {
  // Key forces remount when step or category changes (triggers animation restart)
  const key = `${cue.step}-${cue.categoryId ?? 'none'}-${cue.oneshotStyle}`;

  if (cue.step === 'idle') {
    return null;
  }

  if (cue.step === 'title') {
    return (
      <StepTitle
        key={key}
        eventName={eventName}
        eventSubtitle={eventSubtitle}
        categoryName={category?.name}
      />
    );
  }

  if (cue.step === 'nominees') {
    return (
      <StepNominees
        key={key}
        category={category}
        eventName={eventName}
      />
    );
  }

  if (cue.step === 'ranks52') {
    return (
      <StepRanking
        key={key}
        category={category}
        eventName={eventName}
      />
    );
  }

  if (cue.step === 'winner-bar') {
    return (
      <StepWinnerBar
        key={key}
        category={category}
        eventName={eventName}
      />
    );
  }

  if (cue.step === 'oneshot') {
    return (
      <StepOneShot
        key={key}
        category={category}
        eventName={eventName}
        style={cue.oneshotStyle}
      />
    );
  }

  return null;
}
