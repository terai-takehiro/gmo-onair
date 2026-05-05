import { useEffect, useState, type ReactNode } from 'react';
import { SLOT_DURATION } from './timings';

interface Props {
  keyId: string;
  children: ReactNode;
  duration?: number;
}

// モジュール切替時のクロスディゾルブ (高さは新コンテンツに合わせて自然リサイズ)
export default function SlotSwitcher({ keyId, children, duration = SLOT_DURATION }: Props) {
  const [render, setRender] = useState<{ id: string; content: ReactNode }>({ id: keyId, content: children });
  const [exiting, setExiting] = useState<{ id: string; content: ReactNode } | null>(null);

  useEffect(() => {
    if (keyId !== render.id) {
      setExiting(render);
      setRender({ id: keyId, content: children });
      const t = setTimeout(() => setExiting(null), duration);
      return () => clearTimeout(t);
    }
    setRender({ id: keyId, content: children });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId, children]);

  return (
    <div className="lt-slot">
      {exiting && (
        <div className="lt-module lt-mod-exit slot-fade-out" key={'e' + exiting.id}>
          {exiting.content}
        </div>
      )}
      <div className="lt-module slot-fade-in" key={render.id}>
        {render.content}
      </div>
    </div>
  );
}
