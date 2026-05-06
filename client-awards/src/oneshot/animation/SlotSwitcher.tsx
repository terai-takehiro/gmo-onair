import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SLOT_PHASE_EXIT_MS } from './timings';

interface Props {
  keyId: string;
  children: ReactNode;
}

// シンプルなクロスディゾルブ。旧コンテンツ fade-out (~180ms) → 新コンテンツ fade-in (~240ms)
// が少しオーバーラップ、合計 ~360ms。サイズ変化は LowerThirdCG の FLIP (transform: scale)
// が GPU 加速で並走。
export default function SlotSwitcher({ keyId, children }: Props) {
  const [shown, setShown] = useState<{ id: string; content: ReactNode }>({
    id: keyId,
    content: children,
  });
  const [exiting, setExiting] = useState<{ id: string; content: ReactNode } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (keyId !== shown.id) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setExiting({ id: shown.id, content: shown.content });
      setShown({ id: keyId, content: children });
      timerRef.current = setTimeout(() => {
        setExiting(null);
        timerRef.current = null;
      }, SLOT_PHASE_EXIT_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    setShown({ id: keyId, content: children });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId, children]);

  return (
    <div className="lt-slot">
      {exiting && (
        <div className="lt-module lt-mod-exit slot-fade-out-seq" key={'e' + exiting.id}>
          {exiting.content}
        </div>
      )}
      <div className="lt-module slot-fade-in-seq" key={shown.id}>
        {shown.content}
      </div>
    </div>
  );
}
