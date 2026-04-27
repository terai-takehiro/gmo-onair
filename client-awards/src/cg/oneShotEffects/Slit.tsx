import { useState, useEffect } from 'react';

interface Props {
  on: boolean;
}

export default function OneShotSlitBeam({ on }: Props) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setLit(true), 20);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 4,
          height: 660,
          transform: 'translate(-50%, -50%)',
          background:
            'linear-gradient(180deg, rgba(245,215,110,0) 0%, #fff7d0 20%, #fff 50%, #fff7d0 80%, rgba(245,215,110,0) 100%)',
          opacity: 0,
          animation: lit ? 'cgSlitBeam 900ms ease-out both' : 'none',
          filter:
            'drop-shadow(0 0 16px rgba(255,247,208,0.95)) drop-shadow(0 0 32px rgba(245,215,110,0.7))',
          mixBlendMode: 'screen',
        }}
      />
      <style>{`
        @keyframes cgSlitBeam {
          0%   { opacity: 0; transform: translate(-50%, -50%) scaleY(0); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scaleY(1); }
          60%  { opacity: 1; transform: translate(-50%, -50%) scaleY(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scaleY(1); }
        }
      `}</style>
    </div>
  );
}
