import { useEffect, useRef, useState } from 'react';
import { CG_W, CG_H } from './types';
import type { CgCategory } from './types';
import { useAwardsStore } from './useStore';
import CGSequence from './CGSequence';

interface StageProps {
  category?: CgCategory | null;
  eventName?: string;
  eventSubtitle?: string | null;
  lang?: 'ja' | 'en';
  transparent?: boolean;
}

export default function Stage({ category, eventName = '', eventSubtitle, lang = 'ja', transparent }: StageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const { cue, categories } = useAwardsStore();

  // Scale to fit viewport
  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setScale(Math.min(w / CG_W, h / CG_H));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const activeCategory =
    category ??
    categories.find((c) => c.id === cue.categoryId) ??
    categories[0] ??
    null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ width: '100vw', height: '100vh' }}
    >
      <div
        className="cg-stage"
        style={{
          transform: `scale(${scale})`,
          // Center in viewport
          left: `${(window.innerWidth - CG_W * scale) / 2}px`,
          top: `${(window.innerHeight - CG_H * scale) / 2}px`,
        }}
      >
        <CGSequence
          cue={cue}
          category={activeCategory}
          eventName={eventName}
          eventSubtitle={eventSubtitle}
          lang={lang}
          transparent={transparent}
        />
      </div>
    </div>
  );
}
