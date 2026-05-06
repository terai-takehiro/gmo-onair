import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SLOT_PHASE_ENTER_MS, SLOT_PHASE_EXIT_MS } from './timings';

interface Props {
  keyId: string;
  children: ReactNode;
}

// v2.8.82: 3-phase シーケンス (exit → resize → enter) は jerkiness の原因に
// なりやすかったため、シンプルなクロスディゾルブに戻す。
//   旧コンテンツが fade-out (180ms) しつつ、新コンテンツが少し遅れて fade-in (240ms)
//   起動。height の自然リサイズは useAnimatedHeight (CSS-style) が担う。
// この方が iOS Safari でも frame drop が少なく、jerkiness が出にくい。

export default function SlotSwitcher({ keyId, children }: Props) {
  const [shown, setShown] = useState<{ id: string; content: ReactNode }>({
    id: keyId,
    content: children,
  });
  const [exiting, setExiting] = useState<{ id: string; content: ReactNode } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (keyId !== shown.id) {
      // Cross-dissolve: 旧を exit に、新を即 mount
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
    // 同じ keyId は サイレント更新
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

// SLOT_PHASE_ENTER_MS は使ってないが、import を残しておくと timings の意図が分かりやすい
void SLOT_PHASE_ENTER_MS;
