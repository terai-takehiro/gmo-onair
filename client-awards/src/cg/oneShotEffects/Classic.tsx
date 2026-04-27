import { useState, useEffect } from 'react';

interface Props {
  on: boolean;
}

export default function OneShotImpactBurst({ on }: Props) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setPhase(1), 20);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 80,
        height: 80,
        transform:
          phase === 1
            ? 'translate(-50%, -50%) scale(30)'
            : 'translate(-50%, -50%) scale(0.2)',
        opacity: phase === 1 ? 0 : 0.95,
        transition:
          'transform 900ms cubic-bezier(.15,.7,.25,1), opacity 900ms ease-out',
        borderRadius: '50%',
        background:
          'radial-gradient(circle, rgba(255,245,200,0.9) 0%, rgba(245,215,110,0.5) 25%, rgba(201,162,75,0) 65%)',
        zIndex: 40,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
      }}
    />
  );
}
