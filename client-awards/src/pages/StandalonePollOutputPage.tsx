import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useStandalonePoll } from '@/standalonePoll/usePoll';
import StandalonePollCG from '@/standalonePoll/StandalonePollCG';
import { CG_W, CG_H } from '@/cg/types';

/** 出力ページ: 1920×1080 固定 / 透過 (OBS browser source 用)。 */
export default function StandalonePollOutputPage() {
  const { room = 'main' } = useParams<{ room: string }>();
  const { state } = useStandalonePoll(room);

  useEffect(() => {
    document.body.setAttribute('data-output-transparent', '');
    document.body.style.background = 'transparent';
    return () => {
      document.body.removeAttribute('data-output-transparent');
      document.body.style.background = '';
    };
  }, []);

  return (
    <div style={{ width: CG_W, height: CG_H, position: 'fixed', top: 0, left: 0, background: 'transparent', overflow: 'hidden' }}>
      <StandalonePollCG state={state} />
    </div>
  );
}
