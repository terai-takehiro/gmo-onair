import type { CgCategory, OneshotStyle } from '../types';
import Classic from '../oneShotEffects/Classic';
import Shards from '../oneShotEffects/Shards';
import Spotlight from '../oneShotEffects/Spotlight';
import Slit from '../oneShotEffects/Slit';

interface StepOneShotProps {
  category: CgCategory | null;
  eventName: string;
  style: OneshotStyle;
}

export default function StepOneShot({ category, eventName, style }: StepOneShotProps) {
  const winner =
    category?.entries.find((e) => e.is_winner) ??
    category?.entries.find((e) => e.rank === 1) ??
    category?.entries[0] ??
    null;

  const props = { winner, category, eventName };

  switch (style) {
    case 'shards':    return <Shards     {...props} />;
    case 'spotlight': return <Spotlight  {...props} />;
    case 'slit':      return <Slit       {...props} />;
    default:          return <Classic    {...props} />;
  }
}
